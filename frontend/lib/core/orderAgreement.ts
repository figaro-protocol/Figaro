/**
 * orderAgreement.ts — create the order and its merkle tree.
 *
 * ONE job. The input is the order's COMPLETE clause map — the seller's pinned
 * assembly already carries every clause (commerce and topology are mandatory,
 * so an assembly without them is rejected; the rest are the designer's
 * electives), each entry already valued for this order. This file:
 *
 *   1. projects each clause into an agreement section — `{ clause, version, data }`,
 *   2. assembles the canonical Agreement,
 *   3. returns it with its `agreementHash` = the merkle root over the section
 *      leaves, computed by the ONE builder in `@figaro/core`.
 *
 * It names no clause, injects nothing, special-cases nothing, and re-implements
 * no hashing. Commerce and topology are leaves like any other.
 */
import {
    computeAgreementHash,
    type Agreement,
    type AgreementSection,
} from "@figaro/core";
import { getClauseSpec } from "@/lib/shared/clauseSpecSource";
import type { ClauseFields } from "@/lib/core/encoding";

export interface OrderAgreement {
    agreement: Agreement;
    agreementHash: `0x${string}`;
}

/**
 * Build the order's agreement and merkle tree from its complete clause map.
 * `clauses` is `{ [clauseId]: fieldValues }` — the pinned assembly's clauses,
 * valued for this order. Sections are sorted by clause key so the pinned JSON
 * is deterministic; the merkle root sorts its own leaves, so order never
 * affects the hash.
 */
export function buildOrderAgreement(
    buyer: `0x${string}`,
    seller: `0x${string}`,
    clauses: ClauseFields,
): OrderAgreement {
    const sections: AgreementSection[] = Object.keys(clauses)
        .map((clause) => ({
            clause,
            version: getClauseSpec(clause)?.version ?? 1,
            data: clauses[clause] ?? {},
        }))
        .sort((a, b) => (a.clause < b.clause ? -1 : a.clause > b.clause ? 1 : 0));

    const agreement: Agreement = { version: "a1", buyer, seller, sections };
    return { agreement, agreementHash: computeAgreementHash(agreement) };
}
