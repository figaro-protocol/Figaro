/**
 * Clause-spec source — the in-memory cache of clause specs, fed ONLY from
 * chain → IPFS.
 *
 * The on-chain `ClauseRegistry.ClauseRegistered` event carries the readable
 * `clauseId` and a `metadataURI` (IPFS) locator. `loadClauseSpec(clauseId, uri)`
 * fetches the spec from that locator, parses it, and caches it; every sync read
 * below resolves against that cache. There is NO bundled spec set and NO
 * fallback — a spec the chain doesn't point at is simply unknown. The
 * `useClauseSpecs` hook warms the cache at the app boundary (it reads the
 * registry events and loads each `metadataURI`), the same way assemblies load.
 *
 * Spec-derived reads (title, article, attestation tier, enum vocabulary, drawer
 * nesting) live here so there is one source and no parallel taxonomy module.
 */

import { parseClauseSpec, type ClauseSpec, type FieldSpec, type EnumFieldSpec } from "@figaro/core/clauses";
import { clauseIdHash } from "@/lib/shared/evm";
import { DEFAULT_IPFS_SERVICE } from "@/lib/shared/ipfsService";
import { safeJsonFromResponse } from "@/lib/shared/safeJson";

const SPEC_CACHE = new Map<string, ClauseSpec>();
const SPEC_LOAD_ERRORS = new Map<string, string>();

/** clauseId → the parent FIELD name it nests under in the drawer, read from the
 *  spec's `block.nestsUnder`. Populated as specs load. Drives the drawer's
 *  cross-clause nesting (e.g. a proximity policy renders nested under the
 *  modality clause's `handoff` field). Read from the spec; never a hardcoded tree. */
const NESTS_UNDER = new Map<string, string>();

/** clauseId HASH (keccak256 of the clauseId string, as the on-chain Attestation
 *  event carries it) → clauseId. Populated as specs load; the runtime attestation
 *  log keys on the hash. */
const HASH_TO_ID = new Map<string, string>();

/** clauseIds that some other loaded spec names as its `block.sisterClauseId` —
 *  i.e. companion clauses, emitted by their sister at commit rather than chosen
 *  directly (proximity proofs, runtime measurements). Derived
 *  purely from the JSON; populated as specs load. */
const COMPANION_IDS = new Set<string>();

// ── Loading (chain → IPFS) ───────────────────────────────────────────────────

/**
 * Fetcher hook — URI → raw JSON. Default resolves an `ipfs://` locator through
 * the gateway and fetches it; tests swap in a stub via `setClauseSpecFetcher`.
 */
export type ClauseSpecFetcher = (uri: string) => Promise<unknown>;

let activeFetcher: ClauseSpecFetcher = async (uri) => {
    const url = DEFAULT_IPFS_SERVICE.resolveFetchUrl(uri);
    if (!url) throw new Error(`Cannot resolve clause spec URI: ${uri}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch clause spec at ${uri}: ${response.status} ${response.statusText}`);
    const parsed = await safeJsonFromResponse(response);
    if (parsed === null) throw new Error(`Failed to parse clause spec at ${uri}: invalid JSON`);
    return parsed;
};

/** Replace the default fetcher (test-only). */
export function setClauseSpecFetcher(fetcher: ClauseSpecFetcher): void {
    activeFetcher = fetcher;
}

/** Register a loaded spec into the cache + the derived maps. */
function cacheSpec(spec: ClauseSpec): void {
    SPEC_CACHE.set(spec.clauseId, spec);
    HASH_TO_ID.set(clauseIdHash(spec.clauseId, spec.version).toLowerCase(), spec.clauseId);
    const nestsUnder = (spec as { block?: { nestsUnder?: unknown } }).block?.nestsUnder;
    if (typeof nestsUnder === "string" && nestsUnder.length > 0) NESTS_UNDER.set(spec.clauseId, nestsUnder);
    const sister = spec.block?.sisterClauseId;
    if (typeof sister === "string" && sister.length > 0) COMPANION_IDS.add(sister);
}

/** True if a clause is some other clause's `sisterClauseId` — a companion the
 *  designer surfaces via its sister at commit, not as a directly-selectable
 *  clause. Derived from the spec, never a hardcoded list. */
export function isCompanionClause(clauseId: string): boolean {
    return COMPANION_IDS.has(clauseId);
}

/**
 * Async load — fetch a spec from its IPFS locator, parse, cache, and return it.
 * Idempotent: a spec already cached resolves immediately. Throws on parse /
 * network failure / clauseId mismatch (no silent fallback).
 */
