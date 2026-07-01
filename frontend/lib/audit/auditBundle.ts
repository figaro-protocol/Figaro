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

import type { Agreement } from "@figaro/core";
import type { Order } from "@/lib/core/store";
import type { AttestationRecord } from "@/lib/composition/useGHGDisclosure";
import { extractContract, type ContractDocument } from "./contractExtract";
import { extractProcessLogs, type ProcessLogsDocument } from "./processLogsExtract";
import { extractClauseData, type ClauseDataDocument } from "./clauseDataExtract";
import {
    extractDutchAuction,
    type DutchAuctionDocument,
    type DutchAuctionCreatedEvent,
    type DutchAuctionClaimedEvent,
} from "@/lib/composition/dutchAuctionExtract";
import {
    extractSellerRegistry,
    type SellerRegistryDocument,
    type SellerRegisteredEvent,
} from "./sellerRegistryExtract";
import { buildHashAppendix, type HashAppendixDocument } from "./hashAppendix";

export interface AuditBundle {
    contract: ContractDocument;
    processLogs: ProcessLogsDocument;
    /** Every committed clause's data, rendered generically from its spec — the
     *  open-world per-clause view (names no clause, assumes no field). */
    clauseData: ClauseDataDocument;
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
    agreement: Agreement,
    attestations: readonly AttestationRecord[],
    inputs: AuditBundleInputs = {},
): AuditBundle {
    const contract = extractContract(order, agreement);
    return {
        contract,
        processLogs: extractProcessLogs(order, attestations),
        clauseData: extractClauseData(order, agreement),
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
