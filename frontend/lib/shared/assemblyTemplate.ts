/**
 * lib/shared/assemblyTemplate.ts — the assembly family's READING vocabulary.
 *
 * The shared source every tier reads (the assembly-family mirror of
 * `clauseSpecSource.ts`): the template types, the one accessor for a template
 * order's topology edges, and the content-derived slug. AUTHORING lives in
 * `lib/designer/buildAssemblyTemplate.ts` (designers build); this module is
 * for everyone who READS published assemblies — checkout instantiates,
 * sellers bind, inventories list, view pages inspect. SoC: design is design,
 * checkout is checkout; both speak this vocabulary, neither owns the other.
 *
 * The template is the no-hash JSON the designer emits. Per order it carries
 * the clauses composed on it (the buyer↔seller relationship's MEANING) — and
 * the topology is ONE OF THOSE CLAUSES: the structural topology clause holds
 * the order's parent ids. The template carries NO party addresses
 * (PARTY-AGNOSTIC — parties bind at adoption/checkout), NO agreement hashes,
 * NO sentinels: the fingerprint forms later, at checkout, when the real
 * parties fill the clause fields.
 */

/** A clause on an order → the field values filled at design time. An empty
 *  object means the clause is selected but the designer set no fields (the
 *  rest is filled downstream — seller at first-use, buyer at checkout). */
export type ClauseValues = Record<string, Record<string, unknown>>;

export interface AssemblyTemplateOrder {
    /** Local order label — `order-<index>`, stable within the template; the
     *  reference target the topology clause points at. NOT a chain id, and NOT
     *  a party — the template is party-agnostic. */
    id: string;
    /** clauseId → the design-time field values the designer composed. The topology
     *  is a clause here too: the structural topology clause carries
     *  `{ parentOrderHashes }` (root = []). Whatever's absent is filled
     *  downstream. */
    clauses: ClauseValues;
}

export interface AssemblyTemplate {
    /** EDITORIAL — the designer's own words, for legibility (the content-derived
     *  slug is opaque at scale). `name` is a short handle, `summary` a one-line
     *  gloss, `description` the long form. Free-form prose, NOT a taxonomy
     *  (open-world: like a seller's name/specialty/description). These are pinned
     *  in the document but EXCLUDED from the content hash — identity stays
     *  composition-derived, so renaming never forks the slug. All optional. */
    name?: string;
    summary?: string;
    description?: string;
    /** ERC-20 the assembly privileges (its denomination / value-capture
     *  token). Absent = ERC-20-agnostic (any token, per the process at
     *  checkout). One token per assembly; offering several = several
     *  assemblies. The Core stays token-agnostic — this is an assembly-layer
     *  choice, not a kernel constraint. */
    privilegedToken?: string;
    orders: AssemblyTemplateOrder[];
}

/** Read a template order's parent ids — the data of its topology clause. The
 *  topology is a clause like any other; this is the one accessor for it. The entry
 *  is found by its DATA KEY (`parentOrderHashes`), so reading needs no spec
 *  cache and tolerates any registry-defined topology clause. */
export function templateParentOrderHashes(order: AssemblyTemplateOrder): string[] {
    const entry = Object.values(order.clauses).find(
        (fields) => Array.isArray((fields as { parentOrderHashes?: unknown } | undefined)?.parentOrderHashes),
    );
    const ids = (entry as { parentOrderHashes?: unknown } | undefined)?.parentOrderHashes;
    return Array.isArray(ids) ? ids.filter((p): p is string => typeof p === "string") : [];
}

/** The published slug — a deterministic id derived from the composition's
 *  content hash (the clauses + their values + the topology). Identical compositions
 *  → identical slug (the registry's first-write-wins then dedups them); distinct
 *  compositions → distinct slug. There is no user-chosen name and no
 *  circularity: the slug is derived FROM the hash, never part of the hashed
 *  template. */
export function deriveAssemblySlug(contentHash: `0x${string}`): string {
    return `asm-${contentHash.slice(2, 18)}`;
}
