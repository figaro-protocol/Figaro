/**
 * Audit-bundle assembler — composes the per-order extractor outputs into
 * one structured deliverable.
 *
 * Phase D's PDF renderer consumes this. Phase E's `/audit` surface also
 * reads it (or a subset) to drive recomputation of each hash against
 * user-supplied content.
 *
 * The financial-statements panel is not part of this bundle directly —
 * it lives in `lib/semantic/financialsProjection.ts` and is composed
 * alongside the bundle by the consumer (the PDF renderer renders both).
 *
 * Bill-of-Lading discriminator: the BoL is a document genre that exists
 * only on carriage legs — orders where goods are entrusted to a
 * third-party carrier with intent to deliver to a non-party consignee.
 * In Figaro that maps STRUCTURALLY to sub-orders (topology declares
 * parents) that carry a runtime process log — derived from topology +
 * spec tier, never from a clause's name. Orders without that shape have
 * handoff/lifecycle/proximity data surfaced in their own documents
 * (proximity + processLogs) but no BoL page is emitted. See
 * `docs/v5/BOL_RESEARCH.md` for the full rationale.
 */

import { type Agreement, type RedactableAgreement } from "@/lib/core/agreement";
import { findCleartextSectionByField } from "@/lib/core/orderAgreement";
import { clauseIsProcessLog } from "@/lib/shared/clauseSpecSource";
import type { Order } from "@/lib/core/store";
import type { AttestationRecord } from "@/lib/mechanisms/useGHGDisclosure";
import { extractContract, type ContractDocument } from "./contractExtract";
import { extractInvoice, type InvoiceDocument } from "./invoiceExtract";
import { extractBillOfLading, type BillOfLadingDocument } from "./billOfLadingExtract";
import { extractEmissions, type EmissionsDocument } from "./emissionsExtract";
import { extractProximity, type ProximityDocument } from "./proximityExtract";
import { extractProcessLogs, type ProcessLogsDocument } from "./processLogsExtract";
import {
    extractDutchAuction,
    type DutchAuctionDocument,
    type DutchAuctionCreatedEvent,
    type DutchAuctionClaimedEvent,
} from "./dutchAuctionExtract";
import {
    extractSellerRegistry,
    type SellerRegistryDocument,
    type SellerRegisteredEvent,
} from "./sellerRegistryExtract";
import { buildHashAppendix, type HashAppendixDocument } from "./hashAppendix";

/** True when the order is a CARRIAGE LEG: a sub-order (its topology section
 *  declares non-empty parents) carrying a runtime process log (a Category-1
 *  enum-ladder clause, per its registered spec). Both signals are derived —
 *  modality is topology + clauses, never a stored field — so any
 *  registry-defined process clause marks the leg. Buyer↔merchant roots,
 *  pickup orders, and consume-onsite orders have no parents and return
 *  false. The process-log check reads the spec, so it sees redacted
 *  sections too; the topology parents read needs the section cleartext
 *  (audit bundles redact only commerce today). */
export function isCarriageOrder(agreement: Agreement | RedactableAgreement): boolean {
    const topology = findCleartextSectionByField(agreement, "parentOrderHashes");
    const parents = (topology?.data as { parentOrderHashes?: unknown } | undefined)?.parentOrderHashes;
    if (!Array.isArray(parents) || parents.length === 0) return false;
    return agreement.sections.some((s) => clauseIsProcessLog(s.clause));
}

export interface AuditBundle {
    contract: ContractDocument;
    invoice: InvoiceDocument;
    /** Present only when the order is a carriage leg; see
     *  `isCarriageOrder` and `docs/v5/BOL_RESEARCH.md`. */
    billOfLading?: BillOfLadingDocument;
    emissions: EmissionsDocument;
    proximity: ProximityDocument;
    processLogs: ProcessLogsDocument;
    dutchAuction: DutchAuctionDocument;
    sellerRegistry: SellerRegistryDocument;
    hashAppendix: HashAppendixDocument;
}

export interface AuditBundleInputs {
    /** AuctionCreated events scoped to this order's processId. Empty array
     *  if the order didn't come through Dutch auction or events aren't
     *  available; the extractor reports `auctionApplicable: false`. */
    auctionCreatedEvents?: readonly DutchAuctionCreatedEvent[];
    /** AuctionClaimed events scoped to the same auctionIds. */
    auctionClaimedEvents?: readonly DutchAuctionClaimedEvent[];
    /** SellerRegistered events filtered to events where the indexed
     *  `seller` matches `order.seller`. Empty array if the seller is
     *  unregistered — the extractor surfaces that as an audit notice. */
    sellerRegistrationEvents?: readonly SellerRegisteredEvent[];
}

export function buildAuditBundle(
    order: Order,
    agreement: Agreement | RedactableAgreement,
    attestations: readonly AttestationRecord[],
    inputs: AuditBundleInputs = {},
): AuditBundle {
    const contract = extractContract(order, agreement);
    return {
        contract,
        invoice: extractInvoice(order, agreement),
        ...(isCarriageOrder(agreement)
            ? { billOfLading: extractBillOfLading(order, agreement, attestations) }
            : {}),
        emissions: extractEmissions(order, agreement, attestations),
        proximity: extractProximity(order, agreement, attestations),
        processLogs: extractProcessLogs(order, attestations),
        dutchAuction: extractDutchAuction(
            order,
            contract.method,
            inputs.auctionCreatedEvents ?? [],
            inputs.auctionClaimedEvents ?? [],
        ),
        sellerRegistry: extractSellerRegistry(
            order,
            inputs.sellerRegistrationEvents ?? [],
        ),
        hashAppendix: buildHashAppendix(order, agreement, attestations),
    };
}
