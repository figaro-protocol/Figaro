/**
 * Proximity extractor — pure projection of an order's committed proximity
 * policy (Category-2 — band declared at agreement time) + runtime
 * proximity proofs (Category-1 — per-handoff signed witness payloads).
 *
 * Two layers (matching the GHG disclosure / measurement split):
 *
 *   • Committed policy — the clause declaring a `bands` field names the
 *     required detection bands. Bands convey distance tolerance:
 *     progressively tighter from zone to contact.
 *
 *   • Runtime proofs — attestations under the policy family's Category-1
 *     sister clauses (`block.sisterClauseId`) carry per-handoff nonce +
 *     signed witness payload. The on-chain Attestation event records
 *     contentRef = keccak256(content); the original
 *     `(uint8 band, bytes32 nonce, bytes witness)` triple sits in the
 *     transaction calldata.
 *
 * Sections are found by their declared FIELDS and spec-derived families,
 * never by clause name. Off-chain consumers verify `proof.band ==
 * policy.band` when both halves are present; this extractor surfaces both
 * so the auditor can perform that comparison.
 */

import {
    type Agreement,
    type AgreementSection,
    type RedactableAgreement,
} from "@/lib/core/agreement";
import { findCleartextSectionByField } from "@/lib/core/orderAgreement";
import { clauseDeclaresField, getClauseSpec, listKnownClauseIds } from "@/lib/shared/clauseSpecSource";
import type { Order } from "@/lib/core/store";
import type { AttestationRecord } from "@/lib/mechanisms/useGHGDisclosure";
import type { AttestationReceipt, ExtractedDocument } from "./types";

function findPolicySection(
    agreement: Agreement | RedactableAgreement,
): AgreementSection | undefined {
    return findCleartextSectionByField(agreement, "bands");
}


export interface ProximityDocument extends ExtractedDocument {
    /** True when a proximity-policy clause (the one declaring `bands`) is
     *  signed. */
    policyCommitted: boolean;
    /** Committed band: 0 (unset) | 1 | 2 | 3 (progressively tighter). */
    committedBand?: number;
    /** Runtime proof receipts, in input order. Each receipt's recovered
     *  band must match `committedBand` for the proof chain to verify. */
    proofs: AttestationReceipt[];
}

/** True when the attestation lands under a PROOF clause — a Category-1
 *  sister some registered bands-declaring policy clause names via
 *  `block.sisterClauseId`. */
function attestationMatchesProofClause(att: AttestationRecord): boolean {
    return listKnownClauseIds().some(
        (clauseId) =>
            clauseDeclaresField(clauseId, "bands")
            && getClauseSpec(clauseId)?.block?.sisterClauseId === att.clauseId,
    );
}

export function extractProximity(
    order: Order,
    agreement: Agreement | RedactableAgreement,
    attestations: readonly AttestationRecord[],
): ProximityDocument {
    const policy = findPolicySection(agreement);
    const data = policy?.data as { band?: unknown } | undefined;
    // The band is already spec-validated at attest time (its range is the
    // clause enum cardinality, owned by the spec); the extractor trusts the
    // committed value rather than re-hardcoding 0..N here.
    const committedBand = typeof data?.band === "number" ? data.band : undefined;

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
