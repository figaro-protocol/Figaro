/**
 * Bill of Lading extractor — pure projection of an order's handoff + geo
 * clauses (signed at commit) plus delivery-lifecycle attestation events
 * (emitted at runtime as the order moves through stages) into a structured
 * BoL document.
 *
 * The BoL combines two layers:
 *
 *   • Committed-at-signing clauses — what the parties bound to:
 *       fulfilment modality + handoffPoint (figaro-fulfilment-v2)
 *       origin / destination geohashes (figaro-geo-v1)
 *
 *   • Runtime attestations — what actually happened:
 *       delivery-lifecycle stage receipts (figaro-delivery-lifecycle-v1)
 *       attester address + block number + contentRef + transaction hash
 *
 * The full canonical 5-stage progression is rendered with each stage's
 * attestation status (attested or pending) — auditors see at a glance
 * which stages have on-chain receipts and which are missing.
 */

import {
    type Agreement,
    type AgreementSection,
    type RedactableAgreement,
    DELIVERY_LIFECYCLE_SCHEMA_KEY,
    FULFILMENT_V2_SCHEMA_KEY,
    GEO_SCHEMA_KEY,
    isRedactedSection,
} from "@/lib/core/agreementManifest";
import type { Order } from "@/lib/core/store";
import type { AttestationRecord } from "@/lib/mechanisms/useGHGDisclosure";
import { hexEqual } from "@/lib/shared/evm";
import { DELIVERY_LIFECYCLE_STAGES, type ExtractedDocument } from "./types";

/** Match a section by schema key, returning its cleartext form only.
 *  Redacted sections (or absent ones) yield undefined — handoff and geo
 *  are not redaction targets in the current Step-2 scope, so a redacted
 *  section here just means the BoL gracefully degrades. */
function getSectionByKey(
    agreement: Agreement | RedactableAgreement,
    schemaKey: string,
): AgreementSection | undefined {
    const s = agreement.sections.find((x) => x.schema === schemaKey);
    if (!s) return undefined;
    return isRedactedSection(s) ? undefined : s;
}


export interface BolStageReceipt {
    stageId: number;
    stageName: string;
    /** True when an attestation for this (orderHash, schema, stage) has landed. */
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
    /** Full 5-stage progression, attested or pending. Ordered by stageId. */
    stages: BolStageReceipt[];
}

/** True when the schemaId encoded in an attestation matches the expected
 *  schema. The kernel emits schemaId as a bytes32 keccak hash of the
 *  schema key string, but the indexer in `useGHGDisclosure.ts` and friends
 *  surface it pre-decoded as a string. We accept both shapes. */
function attestationMatchesLifecycleSchema(att: AttestationRecord): boolean {
    if (typeof att.schemaId !== "string") return false;
    if (att.schemaId === DELIVERY_LIFECYCLE_SCHEMA_KEY) return true;
    // keccak256("figaro-delivery-lifecycle-v1") — defensive match if the
    // indexer has not pre-decoded.
    const KECCAK_LIFECYCLE = "0xa9adfb6b1ad3e4c69a7afae4f21a05fd56c80b0ca0fdc63ac8e95dcd9bf73c40";
    return hexEqual(att.schemaId, KECCAK_LIFECYCLE);
}

export function extractBillOfLading(
    order: Order,
    agreement: Agreement | RedactableAgreement,
    attestations: readonly AttestationRecord[],
): BillOfLadingDocument {
    const fulfilment = getSectionByKey(agreement, FULFILMENT_V2_SCHEMA_KEY);
    const geo = getSectionByKey(agreement, GEO_SCHEMA_KEY);
    const fulfilmentData = fulfilment?.data as { handoffPoint?: string } | undefined;
    const geoData = geo?.data as { originGeohash?: string; destinationGeohash?: string } | undefined;

    // Index lifecycle attestations for THIS order by stage. The BoL only
    // applies to the current order; cross-order lifecycle attestations
    // (e.g. delivery sub-order's stages attested against the root
    // orderHash) need to be passed in scoped to the right orderHash by
    // the caller.
    const byStage: Record<number, AttestationRecord> = {};
    for (const att of attestations) {
        if (att.orderHash !== order.id) continue;
        if (!attestationMatchesLifecycleSchema(att)) continue;
        // Last-write-wins for the same stage; live kernel typically only
        // sees one attestation per (order, stage) since validators reject
        // re-attestation of the same stage.
        byStage[att.stage] = att;
    }

    const stages: BolStageReceipt[] = DELIVERY_LIFECYCLE_STAGES.map(({ id, name }) => {
        const att = byStage[id];
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
        handoffMode: fulfilmentData?.handoffPoint,
        originGeohash: geoData?.originGeohash,
        destinationGeohash: geoData?.destinationGeohash,
        stages,
    };
}
