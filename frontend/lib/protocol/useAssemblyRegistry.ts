/**
 * useAssemblyRegistry — on-chain hooks for the `AssemblyRegistry`. Parallel
 * to `useMembersRegistry` (sellers) and the clause-registry wiring (clauses)
 * per the separation-of-concerns doctrine.
 *
 * This is the thin on-chain layer: the ABI, registry-address resolution, the
 * event-derived read hooks, the revert translator, and the IPFS template
 * fetch. The publish-build + template-enrichment orchestration lives one
 * layer up in `@/lib/protocol/assemblyChoices`; the member-profile
 * resolution lives in `@/lib/member/useMemberBoundAssemblies`. This file
 * imports only viem / wagmi / `@/lib/shared/*` / `@/lib/kernel/*`.
 */

import { hexEqual, isValidAddress } from "@/lib/shared/evm";
import { parseAssemblyRegistryLogs } from "@figaro-protocol/sdk";
import { ASSEMBLY_REGISTRY_ABI, CONTRACTS } from "@/lib/kernel/contracts";
import { DEFAULT_IPFS_SERVICE, fetchCappedContent } from "@/lib/shared/ipfsService";
import { safeJsonParse } from "@/lib/shared/safeJson";
import {
    createUseWithdrawStake,
    translateContractRevert,
    withdrawRevertMessage,
} from "@/lib/protocol/useWithdrawStake";
import { createRegistryEventScan } from "@/lib/protocol/registryEventScan";
import {
    deriveAssemblySlug,
    templateCompositionHash,
    type AssemblyTemplate,
} from "@/lib/shared/assemblyTemplate";

// Per-process gas ceiling lives in `@/lib/shared/chainGasCeilings`
// (`maxOrdersResolvablePerProcess`) — the ceiling depends on the active
// chain's block gas limit; it is never a hardcoded literal. Callers that
// need the chain-aware cap import `maxOrdersResolvablePerProcess` directly.

export function getAssemblyRegistry(): `0x${string}` | null {
    const a = CONTRACTS.assemblyRegistry;
    return isValidAddress(a) ? a : null;
}

export interface PublishOutcome {
    hash: `0x${string}`;
    ipfsURI: string;
    /** The content-derived slug the assembly was registered under. */
    slug: string;
}

// ── Read hooks (event-derived) ────────────────────────────────────────────────

/**
 * A single registered assembly, reconstructed from an `AssemblyRegistered`
 * event. compositionHash + registeredBy come from indexed topics; contentURI is
 * event data. The slug exists nowhere on-chain — it is derived here as a
 * pure function of compositionHash (`deriveAssemblySlug`).
 */
interface PublishedAssembly {
    slug: string;
    registeredBy: `0x${string}`;
    compositionHash: `0x${string}`;
    contentURI: string;
    blockNumber: bigint;
    transactionHash: `0x${string}`;
    /** True when the registeredBy reclaimed the registration deposit (K4:
     *  surfacing derives from the live stake — withdraw = de-surface).
     *  The binding itself is permanent; committed processes are
     *  unaffected. */
    stakeWithdrawn: boolean;
}

/** Map an `AssemblyRegistry` revert into a human-readable Error. Used by
 *  `publish()` to surface a specific cause (composition already anchored,
 *  wrong deposit, empty fields) instead of viem's default "execution
 *  reverted" message. Falls through to the original error for anything we
 *  don't recognize. */
export function translatePublishRevert(err: unknown, attemptedSlug: string): Error {
    return translateContractRevert(err, (name, args) => {
        switch (name) {
            case "CompositionAlreadyRegistered":
                return `This assembly is already published — an identical composition is anchored on-chain as "${attemptedSlug}". Identity is the composition, so the same composition always maps to one binding; adopt the existing one rather than re-publishing.`;
            case "WrongDeposit": {
                const provided = (args?.[0] as bigint | undefined)?.toString() ?? "?";
                const required = (args?.[1] as bigint | undefined)?.toString() ?? "?";
                return `Registration deposit mismatch (provided ${provided} wei, required ${required} wei). The deposit amount changed between the read and the send — retry.`;
            }
            case "EmptyContentURI":
                return "The IPFS pin returned an empty URI.";
            case "ZeroCompositionHash":
                return "Computed an empty composition hash — likely a assemblyTemplate-builder bug.";
            default:
                return null;
        }
    });
}

