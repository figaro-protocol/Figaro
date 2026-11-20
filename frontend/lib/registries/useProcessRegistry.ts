/**
 * useProcessRegistry — on-chain hooks for the `ProcessRegistry`. Parallel
 * to `useMembersRegistry` (members) and the clause-registry wiring (clauses)
 * per the separation-of-concerns doctrine.
 *
 * This is the thin on-chain layer: the ABI, registry-address resolution, the
 * event-derived read hooks, the revert translator, and the IPFS assembly
 * fetch. The publish-build + assembly-enrichment orchestration lives one
 * layer up in `@/lib/registries/assemblyChoices`; the member-profile
 * resolution lives in `@/lib/registries/useMemberBoundAssemblies`. This file
 * imports nothing from `wagmi`, so a page with no wallet provider reads
 * through it; the withdraw hook, which needs a wallet, is
 * `useWithdrawAssembly` in `@/lib/registries/useWithdrawStake`.
 */

import { isValidAddress } from "@/lib/shared/evm";
import { anchorProcessDesign, parseProcessRegistryLogs, type Anchored, type HydratedProcessDesign } from "@figaro-protocol/sdk";
import { PROCESS_REGISTRY_ABI, REGISTRY_CONTRACTS } from "@/lib/registries/contracts";
import { safeJsonParse } from "@/lib/shared/safeJson";
import { sharedRegisterRevertMessage } from "@/lib/registries/registryRevertMessages";
import type { RevertMessage } from "@/lib/shared/errors";
import { createRegistryEventScan, useDesurfaced } from "@/lib/registries/registryEventScan";
import { fetchPinnedDocument, readRegistryBinding } from "@/lib/registries/registryDocument";
import { hydrateAnchoredAssembly, getRegisteredAgreementLoadError } from "@/lib/registries/useAgreementRegistry";
import {
    deriveProcessDesignSlug,
    type ProcessDesign,
} from "@/lib/shared/assembly";

// Per-process gas ceiling lives in `@/lib/shared/chainGasCeilings`
// (`maxOrdersResolvablePerProcess`) — the ceiling depends on the active
// chain's block gas limit; it is never a hardcoded literal. Callers that
// need the chain-aware cap import `maxOrdersResolvablePerProcess` directly.

export function getProcessRegistry(): `0x${string}` | null {
    const a = REGISTRY_CONTRACTS.processRegistry;
    return isValidAddress(a) ? a : null;
}

export interface PublishOutcome {
    hash: `0x${string}`;
    ipfsURI: string;
    /** The content-derived slug the assembly was registered under. */
    slug: string;
    /** Each agreement this publish registered on `AgreementRegistry` before
     *  the assembly (a newly agreement no registry bound yet): its
     *  key, the registration's transaction and the pinned document's URI. */
    agreements: { agreementHash: `0x${string}`; hash: `0x${string}`; ipfsURI: string }[];
}

// ── Read hooks (event-derived) ────────────────────────────────────────────────

/**
 * A single registered assembly, reconstructed from an `ProcessRegistered`
 * event. processDesignHash + registeredBy come from indexed topics; contentURI is
 * event data. The slug exists nowhere on-chain — it is derived here as a
 * pure function of processDesignHash (`deriveProcessDesignSlug`).
 */
interface PublishedAssembly {
    slug: string;
    registeredBy: `0x${string}`;
    processDesignHash: `0x${string}`;
    contentURI: string;
    blockNumber: bigint;
    transactionHash: `0x${string}`;
    /** True when the registeredBy reclaimed the registration stake (K4:
     *  surfacing derives from the live stake — withdraw = de-surface).
     *  The binding itself is permanent; committed processes are
     *  unaffected. */
    stakeWithdrawn: boolean;
}

/** The `ProcessRegistry.registerProcess` revert table, by error name. Used
 *  by `publish()` to surface a specific cause (composition already anchored,
 *  wrong deposit, empty fields) instead of viem's default "execution
 *  reverted" message; a name it leaves unmapped falls to the shared
 *  error-name translation. */
