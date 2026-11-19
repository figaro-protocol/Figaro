/**
 * Clause block-binding — the `block` slice of a clause spec: the UI half of
 * the clause document, on the frontend side of the UI/protocol seam.
 *
 * A clause spec has two halves. The TOP LEVEL is the protocol half — identity,
 * registration, and the content `fields`/`stages` that become clauses of
 * signed agreements (merkle leaves under the on-chain `checkoutHash`).
 * `block` is the UI half: instructions to frontends, organized into PHASE
 * SECTIONS, each named for the phase whose actor it instructs —
 *
 *   - `design`   — the designer, composing clauses into agreements and assemblies,
 *   - `checkout` — the seller binding and the buyer filling and signing,
 *   - `runtime`  — the parties while the process runs, after commit.
 *
 * Nothing on-chain reads any of it; any frontend could present the same
 * clause differently. A later phase may read an earlier section; no phase
 * reads a section named for a later one. An attribute read in two phases is
 * declared in the section of its FIRST reader (`design.composes` is declared
 * at design, dispatched at checkout and runtime). The one verb `fills` recurs across sections and
 * always means the same thing: the content fields (by name) whose values that
 * phase's actor fills — the BUYER owns every content field named in no
 * fills list, filled at checkout (the default case; always derived as the
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

import { parseFieldSpec, type SpecParseError, type FieldSpec } from "@figaro-protocol/sdk/clauses";
import {
    parseCheckoutDerivations,
    parsePricedLinesMark,
    type CatalogueMeasure,
    type CheckoutDerivation,
    type PricedLinesMark,
} from "@figaro-protocol/sdk";

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
    /** What the clause binds. `"agreement"` (the default) = a term of ONE
     *  relationship, composed per-order in the drawer. `"assembly"` = a term
     *  of the COMPOSITION itself (a denomination pin, a dispute forum):
     *  composed once at the assembly level, carried once in the assembly
     *  (part of the processDesignHash), folded into EVERY agreement at checkout
     *  so every party signs it. Wrong-level composition is a build/publish
     *  error, never a silent no-op. */
    scope: "agreement" | "assembly";
    /** The FIELD name (on another, parent clause) this clause nests under in
     *  the designer drawer — a containment relationship read from the spec,
     *  never a hardcoded tree (e.g. a proximity-policy clause nests under a
     *  hand-off clause's `handoff` field). Null for top-level clauses. */
    nestsUnder: string | null;
    /** The content fields (by name) the DESIGNER fills into the assembly
     *  assembly — the tailoring that adapts a generic clause to a specific
     *  application (a pinned consent document, a pinned denomination).
     *  The drawer exposes field editors exactly for these; their values
     *  survive into the published assembly (identity-bearing — part of the
     *  processDesignHash). Empty when the designer only selects the clause. */
    fills: readonly string[];
    /** Composition binding — the on-network contract or external forum this
     *  clause composes with (external, on-chain composition). `interface` names a STANDARD
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
    /** The content fields (by name) filled per-item on the seller's
     *  CATALOG (item master data: freight class, hazmat class, cold-chain
     *  window) and folded onto the matching leaf at checkout. Generic
     *  surfaces render a spec-driven authoring section on the catalog item
     *  for ANY clause declaring a non-empty list — including one this
     *  codebase has never seen. */
    catalogueFills: readonly string[];
    /** The content fields (by name) filled ONCE on the member's PROFILE
     *  (seller master data: a dim-weight divisor, a declared credential id)
     *  and folded onto the matching leaf at checkout. The seller-level
     *  sibling of `catalogueFills` — two distinct layers: catalog = what is
     *  sold, profile = who sells. ANY registered clause opts in by declaring
     *  a non-empty list. */
    profileFills: readonly string[];
    /** The content fields (by name, the map's keys) read from each order
     *  line's CATALOG ITEM — the item's own attributes (its mass, its
     *  dimensions), not per-clause values — and combined at checkout as each
     *  entry declares (`CatalogueMeasure`: summed over the lines, or taken
     *  from a one-unit order). Seller-sourced like `catalogueFills`, so never
     *  the buyer's. */
    catalogueMeasures: Readonly<Record<string, CatalogueMeasure>>;
    /** The field that carries the order's PRICED LINES, and which field of
     *  each line plays each role (`PricedLinesMark`: quantity and unit price,
     *  and optionally the catalog item's id and name). The checkout writes the
     *  lines there, a quote request prices each line's unit price, and a
     *  review reads them through this mark, never through a field name. Null
     *  for a clause that carries no priced lines. */
    pricedLines: PricedLinesMark | null;
    /** The content fields (by name, the map's keys) the checkout COMPUTES,
     *  each by a rule of the open derivation registry over its declared
     *  inputs (`CheckoutDerivation`). Never the buyer's. */
    derives: Readonly<Record<string, CheckoutDerivation>>;
    /** The enum content fields (by name, the map's keys) whose values a
     *  checkout offers only when the chain in use holds what each value
     *  names (`HeldValuesHint`): read at checkout by the reader the hint
     *  names, from the contracts it gives for that chain. A presentation
     *  hint like every attribute here: what the parties sign is unchanged,
     *  and a frontend that knows no reader for the standard offers none of
     *  the values. */
    heldValues: Readonly<Record<string, HeldValuesHint>>;
    /** The composition's input field specs: values the buyer supplies at
     *  checkout for the contract `design.composes` names (its opening
     *  parameters). They are not the clause's content `fields`, so they are
     *  not committed into the agreement at signing. ONE generic form renders
     *  them; the surface reads no interface name. Same `FieldSpec` shape as
     *  content fields: one parser, one renderer. Empty for a clause that
     *  composes with nothing or takes no input. */
    compositionFields: readonly FieldSpec[];
}

