/**
 * Catalog clause-value validation — the off-chain validation gate for the product master
 * data a member fills per item (freight class, hazmat, cold-chain, …).
 *
 * Open-world and clause-agnostic: no clause is named. Each entry in an item's
 * `clauseValues` map is validated against that clause's REGISTERED spec via the
 * same `validateContent` the sign/attest paths use — one validator, one source
 * of truth. Requires the clause-spec cache warm (`useClauseSpecs`); a clauseId
 * whose spec isn't loaded is skipped (resolved-empty), never failed.
 */

import { validateContent, type FieldSpec } from "@figaro-protocol/sdk/clauses";
import {
    clauseCatalogFills,
    getClauseSpec,
    listCatalogSourcedClauses,
    memberDocumentClauseSpec,
} from "@/lib/shared/clauseSpecSource";
import type { CatalogItemMetadata } from "@/lib/member/memberCatalogMetadata";

/**
 * Validate an item's catalog-sourced clause values against each clause's
 * registered spec. Returns `clauseId.path: message` strings; empty = valid.
 */
export function validateCatalogClauseValues(item: CatalogItemMetadata): string[] {
    const values = item.clauseValues;
    if (!values) return [];
    const errors: string[] = [];
    for (const [clauseId, data] of Object.entries(values)) {
        // The catalog document names the clause without a version.
        const spec = memberDocumentClauseSpec(clauseId);
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
 * The catalog-filled clause sections a member's items actually offer:
 * every registered clause with `block.checkout.catalogueFills` that one of the
 * assemblies this member has BOUND composes. Two derivations, one direction —
 * the bindings decide the clauses, the clauses decide the fields; the
 * catalog never opens a field no trade of this member's can carry.
 *
 * Empty until an assembly is bound, and empty for a member whose bound
 * assemblies compose no product-property clause (the member of one mug sees no
 * hazmat class). A bound assembly whose template has not resolved yet
 * contributes nothing rather than everything — absence, read at the edge.
 *
 * `choices` is the live registry projection (`useAssemblyChoices`); nothing
 * here knows any clause or assembly by name.
 */
export function catalogClausesForBindings(
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
    return listCatalogSourcedClauses().filter((c) => composed.has(c.clauseId));
}

/**
 * The fields of one clause the CATALOG fills — the clause's own
 * `block.checkout.catalogueFills`, resolved against its registered spec and
 * returned in spec order. Fields the clause assigns to another source (the
 * designer's fills, the buyer's checkout particulars, the member's profile)
 * are not the catalog's to ask for. Empty while the spec is uncached.
 */
export function catalogFieldsOfClause(
    clauseId: string,
    version: number,
): readonly FieldSpec[] {
    const spec = getClauseSpec(clauseId, version);
    if (!spec) return [];
    const fills = new Set(clauseCatalogFills(clauseId, version));
    return spec.fields.filter((f) => fills.has(f.name));
}
