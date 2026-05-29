/**
 * Proximity extractor — pure projection of an order's committed proximity
 * policy (Category-2 — band declared at agreement time) + runtime
 * proximity proofs (Category-1 — per-handoff signed witness payloads).
 *
 * Two layers (matching the GHG disclosure / measurement split):
 *
 *   • Committed policy — `figaro-proximity-policy-v1` clause names the
 *     required detection band. Data: `(uint8 band)`. Bands convey distance
 *     tolerance: 0=unset, 1-3 = progressively tighter.
 *
 *   • Runtime proofs — `figaro-proximity-proof-v1` attestations carry per-
 *     handoff nonce + signed witness payload. The on-chain Attestation
 *     event records contentRef = keccak256(content); the original
 *     `(uint8 band, bytes32 nonce, bytes witness)` triple sits in the
 *     transaction calldata.
 *
 * Off-chain consumers verify `proof.band == policy.band` when both
 * sections are present. This extractor surfaces both halves so the
 * auditor can perform that comparison.
 */

import {
    type Agreement,
    type AgreementSection,
    type RedactableAgreement,
    PROXIMITY_POLICY_CLAUSE_KEY,
    PROXIMITY_PROOF_CLAUSE_KEY,
    isRedactedSection,
} from "@/lib/core/agreement";
import type { Order } from "@/lib/core/store";
import type { AttestationRecord } from "@/lib/mechanisms/useGHGDisclosure";
import type { AttestationReceipt, ExtractedDocument } from "./types";

function findPolicySection(
    agreement: Agreement | RedactableAgreement,
): AgreementSection | undefined {
    const s = agreement.sections.find((x) => x.clause === PROXIMITY_POLICY_CLAUSE_KEY);
    if (!s) return undefined;
    return isRedactedSection(s) ? undefined : s;
}


export interface ProximityDocument extends ExtractedDocument {
    /** True when an agreement clause from `figaro-proximity-policy-v1` is
     *  signed. */
    policyCommitted: boolean;
    /** Committed band: 0 (unset) | 1 | 2 | 3 (progressively tighter). */
    committedBand?: number;
    /** Runtime proof receipts, in input order. Each receipt's recovered
     *  band must match `committedBand` for the proof chain to verify. */
    proofs: AttestationReceipt[];
}

function attestationMatchesProofClause(att: AttestationRecord): boolean {
    return att.clauseId === PROXIMITY_PROOF_CLAUSE_KEY;
}

export function extractProximity(
    order: Order,
    agreement: Agreement | RedactableAgreement,
    attestations: readonly AttestationRecord[],
): ProximityDocument {
    const policy = findPolicySection(agreement);
    const data = policy?.data as { band?: unknown } | undefined;
    const committedBand = typeof data?.band === "number" && data.band >= 0 && data.band <= 3
        ? data.band
        : undefined;

    const proofs: AttestationReceipt[] = [];
    for (const att of attestations) {
        if (att.orderHash !== order.id) continue;
        if (!attestationMatchesProofClause(att)) continue;
        proofs.push({
            contentRef: att.contentRef,
            attester: att.attester,
            stage: att.stage,
            blockNumber: att.blockNumber,
            transactionHash: att.transactionHash ?? undefined,
        });
    }

    return {
        title: "Proximity policy + proofs",
        orderHash: order.id,
        processId: order.processId,
        agreementHash: order.agreementHash ?? "0x",
        buyer: order.buyer,
        seller: order.seller,
        policyCommitted: policy !== undefined,
        committedBand,
        proofs,
    };
}
