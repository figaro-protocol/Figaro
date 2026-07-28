/**
 * projection.ts — from composed clauses to the canonical Agreement, and from
 * a design's orders to the assembly template. The deterministic projection
 * rules BOTH parties (and any second frontend) must reproduce byte-exactly,
 * because their outputs are hashed: `agreementHash` (the merkle root the
 * commitment signs) and `compositionHash` (assembly identity).
 *
 * The SDK holds NO clause-spec cache. Every function takes a `SpecSource` —
 * the consumer's window onto the live ClauseRegistry→IPFS spec set. A spec
 * that is not (yet) loaded returns `undefined` from `get`, and the
 * projection degrades exactly as the registry-reading frontend does: no
 * defaults injected, validation skipped for that section, field lookups
 * fall back to data-key presence. Consumers that need strictness gate on
 * their cache being warm before projecting.
 *
 * Four `block` hints are HASH-LOAD-BEARING and therefore projection
 * vocabulary, not presentation: `design.article: "mandatory"` (which clauses
 * auto-fold into every template agreement → compositionHash),
 * `design.article: "attestations"` (process-log clauses stay empty anchors at
 * commit → agreementHash), `design.fills` (the fields whose values the
 * DESIGNER composes into the template — the tailoring; every other clause's
 * template values are `{}` and the fields fill at checkout →
 * compositionHash), and the `checkout` fills (`catalogueFills` /
 * `profileFills` — which sections the catalogue and seller-profile folds
 * write → agreementHash). `parseProjectionHints` extracts exactly those from
 * a raw spec document; everything else in `block` remains presentation the
 * SDK never reads.
 */

import {
    canonicalize,
    computeAgreementHash,
    type Agreement,
    type AgreementSection,
} from "./agreement.js";
import { templateCompositionHash, type AssemblyTemplate } from "./assembly.js";
import { validateContent, type ClauseSpec } from "./clauses/index.js";

// ── The spec seam ───────────────────────────────────────────────────────────

/** The hash-load-bearing slice of a clause spec's `block` — the few
 *  phase-section attributes whose values decide what ends up committed
 *  (template values, checkout folds), lifted out of the sectioned block. */
export interface ProjectionHints {
    /** The spec's `block.design.article` (e.g. `"mandatory"`, `"attestations"`). */
    article?: string;
    /** The spec's `block.design.fills` — the content fields (by name) the
     *  DESIGNER authors into the template (the tailoring: a pinned consent
     *  document, a pinned settlement token); their values survive into the
     *  published template. Absent/empty = the designer only selects the
     *  clause. */
    designFills?: readonly string[];
    /** The spec's `block.checkout.catalogueFills` — the content fields (by
     *  name) authored per-item on the seller's CATALOGUE and folded onto the
     *  matching leaf at checkout. */
    catalogueFills?: readonly string[];
    /** The spec's `block.checkout.profileFills` — the content fields (by
     *  name) authored once on the seller's PROFILE (seller master data: a
     *  divisor, a declared credential id), folded onto the matching leaf at
     *  checkout. The profile sibling of `catalogueFills` (item master data). */
    profileFills?: readonly string[];
}

/** A clause spec as the projection sees it: the Layer-A spec plus the
 *  hash-load-bearing hints. */
export type ProjectionSpecView = ClauseSpec & { hints?: ProjectionHints };

/**
 * The consumer's window onto its loaded clause specs (ClauseRegistry → IPFS).
 * `get` with no version returns the highest loaded version; `list` returns
 * every loaded spec (one entry per clauseId+version).
 */
export interface SpecSource {
    get(clauseId: string, version?: number): ProjectionSpecView | undefined;
    list(): readonly ProjectionSpecView[];
}

/** Extract the hash-load-bearing hints from a raw spec document's `block`
 *  slice (`JSON.parse`d clause JSON, sectioned by phase: design / checkout /
 *  runtime). Everything else in `block` is presentation and deliberately not
 *  surfaced here. */
