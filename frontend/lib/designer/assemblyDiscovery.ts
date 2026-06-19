/**
 * assemblyDiscovery — the publish-build + template-enrichment orchestration
 * layer over the on-chain `AssemblyRegistry` hooks (`@/lib/mechanisms/useAssemblyRegistry`).
 *
 * This is designer-tier composition: it builds the off-chain assembly
 * template from a design snapshot, pins it, registers it, and enriches the
 * event-derived published list into selectable/inspectable `AssemblyChoice`s.
 * designer/→mechanisms/ is a legal downward arrow.
 *
 * Publish flow:
 *   1. Build a full off-chain assemblyTemplate from the snapshot — topology
 *      (orders array), per-order agreement bodies (inlined), and prose.
 *   2. Compute the canonical content hash (keccak256 of stable JSON).
 *   3. Pin the assemblyTemplate to IPFS via DEFAULT_IPFS_SERVICE.
 *   4. Call AssemblyRegistry.registerAssembly(slug, contentHash,
 *      metadataURI). Before the call, a CLIENT-SIDE publish guard checks
 *      that the node count (orders.length) fits the per-process gas
 *      ceiling, derived at runtime from the active chain's block gas limit
 *      via `maxOrdersResolvablePerProcess` in `@/lib/shared/chainGasCeilings`.
 *      The count is not a contract parameter and is never stored on-chain.
 *      All other content validation lives at the per-clause layer and runs
 *      when each order's clauses are attested at commit time.
 *
 * No graceful retry, no optimistic UI — the publish is a single atomic
 * step from the user's POV: success means the slug is permanently bound
 * to (msg.sender, contentHash, ipfs URI).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { activeChain } from "@/lib/shared/wagmi";
import { DEFAULT_IPFS_SERVICE } from "@/lib/shared/ipfsService";
import { clauseDeclaresField, clauseIsProcessLog } from "@/lib/shared/clauseSpecSource";
import type { DesignSnapshot } from "@/lib/designer/syntheticDesignStore";
import { buildAssemblyTemplate, serializeAssemblyTemplate, deriveAssemblySlug, templateParentOrderIds, type AssemblyTemplate } from "@/lib/designer/assemblyTemplate";
import { maxOrdersResolvablePerProcess } from "@/lib/shared/chainGasCeilings";
import { DEVNET_CHAIN_ID } from "@/lib/shared/chains";
import {
    ASSEMBLY_REGISTRY_ABI,
    getAssemblyRegistry,
    usePublishedAssemblies,
    fetchAssemblyTemplate,
    translatePublishRevert,
    type PublishOutcome,
} from "@/lib/mechanisms/useAssemblyRegistry";

/**
 * Synthesize a `networkTargets` value for an on-chain-registered assembly
 * based on the chain its registry lives on. Derived rather than stored —
 * the AssemblyRegistry is per-chain, so the chain IS the network target.
 */
function chainIdToNetworkTarget(chainId: number): string {
    switch (chainId) {
        case DEVNET_CHAIN_ID:
            return "local-anvil";
        case 11155111:
            return "sepolia";
        case 1:
            return "mainnet";
        default:
            return `evm-${chainId}`;
    }
}

/** Walk the assemblyTemplate's inlined agreements and collect the unique set of
 *  clauses anchored across all orders. Sorted alphabetically for stable
 *  display order. */
function collectAssemblyClauses(template: AssemblyTemplate): string[] {
    const set = new Set<string>();
    for (const order of template.orders) {
        for (const clauseId of Object.keys(order.clauses)) set.add(clauseId);
    }
    return Array.from(set).sort();
}

/** Process clauses the seller must populate with counterparty wallets
 *  when they bind to this assembly. Emitted only for non-root orders
 *  whose parent's coordination clause is `seller-assigned` —
 *  the case where the buyer may pick a fulfiller from the seller's
 *  roster at checkout. When the parent's coordination is exclusively
 *  `dutch-auction` (the auction contract assigns the fulfiller at
 *  runtime) or `buyer-assigned` (the buyer picks freely at checkout),
 *  no roster is needed and no clause is emitted.
 *
 *  The sub-order's process clause is identified from its SPEC, never by
 *  name: a category-1 clause with an enum ladder that is not a companion
 *  (the runtime event-log a sub-order's seller advances). Whatever such
 *  clause the registry defines marks which kind of off-chain seller the
 *  sub-order needs. Returns the set of distinct clauseIds, sorted.
 *
 *  Root order is excluded — the rootBuyer is the connected wallet at
 *  checkout, not designated by the seller's profile. */
