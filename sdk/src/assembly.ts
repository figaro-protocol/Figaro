/**
 * @figaro/sdk — Assembly identity
 *
 * The AssemblyRegistry keys bindings by `compositionHash`, exactly as the
 * ClauseRegistry keys clauses by `keccak256(abi.encode(name, version))`
 * (`computeClauseKey`). This module is that family's key derivation — pure
 * functions over the template document, no chain access.
 */

import type { Hex } from "./types.js";
import { canonicalContentHash } from "./agreement.js";

// ── The template document (the pinned assembly, hydrated off-chain) ──────────

export interface TemplateAgreement {
    /** Local label for the kernel-order slot this agreement binds to at
     *  checkout — `order-<index>`, stable within the template; the reference
     *  target the topology clause points at. NOT a chain id, and NOT a
     *  party — the template is party-agnostic. */
    id: string;
    /** clauseId → the designer's composed clause map. Design time is
     *  STRUCTURAL (ruled 2026-07-14): a clause with no designer fills carries
     *  `{}` — the selection only; its fields are transaction particulars
     *  filled at checkout. Exactly two kinds of values exist here: the
     *  mandatory topology clause's `{ parentOrderHashes }` (root = [] — the
     *  DAG, the design itself) and clauses declaring `block.design.fills`
     *  (the designer's tailoring — a pinned consent document, a pinned
     *  settlement token) whose values are the designer's fills.
     *  `buildAssemblyTemplate` (exported from the root `@figaro/sdk`; defined
     *  in `projection.ts`, not here) enforces this by construction. */
    clauses: Record<string, Record<string, unknown>>;
    /** clauseId → the registered VERSION composed, when it isn't 1. A clause's
     *  identity is (name, version) — two live versions are two clauses; this
     *  records WHICH one this agreement composed. SPARSE by normalization:
     *  version-1 entries are never serialized, so a template with only v1
     *  clauses carries no map and hashes identically to the pre-version form. */
    clauseVersions?: Record<string, number>;
}

export interface AssemblyTemplate {
    /** EDITORIAL — the designer's own words, for legibility (the content-derived
     *  slug is opaque at scale). Free-form prose, NOT a taxonomy. Pinned in the
     *  document but EXCLUDED from the composition hash — identity stays
     *  composition-derived, so renaming never forks the slug. All optional. */
    name?: string;
    summary?: string;
    description?: string;
    /** ASSEMBLY-SCOPED clause sections — clauses declaring
     *  `design.scope: "assembly"`, composed ONCE for the whole design
     *  (clauseId → the designer's values, `design.fills` only — same
     *  value-free rule as agreements). At checkout every one of these folds
     *  into EVERY agreement, so every party signs the assembly-wide term in
     *  their own agreement. Sparse: absent when none composed (the hash of an
     *  assembly without them is unchanged). */
    assemblyClauses?: Record<string, Record<string, unknown>>;
    /** clauseId → registered version for assembly-scoped clauses (sparse;
     *  absent = 1, mirroring `TemplateAgreement.clauseVersions`). */
    assemblyClauseVersions?: Record<string, number>;
    /** The composition: the agreements the designer composed, one per future
     *  kernel order. */
    agreements: TemplateAgreement[];
}

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
 *  The committed section versions come from the COMPOSITION, never from
 *  whichever spec versions a registry read happens to resolve. */
export function templateClauseVersion(agreement: Pick<TemplateAgreement, "clauseVersions">, clauseId: string): number {
    return agreement.clauseVersions?.[clauseId] ?? 1;
}

/** The COMPLETE clauseId → version map for a template agreement (absent = 1
 *  made explicit). */
export function templateClauseVersionMap(agreement: TemplateAgreement): Record<string, number> {
    return Object.fromEntries(
        Object.keys(agreement.clauses).map((c) => [c, templateClauseVersion(agreement, c)]),
    );
}

/** The assembly's identity — keccak256 of the canonical COMPOSITION subset of
 *  the template (the composed agreements: their clauses, values, and topology;
 *  editorial prose excluded, so renaming never forks identity). This is the
 *  hash `AssemblyRegistry` keys bindings on. Publishers anchor it; readers
 *  recompute it from a fetched document to verify integrity. */
export function templateCompositionHash(
    template: Pick<AssemblyTemplate, "agreements" | "assemblyClauses" | "assemblyClauseVersions">,
): Hex {
    // Assembly-scoped sections are IDENTITY-BEARING (a differently-termed
    // assembly is a different assembly) — included in the hash whenever
    // composed; omitted entirely when none, so every pre-existing assembly's
    // hash is unchanged.
    const assemblyClauses = template.assemblyClauses;
    const hasAssemblyClauses = assemblyClauses && Object.keys(assemblyClauses).length > 0;
    return canonicalContentHash({
        agreements: template.agreements,
        ...(hasAssemblyClauses && { assemblyClauses }),
        ...(hasAssemblyClauses && template.assemblyClauseVersions
            && Object.keys(template.assemblyClauseVersions).length > 0
            && { assemblyClauseVersions: template.assemblyClauseVersions }),
    });
}

/** The published slug — presentation only, a deterministic pure function of
 *  the composition hash. Identical compositions → identical slug; distinct
 *  compositions → distinct slug. The slug exists nowhere on-chain: the
 *  registry keys bindings by `compositionHash`, and every reader derives the
 *  slug from the event's hash. */
export function deriveAssemblySlug(compositionHash: Hex): string {
    return `asm-${compositionHash.slice(2, 18)}`;
}