export function parseProjectionHints(rawSpec: unknown): ProjectionHints {
    const block = (rawSpec as { block?: Record<string, unknown> } | null)?.block;
    if (!block || typeof block !== "object") return {};
    const hints: ProjectionHints = {};
    const design = block.design;
    if (design && typeof design === "object" && !Array.isArray(design)) {
        const d = design as Record<string, unknown>;
        if (typeof d.article === "string") hints.article = d.article;
        const fills = parseFillList(d.fills);
        if (fills) hints.designFills = fills;
    }
    const checkout = block.checkout;
    if (checkout && typeof checkout === "object" && !Array.isArray(checkout)) {
        const c = checkout as Record<string, unknown>;
        const catalogue = parseFillList(c.catalogueFills);
        if (catalogue) hints.catalogueFills = catalogue;
        const profile = parseFillList(c.profileFills);
        if (profile) hints.profileFills = profile;
    }
    return hints;
}

/** A non-empty array of non-empty field names, or undefined. */
function parseFillList(raw: unknown): readonly string[] | undefined {
    if (Array.isArray(raw) && raw.length > 0 && raw.every((f) => typeof f === "string" && f.length > 0)) {
        return raw as string[];
    }
    return undefined;
}

/** Whether a spec declares a top-level field named `fieldName`. Field names —
 *  not clause ids — are the binding vocabulary generic surfaces look things
 *  up by: ANY registered clause carrying the field participates. */
export function specDeclaresField(spec: ProjectionSpecView, fieldName: string): boolean {
    return spec.fields.some((f) => f.name === fieldName);
}

/** True for the MANDATORY clauses (`block.design.article: "mandatory"` —
 *  commerce, topology) that auto-fold into every template agreement; they are
 *  not designer choices. (Article renamed from "structural" 2026-07-14 — that
 *  word collided with the design/DAG sense and maddened everyone.) */
export function specIsMandatory(spec: ProjectionSpecView): boolean {
    return spec.hints?.article === "mandatory";
}

/** The DESIGNER-authored field names of a clause (`block.design.fills`) —
 *  the tailoring that adapts a generic clause to a specific application
 *  (a pinned consent document, a pinned settlement token). The template
 *  keeps the designer's values for a clause declaring fills; every other
 *  clause's fields are transaction particulars, filled at checkout — the
 *  template carries `{}` for it. Empty for clauses the designer only
 *  selects. */
export function specDesignFills(spec: ProjectionSpecView): readonly string[] {
    return spec.hints?.designFills ?? [];
}

/** True for process-log clauses (`block.design.article: "attestations"`) —
 *  empty anchors at commit whose content is attested later. */
export function specIsProcessLog(spec: ProjectionSpecView): boolean {
    return spec.hints?.article === "attestations";
}

/** The CATALOGUE-authored field names of a clause
 *  (`block.checkout.catalogueFills`) — content authored per-item on the
 *  seller's catalogue and folded onto the matching leaf at checkout. Empty
 *  for clauses with no catalogue-authored fields. */
export function specCatalogueFills(spec: ProjectionSpecView): readonly string[] {
    return spec.hints?.catalogueFills ?? [];
}

/** The PROFILE-authored field names of a clause
 *  (`block.checkout.profileFills`) — seller master data, authored once on the
 *  seller's profile (the sibling of the catalogue's per-item data) and folded
 *  onto the matching leaf at checkout. Editors render exactly these fields;
 *  the fold folds only these values. Empty for clauses with no
 *  profile-authored fields. */
export function specProfileFills(spec: ProjectionSpecView): readonly string[] {
    return spec.hints?.profileFills ?? [];
}

// ── Agreement projection ────────────────────────────────────────────────────

export interface OrderAgreement {
    agreement: Agreement;
    agreementHash: `0x${string}`;
}

/** Fill fields the composing input omitted with the clause spec's OWN declared
 *  defaults (registry-sourced, never code-sourced). A process-log clause is an
 *  empty anchor at commit and stays untouched. */