export async function loadClauseSpec(clauseId: string, uri: string): Promise<ClauseSpec> {
    const cached = SPEC_CACHE.get(clauseId);
    if (cached !== undefined) return cached;
    const raw = await activeFetcher(uri);
    const parsed = parseClauseSpec(raw);
    if (!parsed.ok) {
        const detail = parsed.errors.map((e) => `${e.path}: ${e.message}`).join("; ");
        SPEC_LOAD_ERRORS.set(clauseId, `spec at ${uri} failed to parse: ${detail}`);
        throw new Error(`Clause spec at ${uri} failed to parse: ${detail}`);
    }
    if (parsed.spec.clauseId !== clauseId) {
        throw new Error(`Clause spec at ${uri} declares clauseId "${parsed.spec.clauseId}", expected "${clauseId}"`);
    }
    cacheSpec(parsed.spec);
    return parsed.spec;
}

/** Test-only — clear all caches. */
export function _resetClauseSpecCache_TESTING_ONLY(): void {
    SPEC_CACHE.clear();
    SPEC_LOAD_ERRORS.clear();
    NESTS_UNDER.clear();
    HASH_TO_ID.clear();
}

// ── Sync API (resolves against the loaded cache) ─────────────────────────────

/** Synchronous lookup — returns a cached spec, or `undefined` if not loaded. */
export function getClauseSpec(clauseId: string): ClauseSpec | undefined {
    return SPEC_CACHE.get(clauseId);
}

/** Returns the load error for a clauseId, if any. */
export function getClauseSpecLoadError(clauseId: string): string | undefined {
    return SPEC_LOAD_ERRORS.get(clauseId);
}

/** Returns all currently-loaded clause IDs. */
export function listKnownClauseIds(): readonly string[] {
    return Array.from(SPEC_CACHE.keys());
}

/** The field name a clause nests under in the drawer, or null if top-level. */
export function clauseNestsUnder(clauseId: string): string | null {
    return NESTS_UNDER.get(clauseId) ?? null;
}

/** True if a clause is STRUCTURAL — composed on every order by the agreement
 *  build, not a designer choice (commerce, topology). Read from the spec's
 *  `block.structural`; generic surfaces exclude it from selectable lists. */
export function clauseIsStructural(clauseId: string): boolean {
    return getClauseSpec(clauseId)?.block?.structural === true;
}

/** Default-on clause — pre-composed (as an empty object; the spec's field
 *  `default`s fill it through the generic build walk) on every freshly-spawned
 *  designer node, removable in the drawer. From `block.defaultOn`. */
export function clauseIsDefaultOn(clauseId: string): boolean {
    return getClauseSpec(clauseId)?.block?.defaultOn === true;
}

/** A PROCESS-LOG clause — the Category-1 enum-ladder runtime event log (not a
 *  companion proof) an order's seller advances. The generic marker for "this
 *  order runs a lifecycle"; resolved from the spec, never by name. */
export function clauseIsProcessLog(clauseId: string): boolean {
    return (
        getClauseSpec(clauseId)?.block?.tier === "category-1"
        && clauseLadderField(clauseId) !== null
        && !isCompanionClause(clauseId)
    );
}

/** Whether a clause's spec declares a top-level field named `fieldName`.
 *  Field names — not clause ids — are the binding vocabulary generic surfaces
 *  look things up by: ANY registered clause carrying the field participates,
 *  including clauses this codebase has never seen. False while uncached. */
export function clauseDeclaresField(clauseId: string, fieldName: string): boolean {
    return getClauseSpec(clauseId)?.fields.some((f) => f.name === fieldName) === true;
}

/** The manifest-only structural clause — the topology manifest whose data
 *  carries the order's DAG edges, reconstructed off-chain by indexers.
 *  Resolved from the registry by TIER (manifest-only is the topology tier by
 *  construction), never by name. undefined while the cache is cold. */
export function manifestTopologyClauseId(): string | undefined {
    return listKnownClauseIds().find(
        (clauseId) =>
            getClauseSpec(clauseId)?.block?.tier === "manifest-only" && clauseIsStructural(clauseId),
    );
}

/** WHO attests a runtime clause — "seller" (the order's seller, default) or
 *  "bilateral" (both buyer and seller witness, e.g. proximity proof). Read from
 *  `block.attestation`; the generic runtime engine surfaces the attestation to
 *  the right party/parties without naming any clause. */
export function clauseAttestation(clauseId: string): "seller" | "bilateral" {
    return getClauseSpec(clauseId)?.block?.attestation ?? "seller";
}

/** The enum stage CODES of a lifecycle clause that are PHYSICAL HAND-OFFS (value
 *  changes hands). Read from `block.handoffStages`; the generic engine pairs a
 *  proximity cross-witness at these stages. Empty when the clause has no hand-off. */
