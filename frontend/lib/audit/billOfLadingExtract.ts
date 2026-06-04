/**
 * Bill of Lading extractor — pure projection of an order's handoff + geo
 * clauses (signed at commit) plus per-role sovereign event-log attestations
 * (emitted at runtime by the merchant and courier sellers) into a
 * structured BoL document.
 *
 * The BoL combines two layers:
 *
 *   • Committed-at-signing clauses — what the parties bound to:
 *       fulfilment modality + handoffPoint (figaro-fulfilment-v2)
 *       origin / destination geohashes + mass + volume + class (figaro-geo-v2)
 *
 *   • Runtime per-role attestations — what actually happened:
 *       merchant-process events (figaro-merchant-process-v1) — stages 2-3
 *       courier-process events (figaro-courier-process-v1) — stages 2/3/6
 *
 * The 5-stage progression (PreparationStarted → ReadyForPickup →
 * CourierEnRoute → PickedUp → Delivered) is reconstructed off-chain by
 * mapping per-role events to BoL stages. Each stage is annotated with
 * attester + block + contentRef + transaction hash if attested, or pending
 * if not.
 */

import {
    type Agreement,
    type AgreementSection,
    type RedactableAgreement,
    COURIER_PROCESS_CLAUSE_KEY,
    FULFILMENT_V2_CLAUSE_KEY,
    GEO_CLAUSE_KEY,
    MERCHANT_PROCESS_CLAUSE_KEY,
    findCleartextSection,
} from "@/lib/core/agreement";
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
 * BoL stage → per-role clause + event uint8 mapping.
 *
 *   stage 0 (PreparationStarted)  ← merchant.prep-started        (event 2)
 *   stage 1 (ReadyForPickup)      ← merchant.ready-for-pickup    (event 3)
 *   stage 2 (CourierEnRoute)      ← courier.en-route-pickup      (event 2)
 *   stage 3 (PickedUp)            ← courier.arrived-pickup       (event 3)
 *   stage 4 (Delivered)           ← courier.completed            (event 6)
 *
 * The merchant attests stages 0-1 because those events live in the
 * merchant's physical workflow (prep, ready). The courier attests stages
 * 2-4 because those events live in the courier's transport workflow
 * (en route, picked up, delivered). Each seller is the sovereign
 * authority over their own events.
 */
const STAGE_SOURCE: Record<number, { clauseKey: string; eventStage: number }> = {
    0: { clauseKey: MERCHANT_PROCESS_CLAUSE_KEY, eventStage: 2 },
    1: { clauseKey: MERCHANT_PROCESS_CLAUSE_KEY, eventStage: 3 },
    2: { clauseKey: COURIER_PROCESS_CLAUSE_KEY, eventStage: 2 },
    3: { clauseKey: COURIER_PROCESS_CLAUSE_KEY, eventStage: 3 },
    4: { clauseKey: COURIER_PROCESS_CLAUSE_KEY, eventStage: 6 },
};

export function extractBillOfLading(
    order: Order,
    agreement: Agreement | RedactableAgreement,
    attestations: readonly AttestationRecord[],
): BillOfLadingDocument {
    const fulfilment = findCleartextSection(agreement, FULFILMENT_V2_CLAUSE_KEY);
    const geo = findCleartextSection(agreement, GEO_CLAUSE_KEY);
    // handoff is a top-level sub-clause (any physical exchange), array-of-enum.
    const fulfilmentData = fulfilment?.data as { handoff?: unknown } | undefined;
    const handoffPointsArr = Array.isArray(fulfilmentData?.handoff)
        ? fulfilmentData.handoff
        : [];
    const handoffMode = typeof handoffPointsArr[0] === "string" ? handoffPointsArr[0] : undefined;
    const geoData = geo?.data as {
        originGeohash?: string;
        destinationGeohash?: string;
        massGrams?: number;
        volumeMl?: number;
        classOfService?: string;
    } | undefined;

    // Index per-role attestations for THIS order by (clauseKey, stage). The
    // BoL only applies to the current order; cross-order attestations need
    // to be passed in scoped to the right orderHash by the caller.
    const byKey = new Map<string, AttestationRecord>();
    for (const att of attestations) {
        if (att.orderHash !== order.id) continue;
        if (
            att.clauseId !== MERCHANT_PROCESS_CLAUSE_KEY
            && att.clauseId !== COURIER_PROCESS_CLAUSE_KEY
        ) continue;
        // Last-write-wins for the same (clause, stage); live kernel typically
        // only sees one attestation per (order, clause, stage) since validators
        // reject re-attestation of the same envelope.
        byKey.set(`${att.clauseId}:${att.stage}`, att);
    }

    const stages: BolStageReceipt[] = DELIVERY_LIFECYCLE_STAGES.map(({ id, name }) => {
        const source = STAGE_SOURCE[id];
        const att = source ? byKey.get(`${source.clauseKey}:${source.eventStage}`) : undefined;
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