export function assemblyRegisterRevertMessage(attemptedSlug: string): RevertMessage {
    return (name, args) => {
        switch (name) {
            case "ProcessAlreadyRegistered":
                return `This assembly is already published — an identical composition is anchored on-chain as "${attemptedSlug}". Identity is the composition, so the same composition always maps to one binding; adopt the existing one rather than re-publishing.`;
            case "ZeroProcessDesignHash":
                return "Computed an empty assembly hash — likely a assembly-builder bug.";
            default:
                return sharedRegisterRevertMessage(name, args);
        }
    };
}

/**
 * Reads `ProcessRegistered` events from the registry, optionally filtered
 * to a specific registering wallet. Returns the most-recent-first list — the
 * composition binding is first-write-wins on-chain, so duplicates per
 * processDesignHash shouldn't occur, but if they do (e.g. a stale fork
 * chain), the most-recent block wins.
 *
 * SURFACING DERIVES FROM THE LIVE STAKE (K4): `WithdrawalRequested` events
 * fold in as `stakeWithdrawn`. The network-wide read (registeredBy === undefined
 * — every discovery/inventory/checkout surface) DROPS withdrawn
 * assemblies: withdraw = de-surface. The registeredBy-scoped read keeps them,
 * flagged — a registering wallet must still see (and reason about) their own
 * withdrawn bindings.
 *
 * The paired scan is the shared factory shape (`createRegistryEventScan`):
 * both streams ride the event cache through the standalone `publicClient`
 * (so the marketing tier, which mounts no wallet provider, renders it), and
 * `failed` reports a read that THREW — distinct from resolved-empty. To pick
 * up a newly published assembly after mount, call `refetch`.
 */
const useProcessRegistryScan = createRegistryEventScan<PublishedAssembly>({
    getRegistry: getProcessRegistry,
    abi: PROCESS_REGISTRY_ABI,
    registeredEventName: "ProcessRegistered",
    withdrawnEventName: "WithdrawalRequested",
    label: "usePublishedAssemblies",
    toRows: (registeredLogs, withdrawnLogs, registeredBy) => {
        // Decoding is the SDK's — one parse per family.
        const withdrawn = new Set(
            parseProcessRegistryLogs(withdrawnLogs).withdrawn
                .map((w) => w.processDesignHash.toLowerCase()),
        );
        const items: PublishedAssembly[] = parseProcessRegistryLogs(registeredLogs).registered.map((row) => ({
            slug: deriveProcessDesignSlug(row.processDesignHash),
            registeredBy: row.registeredBy,
            processDesignHash: row.processDesignHash,
            contentURI: row.contentURI,
            blockNumber: BigInt(row.blockNumber),
            transactionHash: (row.transactionHash ?? "0x") as `0x${string}`,
            stakeWithdrawn: withdrawn.has(row.processDesignHash.toLowerCase()),
        }));
        items.sort((a, b) => Number(b.blockNumber - a.blockNumber));
        // All rows, flagged — the de-surface policy is applied in
        // `usePublishedAssemblies`, where a consumer that must SHOW
        // withdrawn stakes (the registry explorer's withdrawn view) can
        // opt out of it.
        return items;
    },
});

export function usePublishedAssemblies(
    registeredBy: `0x${string}` | undefined,
    opts?: { includeWithdrawn?: boolean },
) {
    return useDesurfaced(useProcessRegistryScan({ registeredBy }), registeredBy, opts);
}

/**
 * Convenience wrapper for the unfiltered "all published assemblies" case.
 * Used by surfaces like the onboarding assembly-picker that need every
 * registered assembly regardless of who registered it.
 */
export function useAllPublishedAssemblies() {
    return usePublishedAssemblies(undefined);
}

/**
 * Fetch the IPFS-pinned assembly at `contentURI` and VERIFY it
 * against the anchored identity: the fetched document's recomputed
 * assembly hash must equal the on-chain `processDesignHash`. A document
 * that fails verification is treated exactly like an unreachable one —
 * null, never rendered (a tampered or mismatched pin is absence, not
 * content). Returns null on gateway failure, malformed JSON, or hash
 * mismatch.
 */