function withSpecDefaults(
    specs: SpecSource,
    clause: string,
    data: Record<string, unknown>,
    version?: number,
): Record<string, unknown> {
    const spec = specs.get(clause, version);
    if (!spec || specIsProcessLog(spec)) return data;
    let out = data;
    for (const field of spec.fields ?? []) {
        if (field.default !== undefined && out[field.name] === undefined) {
            if (out === data) out = { ...data };
            out[field.name] = field.default;
        }
    }
    return out;
}

/**
 * Build the order's agreement and merkle tree from its complete clause map.
 * `clauses` is `{ [clauseId]: fieldValues }` — the pinned assembly's clauses,
 * valued for this order. Sections are sorted by clause key so the pinned JSON
 * is deterministic; the merkle root sorts its own leaves, so order never
 * affects the hash.
 *
 * It names no clause, special-cases nothing, and re-implements no hashing.
 * The ONE spec-driven step: each clause spec's own declared field defaults
 * fill fields the composing input omitted — the SPEC speaks, the code
 * injects nothing of its own.
 *
 * `clauseVersions`: clauseId → the registered version composed
 * (template-sourced). Absent entries fall back to the loaded spec's version —
 * the non-template compose paths, where whatever the registry surfaced is
 * what was picked.
 */
export function buildOrderAgreement(
    buyer: `0x${string}`,
    seller: `0x${string}`,
    clauses: Readonly<Record<string, Record<string, unknown>>>,
    specs: SpecSource,
    clauseVersions?: Readonly<Record<string, number>>,
): OrderAgreement {
    const sections: AgreementSection[] = Object.keys(clauses)
        .map((clause) => {
            const version = clauseVersions?.[clause] ?? specs.get(clause)?.version ?? 1;
            return {
                clause,
                version,
                data: withSpecDefaults(specs, clause, clauses[clause] ?? {}, version),
            };
        })
        .sort((a, b) => (a.clause < b.clause ? -1 : a.clause > b.clause ? 1 : 0));

    const agreement: Agreement = { version: "a1", buyer, seller, sections };
    return { agreement, agreementHash: computeAgreementHash(agreement) };
}

/** A single Layer-A issue found before signing: which clause, which field path
 *  (or "(merkle)"), and what's wrong. */
export interface CommitmentAgreementIssue {
    clause: string;
    path: string;
    message: string;
}

/**
 * Layer A of the verification stack, run on BOTH sides of the bilateral commit
 * (buyer before initiating, seller before counter-signing) so neither party
 * signs an invalid agreement. Two checks: every present section conforms to its
 * clause spec (validateContent; process-log clauses are presence-markers,
 * skipped), and the `agreementHash` about to be signed equals the merkle root
 * recomputed from the sections. Catches a malformed agreement before a chain
 * round-trip.
 */
export function validateCommitmentAgreement(
    agreement: Agreement,
    expectedHash: `0x${string}`,
    specs: SpecSource,
): { ok: boolean; issues: CommitmentAgreementIssue[] } {
    const issues: CommitmentAgreementIssue[] = [];

    for (const section of agreement.sections) {
        const spec = specs.get(section.clause);
        if (!spec) continue;
        // A runtime-lifecycle clause is an empty anchor at commit — its content
        // is attested later, so there is nothing to validate here.
        if (specIsProcessLog(spec)) continue;
        const result = validateContent(section.data, spec);
        if (!result.ok) {
            for (const e of result.errors) {
                issues.push({ clause: section.clause, path: e.path, message: e.message });
            }
        }
    }

    if (issues.length === 0) {
        let computed: `0x${string}` | null = null;
        try {
            computed = computeAgreementHash(agreement);
        } catch (cause) {
            issues.push({
                clause: "(merkle)",
                path: "agreementHash",
                message: `agreement content failed to encode: ${cause instanceof Error ? cause.message : String(cause)}`,
            });
        }
        if (computed && computed.toLowerCase() !== expectedHash.toLowerCase()) {
            issues.push({
                clause: "(merkle)",
                path: "agreementHash",
                message: `signed hash ${expectedHash} does not match the agreement's computed root ${computed}`,
            });
        }
    }

    return { ok: issues.length === 0, issues };
}

