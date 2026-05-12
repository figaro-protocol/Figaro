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

import { encodeAbiParameters, keccak256, toBytes, parseAbi } from "viem";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
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
