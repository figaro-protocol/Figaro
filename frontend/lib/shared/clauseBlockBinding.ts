/**
 * Clause block-binding — the `block` slice of a clause spec: the UI half of
 * the clause document, on the frontend side of the UI/protocol crease.
 *
 * A clause spec has two halves. The TOP LEVEL is the protocol half — identity,
 * registration, and the content `fields`/`stages` that become sections of
 * signed agreements (merkle leaves under the on-chain `agreementHash`).
 * `block` is the UI half: instructions to frontends, organized into PHASE
 * SECTIONS, each named for its reader —
 *
 *   - `design`   — read by the designer's canvas and agreement drawer,
 *   - `checkout` — read by the checkout fold,
 *   - `runtime`  — read by the capability rail.
 *
 * Nothing on-chain reads any of it; any frontend could present the same
 * clause differently. An attribute read in two phases is declared in the
 * section of its FIRST reader (`design.composes` is declared at design,
 * dispatched at runtime). The one verb `fills` recurs across sections and
 * always means the same thing: the content fields (by name) whose values that
 * phase's actor authors — the BUYER owns every content field named in no
 * fills list, authored at checkout (the default case; always derived as the
 * complement, never stored).
 *
 * This module lives in the FRONTEND because the frontend is `block`'s
 * reference parser (the published JSON Schema names it): the SDK `ClauseSpec` is
 * content-only (`fields` / `stages`), and the SDK projection sees only the
 * narrow `ProjectionHints` slice the frontend derives at its spec-loading
 * boundary (`clauseSpecSource.loadClauseSpec`), attached as
 * `ClauseSpecWithBlock.block`.
 *
 * Absence degrades, malformation errors: a spec omitting an attribute gets
 * that attribute's EMPTY value (resolved-empty = absence — a sparser
 * third-party spec still surfaces), but a present-and-malformed value is a
 * `SpecParseError` on the same `$.block.*` paths the SDK parser uses, so the
 * load path folds block errors into one "spec failed to parse" report. The
 * repo's own clause corpus expresses every attribute explicitly (the
 * standard: zero, empty, or null — never absent), enforced by test.
 */

import { parseFieldSpec, type SpecParseError, type FieldSpec } from "@figaro/sdk/clauses";

/** Drawer article a clause composes into on the designer canvas. A free-form
 *  string read straight from the spec — the set of articles and their grouping
 *  are whatever the registered clauses declare, never a closed list.
 *  Module-internal: consumers read `block.design.article` off `ClauseBlockBinding`. */
type ClauseArticle = string;

/** The `design` section — read by the designer's canvas and drawer. */
interface ClauseBlockDesign {
    /** Drawer grouping heading — the contract-document section this clause
     *  reads under. REQUIRED: every clause declares exactly one. */
    article: ClauseArticle;
    /** The FIELD name (on another, parent clause) this clause nests under in
     *  the designer drawer — a containment relationship read from the spec,
     *  never a hardcoded tree (e.g. a proximity-policy clause nests under a
     *  hand-off clause's `handoff` field). Null for top-level clauses. */
    nestsUnder: string | null;
    /** The content fields (by name) the DESIGNER authors into the assembly
     *  template — the tailoring that adapts a generic clause to a specific
     *  application (a pinned consent document, a pinned settlement token).
     *  The drawer exposes field editors exactly for these; their values
     *  survive into the published template (identity-bearing — part of the
     *  compositionHash). Empty when the designer only selects the clause. */
    fills: readonly string[];
    /** Composition binding — the on-network contract or external forum this
     *  clause composes with (the fifth noun). `interface` names a STANDARD
     *  composition interface (chain-agnostic, read from spec — never a
     *  bundled clause-id switch in code); the concrete instance ADDRESS is
     *  chain-specific and comes at runtime (clause data / chain
     *  self-declaration / env), NOT here. `forumUrl` deep-links a provider's
     *  own web UI for URL-only compositions (e.g. a dispute forum) — parsed
     *  as https: only (see `parseBlockBinding`), since it renders as a link.
     *  Invoking an on-network contract is per-standard-interface integration
     *  code (a handler + the standard's ABI); there is no per-clause
     *  ABI/choreography artifact — the CALL-SHAPE is the interface standard,
     *  and the trade-level coordination is the assembly. Null for clauses
     *  that compose with nothing. */
    composes: {
        interface: string;
        forumUrl?: string;
    } | null;
}

/** The `checkout` section — read by the checkout fold: where declared values
 *  come from before the buyer signs. */
