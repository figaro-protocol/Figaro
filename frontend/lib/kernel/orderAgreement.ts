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
 * It names no clause, special-cases nothing, and re-implements no hashing.
 * Commerce and topology are leaves like any other. The ONE spec-driven step:
 * each clause spec's own declared field defaults fill fields the composing
 * input omitted (`BaseFieldSpec.default` — "applied when the composing input
 * omits this field") — the SPEC speaks, the code injects nothing of its own.
 */
import {
    computeAgreementHash,
    type Agreement,
    type AgreementSection,
} from "@figaro/core";
import { validateContent } from "@figaro/core/clauses";
import { getClauseSpec, clauseIsProcessLog } from "@/lib/shared/clauseSpecSource";
import { hexEqual } from "@/lib/shared/evm";
import type { ClauseFields } from "@/lib/shared/clauseFields";

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
/** Fill fields the composing input omitted with the clause spec's OWN declared
 *  defaults (registry-sourced, never code-sourced). A process-log clause is an
 *  empty anchor at commit and stays untouched. */
function withSpecDefaults(clause: string, data: Record<string, unknown>): Record<string, unknown> {
    const spec = getClauseSpec(clause);
    if (!spec || clauseIsProcessLog(clause)) return data;
    let out = data;
    for (const field of spec.fields ?? []) {
        if (field.default !== undefined && out[field.name] === undefined) {
            if (out === data) out = { ...data };
            out[field.name] = field.default;
        }
    }
    return out;
}

export function buildOrderAgreement(
    buyer: `0x${string}`,
    seller: `0x${string}`,
    clauses: ClauseFields,
): OrderAgreement {
    const sections: AgreementSection[] = Object.keys(clauses)
        .map((clause) => ({
            clause,
            version: getClauseSpec(clause)?.version ?? 1,
            data: withSpecDefaults(clause, clauses[clause] ?? {}),
        }))
        .sort((a, b) => (a.clause < b.clause ? -1 : a.clause > b.clause ? 1 : 0));

    const agreement: Agreement = { version: "a1", buyer, seller, sections };
    return { agreement, agreementHash: computeAgreementHash(agreement) };
}

/** A single Layer-A issue found before signing: which clause, which field path
 *  (or "(merkle)"), and what's wrong. */
export interface CommitmentAgreementIssue {
    clause: string;
    path: string;
    message: string;
}

/**
 * Layer A of the verification stack, run on BOTH sides of the bilateral commit
 * (buyer before initiating, seller before counter-signing) so neither party
 * signs an invalid agreement. Two checks: every present section conforms to its
 * clause spec (SDK validateContent; runtime clauses are presence-markers, skipped),
 * and the `agreementHash` about to be signed equals the merkle root recomputed
 * from the sections. Catches a malformed agreement before a chain round-trip.
 */
export function validateCommitmentAgreement(
    agreement: Agreement,
    expectedHash: `0x${string}`,
): { ok: boolean; issues: CommitmentAgreementIssue[] } {
    const issues: CommitmentAgreementIssue[] = [];

    for (const section of agreement.sections) {
        const spec = getClauseSpec(section.clause);
        if (!spec) continue;
        // A runtime-lifecycle clause is an empty anchor at commit — its content
        // is attested later, so there is nothing to validate here.
        if (clauseIsProcessLog(section.clause)) continue;
        const result = validateContent(section.data, spec);
        if (!result.ok) {
            for (const e of result.errors) {
                issues.push({ clause: section.clause, path: e.path, message: e.message });
            }
        }
    }

    if (issues.length === 0) {
        let computed: `0x${string}` | null = null;
        try {
            computed = computeAgreementHash(agreement);
        } catch (cause) {
            issues.push({
                clause: "(merkle)",
                path: "agreementHash",
                message: `agreement content failed to encode: ${cause instanceof Error ? cause.message : String(cause)}`,
            });
        }
        if (computed && !hexEqual(computed, expectedHash)) {
            issues.push({
                clause: "(merkle)",
                path: "agreementHash",
                message: `signed hash ${expectedHash} does not match the agreement's computed root ${computed}`,
            });
        }
    }

    return { ok: issues.length === 0, issues };
}
