/**
 * Clause block-binding — the `block` slice of a clause spec.
 *
 * This is pure UI / runtime-composition metadata: which drawer article a clause
 * composes into, the field a clause nests under in the drawer, and the
 * on-network contract / external forum it composes with (`composes` — the fifth
 * noun).
 *
 * It lives in the FRONTEND, not the protocol SDK: nothing on-chain reads it, and
 * nothing in `@figaro/core` reads it either. The SDK `ClauseSpec` is content-only
 * (`fields` / `stages`); the frontend parses this `block` slice off the SAME spec
 * JSON at its spec-loading boundary (`clauseSpecSource.loadClauseSpec`) and
 * attaches it as `ClauseSpecWithBlock.block`. Keeping it here is the clause.block
 * seam: `fields` are the verified protocol; everything else in `block` is
 * replaceable presentation owned by the runtime.
 *
 * The parse mirrors the SDK's spec parser shape (it produces `SpecParseError`s on
 * the same `$.block.*` paths the SDK once used) so the frontend load path can fold
 * block errors into the same "spec failed to parse" report.
 */

import { parseFieldSpec, type SpecParseError, type FieldSpec } from "@figaro/core/clauses";

/** Drawer article a clause composes into on the designer canvas. A free-form
 *  string read straight from the spec — the set of articles and their grouping
 *  are whatever the registered clauses declare, never a closed list.
 *  Module-internal: consumers read `block.article` off `ClauseBlockBinding`. */
type ClauseArticle = string;

/**
 * Block-binding metadata — how a clause composes into the UI. Each clause
 * declares its own binding here: its drawer `article` and the `nestsUnder`
 * field it nests beneath.
 *
 * Nothing on-chain reads this field — it's purely UI/composition metadata.
 */
export interface ClauseBlockBinding {
    /** Drawer article that composes this clause in the canvas designer — the
     *  clause's sole classification (post-K1-OW). REQUIRED: every clause
     *  declares exactly one article. */
    article: ClauseArticle;
    /** The FIELD name (on another, parent clause) this clause nests under in the
     *  designer drawer — a containment relationship read from the spec, never a
     *  hardcoded tree. The drawer renders this clause nested beneath the parent
     *  clause's matching field (e.g. a proximity-policy clause nests under a
     *  hand-off clause's `handoff` field). Omit for top-level clauses. */
    nestsUnder?: string;
    /** Composition binding — the on-network contract or external forum this
     *  clause composes with (the fifth noun). `interface` names a STANDARD
     *  composition interface (chain-agnostic, read from spec — never a bundled
     *  clause-id switch in code); the concrete instance ADDRESS is chain-specific
     *  and comes at runtime (clause data / chain self-declaration / env), NOT
     *  here. `forumUrl` deep-links a provider's own web UI for URL-only
     *  compositions (e.g. a dispute forum). Invoking an on-network contract is
     *  per-standard-interface integration code (a handler + the standard's ABI);
     *  there is no per-clause ABI/choreography artifact — the CALL-SHAPE is the
     *  interface standard, and the trade-level coordination is the assembly. Omit
     *  for clauses that compose with nothing. */
    composes?: {
        interface: string;
        forumUrl?: string;
    };
    /** Interaction binding — the party↔party runtime interaction standard
     *  this clause's tasks use (the sibling of `composes`, which names an
     *  on-network contract interface). `interface` names a STANDARD
     *  interaction (e.g. a QR order-identity challenge at a physical
     *  hand-off) — read from the spec, never a bundled clause-id switch.
     *  A frontend that registered a surface for the interface mounts it
     *  (`interactionSurfaces`); one that didn't renders nothing extra — the
     *  affordance is progressive enhancement, the protocol never depends on
     *  it. Omit for clauses whose tasks need no dedicated interaction. */
    interaction?: {
        interface: string;
    };
    /** Catalogue-sourced — this clause's content values are authored per-item on
     *  the seller's CATALOGUE (product master data: freight class, hazmat,
     *  cold-chain), not composed at design time. Generic surfaces read this to
     *  render a spec-driven authoring section on the catalogue item and to fold
     *  the stored values onto the matching leaf at checkout. ANY registered
     *  clause opts in by declaring it — including one this codebase has never
     *  seen. Omit (falsy) for clauses whose values come from composition/topology. */
    catalogueSourced?: boolean;
    /** Runtime inputs — the fields a party supplies at RUNTIME, distinct
     *  from the clause's content `fields` (which are committed into the agreement
     *  at signing). Rendered by ONE generic form; the surface reads no interface
     *  name. Serves any runtime input: a composed contract's parameters (e.g. a
     *  composed contract's opening parameter — paired with `composes`) or a runtime
     *  attestation's witness. Same `FieldSpec` shape as content fields — one
     *  parser, one renderer. Omit for clauses with no runtime input. */
    fields?: readonly FieldSpec[];
    /** Hand-off stages — for a process-log (ladder) clause, the eventType
     *  values at which a PHYSICAL hand-off occurs. Executing one of these
     *  ladder stages pairs the witness stage of any co-composed clause nesting
     *  under `handoff` (proximity) on the same order — one action, two
     *  attestations. Read from the spec, never a hardcoded stage list; omit
     *  for clauses with no hand-off semantics. */
    handoffStages?: readonly string[];
}

function isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
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
    if (typeof raw.article !== "string" || raw.article.length === 0) {
        errors.push({ path: `${path}.article`, message: "article is required and must be a non-empty string (the clause's sole classification)" });
        return null;
    }
    if (raw.nestsUnder !== undefined) {
        if (typeof raw.nestsUnder !== "string" || raw.nestsUnder.length === 0) {
            errors.push({ path: `${path}.nestsUnder`, message: "nestsUnder must be a non-empty string when present" });
            return null;
        }
    }
    let composes: ClauseBlockBinding["composes"];
    if (raw.composes !== undefined) {
        if (!isObject(raw.composes)) {
            errors.push({ path: `${path}.composes`, message: "composes must be an object when present" });
            return null;
        }
        if (typeof raw.composes.interface !== "string" || raw.composes.interface.length === 0) {
            errors.push({ path: `${path}.composes.interface`, message: "composes.interface is required and must be a non-empty string" });
            return null;
        }
        for (const opt of ["forumUrl"] as const) {
            const v = raw.composes[opt];
            if (v !== undefined && (typeof v !== "string" || v.length === 0)) {
                errors.push({ path: `${path}.composes.${opt}`, message: `composes.${opt} must be a non-empty string when present` });
                return null;
            }
        }
        composes = {
            interface: raw.composes.interface,
            ...(raw.composes.forumUrl !== undefined && { forumUrl: raw.composes.forumUrl as string }),
        };
    }
    if (raw.catalogueSourced !== undefined && typeof raw.catalogueSourced !== "boolean") {
        errors.push({ path: `${path}.catalogueSourced`, message: "catalogueSourced must be a boolean when present" });
        return null;
    }
    let interaction: ClauseBlockBinding["interaction"];
    if (raw.interaction !== undefined) {
        if (!isObject(raw.interaction)) {
            errors.push({ path: `${path}.interaction`, message: "interaction must be an object when present" });
            return null;
        }
        if (typeof raw.interaction.interface !== "string" || raw.interaction.interface.length === 0) {
            errors.push({ path: `${path}.interaction.interface`, message: "interaction.interface is required and must be a non-empty string" });
            return null;
        }
        interaction = { interface: raw.interaction.interface };
    }
    let handoffStages: readonly string[] | undefined;
    if (raw.handoffStages !== undefined) {
        if (!Array.isArray(raw.handoffStages) || raw.handoffStages.some((s) => typeof s !== "string" || s.length === 0)) {
            errors.push({ path: `${path}.handoffStages`, message: "handoffStages must be an array of non-empty strings when present" });
            return null;
        }
        handoffStages = raw.handoffStages as string[];
    }
    let fields: readonly FieldSpec[] | undefined;
    if (raw.fields !== undefined) {
        if (!Array.isArray(raw.fields)) {
            errors.push({ path: `${path}.fields`, message: "block.fields must be an array of field specs when present" });
            return null;
        }
        // Reuse the SDK's field-spec parser — block.fields are the SAME shape as
        // a clause's content fields, so one parser drives both.
        const parsed: FieldSpec[] = [];
        for (let i = 0; i < raw.fields.length; i++) {
            const f = parseFieldSpec(raw.fields[i], `${path}.fields[${i}]`, errors);
            if (f === null) return null;
            parsed.push(f);
        }
        fields = parsed;
    }
    return {
        article: raw.article as ClauseArticle,
        ...(raw.nestsUnder !== undefined && { nestsUnder: raw.nestsUnder as string }),
        ...(raw.catalogueSourced !== undefined && { catalogueSourced: raw.catalogueSourced as boolean }),
        ...(composes !== undefined && { composes }),
        ...(interaction !== undefined && { interaction }),
        ...(fields !== undefined && { fields }),
        ...(handoffStages !== undefined && { handoffStages }),
    };
}
