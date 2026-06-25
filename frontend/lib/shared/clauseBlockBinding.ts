/**
 * Clause block-binding — the `block` slice of a clause spec.
 *
 * This is pure UI / runtime-composition metadata: which drawer article a clause
 * composes into, which mechanism kinds + modules an assembly mounts when it is
 * anchored, which routes surface it, its doctrinal tier, and the designer flags
 * (structural / default-on / nests-under / attestation / hand-off stages).
 *
 * It lives in the FRONTEND, not the protocol SDK: nothing on-chain reads it, and
 * nothing in `@figaro/core` reads it either. The SDK `ClauseSpec` is content-only
 * (`fields` / `stages`); the frontend parses this `block` slice off the SAME spec
 * JSON at its spec-loading boundary (`clauseSpecSource.loadClauseSpec`) and
 * attaches it as `ClauseSpecWithBlock.block`. Keeping it here is the clause.block
 * seam: `fields` + tier are the verified protocol; everything else in `block` is
 * replaceable presentation owned by the runtime.
 *
 * The parse mirrors the SDK's spec parser shape (it produces `SpecParseError`s on
 * the same `$.block.*` paths the SDK once used) so the frontend load path can fold
 * block errors into the same "spec failed to parse" report.
 */

import type { SpecParseError } from "@figaro/core/clauses";

/** Doctrinal tier per the protocol-extension doctrine. Distinct from the
 *  frontend's `ClauseTier` ("designer-time" | "runtime") in `clauseSpecSource`,
 *  which is a different concept — this is the spec's authored `block.tier`.
 *  Module-internal: consumers read `block.tier` off `ClauseBlockBinding`. */
type ClauseBlockTier = "runtime" | "cross-checked" | "agreement-only";

/** Drawer article a clause composes into on the designer canvas. A free-form
 *  string read straight from the spec — the set of articles and their grouping
 *  are whatever the registered clauses declare, never a closed list.
 *  Module-internal: consumers read `block.article` off `ClauseBlockBinding`. */
type ClauseArticle = string;

/**
 * Block-binding metadata — the single source of truth for how a clause
 * composes into the UI. Each clause declares its own binding here. Consumers:
 *   - Designer drawer (which article composes this clause)
 *   - Canvas → assembly derivation (which mechanism kinds + module IDs
 *     to include when this clause is anchored in an order)
 *   - Runtime composer (which modules to mount per anchored clause)
 *   - Route-tier surfaces (which routes surface this clause)
 *
 * Nothing on-chain reads this field — it's purely UI/composition metadata.
 */
export interface ClauseBlockBinding {
    /** Doctrinal tier. */
    tier: ClauseBlockTier;
    /** Drawer article that composes this clause in the canvas designer.
     *  Undefined when the clause is runtime-only (runtime sister of a
     *  cross-checked clause) and not user-toggleable. */
    article?: ClauseArticle;
    /** Mechanism kinds an assembly should include when this clause is
     *  anchored in any of its orders. Empty when the clause has no
     *  capability-dispatching mechanism (e.g. consent, jurisdiction). */
    mechanismKinds: readonly string[];
    /** Runtime view-tier modules that consume / produce this clause's
     *  data. Empty when the clause is route-tier only. */
    moduleIds: readonly string[];
    /** Route-tier blocks that surface this clause (e.g. ["/dispute",
     *  "/evidence-display"]). Empty when the clause is view-tier only or
     *  has no UI at all. */
    routes?: readonly string[];
    /** The clause's runtime-attestation companion — the runtime clause
     *  paired with this one. The agreement build emits it as an empty anchor
     *  (its content is attested at runtime, not composed). N cross-checked clauses
     *  MAY name the same runtime companion (e.g. several disclosure clauses sharing
     *  one runtime-measurement companion); the emitter dedups. Omit for unsistered
     *  clauses. */
    sisterClauseId?: string;
    /** The FIELD name (on another, parent clause) this clause nests under in the
     *  designer drawer — a containment relationship read from the spec, never a
     *  hardcoded tree. The drawer renders this clause nested beneath the parent
     *  clause's matching field (e.g. a proximity-policy clause nests under a
     *  hand-off clause's `handoff` field). Omit for top-level clauses. */
    nestsUnder?: string;
    /** Structural clause — composed on EVERY order by the agreement build, not a
     *  designer choice (the structural commerce + topology clauses). Generic surfaces
     *  read this to exclude it from selectable lists (the drawer never offers a
     *  structural clause as a checkbox). Omit for elective clauses. */
    structural?: boolean;
    /** Default-on clause — pre-composed (as an empty object the spec's field
     *  `default`s fill at build) on every freshly-spawned designer node, a
     *  deliberate analytics default the author can remove in the drawer (unlike
     *  `structural`, which is never offered). Generic surfaces compose the set
     *  by reading this flag; no code names the clauses. Omit for elective
     *  clauses. */
    defaultOn?: boolean;
    /** WHO attests this runtime clause: "seller" (the order's seller
     *  — the default for lifecycle clauses like merchant/courier process) or
     *  "bilateral" (BOTH buyer and seller witness — e.g. the proximity proof of
     *  physical presence). The generic runtime capability engine reads this to
     *  surface the attestation to the right party/parties, with no clause names in
     *  the engine. Omit for non-attestable clauses. */
    attestation?: "seller" | "bilateral";
    /** Enum stage CODES of this lifecycle clause's ladder that are PHYSICAL
     *  HAND-OFFS — the moments value changes hands (e.g. merchant-process
     *  `handed-off`; courier-process `arrived-pickup`/`arrived-dropoff`). At such
     *  a stage the generic engine pairs a proximity cross-witness: the attesting
     *  seller also signs the proximity proof on whichever order in the process
     *  carries it (its own, or — across the topology edge — the counterparty's),
     *  so both sides of the hand-off witness the same proof. Distinct from
     *  `attestation` (who) — this is WHICH stages are hand-offs. Omit for clauses
     *  with no physical exchange. */
    handoffStages?: readonly string[];
}