/**
 * Reclaim an assembly's registration stake (`AssemblyRegistry.withdrawDeposit`).
 * The binding is permanent — withdraw only moves the deposit and de-surfaces
 * the assembly for NEW orders; committed processes keep resolving. Gating on
 * in-flight deals is the caller's job via `useWithdrawGate` (advisory,
 * off-chain); this hook is the plain registeredBy-only write. Simulates first to
 * surface a typed revert before opening the wallet, sends, then waits for a
 * `success` receipt. Throws on any failure.
 */
export const useWithdrawAssembly = createUseWithdrawStake({
    getRegistry: getAssemblyRegistry,
    abi: ASSEMBLY_REGISTRY_ABI,
    notConfiguredMessage: "AssemblyRegistry address not configured (NEXT_PUBLIC_ASSEMBLY_REGISTRY).",
    revertMessage: withdrawRevertMessage("assembly"),
});

/**
 * Reads `AssemblyRegistered` events from the registry, optionally filtered
 * to a specific registering wallet. Returns the most-recent-first list — the
 * composition binding is first-write-wins on-chain, so duplicates per
 * compositionHash shouldn't occur, but if they do (e.g. a stale fork
 * chain), the most-recent block wins.
 *
 * SURFACING DERIVES FROM THE LIVE STAKE (K4): `DepositWithdrawn` events
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
const useAssemblyRegistryScan = createRegistryEventScan<PublishedAssembly>({
    getRegistry: getAssemblyRegistry,
    abi: ASSEMBLY_REGISTRY_ABI,
    registeredEventName: "AssemblyRegistered",
    withdrawnEventName: "DepositWithdrawn",
    label: "usePublishedAssemblies",
    toRows: (registeredLogs, withdrawnLogs, registeredBy) => {
        // Decoding is the SDK's — one parse per family.
        const withdrawn = new Set(
            parseAssemblyRegistryLogs(withdrawnLogs).withdrawn
                .map((w) => w.compositionHash.toLowerCase()),
        );
        const items: PublishedAssembly[] = parseAssemblyRegistryLogs(registeredLogs).registered.map((row) => ({
            slug: deriveAssemblySlug(row.compositionHash),
            registeredBy: row.registeredBy,
            compositionHash: row.compositionHash,
            contentURI: row.contentURI,
            blockNumber: BigInt(row.blockNumber),
            transactionHash: (row.transactionHash ?? "0x") as `0x${string}`,
            stakeWithdrawn: withdrawn.has(row.compositionHash.toLowerCase()),
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
    const scan = useAssemblyRegistryScan({ registeredBy });
    // Withdraw = de-surface: the network-wide read powers every surfacing
    // path, so it drops withdrawn stakes; the registering wallet's own read
    // keeps them, flagged, and `includeWithdrawn` keeps them for a reader
    // whose job is showing the withdrawn set (the registry explorer).
    const keep = !!registeredBy || !!opts?.includeWithdrawn;
    const data = scan.data && !keep ? scan.data.filter((i) => !i.stakeWithdrawn) : scan.data;
    return { ...scan, data };
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
 * Fetch the IPFS-pinned assemblyTemplate at `contentURI` and VERIFY it
 * against the anchored identity: the fetched document's recomputed
 * composition hash must equal the on-chain `compositionHash`. A document
 * that fails verification is treated exactly like an unreachable one —
 * null, never rendered (a tampered or mismatched pin is absence, not
 * content). Returns null on gateway failure, malformed JSON, or hash
 * mismatch.
 */
export async function fetchAssemblyTemplate(
    contentURI: string,
    expectedCompositionHash: `0x${string}`,
): Promise<AssemblyTemplate | null> {
    const url = DEFAULT_IPFS_SERVICE.resolveFetchUrl(contentURI);
    if (!url) return null;
    try {
        // Size-capped fetch (F4): an oversized pin aborts mid-stream (throws →
        // the catch below → null) before the hash check would buffer it.
        const response = await fetchCappedContent(url);
        if (!response.ok) return null;
        // Reviver-backed parse: the compositionHash proves AUTHOR-integrity,
        // not prototype-pollution safety — the registering wallet is untrusted (the
        // AssemblyRegistry is permissionless), so a hostile template can be
        // anchored under its own hash and pass verification (audit 2026-07-23).
        // Matches the clause-spec path; strips __proto__/constructor/prototype.
        const template = safeJsonParse<AssemblyTemplate>(await response.text());
        if (!template) return null;
        const recomputed = templateCompositionHash(template);
        if (!hexEqual(recomputed, expectedCompositionHash)) {
            console.warn(
                `[fetchAssemblyTemplate] integrity failure at ${contentURI}: document composition hashes to ${recomputed}, chain anchors ${expectedCompositionHash} — dropping`,
            );
            return null;
        }
        return template;
    } catch {
        return null;
    }
}