/**
 * The ONE Layer-A thrower every signature routes through — buyer sign, seller
 * counter-sign, and the checkout's early pre-wallet check all call this, so no
 * path signs an agreement whose sections violate their clause specs or whose
 * hash doesn't match its recomputed merkle root.
 */
export function assertAgreementSignable(
    agreement: Agreement,
    expectedHash: `0x${string}`,
    specs: SpecSource,
    label = "This order",
): void {
    const check = validateCommitmentAgreement(agreement, expectedHash, specs);
    if (!check.ok) {
        throw new Error(
            `${label} isn't valid to sign yet: ${check.issues
                .map((i) => `${i.clause} ${i.path}: ${i.message}`)
                .join("; ")}`,
        );
    }
}

// ── Reading sections BY FIELD NAME, never by clause id ─────────────────────

/** Every section whose registered spec declares a top-level field named
 *  `fieldName`. Falls back to data-key presence only when the spec isn't
 *  loaded (a clause registered but not yet hydrated) — still keyed on the
 *  field, never on the clause id. */
export function sectionsByField(
    agreement: Agreement,
    fieldName: string,
    specs: SpecSource,
): AgreementSection[] {
    return agreement.sections.filter((s) => {
        const spec = specs.get(s.clause);
        return spec
            ? specDeclaresField(spec, fieldName)
            : Object.prototype.hasOwnProperty.call(s.data ?? {}, fieldName);
    });
}

/** The first section declaring `fieldName`, or undefined. */
export function sectionByField(
    agreement: Agreement,
    fieldName: string,
    specs: SpecSource,
): AgreementSection | undefined {
    return sectionsByField(agreement, fieldName, specs)[0];
}

// ── Template building (design-time projection) ─────────────────────────────

/** The DAG slice of a design-time order the template build reads:
 *  its (synthetic) hash and its parent edges. */
export interface TemplateOrderNode {
    orderHash: string;
    parentOrderHashes?: readonly string[];
}

/** Fold the MANDATORY clauses into a template agreement's clause set. Each
 *  mandatory clause (`block.design.article: "mandatory"`) draws the fields it
 *  declares from the design-time value bag — topology gets
 *  `{ parentOrderHashes }` (mode is DERIVED from the edges, never stored);
 *  commerce's currency/payment/lineItems are NOT design-time (the buyer fills
 *  them at checkout), so commerce folds in empty. Generic: a never-seen
 *  mandatory clause composes the subset of the bag it declares, with zero
 *  per-clause code. */
function composeMandatoryClauses(
    mandatorySpecs: readonly ProjectionSpecView[],
    parents: string[],
): Record<string, Record<string, unknown>> {
    // The design-time value bag. Checkout-time values (commerce's
    // currency/payment/lineItems) are deliberately absent — filled downstream.
    const bag: Record<string, unknown> = {
        parentOrderHashes: parents,
    };
    const out: Record<string, Record<string, unknown>> = {};
    for (const spec of mandatorySpecs) {
        const data: Record<string, unknown> = {};
        for (const field of spec.fields ?? []) {
            if (field.name in bag) data[field.name] = bag[field.name];
        }
        out[spec.clauseId] = data;
    }
    return out;
}

/** Build the no-hash assembly template from the design's orders + the per-order
 *  clause selection: one template AGREEMENT per canvas order. The MANDATORY
 *  clauses (commerce + topology) fold in automatically on every
 *  agreement — they are not designer choices. */