const VALID_CLAUSE_TIERS: ReadonlySet<string> = new Set([
    "runtime", "cross-checked", "agreement-only",
]);

function isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseStringArray(
    raw: unknown,
    path: string,
    errors: SpecParseError[],
): readonly string[] | null {
    if (!Array.isArray(raw)) {
        errors.push({ path, message: "expected an array of strings" });
        return null;
    }
    for (let i = 0; i < raw.length; i++) {
        if (typeof raw[i] !== "string" || raw[i].length === 0) {
            errors.push({ path: `${path}[${i}]`, message: "expected a non-empty string" });
            return null;
        }
    }
    return raw as string[];
}

/**
 * Parse and validate the `block` slice of a clause spec. Returns null (and
 * pushes `SpecParseError`s) on any malformed field, mirroring the SDK spec
 * parser's error shape so callers fold block errors into one parse report.
 */
export function parseBlockBinding(
    raw: unknown,
    path: string,
    errors: SpecParseError[],
): ClauseBlockBinding | null {
    if (!isObject(raw)) {
        errors.push({ path, message: "block binding must be an object" });
        return null;
    }
    const tier = raw.tier;
    if (typeof tier !== "string" || !VALID_CLAUSE_TIERS.has(tier)) {
        errors.push({ path: `${path}.tier`, message: `tier must be one of: ${[...VALID_CLAUSE_TIERS].join(", ")}` });
        return null;
    }
    if (raw.article !== undefined) {
        if (typeof raw.article !== "string" || raw.article.length === 0) {
            errors.push({ path: `${path}.article`, message: "article must be a non-empty string when present" });
            return null;
        }
    }
    // Optional: a clause wiring no mechanism module — a pure attestation
    // lifecycle, or any minimal stranger's clause — omits these; nothing
    // on-chain reads them. Absent ⇒ []. (Present-but-malformed still errors.)
    let mechanismKinds: readonly string[] = [];
    if (raw.mechanismKinds !== undefined) {
        const parsed = parseStringArray(raw.mechanismKinds, `${path}.mechanismKinds`, errors);
        if (parsed === null) return null;
        mechanismKinds = parsed;
    }
    let moduleIds: readonly string[] = [];
    if (raw.moduleIds !== undefined) {
        const parsed = parseStringArray(raw.moduleIds, `${path}.moduleIds`, errors);
        if (parsed === null) return null;
        moduleIds = parsed;
    }
    let routes: readonly string[] | undefined;
    if (raw.routes !== undefined) {
        const r = parseStringArray(raw.routes, `${path}.routes`, errors);
        if (r === null) return null;
        routes = r;
    }
    if (raw.sisterClauseId !== undefined) {
        if (typeof raw.sisterClauseId !== "string" || raw.sisterClauseId.length === 0) {
            errors.push({ path: `${path}.sisterClauseId`, message: "sisterClauseId must be a non-empty string when present" });
            return null;
        }
    }
    if (raw.nestsUnder !== undefined) {
        if (typeof raw.nestsUnder !== "string" || raw.nestsUnder.length === 0) {
            errors.push({ path: `${path}.nestsUnder`, message: "nestsUnder must be a non-empty string when present" });
            return null;
        }
    }
    if (raw.structural !== undefined && typeof raw.structural !== "boolean") {
        errors.push({ path: `${path}.structural`, message: "structural must be a boolean when present" });
        return null;
    }
    if (raw.defaultOn !== undefined && typeof raw.defaultOn !== "boolean") {
        errors.push({ path: `${path}.defaultOn`, message: "defaultOn must be a boolean when present" });
        return null;
    }
    if (raw.attestation !== undefined && raw.attestation !== "seller" && raw.attestation !== "bilateral") {
        errors.push({ path: `${path}.attestation`, message: "attestation must be 'seller' or 'bilateral' when present" });
        return null;
    }
    let handoffStages: readonly string[] | undefined;
    if (raw.handoffStages !== undefined) {
        const h = parseStringArray(raw.handoffStages, `${path}.handoffStages`, errors);
        if (h === null) return null;
        handoffStages = h;
    }
    return {
        tier: tier as ClauseBlockTier,
        ...(raw.article !== undefined && { article: raw.article as ClauseArticle }),
        mechanismKinds,
        moduleIds,
        ...(routes !== undefined && { routes }),
        ...(raw.sisterClauseId !== undefined && { sisterClauseId: raw.sisterClauseId as string }),
        ...(raw.nestsUnder !== undefined && { nestsUnder: raw.nestsUnder as string }),
        ...(raw.structural !== undefined && { structural: raw.structural as boolean }),
        ...(raw.defaultOn !== undefined && { defaultOn: raw.defaultOn as boolean }),
        ...(raw.attestation !== undefined && { attestation: raw.attestation as "seller" | "bilateral" }),
        ...(handoffStages !== undefined && { handoffStages }),
    };
}