interface ClauseBlockCheckout {
    /** The content fields (by name) authored per-item on the seller's
     *  CATALOGUE (item master data: freight class, hazmat class, cold-chain
     *  window) and folded onto the matching leaf at checkout. Generic
     *  surfaces render a spec-driven authoring section on the catalogue item
     *  for ANY clause declaring a non-empty list — including one this
     *  codebase has never seen. */
    catalogueFills: readonly string[];
    /** The content fields (by name) authored ONCE on the seller's PROFILE
     *  (seller master data: a dim-weight divisor, a declared credential id)
     *  and folded onto the matching leaf at checkout. The seller-level
     *  sibling of `catalogueFills` — two distinct layers: catalogue = what is
     *  sold, profile = who sells. ANY registered clause opts in by declaring
     *  a non-empty list. */
    profileFills: readonly string[];
}

/** The `runtime` section — read by the capability rail while the process runs. */
interface ClauseBlockRuntime {
    /** Interaction binding — the party↔party runtime interaction standard
     *  this clause's tasks use (the sibling of `design.composes`, which names
     *  an on-network contract interface). `interface` names a STANDARD
     *  interaction (e.g. a QR order-identity challenge at a physical
     *  hand-off) — read from the spec, never a bundled clause-id switch.
     *  A frontend that registered a surface for the interface mounts it
     *  (`interactionSurfaces`); one that didn't renders nothing extra — the
     *  affordance is progressive enhancement, the protocol never depends on
     *  it. Null for clauses whose tasks need no dedicated interaction. */
    interaction: { interface: string } | null;
    /** Runtime-input field specs — values a party supplies at RUNTIME,
     *  distinct from the clause's content `fields` (which are committed into
     *  the agreement at signing). Rendered by ONE generic form; the surface
     *  reads no interface name. Serves any runtime input: a composed
     *  contract's parameters (paired with `design.composes`) or a runtime
     *  attestation's witness. Same `FieldSpec` shape as content fields — one
     *  parser, one renderer. Empty for clauses with no runtime input. */
    fields: readonly FieldSpec[];
    /** For a clause whose runtime evidence is a coordination event log: the
     *  eventType values at which a hand-off occurs. Executing one of these
     *  stages pairs the witness stage of ANY co-composed clause declaring
     *  `design.nestsUnder: "handoff"` on the same order — one action, two
     *  attestations. A field-name vocabulary, deliberately not a clause
     *  list; physical and digital hand-offs alike. Empty for clauses with no
     *  hand-off semantics. */
    handoffStages: readonly string[];
}

/**
 * Block-binding metadata — the parsed UI half of a clause spec, sectioned by
 * phase. Every section is present on the parsed binding (absent attributes
 * degrade to their empty values); `design.article` is the one required
 * declaration.
 */
export interface ClauseBlockBinding {
    design: ClauseBlockDesign;
    checkout: ClauseBlockCheckout;
    runtime: ClauseBlockRuntime;
}

function isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseFieldNameList(
    raw: unknown,
    path: string,
    errors: SpecParseError[],
): readonly string[] | null {
    if (raw === undefined) return [];
    if (!Array.isArray(raw) || raw.some((f) => typeof f !== "string" || f.length === 0)) {
        errors.push({ path, message: "must be an array of non-empty field names when present" });
        return null;
    }
    return raw as string[];
}

