/**
 * Emissions extractor — pure projection of an order's GHG disclosure clause
 * (signed at commit, Category-2: standard + scope) + runtime measurement
 * attestations (Category-1: per-stage grams) into a single emissions
 * document for the audit bundle.
 *
 * Two layers:
 *
 *   • Committed disclosure — whatever registered clause declaring a `scope`
 *     field the parties composed; each accounting standard is its own
 *     clause, so the standard's identity IS the clauseKey and its label is
 *     the registered spec's title. The data field is `(uint8 scope)` —
 *     0=unset, 1=Scope 1, 2=Scope 2, 3=Scope 3.
 *
 *   • Runtime measurement — attestations under the disclosure family's
 *     Category-1 sister clauses (`block.sisterClauseId`) carry
 *     the actual grams CO2e per stage. The on-chain Attestation event
 *     records contentRef = keccak256(content); the original `(uint256 grams)`
 *     value sits in the transaction calldata and is recoverable off-chain.
 *     This extractor records the receipt; calldata decoding is left to
 *     the caller.
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

/** The first cleartext GHG DISCLOSURE section — any registered clause
 *  declaring a `scope` field; the family is the registry's, never a list
 *  in code. */
function findGhgDisclosureSection(
    agreement: Agreement | RedactableAgreement,
): AgreementSection | undefined {
    return findCleartextSectionByField(agreement, "scope");
}


export interface EmissionsDocument extends ExtractedDocument {
    /** True when an agreement clause from one of the GHG sister clauses
     *  is present. False when the parties did not commit to a GHG
     *  disclosure framework — the measurement attestations may still
     *  exist but they're untyped. */
    disclosed: boolean;
    /** Readable clauseId of the disclosure clause (figaro-ghg). */
    standardClauseKey?: string;
    /** The committed accounting methodology — the disclosure's free-form
     *  `standard` field (e.g. "ISO 14064"). */
    standardLabel?: string;
    /** Committed scope: 0 (unset) | 1 (Scope 1) | 2 (Scope 2) | 3 (Scope 3). */
    scope?: number;
    /** Runtime measurement receipts, in input order (typically commit-block
     *  order). */
    measurements: AttestationReceipt[];
}

/** True when the attestation lands under a MEASUREMENT clause — a Category-1
 *  sister some registered disclosure clause names via `block.sisterClauseId`.
 *  The family is spec-derived, never named. */
function attestationMatchesMeasurementClause(att: AttestationRecord): boolean {
    return listKnownClauseIds().some(
        (clauseId) =>
            clauseDeclaresField(clauseId, "scope")
            && getClauseSpec(clauseId)?.block?.sisterClauseId === att.clauseId,
    );
}

export function extractEmissions(
    order: Order,
    agreement: Agreement | RedactableAgreement,
    attestations: readonly AttestationRecord[],
): EmissionsDocument {
    const disclosure = findGhgDisclosureSection(agreement);
    const data = disclosure?.data as { scope?: unknown; standard?: unknown } | undefined;
    const scope = typeof data?.scope === "number" && data.scope >= 0 && data.scope <= 3
        ? data.scope
        : undefined;
    const standardClauseKey = disclosure?.clause;
    // The accounting methodology is the disclosure's free-form `standard` field
    // (the GHG clauses consolidated into one figaro-ghg with a methodology
    // field) — not the clause's spec title, which is the generic clause name.
    const standardLabel = typeof data?.standard === "string" ? data.standard : undefined;

    const measurements: AttestationReceipt[] = [];
    for (const att of attestations) {
        if (att.orderHash !== order.id) continue;
        if (!attestationMatchesMeasurementClause(att)) continue;
        measurements.push({
            contentRef: att.contentRef,
            attester: att.attester,
            stage: att.stage,
            blockNumber: att.blockNumber,
            transactionHash: att.transactionHash ?? undefined,
        });
    }

    return {
        title: "Emissions disclosure",
        orderHash: order.id,
        processId: order.processId,
        agreementHash: order.agreementHash ?? "0x",
        buyer: order.buyer,
        seller: order.seller,
        disclosed: disclosure !== undefined,
        standardClauseKey,
        standardLabel,
        scope,
        measurements,
    };
}
