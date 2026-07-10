/**
 * useAssemblyRegistry — on-chain hooks for the `AssemblyRegistry`. Parallel
 * to `useSellerRegistry` (sellers) and the clause-registry wiring (clauses)
 * per the separation-of-concerns doctrine.
 *
 * This is the thin on-chain layer: the ABI, registry-address resolution, the
 * event-derived read hooks, the revert translator, and the IPFS template
 * fetch. The publish-build + template-enrichment orchestration lives one
 * layer up in `@/lib/protocol/assemblyChoices`; the seller-profile
 * resolution lives in `@/lib/seller/useSellerBoundAssemblies`. This file
 * imports only viem / wagmi / `@/lib/shared/*` / `@/lib/kernel/*`.
 */

import { useCallback, useEffect, useState } from "react";
import { toError } from "@/lib/shared/errors";
import { BaseError, ContractFunctionRevertedError } from "viem";
import { parseAssemblyRegistryLogs } from "@figaro/core";
import { publicClient } from "@/lib/shared/wagmi";
import { ASSEMBLY_REGISTRY_ABI, CONTRACTS } from "@/lib/kernel/contracts";
import { DEFAULT_IPFS_SERVICE } from "@/lib/shared/ipfsService";
import {
    deriveAssemblySlug,
    templateCompositionHash,
    type AssemblyTemplate,
} from "@/lib/shared/assemblyTemplate";

// Per-process gas ceiling moved to `@/lib/shared/chainGasCeilings`
// (`maxOrdersResolvablePerProcess`) — the ceiling depends on the active
// chain's block gas limit and is no longer a hardcoded 2,145 literal.
// The old `MAX_NODES_PER_ASSEMBLY` export is gone; callers that need
// the chain-aware cap import `maxOrdersResolvablePerProcess` directly.

export function getAssemblyRegistry(): `0x${string}` | null {
    return CONTRACTS.assemblyRegistry || null;
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
 * event. compositionHash + author come from indexed topics; contentURI is
 * event data. The slug exists nowhere on-chain — it is derived here as a
 * pure function of compositionHash (`deriveAssemblySlug`).
 */
interface PublishedAssembly {
    slug: string;
    author: `0x${string}`;
    compositionHash: `0x${string}`;
    contentURI: string;
    blockNumber: bigint;
    transactionHash: `0x${string}`;
    /** True when the author reclaimed the registration deposit (K4:
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
    if (err instanceof BaseError) {
        const revert = err.walk(
            (e) => e instanceof ContractFunctionRevertedError,
        ) as ContractFunctionRevertedError | undefined;
        const name = revert?.data?.errorName;
        if (name === "CompositionAlreadyRegistered") {
            return new Error(
                `This assembly is already published — an identical composition is anchored on-chain as "${attemptedSlug}". Identity is the composition, so the same composition always maps to one binding; adopt the existing one rather than re-publishing.`,
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
        if (name === "EmptyContentURI") return new Error("The IPFS pin returned an empty URI.");
        if (name === "ZeroCompositionHash") return new Error("Computed an empty composition hash — likely a assemblyTemplate-builder bug.");
    }
    return toError(err);
}

/**
 * Reads `AssemblyRegistered` events from the registry, optionally filtered
 * to a specific author. Returns the most-recent-first list — the
 * composition binding is first-write-wins on-chain, so duplicates per
 * compositionHash shouldn't occur, but if they do (e.g. a stale fork
 * chain), the most-recent block wins.
 *
 * SURFACING DERIVES FROM THE LIVE STAKE (K4): `DepositWithdrawn` events
 * fold in as `stakeWithdrawn`. The network-wide read (author === undefined
 * — every discovery/inventory/checkout surface) DROPS withdrawn
 * assemblies: withdraw = de-surface. The author-scoped read keeps them,
 * flagged — an author must still see (and reason about) their own
 * withdrawn bindings.
 *
 * No caching, no auto-refresh. To pick up a newly published assembly
 * after mount, call `refetch`.
 */
export function usePublishedAssemblies(author: `0x${string}` | undefined) {
    const [data, setData] = useState<PublishedAssembly[] | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [generation, setGeneration] = useState(0);

    useEffect(() => {
        const registry = getAssemblyRegistry();
        if (!registry) {
            setData([]);
            return;
        }
        let cancelled = false;
        setIsLoading(true);

        // Reads through the standalone `publicClient` (not wagmi's
        // `usePublicClient`) so the hook works on the marketing tier too,
        // which mounts no wallet provider. App-tier callers see no
        // behavioural change: the standalone client uses the same chain
        // config wagmi's provider is built from.
        Promise.all([
            publicClient.getContractEvents({
                address: registry,
                abi: ASSEMBLY_REGISTRY_ABI,
                eventName: "AssemblyRegistered",
                args: author ? { author } : undefined,
                fromBlock: 0n,
                toBlock: "latest",
            }),
            publicClient.getContractEvents({
                address: registry,
                abi: ASSEMBLY_REGISTRY_ABI,
                eventName: "DepositWithdrawn",
                fromBlock: 0n,
                toBlock: "latest",
            }),
        ])
            .then(([logs, withdrawnLogs]) => {
                if (cancelled) return;
                // Decoding is the SDK's — one parse per family.
                const withdrawn = new Set(
                    parseAssemblyRegistryLogs(withdrawnLogs).withdrawn
                        .map((w) => w.compositionHash.toLowerCase()),
                );
                const items: PublishedAssembly[] = parseAssemblyRegistryLogs(logs).registered.map((row) => ({
                    slug: deriveAssemblySlug(row.compositionHash),
                    author: row.author,
                    compositionHash: row.compositionHash,
                    contentURI: row.contentURI,
                    blockNumber: BigInt(row.blockNumber),
                    transactionHash: (row.transactionHash ?? "0x") as `0x${string}`,
                    stakeWithdrawn: withdrawn.has(row.compositionHash.toLowerCase()),
                }));
                items.sort((a, b) => Number(b.blockNumber - a.blockNumber));
                // Withdraw = de-surface: the network-wide read powers every
                // surfacing path, so it drops withdrawn stakes; the author's
                // own read keeps them, flagged.
                setData(author ? items : items.filter((i) => !i.stakeWithdrawn));
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
    }, [author, generation]);

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
        const response = await fetch(url);
        if (!response.ok) return null;
        const template = (await response.json()) as AssemblyTemplate;
        const recomputed = templateCompositionHash(template);
        if (recomputed.toLowerCase() !== expectedCompositionHash.toLowerCase()) {
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
