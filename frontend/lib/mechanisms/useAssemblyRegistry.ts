/**
 * useAssemblyRegistry — hooks for publishing designer-built assemblies
 * to the on-chain `AssemblyRegistry`. Parallel to `useOperatorRegistry`
 * (operators) and the schema-registry wiring (schemas) per the
 * separation-of-concerns doctrine.
 *
 * Publish flow:
 *   1. Build a full off-chain manifest from the snapshot — topology
 *      (orders array), per-order agreement bodies (inlined), and prose.
 *   2. Compute the canonical content hash (keccak256 of stable JSON).
 *   3. Pin the manifest to IPFS via DEFAULT_IPFS_SERVICE.
 *   4. Call AssemblyRegistry.registerAssembly(slug, nodeCount,
 *      contentHash, metadataURI). The registry's only on-chain check
 *      is that nodeCount fits the per-process gas ceiling
 *      (MAX_NODES_PER_ASSEMBLY = 2145, set per FigaroCore docs).
 *      All other content validation lives at the per-schema layer
 *      and runs when each order's clauses are attested at commit time.
 *
 * No graceful retry, no optimistic UI — the publish is a single atomic
 * step from the user's POV: success means the slug is permanently bound
 * to (msg.sender, nodeCount, contentHash, ipfs URI).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keccak256, toHex, parseAbi, BaseError, ContractFunctionRevertedError } from "viem";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient, useChainId } from "wagmi";
import { DEFAULT_IPFS_SERVICE } from "@/lib/shared/ipfsService";
import { loadAgreement } from "@/lib/core/agreementStore";
import {
    deriveCanonicalFulfilmentMethod,
    type CanonicalFulfilmentMethod,
} from "@/lib/core/orderAgreement";
import type { Agreement } from "@figaro/core";
import type { Order } from "@/lib/core/store";
import type { DesignSnapshot } from "@/lib/designer/syntheticDesignStore";
import { useOperatorProfile } from "./useOperatorRegistry";
import { resolveContentURI } from "@/lib/shared/merchantBranding";
import { tryParseOperatorProfileDocument } from "@/lib/shared/operatorProfileMetadata";

export const ASSEMBLY_REGISTRY_ABI = parseAbi([
    "function registerAssembly(string slug, bytes32 contentHash, string metadataURI) external payable",
    "function withdrawDeposit(string slug) external",
    "function bindings(bytes32 slugHash) view returns (address author, uint64 registeredAt, bool depositWithdrawn, bytes32 contentHash, string metadataURI)",
    "function registrationDeposit() view returns (uint256)",
    "function depositLockPeriod() view returns (uint256)",
    "event AssemblyRegistered(bytes32 indexed slugHash, address indexed author, string slug, bytes32 contentHash, string metadataURI)",
    "event DepositWithdrawn(bytes32 indexed slugHash, address indexed author, uint256 amount)",
] as const);

/** Per-process gas ceiling at the kernel resolveProcess path. Documented
 *  in `src/FigaroCore.sol:240-250`. Enforced publish-side here (and
 *  again buyer-side at commit time) because the contract can't see
 *  off-chain manifest content to enforce it on-chain. */
export const MAX_NODES_PER_ASSEMBLY = 2145;

/** Off-chain manifest persisted to IPFS. Content-addressed by keccak256
 *  of its canonical JSON serialization (`canonicalize` below). The
 *  on-chain binding stores only contentHash + metadataURI; this object
 *  carries the topology + per-order agreements. */
export interface AssemblyManifest {
    slug: string;
    name: string;
    /** Synthetic-process metadata so the canvas can faithfully restore
     *  session state when a forked draft is hydrated. */
    processId: string;
    nextOrderIndex: number;
    nextSellerIndex: number;
    /** Topology — each order's id, parent connections live in its
     *  agreement's figaro-topology-v1 section. */
    orders: Order[];
    /** Per-agreementHash, the full agreement document with all schema
     *  sections. Inlined so the manifest is self-contained — consumers
     *  don't need a separate agreement-store fetch. */
    agreements: Record<string, Agreement>;
}

/** Stable JSON serialization — sorted object keys at every depth, bigints
 *  serialized as decimal strings. The off-chain content hash and the
 *  IPFS-pinned bytes both derive from this function so they always agree. */
