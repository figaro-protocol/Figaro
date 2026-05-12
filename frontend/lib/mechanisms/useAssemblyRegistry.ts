/**
 * useAssemblyRegistry — hooks for publishing designer-built assemblies
 * to the on-chain `AssemblyRegistry`. Parallel to `useOperatorRegistry`
 * (operators) and the schema-validator wiring (schemas) per the
 * separation-of-concerns doctrine.
 *
 * Publish flow:
 *   1. Build a class-specific manifest from the snapshot (direct-sale-v1
 *      is the only class today). Throws on shape mismatch.
 *   2. Pin a JSON copy of the manifest to IPFS via DEFAULT_IPFS_SERVICE.
 *   3. Call AssemblyRegistry.registerAssembly(slug, classId, content, uri).
 *      The on-chain validator (DirectSaleV1Validator) reverts if the
 *      ABI-encoded `content` doesn't satisfy the class invariants.
 *
 * No graceful retry, no optimistic UI — the publish is a single atomic
 * step from the user's POV: success means the slug is permanently bound
 * to (msg.sender, contentHash, ipfs URI).
 */

import { useCallback, useEffect, useState } from "react";
import { encodeAbiParameters, keccak256, toBytes, parseAbi } from "viem";
import { useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { DEFAULT_IPFS_SERVICE } from "@/lib/shared/ipfsService";
import { loadAgreement } from "@/lib/core/agreementStore";
import type { DesignSnapshot } from "@/lib/designer/syntheticDesignStore";

export const ASSEMBLY_REGISTRY_ABI = parseAbi([
    "function registerAssembly(string slug, bytes32 classId, bytes content, string metadataURI) external",
    "function validators(bytes32 classId) view returns (address)",
    "function bindings(bytes32 slugHash) view returns (address author, bytes32 classId, bytes32 contentHash, string metadataURI, uint64 registeredAt)",
    "event AssemblyRegistered(bytes32 indexed slugHash, bytes32 indexed classId, address indexed author, string slug, bytes32 contentHash, string metadataURI)",
] as const);

export const DIRECT_SALE_V1_CLASS_ID = keccak256(toBytes("direct-sale-v1"));

/** Mirrors the uint8 encoding in FigaroJurisdictionV1Validator. */
const KLEROS_COURT_MAP: Record<string, number> = {
    general: 1,
    "blockchain-nontechnical": 2,
    "blockchain-technical": 3,
    "english-language": 4,
};

export interface DirectSaleManifest {
    slug: string;
    name: string;
    klerosCourt: number;
    klerosMinJurors: number;
    fulfilmentModalities: string[];
    /** Descriptive prose pinned to IPFS but not part of the on-chain ABI tuple. */
    description?: string;
    narrativeSummary?: string;
    builderNotes?: string;
}

export function getAssemblyRegistry(): `0x${string}` | null {
    const addr = process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY;
    if (!addr) return null;
    return addr as `0x${string}`;
}

/**
 * Build a direct-sale-v1 manifest from a DesignSnapshot. Returns the
 * manifest object (for IPFS) and the ABI-encoded content (for the
 * on-chain validator). Throws on shape mismatch — the user must fix
 * the design before retrying.
 */
export function buildDirectSaleManifest(snapshot: DesignSnapshot): {
    manifest: DirectSaleManifest;
    encodedContent: `0x${string}`;
} {
    if (snapshot.orders.length !== 1) {
        throw new Error(
            `direct-sale-v1 requires exactly 1 order; this design has ${snapshot.orders.length}.`,
        );
    }
    const order = snapshot.orders[0];
    if (!order.agreementHash) {
        throw new Error("Root order has no agreement.");
    }
    const agreement = loadAgreement(order.agreementHash);
    if (!agreement) {
        throw new Error("Agreement not found in local storage.");
    }

    const jurisdictionSection = agreement.sections.find(
        (s) => s.schema === "figaro-jurisdiction-v1",
    );
    const fulfilmentSection = agreement.sections.find(
        (s) => s.schema === "figaro-fulfilment-v2",
    );
    if (!jurisdictionSection) {
        throw new Error("Agreement is missing the jurisdiction clause.");
    }
    if (!fulfilmentSection) {
        throw new Error("Agreement is missing the fulfilment clause.");
    }

    const jData = jurisdictionSection.data as {
        klerosCourt?: string;
        klerosMinJurors?: number | string;
    };
    const fData = fulfilmentSection.data as { modalities?: string[] };

    const klerosCourtKey = jData.klerosCourt ?? "";
    const klerosCourt = KLEROS_COURT_MAP[klerosCourtKey];
    if (!klerosCourt) {
        throw new Error(
            `Kleros court must be one of: ${Object.keys(KLEROS_COURT_MAP).join(", ")}.`,
        );
    }
    const klerosMinJurors = Number(jData.klerosMinJurors ?? 0);
    if (!klerosMinJurors || klerosMinJurors < 1 || klerosMinJurors > 99) {
        throw new Error("Kleros min-jurors must be 1–99.");
    }

    const modalities = Array.isArray(fData.modalities) ? fData.modalities : [];
    if (modalities.length === 0) {
        throw new Error("Fulfilment modalities are empty.");
    }

    const manifest: DirectSaleManifest = {
        slug: snapshot.slug,
        name: snapshot.name,
        klerosCourt,
        klerosMinJurors,
        fulfilmentModalities: modalities,
        description: snapshot.description,
        narrativeSummary: snapshot.narrativeSummary,
        builderNotes: snapshot.builderNotes,
    };

    const encodedContent = encodeAbiParameters(
        [
            { type: "string" },
            { type: "string" },
            { type: "uint8" },
            { type: "uint8" },
            { type: "string[]" },
        ],
        [
            manifest.slug,
            manifest.name,
            manifest.klerosCourt,
            manifest.klerosMinJurors,
            manifest.fulfilmentModalities,
        ],
    );

    return { manifest, encodedContent };
}

export interface PublishOutcome {
    hash: `0x${string}`;
    ipfsURI: string;
}

// ── Read hooks (event-derived) ────────────────────────────────────────────────

/**
 * A single registered assembly, reconstructed from an `AssemblyRegistered`
 * event. The slug + metadataURI are non-indexed event-data fields; the
 * three hashes (slugHash, classId, contentHash) come from indexed topics.
 */
export interface PublishedAssembly {
    slug: string;
    slugHash: `0x${string}`;
    classId: `0x${string}`;
    author: `0x${string}`;
    contentHash: `0x${string}`;
    metadataURI: string;
    blockNumber: bigint;
    transactionHash: `0x${string}`;
}

/**
 * Reads `AssemblyRegistered` events from the registry, optionally filtered
 * to a specific author. Returns the deduped most-recent-first list — slug
 * binding is first-write-wins on-chain, so duplicates per slug shouldn't
 * occur, but if they do (e.g., a stale fork chain), the most-recent block
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
                    classId: log.args.classId as `0x${string}`,
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
 * Best practice per the manifest split: human-readable fields (name,
 * description) live on IPFS, not on-chain — this is the reader.
 */
export async function fetchAssemblyManifest(
    metadataURI: string,
): Promise<DirectSaleManifest | null> {
    const url = DEFAULT_IPFS_SERVICE.resolveFetchUrl(metadataURI);
    if (!url) return null;
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        return (await response.json()) as DirectSaleManifest;
    } catch {
        return null;
    }
}

