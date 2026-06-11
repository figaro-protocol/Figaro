/**
 * Bill of Lading extractor — pure projection of an order's handoff + geo
 * clauses (signed at commit) plus per-role sovereign event-log attestations
 * (emitted at runtime by the merchant and courier sellers) into a
 * structured BoL document.
 *
 * The BoL combines two layers:
 *
 *   • Committed-at-signing clauses — what the parties bound to: the
 *     hand-off section (found by its `handoff` field) and the geo section
 *     (`originGeohash` + mass + volume + class). Sections are found by
 *     their declared FIELDS, never by clause name.
 *
 *   • Runtime process-log attestations — what actually happened: events
 *     under whatever Category-1 enum-ladder clauses the order carries.
 *
 * The 5-stage progression (PreparationStarted → ReadyForPickup →
 * CourierEnRoute → PickedUp → Delivered) is reconstructed off-chain by
 * matching each BoL milestone's witnessing stage CODE (spec-defined enum
 * vocabulary) against the order's process-log ladders, at the ordinal the
 * registered spec gives the code. Each stage is annotated with attester +
 * block + contentRef + transaction hash if attested, or pending if not.
 */

import {
    type Agreement,
    type AgreementSection,
    type RedactableAgreement,
} from "@/lib/core/agreement";
import { findCleartextSectionByField } from "@/lib/core/orderAgreement";
import { clauseIsProcessLog, clauseLadderField, listKnownClauseIds } from "@/lib/shared/clauseSpecSource";
import type { Order } from "@/lib/core/store";
import type { AttestationRecord } from "@/lib/mechanisms/useGHGDisclosure";
import { DELIVERY_LIFECYCLE_STAGES, type ExtractedDocument } from "./types";

interface BolStageReceipt {
    stageId: number;
    stageName: string;
    /** True when an attestation that maps to this BoL stage has landed. */
    attested: boolean;
    attester?: string;
    attestedAtBlock?: number;
    /** keccak256 of the attestation content bytes. Hash is the verifiable
     *  anchor; the original `evidenceUri` string sits in the transaction
     *  calldata and is recoverable off-chain via decodeFunctionData. */
    contentRef?: string;
    transactionHash?: string;
}

export interface BillOfLadingDocument extends ExtractedDocument {
    bolNumber: string;
    /** Consignor — seller of the order (typically the merchant of the root
     *  or the courier of a delivery sub-order, depending on which order
     *  this BoL describes). */
    consignor: string;
    /** Consignee — buyer of the order. */
    consignee: string;
    /** Physical-exchange modality from the handoff clause, if signed. */
    handoffMode?: string;
    /** Origin geohash from the geo clause, if signed. */
    originGeohash?: string;
    /** Destination geohash from the geo clause, if signed. */
    destinationGeohash?: string;
    /** Shipment mass in grams (canonical metric storage). */
    massGrams?: number;
    /** Shipment volume in millilitres (canonical metric storage). */
    volumeMl?: number;
    /** Shipping/handling class — SDK short code ("S"/"E"/"F"/"C")
     *  carried in the geo section data. The PDF expands to full names. */
    classOfService?: string;
    /** Full 5-stage progression, attested or pending. Ordered by stageId. */
    stages: BolStageReceipt[];
}

/**
 * BoL milestone → the stage CODE that witnesses it.
 *
 *   stage 0 (PreparationStarted)  ← "prep-started"
 *   stage 1 (ReadyForPickup)      ← "ready-for-pickup"
 *   stage 2 (CourierEnRoute)      ← "en-route-pickup"
 *   stage 3 (PickedUp)            ← "arrived-pickup"
 *   stage 4 (Delivered)           ← "completed"
 *
 * Codes are spec-defined enum vocabulary (field VALUES, never clause ids).
 * Each is resolved against whatever process-log clause on the order's
 * agreement declares it in its ladder, at the ordinal the registered spec
 * gives it — so ANY registry-defined process clause whose ladder carries a
 * code witnesses that milestone, and each seller stays the sovereign
 * authority over their own events. (Declaring the milestone set in spec
 * `block.audit` metadata is the tracked deeper step.)
 */
