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

import { canonicalContentHash } from "@/lib/shared/canonicalJson";
import type { ClauseFields } from "@/lib/shared/clauseFields";

export interface AssemblyTemplateOrder {
    /** Local order label — `order-<index>`, stable within the template; the
     *  reference target the topology clause points at. NOT a chain id, and NOT
     *  a party — the template is party-agnostic. */
    id: string;
    /** clauseId → the design-time field values the designer composed (an empty
     *  object = selected, no fields set — filled downstream: seller at
     *  first-use, buyer at checkout). The topology is a clause here too: the
     *  structural topology clause carries `{ parentOrderHashes }` (root = []). */
    clauses: ClauseFields;
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

/** The assembly's identity — keccak256 of the canonical COMPOSITION subset of
 *  the template (the composed orders: their clauses, values, and topology;
 *  editorial prose excluded, so renaming never forks identity). This is the
 *  hash `AssemblyRegistry` keys bindings on. Publishers anchor it; readers
 *  recompute it from a fetched document to verify integrity. */
export function templateCompositionHash(template: AssemblyTemplate): `0x${string}` {
    return canonicalContentHash({ orders: template.orders });
}

/** The published slug — presentation only, a deterministic pure function of
 *  the composition hash. Identical compositions → identical slug; distinct
 *  compositions → distinct slug. The slug exists nowhere on-chain: the
 *  registry keys bindings by `compositionHash`, and every reader derives the
 *  slug from the event's hash. */
export function deriveAssemblySlug(compositionHash: `0x${string}`): string {
    return `asm-${compositionHash.slice(2, 18)}`;
}
