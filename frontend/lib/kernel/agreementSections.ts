/**
 * agreementSections.ts — read a clause section out of a signed agreement
 * BY FIELD NAME, never by clause id.
 *
 * What decides which section carries a field is the clause's REGISTERED SPEC
 * (ClauseRegistry → IPFS, surfaced through `clauseSpecSource`), so a clause this
 * code has never seen participates the instant it declares the field. No clause
 * is named here; no list is bundled; nothing is hardcoded. The agreement these
 * read — one with `sections` and therefore a merkle tree — exists only AFTER the
 * buyer signs; drafts (no tree) never reach this file.
 *
 * A deliberately tiny, open-world-clean island: the runtime/audit consumers that
 * still need auditing can lean on it without blessing their own internals.
 */
import type { Agreement, AgreementSection } from "@figaro/sdk";
import { clauseDeclaresField, getClauseSpec } from "@/lib/shared/clauseSpecSource";

/** @public — the by-field catalogue's many-result reader, pending consumer
 *  (the single-result `sectionByField` is the one wired so far). Every section
 *  whose registered spec declares a top-level field named `fieldName`. Falls back
 *  to data-key presence only when the spec isn't cached (a clause registered but
 *  not yet hydrated) — still keyed on the field, never on the clause id. */
export function sectionsByField(agreement: Agreement, fieldName: string): AgreementSection[] {
    return agreement.sections.filter((s) =>
        getClauseSpec(s.clause)
            ? clauseDeclaresField(s.clause, fieldName)
            : Object.prototype.hasOwnProperty.call(s.data ?? {}, fieldName),
    );
}

/** The first section declaring `fieldName`, or undefined. */
export function sectionByField(agreement: Agreement, fieldName: string): AgreementSection | undefined {
    return sectionsByField(agreement, fieldName)[0];
}
