/**
 * lib/shared/assemblyTemplate.ts — the assembly family's READING vocabulary.
 *
 * The shared source every tier reads (the assembly-family mirror of
 * `clauseSpecSource.ts`): the template types, the one accessor for a template
 * agreement's topology edges, and the content-derived slug. AUTHORING lives in
 * `@figaro/sdk` projection — `buildAssemblyTemplate` (designers build); this module is
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

// The template SHAPE's single home is the SDK (`@figaro/sdk` — assembly.ts):
// one shape, one nested-type name (`TemplateAgreement`). `clauses` is the same
// per-order bag `ClauseFields` names (`Record<string, Record<string, unknown>>`).
export type { AssemblyTemplate } from "@figaro/sdk";

// The shape's accessors (topology parents, composed clause versions), the
// assembly's identity (the AssemblyRegistry key), and its derived slug —
// single home is the SDK; re-exported here for the designer/registry surfaces.
export {
    templateParentOrderHashes,
    templateCompositionHash,
    deriveAssemblySlug,
} from "@figaro/sdk";

/** @public pending consumer: per-clause version display on the drawer/audit
 *  read surfaces. */
export { templateClauseVersion } from "@figaro/sdk";
