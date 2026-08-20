/**
 * Catalogue clause-value validation — the Layer-A gate for the product master
 * data a seller authors per item (freight class, hazmat, cold-chain, …).
 *
 * Open-world and clause-agnostic: no clause is named. Each entry in an item's
 * `clauseValues` map is validated against that clause's REGISTERED spec via the
 * same `validateContent` the sign/attest paths use — one validator, one source
 * of truth. Requires the clause-spec cache warm (`useClauseSpecs`); a clauseId
 * whose spec isn't loaded is skipped (resolved-empty), never failed.
 */

import { validateContent } from "@figaro-protocol/sdk/clauses";
import { getClauseSpec } from "@/lib/shared/clauseSpecSource";
import type { CatalogueItemMetadata } from "@/lib/member/memberCatalogueMetadata";

/**
 * Validate an item's catalogue-sourced clause values against each clause's
 * registered spec. Returns `clauseId.path: message` strings; empty = valid.
 */
export function validateCatalogueClauseValues(item: CatalogueItemMetadata): string[] {
    const values = item.clauseValues;
    if (!values) return [];
    const errors: string[] = [];
    for (const [clauseId, data] of Object.entries(values)) {
        const spec = getClauseSpec(clauseId);
        if (!spec) continue; // spec not loaded — resolved-empty, not a failure
        const result = validateContent(data, spec);
        if (!result.ok) {
            for (const e of result.errors) {
                errors.push(`${clauseId}${e.path.replace(/^\$/, "")}: ${e.message}`);
            }
        }
    }
    return errors;
}
