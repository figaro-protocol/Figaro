/**
 * Shared state for the handoff-ceremony interaction panels
 * (`ContentDeliveryPanel`, `AddressDetailPanel`): both poll for an on-chain
 * attestation whose `contentRef` matches a locally-derived fingerprint, and
 * render one of the same three verdicts while they wait.
 */
import type { PublicClient } from "viem";
import { getAttestationsByOrder } from "@/lib/composition/indexer";
import { hexEqual } from "@/lib/shared/evm";

/** Whether a ceremony's locally-decrypted artifact has a matching on-chain
 *  attestation anchor yet. */
export type AnchorVerificationState = "unknown" | "verified" | "missing";

/** True iff some attestation on `orderHash` carries `contentRef === expected`
 *  — the on-chain anchor check every handoff ceremony panel polls with, each
 *  against its own ceremony's fingerprint. */
export async function attestationAnchorMatches(
    publicClient: PublicClient,
    chainId: number,
    orderHash: string,
    expected: `0x${string}`,
): Promise<boolean> {
    // Either path: the signer and the content reference are bound the same way
    // on the coordinator's and on the batch verifier's `Attestation`.
    const records = await getAttestationsByOrder(publicClient, chainId, orderHash);
    return records.some((record) => hexEqual(record.contentRef, expected));
}
