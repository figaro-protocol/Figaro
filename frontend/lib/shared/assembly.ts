/**
 * lib/shared/assembly.ts — the assembly family's READING vocabulary.
 *
 * The shared source every tier reads (the assembly-family mirror of
 * `clauseSpecSource.ts`): the assembly type, the one accessor for an agreement
 * own topology edges, the assembly root, and the content-derived slug.
 * AUTHORING lives in `@figaro-protocol/sdk` projection — `buildProcessDesign`
 * (designers build); this module is for everyone who READS published
 * assemblies — checkout instantiates, sellers bind, inventories list, view
 * pages inspect. SoC: design is design, checkout is checkout; both speak this
 * vocabulary, neither owns the other.
 *
 * The assembly is the JSON the designer pins: one AGREEMENT per future
 * FigaroCore order. Each agreement binds a REGISTERED AGREEMENT by its
 * `AgreementRegistry` key — the clauses composed for that agreement, pinned
 * once and read by key — and carries its own fills over it and its own
 * topology, `follows`: the sibling `agreement-<index>` labels it follows (at
 * runtime the order's agreement carries the parent orders' FigaroCore order
 * hashes in its topology leaf, `Agreement.follows`). A reader hydrates the assembly with each
 * agreement's agreement before checkout plans from it. The assembly carries
 * NO party addresses (PARTY-AGNOSTIC — parties bind at adoption/checkout), NO
 * checkout hashes, NO sentinels: the fingerprint forms later, at checkout,
 * when the real parties fill the clause fields.
 */

// The assembly SHAPE's single home is the SDK (`@figaro-protocol/sdk` — assembly.ts):
// `ProcessDesign` with its `ProcessDesignAgreement` agreements; an agreement's
// `clauses` is the same per-order bag `ClauseFields` names
// (`Record<string, Record<string, unknown>>`).
export type { ProcessDesign } from "@figaro-protocol/sdk";

// The shape's accessor (topology parents), the
// assembly's identity (the ProcessRegistry key), and its derived slug —
// single home is the SDK; re-exported here for the designer/registry surfaces.
export {
    processDesignFollows,
    processDesignHashOf,
    deriveProcessDesignSlug,
    // The name the frozen /communities page imports; it moves when that page is unfrozen.
    deriveProcessDesignSlug as deriveAssemblySlug,
} from "@figaro-protocol/sdk";