/**
 * Synthesize a `networkTargets` value for an on-chain-registered assembly
 * based on the chain its registry lives on. Derived rather than stored —
 * the AssemblyRegistry is per-chain, so the chain IS the network target.
 *
 * The names match the existing convention in the hand-coded reference
 * JSONs (`local-anvil`, `sepolia`, ...) so downstream consumers like
 * `listBindingsForAddress` filter correctly across both sources.
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

// ── Write hook ────────────────────────────────────────────────────────────────

export function usePublishDirectSaleAssembly() {
    const { writeContractAsync, data: hash, isPending, error: writeError } =
        useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

    /** Pin manifest to IPFS, then call registerAssembly. Returns the
     *  transaction hash + the IPFS URI on success. Throws on any
     *  failure (no wallet, IPFS down, validator rejection, etc.). */
    async function publish(snapshot: DesignSnapshot): Promise<PublishOutcome> {
        const registry = getAssemblyRegistry();
        if (!registry) {
            throw new Error(
                "AssemblyRegistry address not configured (NEXT_PUBLIC_ASSEMBLY_REGISTRY).",
            );
        }
        const { manifest, encodedContent } = buildDirectSaleManifest(snapshot);
        const ipfs = await DEFAULT_IPFS_SERVICE.publishJSON(manifest);
        const txHash = await writeContractAsync({
            address: registry,
            abi: ASSEMBLY_REGISTRY_ABI,
            functionName: "registerAssembly",
            args: [manifest.slug, DIRECT_SALE_V1_CLASS_ID, encodedContent, ipfs.uri],
        });
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
