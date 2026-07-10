/**
 * Generic per-clause data extractor — the OPEN-WORLD replacement for the
 * per-genre extractors (emissions / proximity / invoice / bill-of-lading),
 * each of which paired a hardcoded field name with a fixed meaning.
 *
 * This names no clause and assumes no field: it renders EVERY committed clause's
 * data through `describeClause`, which reads the clause's registered spec (title,
 * field labels, enum `valueLabels`) and projects whatever fields the committed
 * data carries. A clause the protocol has never seen renders here from its own
 * spec, with zero code change — the same generic model `processLogsExtract`
 * applies to attestation timelines.
 */

import type { Agreement } from "@figaro/sdk";
import { describeClause, type ClauseDescription } from "@/lib/shared/clauseSpecSource";
import type { Order } from "@/lib/kernel/store";
import type { ExtractedDocument } from "./types";

export interface ClauseDataDocument extends ExtractedDocument {
    /** One description per committed clause — its spec title + each declared
     *  field's label + committed value(s). EVERY committed leaf surfaces, even
     *  when its fields render no values (e.g. a root order's topology leaf with
     *  empty parents): the audit's contract is completeness over the committed
     *  tree, so omission would hide a leaf the merkle root provably carries. */
    clauses: ClauseDescription[];
}

export function extractClauseData(
    order: Order,
    agreement: Agreement,
): ClauseDataDocument {
    const clauses = agreement.sections.map((section) =>
        describeClause(section.clause, (section as { data?: Record<string, unknown> }).data),
    );
    return {
        title: "Clause data",
        orderHash: order.orderHash,
        processId: order.processId,
        agreementHash: order.agreementHash ?? "0x",
        buyer: order.buyer,
        seller: order.seller,
        clauses,
    };
}