function canonicalize(value: unknown): string {
    return JSON.stringify(value, (_key, raw) => {
        if (typeof raw === "bigint") return raw.toString();
        if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return raw;
        const sorted: Record<string, unknown> = {};
        for (const k of Object.keys(raw).sort()) sorted[k] = (raw as Record<string, unknown>)[k];
        return sorted;
    });
}

export function getAssemblyRegistry(): `0x${string}` | null {
    const addr = process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY;
    if (!addr) return null;
    return addr as `0x${string}`;
}

/** Build a self-contained manifest from a DesignSnapshot. Inlines every
 *  order's agreement so the manifest doesn't depend on any external
 *  agreement-store state. Throws if any order's agreement is missing
 *  locally. */
export function buildAssemblyManifest(snapshot: DesignSnapshot): AssemblyManifest {
    if (snapshot.orders.length === 0) {
        throw new Error("Assembly has no orders.");
    }
    const agreements: Record<string, Agreement> = {};
    for (const order of snapshot.orders) {
        if (!order.agreementHash) {
            throw new Error(`Order ${order.id} has no agreement.`);
        }
        const agreement = loadAgreement(order.agreementHash);
        if (!agreement) {
            throw new Error(
                `Agreement ${order.agreementHash} for order ${order.id} not found in local storage.`,
            );
        }
        agreements[order.agreementHash] = agreement;
    }
    return {
        slug: snapshot.slug,
        name: snapshot.name,
        processId: snapshot.processId,
        nextOrderIndex: snapshot.nextOrderIndex,
        nextSellerIndex: snapshot.nextSellerIndex,
        orders: snapshot.orders,
        agreements,
    };
}

/** Canonicalize the manifest and compute (canonical bytes, content hash). */
export function serializeManifest(manifest: AssemblyManifest): {
    json: string;
    contentHash: `0x${string}`;
} {
    const json = canonicalize(manifest);
    const contentHash = keccak256(toHex(json));
    return { json, contentHash };
}

export interface PublishOutcome {
    hash: `0x${string}`;
    ipfsURI: string;
}

// ── Read hooks (event-derived) ────────────────────────────────────────────────

/**
 * A single registered assembly, reconstructed from an `AssemblyRegistered`
 * event. The slug + metadataURI are non-indexed event-data fields;
 * slugHash and author come from indexed topics.
 */
export interface PublishedAssembly {
    slug: string;
    slugHash: `0x${string}`;
    author: `0x${string}`;
    contentHash: `0x${string}`;
    metadataURI: string;
    blockNumber: bigint;
    transactionHash: `0x${string}`;
}

/** Map an `AssemblyRegistry` revert into a human-readable Error. Used by
 *  `publish()` to surface a specific cause (slug already taken, wrong
 *  deposit, empty fields) instead of viem's default "execution reverted"
 *  message. Falls through to the original error for anything we don't
 *  recognize. */
function translatePublishRevert(err: unknown, attemptedSlug: string): Error {
    if (err instanceof BaseError) {
        const revert = err.walk(
            (e) => e instanceof ContractFunctionRevertedError,
        ) as ContractFunctionRevertedError | undefined;
        const name = revert?.data?.errorName;
        if (name === "SlugAlreadyRegistered") {
            return new Error(
                `The slug "${attemptedSlug}" is already registered on-chain. Pick a different slug — slug bindings are first-write-wins and permanent.`,
            );
        }
        if (name === "WrongDeposit") {
            const args = revert?.data?.args as readonly bigint[] | undefined;
            const provided = args?.[0]?.toString() ?? "?";
            const required = args?.[1]?.toString() ?? "?";
            return new Error(
                `Registration deposit mismatch (provided ${provided} wei, required ${required} wei). The deposit amount changed between the read and the send — retry.`,
            );
        }
        if (name === "EmptySlug") return new Error("Cannot publish with an empty slug.");
        if (name === "EmptyMetadataURI") return new Error("The IPFS pin returned an empty URI.");
        if (name === "EmptyContentHash") return new Error("Computed an empty content hash — likely a manifest-builder bug.");
    }
    return err instanceof Error ? err : new Error(String(err));
}

