/**
 * Audit-bundle assembler — composes the 4 extractor outputs (contract,
 * invoice, BoL, hash appendix) into one structured deliverable.
 *
 * Phase D's PDF renderer consumes this. Phase E's `/verify` page also
 * reads it (or a subset) to drive recomputation of each hash against
 * user-supplied content.
 *
 * The financial-statements panel is not part of this bundle directly —
 * it lives in `lib/semantic/financialsProjection.ts` and is composed
 * alongside the bundle by the consumer (the PDF renderer renders both).
 */

import type { Agreement } from "@/lib/core/agreementManifest";
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
    extractOperatorRegistry,
    type OperatorRegistryDocument,
    type OperatorRegisteredEvent,
} from "./operatorRegistryExtract";
import { buildHashAppendix, type HashAppendixDocument } from "./hashAppendix";

export interface AuditBundle {
    contract: ContractDocument;
    invoice: InvoiceDocument;
    billOfLading: BillOfLadingDocument;
    emissions: EmissionsDocument;
    proximity: ProximityDocument;
    processLogs: ProcessLogsDocument;
    dutchAuction: DutchAuctionDocument;
    operatorRegistry: OperatorRegistryDocument;
    hashAppendix: HashAppendixDocument;
}

export interface AuditBundleInputs {
    /** AuctionCreated events scoped to this order's processId. Empty array
     *  if the order didn't come through Dutch auction or events aren't
     *  available; the extractor reports `auctionApplicable: false`. */
    auctionCreatedEvents?: readonly DutchAuctionCreatedEvent[];
    /** AuctionClaimed events scoped to the same auctionIds. */
    auctionClaimedEvents?: readonly DutchAuctionClaimedEvent[];
    /** OperatorRegistered events filtered to events where the indexed
     *  `operator` matches `order.seller`. Empty array if the seller is
     *  unregistered — the extractor surfaces that as an audit notice. */
    operatorRegistrationEvents?: readonly OperatorRegisteredEvent[];
}

export function buildAuditBundle(
    order: Order,
    agreement: Agreement,
    attestations: readonly AttestationRecord[],
    inputs: AuditBundleInputs = {},
): AuditBundle {
    const contract = extractContract(order, agreement);
    return {
        contract,
        invoice: extractInvoice(order, agreement),
        billOfLading: extractBillOfLading(order, agreement, attestations),
        emissions: extractEmissions(order, agreement, attestations),
        proximity: extractProximity(order, agreement, attestations),
        processLogs: extractProcessLogs(order, attestations),
        dutchAuction: extractDutchAuction(
            order,
            contract.fulfilment?.method,
            inputs.auctionCreatedEvents ?? [],
            inputs.auctionClaimedEvents ?? [],
        ),
        operatorRegistry: extractOperatorRegistry(
            order,
            inputs.operatorRegistrationEvents ?? [],
        ),
        hashAppendix: buildHashAppendix(order, agreement, attestations),
    };
}
