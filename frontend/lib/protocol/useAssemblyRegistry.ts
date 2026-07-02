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
 * imports only viem / wagmi / `@/lib/shared/*` / `@/lib/core/*`.
 */

import { useCallback, useEffect, useState } from "react";
import { toError } from "@/lib/shared/errors";
import { BaseError, ContractFunctionRevertedError } from "viem";
import { publicClient } from "@/lib/shared/wagmi";
import { ASSEMBLY_REGISTRY_ABI, CONTRACTS } from "@/lib/core/contracts";
import { DEFAULT_IPFS_SERVICE } from "@/lib/shared/ipfsService";
import { type AssemblyTemplate } from "@/lib/shared/assemblyTemplate";

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
 * event. The slug + metadataURI are non-indexed event-data fields;
 * slugHash and author come from indexed topics.
 */
interface PublishedAssembly {
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
export function translatePublishRevert(err: unknown, attemptedSlug: string): Error {
    if (err instanceof BaseError) {
        const revert = err.walk(
            (e) => e instanceof ContractFunctionRevertedError,
        ) as ContractFunctionRevertedError | undefined;
        const name = revert?.data?.errorName;
        if (name === "SlugAlreadyRegistered") {
            return new Error(
                `This assembly is already published — an identical composition is registered on-chain as "${attemptedSlug}". The slug is content-derived, so the same composition always maps to it; adopt the existing one rather than re-publishing.`,
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
        if (name === "EmptyContentHash") return new Error("Computed an empty content hash — likely a assemblyTemplate-builder bug.");
    }
    return toError(err);
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
        publicClient
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
 * Fetch the IPFS-pinned assemblyTemplate at `metadataURI`. Returns the parsed
 * JSON or null on failure (gateway unreachable, malformed JSON, etc.).
 * The on-chain binding's `contentHash` should match
 * `keccak256(canonicalize(assemblyTemplate))` — callers that need integrity
 * can verify after fetch.
 */
export async function fetchAssemblyTemplate(
    metadataURI: string,
): Promise<AssemblyTemplate | null> {
    const url = DEFAULT_IPFS_SERVICE.resolveFetchUrl(metadataURI);
    if (!url) return null;
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        return (await response.json()) as AssemblyTemplate;
    } catch {
        return null;
    }
}