/**
 * Reads `AssemblyRegistered` events from the registry, optionally filtered
 * to a specific author. Returns the deduped most-recent-first list — slug
 * binding is first-write-wins on-chain, so duplicates per slug shouldn't
 * occur, but if they do (e.g. a stale fork chain), the most-recent block
 * wins.
 *
 * No caching, no auto-refresh. To pick up a newly published assembly
 * after mount, call `refetch`.
 */
export function usePublishedAssemblies(author: `0x${string}` | undefined) {
    const client = usePublicClient();
    const [data, setData] = useState<PublishedAssembly[] | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [generation, setGeneration] = useState(0);

    useEffect(() => {
        const registry = getAssemblyRegistry();
        if (!client || !registry) {
            setData(null);
            return;
        }
        let cancelled = false;
        setIsLoading(true);

        client
            .getContractEvents({
                address: registry,
                abi: ASSEMBLY_REGISTRY_ABI,
                eventName: "AssemblyRegistered",
                args: author ? { author } : undefined,
                fromBlock: 0n,
                toBlock: "latest",
            })
            .then((logs) => {
                if (cancelled) return;
                const items: PublishedAssembly[] = logs.map((log) => ({
                    slug: log.args.slug ?? "",
                    slugHash: log.args.slugHash as `0x${string}`,
                    author: log.args.author as `0x${string}`,
                    contentHash: log.args.contentHash as `0x${string}`,
                    metadataURI: log.args.metadataURI ?? "",
                    blockNumber: log.blockNumber ?? 0n,
                    transactionHash: log.transactionHash as `0x${string}`,
                }));
                items.sort((a, b) => Number(b.blockNumber - a.blockNumber));
                setData(items);
                setIsLoading(false);
            })
            .catch((err) => {
                if (cancelled) return;
                console.warn("[usePublishedAssemblies] event read failed:", err);
                setData([]);
                setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [client, author, generation]);

    const refetch = useCallback(() => setGeneration((g) => g + 1), []);
    return { data, isLoading, refetch };
}

/**
 * Convenience wrapper for the unfiltered "all published assemblies" case.
 * Used by surfaces like the onboarding assembly-picker that need every
 * registered assembly regardless of author.
 */
export function useAllPublishedAssemblies() {
    return usePublishedAssemblies(undefined);
}

/**
 * Fetch the IPFS-pinned manifest at `metadataURI`. Returns the parsed
 * JSON or null on failure (gateway unreachable, malformed JSON, etc.).
 * The on-chain binding's `contentHash` should match
 * `keccak256(canonicalize(manifest))` — callers that need integrity
 * can verify after fetch.
 */
export async function fetchAssemblyManifest(
    metadataURI: string,
): Promise<AssemblyManifest | null> {
    const url = DEFAULT_IPFS_SERVICE.resolveFetchUrl(metadataURI);
    if (!url) return null;
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        return (await response.json()) as AssemblyManifest;
    } catch {
        return null;
    }
}

/**
 * Synthesize a `networkTargets` value for an on-chain-registered assembly
 * based on the chain its registry lives on. Derived rather than stored —
 * the AssemblyRegistry is per-chain, so the chain IS the network target.
 */
export function chainIdToNetworkTarget(chainId: number): string {
    switch (chainId) {
        case 31337:
            return "local-anvil";
        case 11155111:
            return "sepolia";
        case 1:
            return "mainnet";
        default:
            return `evm-${chainId}`;
    }
}

/** Walk the manifest's inlined agreements and collect the unique set of
 *  schemas anchored across all orders. Sorted alphabetically for stable
 *  display order. */
export function collectAssemblySchemas(manifest: AssemblyManifest): string[] {
    const set = new Set<string>();
    for (const agreement of Object.values(manifest.agreements)) {
        for (const section of agreement.sections) {
            if (typeof section.schema === "string") set.add(section.schema);
        }
    }
    return Array.from(set).sort();
}

/** Process schemas the operator must populate with counterparty wallets
 *  when they bind to this assembly. Emitted only for non-root orders
 *  whose parent's fulfilment coordination includes `seller-assigned` —
 *  the case where the buyer may pick a fulfiller from the operator's
 *  roster at checkout. When the parent's coordination is exclusively
 *  `dutch-auction` (the auction contract assigns the fulfiller at
 *  runtime) or `buyer-assigned` (the buyer picks freely at checkout),
 *  no roster is needed and no schema is emitted.
 *
 *  Identifies the sub-order's process schema (e.g.
 *  `figaro-courier-process-v1`) directly — schemaId is the structural
 *  marker for which kind of off-chain operator a sub-order needs.
 *  Returns the set of distinct schemaIds, sorted.
 *
 *  Root order is excluded — the rootBuyer is the connected wallet at
 *  checkout, not designated by the operator's profile. */
export function requiredCounterpartySchemas(manifest: AssemblyManifest): string[] {
    const COUNTERPARTY_PROCESS_SCHEMAS: ReadonlySet<string> = new Set([
        "figaro-courier-process-v1",
    ]);

    const agreementByOrderId = new Map<string, Agreement>();
    for (const order of manifest.orders) {
        if (!order.agreementHash) continue;
        const agreement = manifest.agreements[order.agreementHash];
        if (agreement) agreementByOrderId.set(order.id, agreement);
    }

    function coordinationsOf(agreement: Agreement): string[] {
        const section = agreement.sections.find(
            (s: { schema: string }) => s.schema === "figaro-fulfilment-v2",
        ) as { data?: { coordinations?: unknown } } | undefined;
        const coords = section?.data?.coordinations;
        return Array.isArray(coords) ? coords.filter((c): c is string => typeof c === "string") : [];
    }

    function parentOrderIds(agreement: Agreement): string[] {
        const section = agreement.sections.find(
            (s: { schema: string }) => s.schema === "figaro-topology-v1",
        ) as { data?: { parentOrderHashes?: unknown } } | undefined;
        const parents = section?.data?.parentOrderHashes;
        return Array.isArray(parents) ? parents.filter((p): p is string => typeof p === "string") : [];
    }

    const schemas = new Set<string>();
    for (const order of manifest.orders) {
        if (!order.agreementHash) continue;
        const agreement = manifest.agreements[order.agreementHash];
        if (!agreement) continue;

        const parents = parentOrderIds(agreement);
        if (parents.length === 0) continue;

        const parentAllowsSellerAssigned = parents.some((parentId) => {
            const parentAgreement = agreementByOrderId.get(parentId);
            if (!parentAgreement) return false;
            return coordinationsOf(parentAgreement).includes("seller-assigned");
        });
        if (!parentAllowsSellerAssigned) continue;

        for (const section of agreement.sections as ReadonlyArray<{ schema: string }>) {
            if (COUNTERPARTY_PROCESS_SCHEMAS.has(section.schema)) {
                schemas.add(section.schema);
            }
        }
    }
    return Array.from(schemas).sort();
}

/** Compact display formatting for a schema list. Strips the `figaro-`
 *  prefix and `-vN` version suffix. Shows the first three inline,
 *  summarizes the rest as `+N more`. Callers typically place the full
 *  set in the row's `title` tooltip. */
export function formatAssemblySchemaList(schemas: readonly string[]): string {
    const trimmed = schemas.map((s) => s.replace(/^figaro-/, "").replace(/-v\d+$/, ""));
    if (trimmed.length <= 3) return trimmed.join(", ");
    return `${trimmed.slice(0, 3).join(", ")}, +${trimmed.length - 3} more`;
}

/**
 * A published assembly enriched with manifest-derived fields, suitable
 * for surfacing to a user as a selectable / inspectable choice.
 *
 * Manifest fetch is lazy per-row; `state` tracks the lifecycle. While
 * `state === "loading"`, `name` falls back to `slug` so the UI can
 * render the row immediately. When `state === "loaded"`, all
 * manifest-derived fields are populated.
 */
/** Per-assembly manifest fetch state: requested, succeeded, or failed. */
export type AssemblyManifestFetchState = "loading" | "loaded" | "error";

export interface AssemblyChoice {
    slug: string;
    author: `0x${string}`;
    contentHash: `0x${string}`;
    metadataURI: string;
    blockNumber: bigint;
    networkTargets: readonly string[];
    state: AssemblyManifestFetchState;
    /** Display name from the manifest; falls back to `slug` until loaded. */
    name: string;
    /** Available when state === "loaded". */
    orderCount: number | null;
    /** Available when state === "loaded". Sorted, deduped schemaIds. */
    schemas: readonly string[] | null;
    /** The full manifest when state === "loaded". Avoids re-fetching from
     *  consumers that need it (e.g. fork). */
    manifest: AssemblyManifest | null;
}

/**
 * Lists every published assembly (optionally filtered to one author)
 * enriched with manifest data — name, order count, schema set.
 *
 * Composes `usePublishedAssemblies` (event log) with a lazy per-row
 * manifest fetch. Both `PublishedList` (designer index) and the
 * operator-profile assembly picker consume this — keeping one fetch
 * strategy and one enriched shape means they can't drift apart.
 */
export function useAssemblyChoices(
    author?: `0x${string}` | undefined,
): { data: AssemblyChoice[] | null; isLoading: boolean; refetch: () => void } {
    const { data: events, isLoading, refetch } = usePublishedAssemblies(author);
    const chainId = useChainId();
    const [manifestState, setManifestState] = useState<
        Map<string, { state: AssemblyManifestFetchState; manifest: AssemblyManifest | null }>
    >(new Map());
    /** Hashes whose fetch has already been kicked off. A ref (not state)
     *  because we want to guard against double-fetch without retriggering
     *  the effect every time we add an entry. */
    const inFlightRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!events || events.length === 0) return;
        for (const event of events) {
            if (inFlightRef.current.has(event.contentHash)) continue;
            inFlightRef.current.add(event.contentHash);
            setManifestState((prev) => {
                const next = new Map(prev);
                next.set(event.contentHash, { state: "loading", manifest: null });
                return next;
            });
            fetchAssemblyManifest(event.metadataURI).then(
                (manifest) => {
                    setManifestState((prev) => {
                        const next = new Map(prev);
                        next.set(
                            event.contentHash,
                            manifest
                                ? { state: "loaded", manifest }
                                : { state: "error", manifest: null },
                        );
                        return next;
                    });
                },
                () => {
                    setManifestState((prev) => {
                        const next = new Map(prev);
                        next.set(event.contentHash, { state: "error", manifest: null });
                        return next;
                    });
                },
            );
        }
    }, [events]);

    // Memoize the derived array so its reference is stable across renders
    // when none of its inputs (events, manifestState, chainId) have changed.
    // Without this, the .map allocates a fresh array on every render, which
    // breaks every downstream useEffect that depends on `choices` — most
    // notably the OnboardingAssembliesForm's autosave effect, which would
    // refire on every render, call update(), trigger another render, and
    // freeze the UI in an infinite loop.
    const data = useMemo<AssemblyChoice[] | null>(() => {
        if (!events) return null;
        const networkTarget = chainIdToNetworkTarget(chainId);
        return events.map((event) => {
            const entry = manifestState.get(event.contentHash);
            const state = entry?.state ?? "loading";
            const manifest = entry?.manifest ?? null;
            return {
                slug: event.slug,
                author: event.author,
                contentHash: event.contentHash,
                metadataURI: event.metadataURI,
                blockNumber: event.blockNumber,
                networkTargets: [networkTarget],
                state,
                name: manifest?.name ?? event.slug,
                orderCount: manifest ? manifest.orders.length : null,
                schemas: manifest ? collectAssemblySchemas(manifest) : null,
                manifest,
            };
        });
    }, [events, manifestState, chainId]);
    return { data, isLoading, refetch };
}

