/**
 * Audit-bundle assembler — composes the per-order extractor outputs into
 * one structured deliverable.
 *
 * Phase D's PDF renderer consumes this. Phase E's `/audit` surface also
 * reads it (or a subset) to drive recomputation of each hash against
 * user-supplied content.
 *
 * The financial-statements panel is not part of this bundle directly —
 * it lives in `lib/audit/financialsProjection.ts` and is composed
 * alongside the bundle by the consumer (the PDF renderer renders both).
 *
 * Document genres: the old per-genre EXTRACTORS (invoice / Bill of Lading /
 * emissions / proximity) were retired with the open-world de-hardcode because
 * they named clauses directly. `clauseData` renders EVERY committed clause
 * generically. A genre document is only rebuilt as a DERIVED read-only
 * PROJECTION over committed leaves that names no clause — e.g. the
 * non-negotiable BoL below, whose carriage-leg discriminator is a sub-order
 * (topology declares parents) carrying a runtime process log. See
 * `docs/v5/BOL_RESEARCH.md` for the full rationale (and why a NEGOTIABLE BoL is
 * structurally impossible here).
 */

import type { Agreement } from "@figaro/core";
import type { Order } from "@/lib/kernel/store";
import type { AttestationRecord } from "@/lib/composition/indexer";
import { extractContract, type ContractDocument } from "./contractExtract";
import { extractProcessLogs, type ProcessLogsDocument } from "./processLogsExtract";
import { extractClauseData, type ClauseDataDocument } from "./clauseDataExtract";
import {
    extractSellerRegistry,
    type SellerRegistryDocument,
    type SellerRegisteredEvent,
} from "./sellerRegistryExtract";
import { buildHashAppendix, type HashAppendixDocument } from "./hashAppendix";
import { projectBillOfLading, type BillOfLadingProjection } from "./billOfLadingProjection";

export interface AuditBundle {
    contract: ContractDocument;
    processLogs: ProcessLogsDocument;
    /** Every committed clause's data, rendered generically from its spec — the
     *  open-world per-clause view (names no clause, assumes no field). */
    clauseData: ClauseDataDocument;
    sellerRegistry: SellerRegistryDocument;
    hashAppendix: HashAppendixDocument;
    /** The non-negotiable Bill of Lading, derived read-only from this order's
     *  committed leaves — present only when the order is a carriage leg, null
     *  otherwise (most orders). Never a document of title. */
    billOfLading: BillOfLadingProjection | null;
}

export interface AuditBundleInputs {
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
        sellerRegistry: extractSellerRegistry(
            order,
            inputs.sellerRegistrationEvents ?? [],
        ),
        hashAppendix: buildHashAppendix(order, agreement, attestations),
        billOfLading: projectBillOfLading(order, agreement),
    };
}
