/**
 * Catalogue clause-value validation — the off-chain validation gate for the product master
 * data a seller authors per item (freight class, hazmat, cold-chain, …).
 *
 * Open-world and clause-agnostic: no clause is named. Each entry in an item's
 * `clauseValues` map is validated against that clause's REGISTERED spec via the
 * same `validateContent` the sign/attest paths use — one validator, one source
 * of truth. Requires the clause-spec cache warm (`useClauseSpecs`); a clauseId
 * whose spec isn't loaded is skipped (resolved-empty), never failed.
 */

import { validateContent, type FieldSpec } from "@figaro-protocol/sdk/clauses";
import {
    clauseCatalogueFills,
    getClauseSpec,
    listCatalogueSourcedClauses,
} from "@/lib/shared/clauseSpecSource";
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

/**
 * The catalogue-authored clause sections a seller's items actually offer:
 * every registered clause with `block.checkout.catalogueFills` that one of the
 * assemblies this seller has BOUND composes. Two derivations, one direction —
 * the bindings decide the clauses, the clauses decide the fields; the
 * catalogue never opens a field no trade of this seller's can carry.
 *
 * Empty until an assembly is bound, and empty for a seller whose bound
 * assemblies compose no product-property clause (the seller of one mug sees no
 * hazmat class). A bound assembly whose template has not resolved yet
 * contributes nothing rather than everything — absence, read at the edge.
 *
 * `choices` is the live registry projection (`useAssemblyChoices`); nothing
 * here knows any clause or assembly by name.
 */
export function catalogueClausesForBindings(
    bindings: readonly { assemblySlug: string }[],
    choices: readonly { slug: string; clauses: readonly string[] | null }[],
): readonly { clauseId: string; version: number }[] {
    const boundSlugs = new Set(bindings.map((b) => b.assemblySlug));
    const composed = new Set<string>();
    for (const choice of choices) {
        if (!boundSlugs.has(choice.slug)) continue;
        for (const clauseId of choice.clauses ?? []) composed.add(clauseId);
    }
    if (composed.size === 0) return [];
    return listCatalogueSourcedClauses().filter((c) => composed.has(c.clauseId));
}

/**
 * The fields of one clause the CATALOGUE authors — the clause's own
 * `block.checkout.catalogueFills`, resolved against its registered spec and
 * returned in spec order. Fields the clause assigns to another source (the
 * designer's fills, the buyer's checkout particulars, the seller's profile)
 * are not the catalogue's to ask for. Empty while the spec is uncached.
 */
export function catalogueFieldsOfClause(
    clauseId: string,
    version?: number,
): readonly FieldSpec[] {
    const spec = getClauseSpec(clauseId, version);
    if (!spec) return [];
    const fills = new Set(clauseCatalogueFills(clauseId, version));
    return spec.fields.filter((f) => fills.has(f.name));
}
