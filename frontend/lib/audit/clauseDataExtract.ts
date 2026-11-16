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

import type { Agreement } from "@figaro-protocol/sdk";
import { describeClause, getClauseSpec, type ClauseDescription } from "@/lib/shared/clauseSpecSource";
import type { Order } from "@/lib/core/store";
import type { ExtractedDocument, MissingPart } from "./types";

export interface ClauseDataDocument extends ExtractedDocument {
    /** One description per committed clause — its spec title + each declared
     *  field's label + committed value(s). EVERY committed leaf surfaces, even
     *  when its fields render no values (e.g. a process-log clause's empty
     *  anchor): the audit's contract is completeness over the committed
     *  tree, so omission would hide a leaf the merkle root provably carries. */
    clauses: ClauseDescription[];
    /** Each private clause's blinding value, as the agreement this file was
     *  built from carries it: no term, so `clauses` never lists it, yet the
     *  forum needs it to rebuild the clause's data hash and leaf. Present only
     *  where the builder holds the clause's content (a withheld clause is
     *  named in `missing` instead). The evidence file is the one reader that
     *  shows it: the public audit view lists `clauses` alone. */
    blindingValues: { clauseKey: string; field: string; value: string }[];
    /** A clause whose spec was not loaded still lists its committed fields, by
     *  raw name; the evidence file says it lacks the spec's title and labels.
     *  A clause whose content is withheld (`dataHash`) is named too. */
    missing: MissingPart[];
}

export function extractClauseData(
    order: Order,
    agreement: Agreement,
): ClauseDataDocument {
    const clauses = agreement.clauses.map((clauseEntry) =>
        describeClause(clauseEntry.clause, (clauseEntry as { data?: Record<string, unknown> }).data),
    );
    const missing: MissingPart[] = agreement.clauses
        .filter((c) => !getClauseSpec(c.clause))
        .map((c) => ({
            part: `Spec of clause ${c.clause}`,
            orderHash: order.orderHash,
            reason: "the spec was not loaded, so the clause's fields are shown by raw name, without the spec's title and labels",
        }));
    const blindingValues: ClauseDataDocument["blindingValues"] = [];
    for (const clauseEntry of agreement.clauses) {
        const data = (clauseEntry as { data?: Record<string, unknown> }).data;
        if (data === undefined) {
            missing.push({
                part: `Content of private clause ${clauseEntry.clause}`,
                orderHash: order.orderHash,
                reason: "the clause's content is withheld from the agreement this file was built from, which carries only its data hash; the party that holds the content, its blinding value included, can hand it over",
            });
            continue;
        }
        const spec = getClauseSpec(clauseEntry.clause);
        for (const field of spec?.fields ?? []) {
            if (field.blinding !== true || typeof data[field.name] !== "string") continue;
            blindingValues.push({ clauseKey: clauseEntry.clause, field: field.name, value: data[field.name] as string });
        }
    }
    return {
        title: "Clause data",
        orderHash: order.orderHash,
        processId: order.processId,
        checkoutHash: order.checkoutHash ?? "0x",
        buyer: order.buyer,
        seller: order.seller,
        clauses,
        blindingValues,
        missing,
    };
}
