/**
 * Audit-bundle assembler — composes the per-order extractor outputs into
 * one structured deliverable.
 *
 * Phase D's PDF renderer consumes this. Phase E's `/audit` surface also
 * reads it (or a subset) to drive recomputation of each hash against
 * user-supplied content.
 *
 * The financial statements are not part of this bundle directly — they are
 * projected documents (`projectAllFinancialStatements` in
 * `lib/audit/documentProjection.ts`, the SAME generic engine that projects the
 * invoice and bill of lading) and composed alongside the bundle by the consumer
 * (the PDF renderer draws them through its one generic document page).
 *
 * Document genres: there are NONE, and there must not be. The per-genre
 * extractors (invoice / Bill of Lading / emissions / proximity) were retired
 * with the open-world de-hardcode because they named clauses directly.
 * `clauseData` renders EVERY committed clause generically from its spec, so the
 * bundle certifies any committed leaf — including a clause this codebase has
 * never seen — with zero genre code. A recognizable document (an invoice, a
 * BoL) is a projection over those same committed leaves; if ever built, it must
 * be a DECLARED / generic composition, never a hand-rolled genre. See
 * `docs/BOL_RESEARCH.md` for why a NEGOTIABLE BoL is structurally impossible.
 */

import type { Agreement } from "@figaro/sdk";
import type { Order } from "@/lib/kernel/store";
import type { AttestationRecord } from "@/lib/composition/indexer";
import { extractContract, type ContractDocument } from "./contractExtract";
import { extractProcessLogs, type ProcessLogsDocument } from "./processLogsExtract";
import { extractClauseData, type ClauseDataDocument } from "./clauseDataExtract";
import {
    extractMembersRegistry,
    type MembersRegistryDocument,
    type MemberRegisteredEvent,
} from "./membersRegistryExtract";
import { buildHashAppendix, type HashAppendixDocument } from "./hashAppendix";

export interface AuditBundle {
    contract: ContractDocument;
    processLogs: ProcessLogsDocument;
    /** Every committed clause's data, rendered generically from its spec — the
     *  open-world per-clause view (names no clause, assumes no field). This is
     *  where a cargo leaf, a freight-class leaf, or a never-seen clause all
     *  surface — no genre document required. */
    clauseData: ClauseDataDocument;
    membersRegistry: MembersRegistryDocument;
    hashAppendix: HashAppendixDocument;
}

export interface AuditBundleInputs {
    /** MemberRegistered events filtered to events where the indexed
     *  `seller` matches `order.seller`. Empty array if the seller is
     *  unregistered — the extractor surfaces that as an audit notice. */
    sellerRegistrationEvents?: readonly MemberRegisteredEvent[];
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
        membersRegistry: extractMembersRegistry(
            order,
            inputs.sellerRegistrationEvents ?? [],
        ),
        hashAppendix: buildHashAppendix(order, agreement, attestations),
    };
}