/** A merchant's on-chain bound assembly, manifest resolved. */
export interface BoundAssembly {
    slug: string;
    /** Display name from the manifest; falls back to the slug. */
    name: string;
    manifest: AssemblyManifest;
    /** Canonical fulfilment method of the root order — the buyer's
     *  selection when this assembly is picked. `null` when the root
     *  fulfilment clause is absent or malformed. */
    fulfilmentMethod: CanonicalFulfilmentMethod | null;
}

export interface MerchantBoundAssemblies {
    /** The merchant's on-chain bound assemblies, manifests resolved —
     *  the buyer-facing choice set at checkout. Each bound assembly is
     *  one option the operator offers; the buyer picks one. */
    assemblies: BoundAssembly[];
    /** Union of root-order fulfilment modalities across the bound
     *  assemblies. Derived from `assemblies` — kept for callers that
     *  only need the flat modality set. */
    modalities: string[];
    /** True while either the operator-profile or the manifest fetches are in flight. */
    isLoading: boolean;
    /** True when at least one of the merchant's bindings matched a published assembly. */
    hasOnChainBinding: boolean;
}

/** Extract the fulfilment shape (modalities + coordinations) from a
 *  manifest's root order agreement. The root order is the first order in
 *  the topology — if a consumer needs sub-order fulfilment, they walk the
 *  orders array themselves. */