/**
 * Parse and validate the `block` slice of a clause spec. Returns null (and
 * pushes `SpecParseError`s) on any malformed field, mirroring the SDK spec
 * parser's error shape so callers fold block errors into one parse report.
 * Absent attributes (and absent `checkout`/`runtime` sections) degrade to
 * their empty values; only `design.article` is required.
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

    // ── design ──────────────────────────────────────────────────────────
    if (!isObject(raw.design)) {
        errors.push({ path: `${path}.design`, message: "design section is required and must be an object" });
        return null;
    }
    const rawDesign = raw.design;
    if (typeof rawDesign.article !== "string" || rawDesign.article.length === 0) {
        errors.push({ path: `${path}.design.article`, message: "article is required and must be a non-empty string (the drawer grouping heading)" });
        return null;
    }
    let nestsUnder: string | null = null;
    if (rawDesign.nestsUnder !== undefined && rawDesign.nestsUnder !== null) {
        if (typeof rawDesign.nestsUnder !== "string" || rawDesign.nestsUnder.length === 0) {
            errors.push({ path: `${path}.design.nestsUnder`, message: "nestsUnder must be a non-empty string or null when present" });
            return null;
        }
        nestsUnder = rawDesign.nestsUnder;
    }
    const designFills = parseFieldNameList(rawDesign.fills, `${path}.design.fills`, errors);
    if (designFills === null) return null;
    let composes: ClauseBlockDesign["composes"] = null;
    if (rawDesign.composes !== undefined && rawDesign.composes !== null) {
        if (!isObject(rawDesign.composes)) {
            errors.push({ path: `${path}.design.composes`, message: "composes must be an object or null when present" });
            return null;
        }
        if (typeof rawDesign.composes.interface !== "string" || rawDesign.composes.interface.length === 0) {
            errors.push({ path: `${path}.design.composes.interface`, message: "composes.interface is required and must be a non-empty string" });
            return null;
        }
        const rawForumUrl = rawDesign.composes.forumUrl;
        if (rawForumUrl !== undefined && (typeof rawForumUrl !== "string" || rawForumUrl.length === 0)) {
            errors.push({ path: `${path}.design.composes.forumUrl`, message: "composes.forumUrl must be a non-empty string when present" });
            return null;
        }
        if (typeof rawForumUrl === "string") {
            // forumUrl is rendered as a link — gate the scheme to https only.
            // `javascript:`/`data:`/plain `http:` are an XSS/downgrade vector;
            // parse with `new URL` (never a string-prefix check) so a scheme
            // hidden behind whitespace/case tricks or a protocol-relative `//`
            // URL (which `new URL` rejects without a base) is caught too.
            let scheme: string | null = null;
            try {
                scheme = new URL(rawForumUrl).protocol;
            } catch {
                scheme = null;
            }
            if (scheme !== "https:") {
                errors.push({ path: `${path}.design.composes.forumUrl`, message: "composes.forumUrl must be an https: URL" });
                return null;
            }
        }
        composes = {
            interface: rawDesign.composes.interface,
            ...(rawForumUrl !== undefined && { forumUrl: rawForumUrl as string }),
        };
    }

    // ── checkout ────────────────────────────────────────────────────────
    let catalogueFills: readonly string[] = [];
    let profileFills: readonly string[] = [];
    if (raw.checkout !== undefined) {
        if (!isObject(raw.checkout)) {
            errors.push({ path: `${path}.checkout`, message: "checkout section must be an object when present" });
            return null;
        }
        const parsedCatalogue = parseFieldNameList(raw.checkout.catalogueFills, `${path}.checkout.catalogueFills`, errors);
        if (parsedCatalogue === null) return null;
        catalogueFills = parsedCatalogue;
        const parsedProfile = parseFieldNameList(raw.checkout.profileFills, `${path}.checkout.profileFills`, errors);
        if (parsedProfile === null) return null;
        profileFills = parsedProfile;
    }

    // ── runtime ─────────────────────────────────────────────────────────
    let interaction: ClauseBlockRuntime["interaction"] = null;
    let runtimeFields: readonly FieldSpec[] = [];
    let handoffStages: readonly string[] = [];
    if (raw.runtime !== undefined) {
        if (!isObject(raw.runtime)) {
            errors.push({ path: `${path}.runtime`, message: "runtime section must be an object when present" });
            return null;
        }
        if (raw.runtime.interaction !== undefined && raw.runtime.interaction !== null) {
            if (!isObject(raw.runtime.interaction)) {
                errors.push({ path: `${path}.runtime.interaction`, message: "interaction must be an object or null when present" });
                return null;
            }
            if (typeof raw.runtime.interaction.interface !== "string" || raw.runtime.interaction.interface.length === 0) {
                errors.push({ path: `${path}.runtime.interaction.interface`, message: "interaction.interface is required and must be a non-empty string" });
                return null;
            }
            interaction = { interface: raw.runtime.interaction.interface };
        }
        if (raw.runtime.fields !== undefined) {
            if (!Array.isArray(raw.runtime.fields)) {
                errors.push({ path: `${path}.runtime.fields`, message: "runtime.fields must be an array of field specs when present" });
                return null;
            }
            // Reuse the SDK's field-spec parser — runtime input fields are the
            // SAME shape as a clause's content fields, so one parser drives both.
            const parsed: FieldSpec[] = [];
            for (let i = 0; i < raw.runtime.fields.length; i++) {
                const f = parseFieldSpec(raw.runtime.fields[i], `${path}.runtime.fields[${i}]`, errors);
                if (f === null) return null;
                parsed.push(f);
            }
            runtimeFields = parsed;
        }
        const parsedHandoff = parseFieldNameList(raw.runtime.handoffStages, `${path}.runtime.handoffStages`, errors);
        if (parsedHandoff === null) return null;
        handoffStages = parsedHandoff;
    }

    return {
        design: { article: rawDesign.article as ClauseArticle, nestsUnder, fills: designFills, composes },
        checkout: { catalogueFills, profileFills },
        runtime: { interaction, fields: runtimeFields, handoffStages },
    };
}
