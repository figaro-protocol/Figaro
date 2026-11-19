/**
 * Shared state for the handoff-ceremony panels (`ContentDeliveryPanel`,
 * `AddressDetailPanel`, `PrivateFilingsPanel`): each polls for on-chain
 * attestations that match what it decrypted, and renders one of the same
 * three verdicts while it waits.
 */
import type { PublicClient } from "viem";
import { getAttestationsByOrder } from "@/lib/core/attestationIndexer";
import { hexEqual } from "@/lib/shared/evm";

/** Whether a ceremony's locally-decrypted payload has a matching on-chain
 *  attestation anchor yet. */
export type AnchorVerificationState = "unknown" | "verified" | "missing";

/** The whole place an attestation must hold: its content reference, the
 *  clause and stage it was filed under, and the wallet that filed it. */
export interface AnchorPlace {
    contentRef: `0x${string}`;
    clauseId: string;
    stage: number;
    attester: string;
}

/** What a ceremony expects on the chain for a decrypted payload: the whole
 *  place (`AnchorPlace`). A content reference alone would match an
 *  attestation anyone on the order filed, under any clause or stage, so a
 *  payload the sender never anchored could read as anchored. */
export type AnchorExpectation = AnchorPlace;

/** True iff some attestation on `orderHash` holds the place `expected`
 *  names — the on-chain anchor check every handoff ceremony panel polls
 *  with, each against its own ceremony's expectation. */
export async function attestationAnchorMatches(
    publicClient: PublicClient,
    chainId: number,
    orderHash: string,
    expected: AnchorExpectation,
): Promise<boolean> {
    // Either path: the signer and the content reference are bound the same way
    // on the coordinator's and on the batch verifier's `Attestation`.
    const records = await getAttestationsByOrder(publicClient, chainId, orderHash);
    return records.some((record) => hexEqual(record.contentRef, expected.contentRef)
        && hexEqual(record.clauseId, expected.clauseId)
        && record.stage === expected.stage
        && hexEqual(record.attester, expected.attester));
}