export function buildAssemblyTemplate(args: {
    name?: string;
    summary?: string;
    description?: string;
    orders: readonly TemplateOrderNode[];
    clausesByOrderId: Readonly<Record<string, Readonly<Record<string, Record<string, unknown>>>>>;
    /** orderId → clauseId → the registered version the designer composed.
     *  Optional; absent entries mean version 1. */
    clauseVersionsByOrderId?: Readonly<Record<string, Readonly<Record<string, number>>>>;
    specs: SpecSource;
}): AssemblyTemplate {
    const { name, summary, description, orders, clausesByOrderId, clauseVersionsByOrderId, specs } =
        args;
    // Dedupe by clauseId (list() is per-version): the fold wants each
    // mandatory clause once, at its highest loaded version.
    const mandatory = new Map<string, ProjectionSpecView>();
    for (const spec of specs.list()) {
        if (!specIsMandatory(spec)) continue;
        const seen = mandatory.get(spec.clauseId);
        if (!seen || spec.version > seen.version) mandatory.set(spec.clauseId, spec);
    }
    if (mandatory.size === 0) {
        // Without the chain→IPFS spec set the mandatory clauses cannot be
        // resolved — refuse loudly rather than emit a template missing them.
        // Consumers gate on their spec cache being warm before building.
        throw new Error(
            "clause specs not loaded: no mandatory clauses in the SpecSource — warm the spec cache before building templates",
        );
    }
    const mandatorySpecs = Array.from(mandatory.values());
    // Re-label each design-time (synthetic) order id to a clean local label
    // naming the future kernel-order slot. The template carries no chain ids
    // and no party addresses — only the clauses (the mandatory ones among
    // them), keyed by these local labels.
    const idToLocal = new Map(orders.map((o, i) => [o.orderHash, `order-${i}`]));
    return {
        ...(name ? { name } : {}),
        ...(summary ? { summary } : {}),
        ...(description ? { description } : {}),
        agreements: orders.map((order, i) => {
            // Design time is STRUCTURAL (ruled 2026-07-14): the template keeps
            // the designer's clause SELECTION, but a clause's field values are
            // transaction particulars — filled at checkout, never composed.
            // Only clauses declaring designer fills (block.design.fills — the
            // designer's tailoring, consent's affixed documents) keep their
            // composed values; everything else strips to `{}` here, so
            // templates are value-free by construction, not by convention.
            const selection: Record<string, Record<string, unknown>> = {};
            for (const [clauseId, values] of Object.entries(clausesByOrderId[order.orderHash] ?? {})) {
                const spec = specs.get(clauseId, clauseVersionsByOrderId?.[order.orderHash]?.[clauseId]);
                selection[clauseId] = spec && specDesignFills(spec).length > 0 ? values : {};
            }
            const clauses = {
                ...selection,
                ...composeMandatoryClauses(
                    mandatorySpecs,
                    (order.parentOrderHashes ?? []).map((p) => idToLocal.get(p) ?? p),
                ),
            };
            // Record each composed clause's registered version — the designer's
            // pick for selected clauses, the loaded spec's version for the
            // auto-folded mandatory ones. NORMALIZED SPARSE: v1 entries are
            // dropped and an empty map is omitted, so templates composed
            // entirely from v1 clauses hash identically to the pre-version form.
            const versions: Record<string, number> = {};
            for (const clauseId of Object.keys(clauses)) {
                const v =
                    clauseVersionsByOrderId?.[order.orderHash]?.[clauseId] ??
                    specs.get(clauseId)?.version ??
                    1;
                if (v !== 1) versions[clauseId] = v;
            }
            return {
                id: `order-${i}`,
                clauses,
                ...(Object.keys(versions).length > 0 ? { clauseVersions: versions } : {}),
            };
        }),
    };
}

export function serializeAssemblyTemplate(template: AssemblyTemplate): {
    json: string;
    compositionHash: `0x${string}`;
} {
    // The pinned document carries everything — INCLUDING the editorial
    // name/summary/description. But the composition hash (→ slug + on-chain
    // anchor) derives from the COMPOSITION ONLY, so editorial edits never
    // fork identity: identical compositions collapse to one binding regardless
    // of their prose.
    const json = canonicalize(template);
    const compositionHash = templateCompositionHash(template);
    return { json, compositionHash };
}