function extractRootFulfilment(
    manifest: AssemblyManifest,
): { modalities: string[]; coordinations: string[] } {
    const empty = { modalities: [], coordinations: [] };
    const rootOrder = manifest.orders[0];
    if (!rootOrder?.agreementHash) return empty;
    const agreement = manifest.agreements[rootOrder.agreementHash];
    if (!agreement) return empty;
    const fulfilmentSection = agreement.sections.find(
        (s: { schema: string }) => s.schema === "figaro-fulfilment-v2",
    );
    const data = fulfilmentSection?.data as
        | { modalities?: unknown; coordinations?: unknown }
        | undefined;
    return {
        modalities: Array.isArray(data?.modalities) ? (data!.modalities as string[]) : [],
        coordinations: Array.isArray(data?.coordinations) ? (data!.coordinations as string[]) : [],
    };
}

/**
 * Resolves a merchant's on-chain bound assemblies into the buyer-facing
 * choice set. Reads the merchant's operator profile (OperatorRegistry →
 * IPFS), intersects the profile's `assemblyBindings[].assemblySlug` with
 * the published assembly events, and fetches each matched manifest.
 *
 * When `hasOnChainBinding` is true, `assemblies` is the authoritative
 * buyer-facing choice set — the buyer picks one assembly at checkout —
 * and `modalities` is the flat union of their root-order fulfilment
 * modalities. When false, the caller falls back to the catalogue.
 */
