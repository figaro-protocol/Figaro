/**
 * lib/shared/assemblyTemplate.ts — the assembly family's READING vocabulary.
 *
 * The shared source every tier reads (the assembly-family mirror of
 * `clauseSpecSource.ts`): the template type, the one accessor for an order
 * slot's topology edges, the composition root, and the content-derived slug.
 * AUTHORING lives in `@figaro-protocol/sdk` projection — `buildAssemblyTemplate`
 * (designers build); this module is for everyone who READS published
 * assemblies — checkout instantiates, sellers bind, inventories list, view
 * pages inspect. SoC: design is design, checkout is checkout; both speak this
 * vocabulary, neither owns the other.
 *
 * The template is the JSON the designer pins: one ORDER SLOT per future
 * FigaroCore order. Each order slot binds a REGISTERED AGREEMENT by its
 * `AgreementRegistry` key — the clauses composed for that order slot, pinned
 * once and read by key — and carries its own fills over it: the topology
 * clause's parents, as sibling `order-<index>` labels, which is why the
 * topology field is `parentOrderHashes` (at runtime it holds the parent
 * orders' FigaroCore order hashes). A reader hydrates the template with each
 * order slot's agreement before checkout plans from it. The template carries
 * NO party addresses (PARTY-AGNOSTIC — parties bind at adoption/checkout), NO
 * agreement hashes, NO sentinels: the fingerprint forms later, at checkout,
 * when the real parties fill the clause fields.
 */

// The template SHAPE's single home is the SDK (`@figaro-protocol/sdk` — assembly.ts):
// `AssemblyTemplate` with its `TemplateSlot` order slots; an order slot's
// `clauses` is the same per-order bag `ClauseFields` names
// (`Record<string, Record<string, unknown>>`).
export type { AssemblyTemplate } from "@figaro-protocol/sdk";

// The shape's accessor (topology parents), the
// assembly's identity (the AssemblyRegistry key), and its derived slug —
// single home is the SDK; re-exported here for the designer/registry surfaces.
export {
    templateParentOrderHashes,
    templateCompositionHash,
    deriveAssemblySlug,
} from "@figaro-protocol/sdk";