const STAGE_WITNESS_CODE: Record<number, string> = {
    0: "prep-started",
    1: "ready-for-pickup",
    2: "en-route-pickup",
    3: "arrived-pickup",
    4: "completed",
};

export function extractBillOfLading(
    order: Order,
    agreement: Agreement | RedactableAgreement,
    attestations: readonly AttestationRecord[],
): BillOfLadingDocument {
    const geo = findCleartextSectionByField(agreement, "originGeohash");
    // hand-off is its own clause (where the physical exchange happens).
    const handoffData = findCleartextSectionByField(agreement, "handoff")?.data as { handoff?: unknown } | undefined;
    const handoffPointsArr = Array.isArray(handoffData?.handoff)
        ? handoffData.handoff
        : [];
    const handoffMode = typeof handoffPointsArr[0] === "string" ? handoffPointsArr[0] : undefined;
    const geoData = geo?.data as {
        originGeohash?: string;
        destinationGeohash?: string;
        massGrams?: number;
        volumeMl?: number;
        classOfService?: string;
    } | undefined;

    // Resolve each milestone's witnessing (clauseId, ladder ordinal) from the
    // REGISTRY's process-log clauses — not just this agreement's sections,
    // because cross-order attestations (e.g. the parent seller's events
    // witnessed on this carriage leg) arrive under clauses composed on a
    // sibling order's agreement.
    const witnessByCode = new Map<string, { clauseId: string; ordinal: number }>();
    for (const clauseId of listKnownClauseIds()) {
        if (!clauseIsProcessLog(clauseId)) continue;
        const ladder = clauseLadderField(clauseId);
        if (!ladder) continue;
        ladder.values.forEach((code, ordinal) => {
            if (!witnessByCode.has(code)) witnessByCode.set(code, { clauseId, ordinal });
        });
    }

    // Index process-log attestations for THIS order by (clauseId, stage). The
    // BoL only applies to the current order; cross-order attestations need
    // to be passed in scoped to the right orderHash by the caller.
    const byKey = new Map<string, AttestationRecord>();
    for (const att of attestations) {
        if (att.orderHash !== order.id) continue;
        if (!clauseIsProcessLog(att.clauseId)) continue;
        // Last-write-wins for the same (clause, stage); live kernel typically
        // only sees one attestation per (order, clause, stage) since validators
        // reject re-attestation of the same envelope.
        byKey.set(`${att.clauseId}:${att.stage}`, att);
    }

    const stages: BolStageReceipt[] = DELIVERY_LIFECYCLE_STAGES.map(({ id, name }) => {
        const witness = witnessByCode.get(STAGE_WITNESS_CODE[id] ?? "");
        const att = witness ? byKey.get(`${witness.clauseId}:${witness.ordinal}`) : undefined;
        if (!att) return { stageId: id, stageName: name, attested: false };
        return {
            stageId: id,
            stageName: name,
            attested: true,
            attester: att.attester,
            attestedAtBlock: att.blockNumber,
            contentRef: att.contentRef,
            transactionHash: att.transactionHash ?? undefined,
        };
    });

    return {
        title: "Bill of Lading",
        orderHash: order.id,
        processId: order.processId,
        agreementHash: order.agreementHash ?? "0x",
        buyer: order.buyer,
        seller: order.seller,
        bolNumber: order.id,
        consignor: order.seller,
        consignee: order.buyer,
        handoffMode,
        originGeohash: geoData?.originGeohash,
        destinationGeohash: geoData?.destinationGeohash,
        massGrams: geoData?.massGrams,
        volumeMl: geoData?.volumeMl,
        classOfService: geoData?.classOfService,
        stages,
    };
}
