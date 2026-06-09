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

import { parseClauseSpec, type ClauseSpec, type FieldSpec } from "@figaro/core/clauses";
import { keccak256, stringToHex } from "viem";
import { DEFAULT_IPFS_SERVICE } from "@/lib/shared/ipfsService";
import { safeJsonFromResponse } from "@/lib/shared/safeJson";

const SPEC_CACHE = new Map<string, ClauseSpec>();
const SPEC_LOAD_ERRORS = new Map<string, string>();

/** clauseId → the parent FIELD name it nests under in the drawer, read from the
 *  spec's `block.nestsUnder`. Populated as specs load. Drives the drawer's
 *  cross-clause nesting (e.g. a proximity policy renders nested under the
 *  fulfilment clause's `handoff` field). Read from the spec; never a hardcoded tree. */
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
    HASH_TO_ID.set(keccak256(stringToHex(spec.clauseId)).toLowerCase(), spec.clauseId);
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
export function clauseLadderField(clauseId: string): { name: string; values: readonly string[] } | null {
    for (const field of getClauseSpec(clauseId)?.fields ?? []) {
        if (field.type === "enum") return { name: field.name, values: field.values };
    }
    return null;
}

// ── Spec-derived reads ───────────────────────────────────────────────────────

/** When a clause is attested. Derived from block.tier: category-1 ⇒ runtime
 *  (attested during/after the process), everything else ⇒ designer-time. */
export type ClauseTier = "designer-time" | "runtime";

/** The first enum vocabulary on a spec — the eventType ladder (merchant /
 *  courier) or the band set (proximity). Looks through enum and enum-typed
 *  array fields. */
function firstEnumValues(spec: ClauseSpec | undefined): readonly string[] | undefined {
    for (const field of spec?.fields ?? []) {
        if (field.type === "enum") return field.values;
        if (field.type === "array" && field.items.type === "enum") return field.items.values;
    }
    return undefined;
}

/** Display text for a runtime attestation, read STRAIGHT from the clause spec:
 *  the title and the enum value at `stage`. Callers pass DATA (the event's
 *  clauseId hash + uint8 stage) — no surface names a clause. Falls back to the
 *  short hash + stage when the clause is unknown (not yet loaded). */
export function describeAttestation(
    clauseIdHash: string,
    stage: number,
): { clauseTitle: string; eventLabel: string } {
    const id = HASH_TO_ID.get(clauseIdHash.toLowerCase());
    const spec = id ? getClauseSpec(id) : undefined;
    if (!spec) return { clauseTitle: `${clauseIdHash.slice(0, 10)}…`, eventLabel: `stage ${stage}` };
    return { clauseTitle: spec.title, eventLabel: firstEnumValues(spec)?.[stage] ?? `stage ${stage}` };
}

/** The enum values a clause field admits, read STRAIGHT from the spec — the SSoT
 *  for which strings are valid. `fieldPath` is dot-delimited for nested object
 *  fields; the leaf may be an enum or an array-of-enum. Empty when absent. */
export function clauseEnumValues(clauseId: string, fieldPath: string): readonly string[] {
    let fields: readonly FieldSpec[] | undefined = getClauseSpec(clauseId)?.fields;
    const segments = fieldPath.split(".");
    for (let i = 0; i < segments.length; i++) {
        const field = fields?.find((f) => f.name === segments[i]);
        if (!field) return [];
        if (i === segments.length - 1) {
            if (field.type === "enum") return field.values;
            if (field.type === "array" && field.items.type === "enum") return field.items.values;
            return [];
        }
        if (field.type !== "object") return [];
        fields = field.fields;
    }
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
 *  `block.drawerArticle`, derived entirely from the specs. Articles appear in
 *  the order their first clause was loaded (chain/registration order); there is
 *  NO imposed sequence — no hardcoded article list, no alphabetical sort. Both
 *  the /clauses inventory and the designer drawer read this one function, so the
 *  two surfaces classify clauses identically. Clauses with no article fall to
 *  "(unclassified)". Sub-clause nesting is layered on top from `block.nestsUnder`
 *  (see `clauseNestsUnder`); companions from `block.sisterClauseId`. */
export function groupClausesByArticle(): readonly ClauseArticleGroup[] {
    const byArticle = new Map<string, ClauseArticleEntry[]>();
    for (const spec of SPEC_CACHE.values()) {
        const article = spec.block?.drawerArticle ?? "(unclassified)";
        const entry = { clauseId: spec.clauseId, title: spec.title, description: spec.description };
        const bucket = byArticle.get(article);
        if (bucket) bucket.push(entry);
        else byArticle.set(article, [entry]);
    }
    // Insertion order = load order; the Map preserves it. No sort, no enum.
    return Array.from(byArticle.entries()).map(([article, clauses]) => ({ article, label: article, clauses }));
}