/** PERMANENT failures, by assembly root: the assembly the binding points
 *  at was served and is not the one the root anchors, or an agreement's
 *  registered agreement failed permanently (`getRegisteredAgreementLoadError`).
 *  A gateway miss keeps nothing and is read again; this is never re-read. */
const loadErrors = new Map<string, string>();

/** The permanent load failure recorded for a assembly root, if any. */
export function getAssemblyLoadError(processDesignHash: string): string | undefined {
    return loadErrors.get(processDesignHash.toLowerCase());
}

export async function fetchAssembly(
    contentURI: string,
    expectedProcessDesignHash: `0x${string}`,
): Promise<Anchored<ProcessDesign> | null> {
    // Size-capped fetch (F4) and a reviver-backed parse: the processDesignHash proves
    // DESIGNER-integrity, not prototype-pollution safety — the registering wallet is
    // untrusted (the ProcessRegistry is permissionless), so a hostile assembly can be
    // anchored under its own hash and pass verification. Matches the clause-spec path;
    // strips __proto__/constructor/prototype.
    return fetchPinnedDocument(
        contentURI,
        (text) => anchorProcessDesign(safeJsonParse<unknown>(text), expectedProcessDesignHash),
        () => {
            loadErrors.set(expectedProcessDesignHash.toLowerCase(), `integrity failure at ${contentURI}: the document is not the assembly the root anchors`);
            console.warn(
                `[fetchAssembly] integrity failure at ${contentURI}: the document is not the assembly whose composition the chain anchors (${expectedProcessDesignHash}) — dropping`,
            );
        },
    );
}

/**
 * The assembly a checkout, a view or a member profile consumes: the assembly
 * read and verified against its assembly root (`fetchAssembly`),
 * then every agreement's registered agreement read from `AgreementRegistry`
 * by key and verified against it (`hydrateAnchoredAssembly`). Null when the
 * assembly or any agreement's agreement is absent — the assembly is not
 * offered, and nothing falls back to a bundled copy.
 */
export async function fetchHydratedAssembly(
    contentURI: string,
    expectedProcessDesignHash: `0x${string}`,
): Promise<HydratedProcessDesign | null> {
    const assembly = await fetchAssembly(contentURI, expectedProcessDesignHash);
    if (!assembly) return null;
    const hydrated = await hydrateAnchoredAssembly(assembly);
    if (hydrated === null) {
        // Absence that can never resolve: an agreement's agreement was served
        // and is not the agreement its key names.
        const failed = assembly.agreements.find((entry) => getRegisteredAgreementLoadError(entry.agreementHash));
        if (failed) {
            loadErrors.set(
                expectedProcessDesignHash.toLowerCase(),
                `agreement ${failed.id} binds ${failed.agreementHash}, whose document is not the agreement the key names`,
            );
        }
    }
    return hydrated;
}

/**
 * The assembly an `ProcessRegistry` binding names, read BY ITS COMPOSITION
 * ROOT (whatever the stake: bindings are never cleared) and verified against
 * it — what the usage planner needs for an agreement's membership proof.
 * Null when unbound, unreachable or not the assembly the root names.
 */
export async function fetchAssemblyByHash(
    processDesignHash: `0x${string}`,
): Promise<Anchored<ProcessDesign> | null> {
    const registry = getProcessRegistry();
    if (!registry) return null;
    const binding = await readRegistryBinding(registry, PROCESS_REGISTRY_ABI, processDesignHash);
    return binding ? fetchAssembly(binding[3], processDesignHash) : null;
}

/**
 * The hydrated assembly an agreement's provenance names, read BY ITS
 * COMPOSITION ROOT (`fetchAssemblyByHash`) and every agreement's registered
 * agreement read and verified against its key (`hydrateAnchoredAssembly`) —
 * the design the sign gate checks the designer's values against. Null when
 * the assembly or any registered agreement is unbound, unreachable or not
 * the document its key names.
 */
export async function fetchHydratedAssemblyByHash(
    processDesignHash: `0x${string}`,
): Promise<HydratedProcessDesign | null> {
    const assembly = await fetchAssemblyByHash(processDesignHash);
    return assembly ? hydrateAnchoredAssembly(assembly) : null;
}