/** @public — engine reader shipped with `block.handoffStages` (the data is in
 *  the specs); the proximity cross-witness pairing consumes it when the generic
 *  handoff wiring lands. */
export function clauseHandoffStages(clauseId: string): readonly string[] {
    return getClauseSpec(clauseId)?.block?.handoffStages ?? [];
}

/** The first enum-type field of a clause — the runtime "stage ladder" (the
 *  `eventType` enum on merchant/courier, or any category-1 clause's ladder).
 *  Returns the field name + its ordered values, or null when the clause has no
 *  enum field (e.g. ghg-measurement's grams). The generic runtime engine reads
 *  this to advance ANY runtime-attestable clause without naming it. */
export function clauseLadderField(clauseId: string): { name: string; values: readonly string[]; valueLabels?: Readonly<Record<string, string>> } | null {
    for (const field of getClauseSpec(clauseId)?.fields ?? []) {
        if (field.type === "enum") return { name: field.name, values: field.values, valueLabels: field.valueLabels };
    }
    return null;
}

// ── Spec-derived reads ───────────────────────────────────────────────────────

/** When a clause is attested. Derived from block.tier: category-1 ⇒ runtime
 *  (attested during/after the process), everything else ⇒ designer-time. */
export type ClauseTier = "designer-time" | "runtime";

/** The first enum field on a spec — the eventType ladder (merchant / courier)
 *  or the band set (proximity). Looks through enum and enum-typed array fields. */
function firstEnumField(spec: ClauseSpec | undefined): EnumFieldSpec | undefined {
    for (const field of spec?.fields ?? []) {
        if (field.type === "enum") return field;
        if (field.type === "array" && field.items.type === "enum") return field.items;
    }
    return undefined;
}

/** The enum field carrying `value` as a member — for labelling a raw value
 *  through its spec. Returns the enum (or array-of-enum item) field, or undefined. */
function enumFieldOf(field: FieldSpec): EnumFieldSpec | undefined {
    if (field.type === "enum") return field;
    if (field.type === "array" && field.items.type === "enum") return field.items;
    return undefined;
}

/** Label a raw enum value through its field's `valueLabels` — the spec is the
 *  SSoT for human-readable value display; falls back to the raw token when the
 *  spec declares no label (a never-labelled clause still renders). Internal —
 *  shared by the spec-derived readers below (`describeAttestation`,
 *  `renderFieldValues`) and by the capability deriver (the runtime action label). */
export function labelEnumValue(field: { valueLabels?: Readonly<Record<string, string>> } | null | undefined, value: string): string {
    return field?.valueLabels?.[value] ?? value;
}

/** Display text for a runtime attestation, read STRAIGHT from the clause spec:
 *  the title and the (labelled) enum value at `stage`. Callers pass DATA (the
 *  event's clauseId hash + uint8 stage) — no surface names a clause. Falls back
 *  to the short hash + stage when the clause is unknown (not yet loaded). */
export function describeAttestation(
    clauseIdHash: string,
    stage: number,
): { clauseTitle: string; eventLabel: string; eventCode: string } {
    const id = HASH_TO_ID.get(clauseIdHash.toLowerCase());
    const spec = id ? getClauseSpec(id) : undefined;
    if (!spec) return { clauseTitle: `${clauseIdHash.slice(0, 10)}…`, eventLabel: `stage ${stage}`, eventCode: `stage-${stage}` };
    const ladder = firstEnumField(spec);
    const value = ladder?.values[stage];
    // eventLabel is the HUMANIZED display text (valueLabels); eventCode is the
    // STABLE raw enum value for targeting (data-testid / data-event-code), the
    // same split the capability rail uses (73d0e22) — the label can evolve
    // without breaking e2e.
    return {
        clauseTitle: spec.title,
        eventLabel: value ? labelEnumValue(ladder, value) : `stage ${stage}`,
        eventCode: value ?? `stage-${stage}`,
    };
}

/** A field's rendered contribution to a clause description: the field's display
 *  label (spec `label` → field name) and its selected value(s) rendered through
 *  the spec's `valueLabels` (raw token when no label is declared). Internal —
 *  consumers receive it structurally as `ClauseDescription.fields[]`. */
interface ClauseFieldDescription {
    name: string;
    label: string;
    values: string[];
}

/** A human description of a composed clause, derived ENTIRELY from its spec +
 *  data — the SSoT reader for display (drawer / canvas / checkout) and future
 *  analysis surfaces. Names no clause; an unknown (unloaded / permissionless)
 *  clause degrades to its short hash + raw data. Only fields actually present in
 *  `data` are described. */
export interface ClauseDescription {
    clauseId: string;
    title: string;
    fields: ClauseFieldDescription[];
}