/** One `checkout.heldValues` entry. `reader` names a STANDARD (an open
 *  registry of readers, `frontend/lib/composition/heldValues.ts`), never a
 *  clause. `contracts` gives, for each chain by its decimal id, the
 *  contracts that reader reads, by the reader's own role names; the
 *  addresses are fixed in the spec's registered bytes, so a chain added
 *  later needs a new spec version. `values` names, for each enum value, what
 *  the reader looks for on the chain, in the reader's own terms. */
export interface HeldValuesHint {
    reader: string;
    contracts: Readonly<Record<string, Readonly<Record<string, `0x${string}`>>>>;
    values: Readonly<Record<string, readonly string[]>>;
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

/** A `checkout.catalogueMeasures` map: absent is `{}`; present, every entry
 *  names its catalog-item field (`from`) and a known combinator, or the map
 *  is malformed — the rule of `clause-spec.schema.json`. */
function parseCatalogueMeasures(
    raw: unknown,
    path: string,
    errors: SpecParseError[],
): Readonly<Record<string, CatalogueMeasure>> | null {
    if (raw === undefined) return {};
    if (!isObject(raw)) {
        errors.push({ path, message: "must be an object mapping content field names to { from, combine } when present" });
        return null;
    }
    const out: Record<string, CatalogueMeasure> = {};
    for (const [field, entry] of Object.entries(raw)) {
        const where = `${path}.${field}`;
        if (!isObject(entry) || typeof entry.from !== "string" || entry.from.length === 0) {
            errors.push({ path: where, message: "must name the catalog-item field it is read from (a non-empty from)" });
            return null;
        }
        if (entry.combine !== "sum" && entry.combine !== "single-unit") {
            errors.push({ path: `${where}.combine`, message: 'combine must be "sum" or "single-unit"' });
            return null;
        }
        out[field] = { from: entry.from, combine: entry.combine };
    }
    return out;
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const CHAIN_ID = /^[1-9][0-9]*$/;

/** A `checkout.heldValues` map: absent is `{}`; present, every entry names
 *  its reader, its contracts per decimal chain id (each an address by role
 *  name) and, per enum value, a non-empty list of non-empty strings — the
 *  rule of `clause-spec.schema.json`. */
function parseHeldValues(
    raw: unknown,
    path: string,
    errors: SpecParseError[],
): Readonly<Record<string, HeldValuesHint>> | null {
    if (raw === undefined) return {};
    if (!isObject(raw)) {
        errors.push({ path, message: "must be an object mapping enum content field names to { reader, contracts, values } when present" });
        return null;
    }
    const out: Record<string, HeldValuesHint> = {};
    for (const [field, entry] of Object.entries(raw)) {
        const where = `${path}.${field}`;
        if (!isObject(entry) || typeof entry.reader !== "string" || entry.reader.length === 0) {
            errors.push({ path: `${where}.reader`, message: "must name its reader standard (a non-empty reader)" });
            return null;
        }
        const contracts: Record<string, Record<string, `0x${string}`>> = {};
        if (!isObject(entry.contracts)) {
            errors.push({ path: `${where}.contracts`, message: "must map decimal chain ids to { role: address }" });
            return null;
        }
        for (const [chainId, roles] of Object.entries(entry.contracts)) {
            if (!CHAIN_ID.test(chainId) || !isObject(roles)
                || Object.values(roles).some((a) => typeof a !== "string" || !ADDRESS.test(a))) {
                errors.push({ path: `${where}.contracts.${chainId}`, message: "must be a decimal chain id mapping role names to 0x-prefixed 20-byte addresses" });
                return null;
            }
            contracts[chainId] = roles as Record<string, `0x${string}`>;
        }
        const values: Record<string, readonly string[]> = {};
        if (!isObject(entry.values)) {
            errors.push({ path: `${where}.values`, message: "must map each enum value to a non-empty list of non-empty strings" });
            return null;
        }
        for (const [value, names] of Object.entries(entry.values)) {
            if (!Array.isArray(names) || names.length === 0
                || names.some((n) => typeof n !== "string" || n.length === 0)) {
                errors.push({ path: `${where}.values.${value}`, message: "must be a non-empty list of non-empty strings" });
                return null;
            }
            values[value] = names as string[];
        }
        out[field] = { reader: entry.reader, contracts, values };
    }
    return out;
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
    let scope: "agreement" | "assembly" = "agreement";
    if (rawDesign.scope !== undefined) {
        if (rawDesign.scope !== "agreement" && rawDesign.scope !== "assembly") {
            errors.push({ path: `${path}.design.scope`, message: 'scope must be "agreement" or "assembly" when present' });
            return null;
        }
        scope = rawDesign.scope;
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
    let catalogueMeasures: Readonly<Record<string, CatalogueMeasure>> = {};
    let pricedLines: PricedLinesMark | null = null;
    let derives: Readonly<Record<string, CheckoutDerivation>> = {};
    let heldValues: Readonly<Record<string, HeldValuesHint>> = {};
    let compositionFields: readonly FieldSpec[] = [];
    if (raw.checkout !== undefined) {
        if (!isObject(raw.checkout)) {
            errors.push({ path: `${path}.checkout`, message: "checkout section must be an object when present" });
            return null;
        }
        const parsedCatalog = parseFieldNameList(raw.checkout.catalogueFills, `${path}.checkout.catalogueFills`, errors);
        if (parsedCatalog === null) return null;
        catalogueFills = parsedCatalog;
        const parsedProfile = parseFieldNameList(raw.checkout.profileFills, `${path}.checkout.profileFills`, errors);
        if (parsedProfile === null) return null;
        profileFills = parsedProfile;
        const parsedMeasures = parseCatalogueMeasures(raw.checkout.catalogueMeasures, `${path}.checkout.catalogueMeasures`, errors);
        if (parsedMeasures === null) return null;
        catalogueMeasures = parsedMeasures;
        // The SDK's parsers are the one reading of these two attributes;
        // here a present value they cannot read is malformed.
        if (raw.checkout.pricedLines !== undefined && raw.checkout.pricedLines !== null) {
            pricedLines = parsePricedLinesMark(raw.checkout.pricedLines) ?? null;
            if (pricedLines === null) {
                errors.push({ path: `${path}.checkout.pricedLines`, message: "pricedLines must name its field, quantity and unitPrice (and item and name, when present) as non-empty strings" });
                return null;
            }
        }
        if (raw.checkout.derives !== undefined) {
            const entries = isObject(raw.checkout.derives) ? Object.keys(raw.checkout.derives).length : -1;
            const parsedDerives = parseCheckoutDerivations(raw.checkout.derives) ?? {};
            if (entries < 0 || Object.keys(parsedDerives).length !== entries) {
                errors.push({ path: `${path}.checkout.derives`, message: "derives must map each content field to { rule, inputs }, every input { field } or { from, combine }" });
                return null;
            }
            derives = parsedDerives;
        }
        const parsedHeld = parseHeldValues(raw.checkout.heldValues, `${path}.checkout.heldValues`, errors);
        if (parsedHeld === null) return null;
        heldValues = parsedHeld;
        if (raw.checkout.compositionFields !== undefined) {
            if (!Array.isArray(raw.checkout.compositionFields)) {
                errors.push({ path: `${path}.checkout.compositionFields`, message: "compositionFields must be an array of field specs when present" });
                return null;
            }
            // Reuse the SDK's field-spec parser: composition input fields are
            // the SAME shape as a clause's content fields, so one parser drives both.
            const parsed: FieldSpec[] = [];
            for (let i = 0; i < raw.checkout.compositionFields.length; i++) {
                const f = parseFieldSpec(raw.checkout.compositionFields[i], `${path}.checkout.compositionFields[${i}]`, errors);
                if (f === null) return null;
                parsed.push(f);
            }
            compositionFields = parsed;
        }
    }

    // ── runtime ─────────────────────────────────────────────────────────
    let interaction: ClauseBlockRuntime["interaction"] = null;
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
    }

    return {
        design: { article: rawDesign.article as ClauseArticle, scope, nestsUnder, fills: designFills, composes },
        checkout: { catalogueFills, profileFills, catalogueMeasures, pricedLines, derives, heldValues, compositionFields },
        runtime: { interaction },
    };
}