export function requiredCounterpartyClauses(template: AssemblyTemplate): string[] {
    const byId = new Map(template.orders.map((o) => [o.id, o]));

    function coordinationOf(order: AssemblyTemplate["orders"][number] | undefined): string | undefined {
        return readSingleSelectClauseField(order?.clauses, "coordination");
    }

    const clauses = new Set<string>();
    for (const order of template.orders) {
        if (templateParentOrderIds(order).length === 0) continue;

        const parentAllowsSellerAssigned = templateParentOrderIds(order).some((parentId) =>
            coordinationOf(byId.get(parentId)) === "seller-assigned",
        );
        if (!parentAllowsSellerAssigned) continue;

        for (const clauseId of Object.keys(order.clauses)) {
            if (clauseIsProcessLog(clauseId)) clauses.add(clauseId);
        }
    }
    return Array.from(clauses).sort();
}

/** Compact display formatting for a clause list. Strips the `figaro-`
 *  prefix and `-vN` version suffix. Shows the first three inline,
 *  summarizes the rest as `+N more`. Callers typically place the full
 *  set in the row's `title` tooltip. */
export function formatAssemblyClauseList(clauses: readonly string[]): string {
    const trimmed = clauses.map((s) => s.replace(/^figaro-/, "").replace(/-v\d+$/, ""));
    if (trimmed.length <= 3) return trimmed.join(", ");
    return `${trimmed.slice(0, 3).join(", ")}, +${trimmed.length - 3} more`;
}

/**
 * A published assembly enriched with assemblyTemplate-derived fields, suitable
 * for surfacing to a user as a selectable / inspectable choice.
 *
 * Template fetch is lazy per-row; `state` tracks the lifecycle. While
 * `state === "loading"`, `name` falls back to `slug` so the UI can
 * render the row immediately. When `state === "loaded"`, all
 * assemblyTemplate-derived fields are populated.
 */
/** Per-assembly assemblyTemplate fetch state: requested, succeeded, or failed. */
type AssemblyTemplateFetchState = "loading" | "loaded" | "error";

export interface AssemblyChoice {
    slug: string;
    author: `0x${string}`;
    contentHash: `0x${string}`;
    metadataURI: string;
    blockNumber: bigint;
    networkTargets: readonly string[];
    state: AssemblyTemplateFetchState;
    /** Display name from the assemblyTemplate; falls back to `slug` until loaded. */
    name: string;
    /** Available when state === "loaded". */
    orderCount: number | null;
    /** Available when state === "loaded". Sorted, deduped clauseIds. */
    clauses: readonly string[] | null;
    /** The full assembly template when state === "loaded". Avoids re-fetching
     *  from consumers that need it (e.g. fork). */
    assemblyTemplate: AssemblyTemplate | null;
}

/**
 * Lists every published assembly (optionally filtered to one author)
 * enriched with assemblyTemplate data — name, order count, clause set.
 *
 * Composes `usePublishedAssemblies` (event log) with a lazy per-row
 * assemblyTemplate fetch. Both `PublishedList` (designer index) and the
 * seller-profile assembly picker consume this — keeping one fetch
 * strategy and one enriched shape means they can't drift apart.
 */
export function useAssemblyChoices(
    author?: `0x${string}` | undefined,
): { data: AssemblyChoice[] | null; isLoading: boolean; refetch: () => void } {
    const { data: events, isLoading, refetch } = usePublishedAssemblies(author);
    // `activeChain` is env-determined; the read uses the standalone public
    // client bound to it. Wagmi's `useChainId` would reflect the connected
    // wallet's chain, which is irrelevant for a read against a fixed chain
    // — and undefined on the marketing tier where no provider is mounted.
    const chainId = activeChain.id;
    const [assemblyTemplateState, setAssemblyTemplateState] = useState<
        Map<string, { state: AssemblyTemplateFetchState; assemblyTemplate: AssemblyTemplate | null }>
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
            setAssemblyTemplateState((prev) => {
                const next = new Map(prev);
                next.set(event.contentHash, { state: "loading", assemblyTemplate: null });
                return next;
            });
            fetchAssemblyTemplate(event.metadataURI).then(
                (assemblyTemplate) => {
                    setAssemblyTemplateState((prev) => {
                        const next = new Map(prev);
                        next.set(
                            event.contentHash,
                            assemblyTemplate
                                ? { state: "loaded", assemblyTemplate }
                                : { state: "error", assemblyTemplate: null },
                        );
                        return next;
                    });
                },
                () => {
                    setAssemblyTemplateState((prev) => {
                        const next = new Map(prev);
                        next.set(event.contentHash, { state: "error", assemblyTemplate: null });
                        return next;
                    });
                },
            );
        }
    }, [events]);

    // Memoize the derived array so its reference is stable across renders
    // when none of its inputs (events, assemblyTemplateState, chainId) have changed.
    // Without this, the .map allocates a fresh array on every render, which
    // breaks every downstream useEffect that depends on `choices` — most
    // notably the OnboardingAssembliesForm's autosave effect, which would
    // refire on every render, call update(), trigger another render, and
    // freeze the UI in an infinite loop.
    const data = useMemo<AssemblyChoice[] | null>(() => {
        if (!events) return null;
        const networkTarget = chainIdToNetworkTarget(chainId);
        return events.map((event) => {
            const entry = assemblyTemplateState.get(event.contentHash);
            const state = entry?.state ?? "loading";
            const assemblyTemplate = entry?.assemblyTemplate ?? null;
            return {
                slug: event.slug,
                author: event.author,
                contentHash: event.contentHash,
                metadataURI: event.metadataURI,
                blockNumber: event.blockNumber,
                networkTargets: [networkTarget],
                state,
                // The editorial name from the pinned template once it loads;
                // the content-derived slug is the fallback (and the identity).
                name: assemblyTemplate?.name ?? event.slug,
                orderCount: assemblyTemplate ? assemblyTemplate.orders.length : null,
                clauses: assemblyTemplate ? collectAssemblyClauses(assemblyTemplate) : null,
                assemblyTemplate,
            };
        });
    }, [events, assemblyTemplateState, chainId]);
    return { data, isLoading, refetch };
}