function renderFieldValues(field: FieldSpec, raw: unknown): string[] {
    const enumField = enumFieldOf(field);
    const label = (v: unknown) => labelEnumValue(enumField, String(v));
    if (Array.isArray(raw)) return raw.filter((v) => v != null && v !== "").map(label);
    if (raw == null || raw === "") return [];
    return [label(raw)];
}

/** Describe a composed clause from its spec + data — the one generic, identity-
 *  blind reader every display/analysis surface shares. */
export function describeClause(clauseId: string, data: Record<string, unknown> | undefined): ClauseDescription {
    const spec = getClauseSpec(clauseId);
    const d = data ?? {};
    if (!spec) {
        return {
            clauseId,
            title: `${clauseId.slice(0, 10)}…`,
            fields: Object.entries(d)
                .map(([name, v]) => ({ name, label: name, values: Array.isArray(v) ? v.map(String) : v == null || v === "" ? [] : [String(v)] }))
                .filter((f) => f.values.length > 0),
        };
    }
    const fields: ClauseFieldDescription[] = [];
    for (const field of spec.fields) {
        const values = renderFieldValues(field, d[field.name]);
        if (values.length === 0) continue;
        fields.push({ name: field.name, label: field.label ?? field.name, values });
    }
    return { clauseId, title: spec.title, fields };
}

/** The FieldSpec at a dot-delimited path inside a clause's spec — the SSoT for
 *  a field's type, constraints, enum values, `default`, and `sentinel`. The
 *  generic build encoder walks `getClauseSpec(id).fields` directly; this
 *  path-lookup form serves form surfaces; undefined when the clause or path
 *  is unknown.
 *  @public pending consumer: the Layer-6 spec-driven drawer controls (render
 *  per-field inputs from the spec); remove the tag when that lands. */
export function clauseFieldSpec(clauseId: string, fieldPath: string): FieldSpec | undefined {
    let fields: readonly FieldSpec[] | undefined = getClauseSpec(clauseId)?.fields;
    const segments = fieldPath.split(".");
    for (let i = 0; i < segments.length; i++) {
        const field = fields?.find((f) => f.name === segments[i]);
        if (!field) return undefined;
        if (i === segments.length - 1) return field;
        if (field.type !== "object") return undefined;
        fields = field.fields;
    }
    return undefined;
}

/** The enum values a clause field admits, read STRAIGHT from the spec — the SSoT
 *  for which strings are valid. `fieldPath` is dot-delimited for nested object
 *  fields; the leaf may be an enum or an array-of-enum. Empty when absent.
 *  @public pending consumer: the Layer-6 spec-driven drawer controls (its
 *  prior consumers, the ALLOWED_* filters, were absorbed by the generic build
 *  walk); remove the tag when that lands. */
export function clauseEnumValues(clauseId: string, fieldPath: string): readonly string[] {
    const field = clauseFieldSpec(clauseId, fieldPath);
    if (field?.type === "enum") return field.values;
    if (field?.type === "array" && field.items.type === "enum") return field.items.values;
    return [];
}

/** When a clause is attested, from block.tier. */
export function clauseTier(clauseId: string): ClauseTier {
    return getClauseSpec(clauseId)?.block?.tier === "category-1" ? "runtime" : "designer-time";
}

interface ClauseArticleEntry {
    clauseId: string;
    title: string;
    description: string;
}

export interface ClauseArticleGroup {
    article: string;
    label: string;
    clauses: readonly ClauseArticleEntry[];
}

/** THE single clause classification — every loaded clause grouped by its
 *  `block.article`, derived entirely from the specs. Articles appear in
 *  the order their first clause was loaded (chain/registration order); there is
 *  NO imposed sequence — no hardcoded article list, no alphabetical sort. Both
 *  the /clauses inventory and the designer drawer read this one function, so the
 *  two surfaces classify clauses identically. Clauses with no article fall to
 *  "(unclassified)". Sub-clause nesting is layered on top from `block.nestsUnder`
 *  (see `clauseNestsUnder`); companions from `block.sisterClauseId`. */
export function groupClausesByArticle(): readonly ClauseArticleGroup[] {
    const byArticle = new Map<string, ClauseArticleEntry[]>();
    for (const spec of SPEC_CACHE.values()) {
        const article = spec.block?.article ?? "(unclassified)";
        const entry = { clauseId: spec.clauseId, title: spec.title, description: spec.description };
        const bucket = byArticle.get(article);
        if (bucket) bucket.push(entry);
        else byArticle.set(article, [entry]);
    }
    // Insertion order = load order; the Map preserves it. No sort, no enum.
    return Array.from(byArticle.entries()).map(([article, clauses]) => ({ article, label: article, clauses }));
}
