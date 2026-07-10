/**
 * lib/shared/assemblyTemplate.ts — the assembly family's READING vocabulary.
 *
 * The shared source every tier reads (the assembly-family mirror of
 * `clauseSpecSource.ts`): the template types, the one accessor for a template
 * agreement's topology edges, and the content-derived slug. AUTHORING lives in
 * `lib/designer/buildAssemblyTemplate.ts` (designers build); this module is
 * for everyone who READS published assemblies — checkout instantiates,
 * sellers bind, inventories list, view pages inspect. SoC: design is design,
 * checkout is checkout; both speak this vocabulary, neither owns the other.
 *
 * The template is the no-hash JSON the designer emits: a composition of
 * AGREEMENTS. Each agreement is one buyer↔seller relationship's MEANING —
 * the clauses composed on it in the drawer — and the topology is ONE OF
 * THOSE CLAUSES: the structural topology clause holds the agreement's parent
 * ids. At checkout the parties fill and sign each agreement, and each signed
 * agreement commits as one kernel ORDER — the agreement's `id` names that
 * future order slot (`order-<index>`), which is why the topology field is
 * `parentOrderHashes`: at runtime it holds the parent orders' kernel order
 * hashes. The template carries NO party addresses (PARTY-AGNOSTIC — parties
 * bind at adoption/checkout), NO agreement hashes, NO sentinels: the
 * fingerprint forms later, at checkout, when the real parties fill the
 * clause fields.
 */

// The template SHAPE's single home is the SDK (`@figaro/core` — assembly.ts):
// one shape, one nested-type name (`TemplateAgreement`). `clauses` is the same
// per-order bag `ClauseFields` names (`Record<string, Record<string, unknown>>`).
export type { AssemblyTemplate, TemplateAgreement } from "@figaro/core";
import type { TemplateAgreement } from "@figaro/core";

/** Read a template agreement's parent ids — the data of its topology clause.
 *  The topology is a clause like any other; this is the one accessor for it.
 *  The entry is found by its DATA KEY (`parentOrderHashes` — named for what
 *  the committed clause holds at runtime: the parent orders' kernel order
 *  hashes; at design time the values are sibling `order-<i>` labels), so
 *  reading needs no spec cache and tolerates any registry-defined topology
 *  clause. */
export function templateParentOrderHashes(agreement: TemplateAgreement): string[] {
    const entry = Object.values(agreement.clauses).find(
        (fields) => Array.isArray((fields as { parentOrderHashes?: unknown } | undefined)?.parentOrderHashes),
    );
    const ids = (entry as { parentOrderHashes?: unknown } | undefined)?.parentOrderHashes;
    return Array.isArray(ids) ? ids.filter((p): p is string => typeof p === "string") : [];
}

/** The registered version an agreement composed for a clause — 1 unless the
 *  sparse `clauseVersions` map says otherwise (v1 pins are never serialized).
 *  @public pending consumer: per-clause version display on the drawer/audit
 *  read surfaces (the map form below is the checkout consumer). */
export function templateClauseVersion(agreement: TemplateAgreement, clauseId: string): number {
    return agreement.clauseVersions?.[clauseId] ?? 1;
}

/** The COMPLETE clauseId → version map for a template agreement (absent = 1
 *  made explicit). Checkout passes this into the agreement build so the
 *  committed section versions come from the composition, never from whichever
 *  spec versions happen to be loaded. */
export function templateClauseVersionMap(agreement: TemplateAgreement): Record<string, number> {
    return Object.fromEntries(
        Object.keys(agreement.clauses).map((c) => [c, templateClauseVersion(agreement, c)]),
    );
}

// The assembly's identity (the AssemblyRegistry key) and its derived slug —
// single home is the SDK; re-exported here for the designer/registry surfaces.
export { templateCompositionHash, deriveAssemblySlug } from "@figaro/core";