/** Extract the single-select modality + coordination values from a
 *  assemblyTemplate's root order agreement. The root order is the first order in
 *  the topology — if a consumer needs a sub-order's modality, they walk the
 *  orders array themselves. */
/** Read a single-select clause scalar from an order's clause set BY DECLARED
 *  FIELD, never by clause name (open-world). One reader for the
 *  modality/coordination-style scalars. */
function readSingleSelectClauseField(
    clauses: Record<string, unknown> | undefined,
    fieldName: string,
): string | undefined {
    const data = Object.entries(clauses ?? {})
        .find(([clauseId]) => clauseDeclaresField(clauseId, fieldName))?.[1] as
        | Record<string, unknown>
        | undefined;
    const value = data?.[fieldName];
    return typeof value === "string" ? value : undefined;
}

export function extractRootModality(
    template: AssemblyTemplate,
): { modality?: string; coordination?: string } {
    const rootOrder =
        template.orders.find((o) => templateParentOrderIds(o).length === 0) ?? template.orders[0];
    return {
        modality: readSingleSelectClauseField(rootOrder?.clauses, "modality"),
        coordination: readSingleSelectClauseField(rootOrder?.clauses, "coordination"),
    };
}

// ── Write hook ────────────────────────────────────────────────────────────────

export function usePublishAssembly() {
    const client = usePublicClient();
    const { address } = useAccount();
    const { writeContractAsync, data: hash, isPending, error: writeError } =
        useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

    /** Build a assemblyTemplate from the snapshot, pin to IPFS, fetch the
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
        // Hard cap = the resolve ceiling: every order must settle in one atomic
        // resolveProcess within a block. Same ceiling the designer canvas gates
        // node addition on, so an assembly authored there never trips this — the
        // guard catches forked / hand-crafted templates. (Commit landing rate is
        // a checkout-time signal, not a size cap; see chainGasCeilings.)
        const perProcessCap = await maxOrdersResolvablePerProcess(client);
        if (snapshot.orders.length > perProcessCap) {
            throw new Error(
                `Assembly has ${snapshot.orders.length} orders; this chain settles at most ${perProcessCap} in one atomic resolveProcess. Compose multiple processes instead.`,
            );
        }
        const deposit = await client.readContract({
            address: registry,
            abi: ASSEMBLY_REGISTRY_ABI,
            functionName: "registrationDeposit",
        });
        // Publish the no-hash assembly template: per order, who's bound, its
        // topology parents, and the selected clauses. The fingerprint forms later
        // at checkout when the parties fill the clause fields.
        const template = buildAssemblyTemplate({
            name: snapshot.name.trim() || undefined,
            summary: snapshot.summary?.trim() || undefined,
            description: snapshot.description?.trim() || undefined,
            privilegedToken: snapshot.privilegedToken,
            orders: snapshot.orders,
            clausesByOrderId: snapshot.clausesByOrderId ?? {},
        });
        const { json, contentHash } = serializeAssemblyTemplate(template);
        // The slug is content-derived: identical compositions collapse to one
        // slug (the registry's first-write-wins dedups them); the user never
        // names it.
        const slug = deriveAssemblySlug(contentHash);
        const ipfs = await DEFAULT_IPFS_SERVICE.publishJSON(JSON.parse(json));

        // Simulate before opening the wallet — catches slug collision /
        // wrong-deposit reverts so the user sees a typed error instead of
        // a silent on-chain revert post-submission.
        try {
            await client.simulateContract({
                address: registry,
                abi: ASSEMBLY_REGISTRY_ABI,
                functionName: "registerAssembly",
                args: [slug, contentHash, ipfs.uri],
                value: deposit,
                account: address,
            });
        } catch (err) {
            throw translatePublishRevert(err, slug);
        }

        const txHash = await writeContractAsync({
            address: registry,
            abi: ASSEMBLY_REGISTRY_ABI,
            functionName: "registerAssembly",
            args: [slug, contentHash, ipfs.uri],
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

        return { hash: txHash, ipfsURI: ipfs.uri, slug };
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