export function useMerchantBoundAssemblies(
    merchantAddress: `0x${string}` | undefined,
): MerchantBoundAssemblies {
    const { data: registryData, isLoading: registryLoading } = useOperatorProfile(merchantAddress);
    const { data: publishedEvents, isLoading: eventsLoading } = useAllPublishedAssemblies();
    const [result, setResult] = useState<MerchantBoundAssemblies>({
        assemblies: [],
        modalities: [],
        isLoading: false,
        hasOnChainBinding: false,
    });

    useEffect(() => {
        if (!merchantAddress) {
            setResult({ assemblies: [], modalities: [], isLoading: false, hasOnChainBinding: false });
            return;
        }
        if (registryLoading || eventsLoading) {
            setResult((r) => ({ ...r, isLoading: true }));
            return;
        }
        if (!registryData || !publishedEvents) {
            setResult({ assemblies: [], modalities: [], isLoading: false, hasOnChainBinding: false });
            return;
        }

        const [metadataURI] = registryData;
        const url = resolveContentURI(metadataURI);
        if (!url) {
            setResult({ assemblies: [], modalities: [], isLoading: false, hasOnChainBinding: false });
            return;
        }

        let cancelled = false;
        setResult((r) => ({ ...r, isLoading: true }));

        (async () => {
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error("operator profile fetch failed");
                const doc = await response.json();
                const profile = tryParseOperatorProfileDocument(doc);
                if (cancelled) return;
                if (!profile?.assemblyBindings || profile.assemblyBindings.length === 0) {
                    setResult({ assemblies: [], modalities: [], isLoading: false, hasOnChainBinding: false });
                    return;
                }

                const merchantSlugs = new Set(profile.assemblyBindings.map((b) => b.assemblySlug));
                const matchedEvents = publishedEvents.filter((e) => merchantSlugs.has(e.slug));
                if (matchedEvents.length === 0) {
                    setResult({ assemblies: [], modalities: [], isLoading: false, hasOnChainBinding: false });
                    return;
                }

                const manifests = await Promise.all(
                    matchedEvents.map((e) => fetchAssemblyManifest(e.metadataURI)),
                );
                if (cancelled) return;

                // matchedEvents and manifests are index-aligned (Promise.all
                // over a .map preserves order). Pair them into BoundAssembly,
                // dropping any manifest that failed to fetch.
                const assemblies: BoundAssembly[] = [];
                const modalitySet = new Set<string>();
                manifests.forEach((m, i) => {
                    if (!m) return;
                    const { modalities, coordinations } = extractRootFulfilment(m);
                    assemblies.push({
                        slug: matchedEvents[i].slug,
                        name: m.name || matchedEvents[i].slug,
                        manifest: m,
                        fulfilmentMethod: deriveCanonicalFulfilmentMethod(modalities, coordinations),
                    });
                    for (const mode of modalities) modalitySet.add(mode);
                });

                setResult({
                    assemblies,
                    modalities: Array.from(modalitySet),
                    isLoading: false,
                    hasOnChainBinding: true,
                });
            } catch {
                if (!cancelled) {
                    setResult({ assemblies: [], modalities: [], isLoading: false, hasOnChainBinding: false });
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [merchantAddress, registryData, publishedEvents, registryLoading, eventsLoading]);

    return result;
}

// ── Write hook ────────────────────────────────────────────────────────────────

export function usePublishAssembly() {
    const client = usePublicClient();
    const { address } = useAccount();
    const { writeContractAsync, data: hash, isPending, error: writeError } =
        useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

    /** Build a manifest from the snapshot, pin to IPFS, fetch the
     *  registry's deposit amount, simulate to catch reverts (slug
     *  collision, wrong deposit) BEFORE opening the wallet, send the
     *  transaction, then wait for the receipt and verify status is
     *  `success`. Returns the transaction hash + IPFS URI on confirmed
     *  success. Throws on any failure — no wallet, IPFS down,
     *  insufficient ETH, slug collision, on-chain revert, etc. */
    async function publish(snapshot: DesignSnapshot): Promise<PublishOutcome> {
        const registry = getAssemblyRegistry();
        if (!registry) {
            throw new Error(
                "AssemblyRegistry address not configured (NEXT_PUBLIC_ASSEMBLY_REGISTRY).",
            );
        }
        if (!client) {
            throw new Error("No public client available to read the registration deposit.");
        }
        if (!address) {
            throw new Error("Connect a wallet before publishing.");
        }
        if (snapshot.orders.length > MAX_NODES_PER_ASSEMBLY) {
            throw new Error(
                `Assembly has ${snapshot.orders.length} orders; the per-process gas ceiling is ${MAX_NODES_PER_ASSEMBLY}. Compose multiple processes instead.`,
            );
        }
        const deposit = await client.readContract({
            address: registry,
            abi: ASSEMBLY_REGISTRY_ABI,
            functionName: "registrationDeposit",
        });
        const manifest = buildAssemblyManifest(snapshot);
        const { json, contentHash } = serializeManifest(manifest);
        const ipfs = await DEFAULT_IPFS_SERVICE.publishJSON(JSON.parse(json));

        // Simulate before opening the wallet — catches slug collision /
        // wrong-deposit reverts so the user sees a typed error instead of
        // a silent on-chain revert post-submission.
        try {
            await client.simulateContract({
                address: registry,
                abi: ASSEMBLY_REGISTRY_ABI,
                functionName: "registerAssembly",
                args: [manifest.slug, contentHash, ipfs.uri],
                value: deposit,
                account: address,
            });
        } catch (err) {
            throw translatePublishRevert(err, manifest.slug);
        }

        const txHash = await writeContractAsync({
            address: registry,
            abi: ASSEMBLY_REGISTRY_ABI,
            functionName: "registerAssembly",
            args: [manifest.slug, contentHash, ipfs.uri],
            value: deposit,
        });

        // Wait for the transaction to be mined and verify it didn't revert
        // on-chain. `writeContractAsync` only confirms wallet submission;
        // without this wait the UI could declare success on a transaction
        // that the chain ultimately rejected.
        const receipt = await client.waitForTransactionReceipt({ hash: txHash });
        if (receipt.status !== "success") {
            throw new Error(
                `Publish transaction reverted on-chain (tx ${txHash}). The slug binding was not created.`,
            );
        }

        return { hash: txHash, ipfsURI: ipfs.uri };
    }

    return {
        publish,
        hash,
        isPending,
        isConfirming,
        isSuccess,
        error: writeError,
    };
}
