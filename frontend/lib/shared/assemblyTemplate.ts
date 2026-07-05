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

import { canonicalContentHash } from "@/lib/shared/canonicalJson";
import type { ClauseFields } from "@/lib/shared/clauseFields";

export interface AssemblyTemplateAgreement {
    /** Local label for the kernel-order slot this agreement binds to at
     *  checkout — `order-<index>`, stable within the template; the reference
     *  target the topology clause points at. NOT a chain id, and NOT a
     *  party — the template is party-agnostic. */
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
     *  in the document but EXCLUDED from the composition hash — identity stays
     *  composition-derived, so renaming never forks the slug. All optional. */
    name?: string;
    summary?: string;
    description?: string;
    /** The composition: the agreements the designer composed, one per future
     *  kernel order. */
    agreements: AssemblyTemplateAgreement[];
}

/** Read a template agreement's parent ids — the data of its topology clause.
 *  The topology is a clause like any other; this is the one accessor for it.
 *  The entry is found by its DATA KEY (`parentOrderHashes` — named for what
 *  the committed clause holds at runtime: the parent orders' kernel order
 *  hashes; at design time the values are sibling `order-<i>` labels), so
 *  reading needs no spec cache and tolerates any registry-defined topology
 *  clause. */
export function templateParentOrderHashes(agreement: AssemblyTemplateAgreement): string[] {
    const entry = Object.values(agreement.clauses).find(
        (fields) => Array.isArray((fields as { parentOrderHashes?: unknown } | undefined)?.parentOrderHashes),
    );
    const ids = (entry as { parentOrderHashes?: unknown } | undefined)?.parentOrderHashes;
    return Array.isArray(ids) ? ids.filter((p): p is string => typeof p === "string") : [];
}

/** The assembly's identity — keccak256 of the canonical COMPOSITION subset of
 *  the template (the composed agreements: their clauses, values, and topology;
 *  editorial prose excluded, so renaming never forks identity). This is the
 *  hash `AssemblyRegistry` keys bindings on. Publishers anchor it; readers
 *  recompute it from a fetched document to verify integrity. */
export function templateCompositionHash(template: AssemblyTemplate): `0x${string}` {
    return canonicalContentHash({ agreements: template.agreements });
}

/** The published slug — presentation only, a deterministic pure function of
 *  the composition hash. Identical compositions → identical slug; distinct
 *  compositions → distinct slug. The slug exists nowhere on-chain: the
 *  registry keys bindings by `compositionHash`, and every reader derives the
 *  slug from the event's hash. */
export function deriveAssemblySlug(compositionHash: `0x${string}`): string {
    return `asm-${compositionHash.slice(2, 18)}`;
}
