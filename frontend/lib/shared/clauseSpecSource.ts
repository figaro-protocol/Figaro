/**
 * Clause-spec source — fetches and caches clause specs by clauseId.
 *
 * The on-chain `ClauseRegistry` anchors `(clauseId, uriHash)` pairs;
 * actual specs live off-chain at the URI (typically IPFS). This module:
 *
 *   1. Maintains an in-memory cache keyed by clauseId
 *   2. Resolves a clauseId → ClauseSpec via either:
 *      - a bundled built-in spec (for clauses we ship in the repo), or
 *      - a fetcher (URI → JSON), pluggable for testing
 *
 * All built-in specs are pre-loaded at module import — no async on the
 * happy path for clauses we ship.
 */

import { parseClauseSpec, type ClauseSpec } from "@figaro/core/clauses";
import { keccak256, stringToHex } from "viem";
import { safeJsonFromResponse } from "@/lib/shared/safeJson";
import commerceSpecRaw from "@/lib/shared/clauses/figaro-commerce-v1.json";
import consentSpecRaw from "@/lib/shared/clauses/figaro-consent-v1.json";
import courierProcessSpecRaw from "@/lib/shared/clauses/figaro-courier-process-v1.json";
import fulfilmentV2SpecRaw from "@/lib/shared/clauses/figaro-fulfilment-v2.json";
import geoV2SpecRaw from "@/lib/shared/clauses/figaro-geo-v2.json";
import ghgCustomSpecRaw from "@/lib/shared/clauses/figaro-ghg-custom-v1.json";
import ghgEn16258SpecRaw from "@/lib/shared/clauses/figaro-ghg-en-16258-v1.json";
import ghgIso14064SpecRaw from "@/lib/shared/clauses/figaro-ghg-iso-14064-v1.json";
import ghgMeasurementSpecRaw from "@/lib/shared/clauses/figaro-ghg-measurement-v1.json";
import ghgPas2050SpecRaw from "@/lib/shared/clauses/figaro-ghg-pas-2050-v1.json";
import ghgProtocolSpecRaw from "@/lib/shared/clauses/figaro-ghg-protocol-v1.json";
import applicableLawSpecRaw from "@/lib/shared/clauses/figaro-applicable-law-v1.json";
import arbitrationKlerosSpecRaw from "@/lib/shared/clauses/figaro-arbitration-kleros-v1.json";
import merchantProcessSpecRaw from "@/lib/shared/clauses/figaro-merchant-process-v1.json";
import offsetPolicySpecRaw from "@/lib/shared/clauses/figaro-offset-policy-v1.json";
import proximityPolicySpecRaw from "@/lib/shared/clauses/figaro-proximity-policy-v1.json";
import proximityProofSpecRaw from "@/lib/shared/clauses/figaro-proximity-proof-v1.json";
import topologySpecRaw from "@/lib/shared/clauses/figaro-topology-v1.json";

const SPEC_CACHE = new Map<string, ClauseSpec>();
const SPEC_LOAD_ERRORS = new Map<string, string>();

/** Tuple of (raw spec, expected clauseId) for every built-in spec.
 *  Single source of truth; `_resetClauseSpecCache_TESTING_ONLY` re-runs it. */
const BUILT_IN_SPECS: ReadonlyArray<[unknown, string]> = [
    [commerceSpecRaw, "figaro-commerce-v1"],
    [consentSpecRaw, "figaro-consent-v1"],
    [courierProcessSpecRaw, "figaro-courier-process-v1"],
    [fulfilmentV2SpecRaw, "figaro-fulfilment-v2"],
    [geoV2SpecRaw, "figaro-geo-v2"],
    [ghgCustomSpecRaw, "figaro-ghg-custom-v1"],
    [ghgEn16258SpecRaw, "figaro-ghg-en-16258-v1"],
    [ghgIso14064SpecRaw, "figaro-ghg-iso-14064-v1"],
    [ghgMeasurementSpecRaw, "figaro-ghg-measurement-v1"],
    [ghgPas2050SpecRaw, "figaro-ghg-pas-2050-v1"],
    [ghgProtocolSpecRaw, "figaro-ghg-protocol-v1"],
    [applicableLawSpecRaw, "figaro-applicable-law-v1"],
    [arbitrationKlerosSpecRaw, "figaro-arbitration-kleros-v1"],
    [merchantProcessSpecRaw, "figaro-merchant-process-v1"],
    [offsetPolicySpecRaw, "figaro-offset-policy-v1"],
    [proximityPolicySpecRaw, "figaro-proximity-policy-v1"],
    [proximityProofSpecRaw, "figaro-proximity-proof-v1"],
    [topologySpecRaw, "figaro-topology-v1"],
];

function preload(raw: unknown, expectedClauseId: string): void {
    const parsed = parseClauseSpec(raw);
    if (!parsed.ok) {
        SPEC_LOAD_ERRORS.set(expectedClauseId, `built-in spec failed to parse: ${parsed.errors.map((e) => `${e.path}: ${e.message}`).join("; ")}`);
        return;
    }
    if (parsed.spec.clauseId !== expectedClauseId) {
        SPEC_LOAD_ERRORS.set(expectedClauseId, `built-in spec clauseId mismatch: file says "${parsed.spec.clauseId}", expected "${expectedClauseId}"`);
        return;
    }
    SPEC_CACHE.set(parsed.spec.clauseId, parsed.spec);
}

function preloadAllBuiltIns(): void {
    for (const [raw, clauseId] of BUILT_IN_SPECS) {
        preload(raw, clauseId);
    }
}

// ── Pre-load built-in specs ─────────────────────────────────────────────────

preloadAllBuiltIns();

// ── API ─────────────────────────────────────────────────────────────────────

/** Synchronous lookup — returns a cached spec, or `undefined` if absent. */
export function getClauseSpec(clauseId: string): ClauseSpec | undefined {
    return SPEC_CACHE.get(clauseId);
}

/** Returns the load error for a clauseId, if any. Used by dev / debug surfaces. */
export function getClauseSpecLoadError(clauseId: string): string | undefined {
    return SPEC_LOAD_ERRORS.get(clauseId);
}

/** Returns all built-in / cached clause IDs. */
export function listKnownClauseIds(): readonly string[] {
    return Array.from(SPEC_CACHE.keys());
}

/**
 * Optional fetcher hook — used by `loadClauseSpec` for non-built-in specs.
 * Defaults to a `fetch`-based loader; tests can swap in a stub.
 */
export type ClauseSpecFetcher = (uri: string) => Promise<unknown>;

let activeFetcher: ClauseSpecFetcher = async (uri) => {
    const response = await fetch(uri);
    if (!response.ok) throw new Error(`Failed to fetch clause spec at ${uri}: ${response.status} ${response.statusText}`);
    const parsed = await safeJsonFromResponse(response);
    if (parsed === null) {
        throw new Error(`Failed to parse clause spec at ${uri}: invalid JSON or pollution-stripped to empty`);
    }
    return parsed;
};

/** Replace the default fetcher (test-only). */
export function setClauseSpecFetcher(fetcher: ClauseSpecFetcher): void {
    activeFetcher = fetcher;
}

/**
 * Async load — fetches a spec from a URI (e.g. IPFS gateway), parses it,
 * caches it, and returns it. Subsequent `getClauseSpec(clauseId)` calls
 * resolve synchronously. Throws on parse / network failure.
 */
export async function loadClauseSpec(clauseId: string, uri: string): Promise<ClauseSpec> {
    const cached = SPEC_CACHE.get(clauseId);
    if (cached !== undefined) return cached;
    const raw = await activeFetcher(uri);
    const parsed = parseClauseSpec(raw);
    if (!parsed.ok) {
        const detail = parsed.errors.map((e) => `${e.path}: ${e.message}`).join("; ");
        throw new Error(`Clause spec at ${uri} failed to parse: ${detail}`);
    }
    if (parsed.spec.clauseId !== clauseId) {
        throw new Error(`Clause spec at ${uri} declares clauseId "${parsed.spec.clauseId}", expected "${clauseId}"`);
    }
    SPEC_CACHE.set(clauseId, parsed.spec);
    return parsed.spec;
}

/** Test-only — clear all caches. */
export function _resetClauseSpecCache_TESTING_ONLY(): void {
    SPEC_CACHE.clear();
    SPEC_LOAD_ERRORS.clear();
    preloadAllBuiltIns();
}

// ── Spec-derived reads ───────────────────────────────────────────────────────
// Everything a surface needs to know about a clause is READ FROM ITS SPEC here
// — title, the article it's grouped under (block.drawerArticle), when it's
// attested (block.tier), and its enum vocabulary. One spec source, no
// hand-maintained parallel maps, no second taxonomy module.

/** When a clause is attested. Derived from block.tier: category-1 ⇒ runtime
 *  (attested during/after the process), everything else ⇒ designer-time. */
export type ClauseTier = "designer-time" | "runtime";

/** clauseId HASH (keccak256 of the clauseId string, as the on-chain Attestation
 *  event carries it) → clauseId. The runtime attestation log keys on the hash. */
const HASH_TO_ID: ReadonlyMap<string, string> = new Map(
    BUILT_IN_SPECS.map(([, id]) => [keccak256(stringToHex(id)).toLowerCase(), id]),
);

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
 *  clauseId hash + uint8 stage) — no surface names a clause, no frontend label
 *  map. Falls back to the short hash + stage when the clause is unknown. */
export function describeAttestation(
    clauseIdHash: string,
    stage: number,
): { clauseTitle: string; eventLabel: string } {
    const id = HASH_TO_ID.get(clauseIdHash.toLowerCase());
    const spec = id ? getClauseSpec(id) : undefined;
    if (!spec) return { clauseTitle: `${clauseIdHash.slice(0, 10)}…`, eventLabel: `stage ${stage}` };
    return { clauseTitle: spec.title, eventLabel: firstEnumValues(spec)?.[stage] ?? `stage ${stage}` };
}

/** The uint8 ordinal of an enum CODE in a clause's enum vocabulary — the
 *  inverse of describeAttestation. The single source for on-chain enum indices,
 *  so the frontend never hardcodes them. -1 if the code is unknown. */
export function clauseEnumOrdinal(clauseId: string, code: string): number {
    return firstEnumValues(getClauseSpec(clauseId))?.indexOf(code) ?? -1;
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

/** Every built-in clause grouped by its article, articles in stable
 *  (alphabetical) order — derived entirely from the specs. Drives the
 *  /clauses inventory and the GHG panel. A new clause JSON appears
 *  automatically; clauses with no drawer article fall to "(unclassified)". */
export const CLAUSES_BY_ARTICLE: readonly ClauseArticleGroup[] = (() => {
    const byArticle = new Map<string, ClauseArticleEntry[]>();
    for (const [, clauseId] of BUILT_IN_SPECS) {
        const spec = getClauseSpec(clauseId);
        if (!spec) continue;
        const article = spec.block?.drawerArticle ?? "(unclassified)";
        const entry = { clauseId, title: spec.title, description: spec.description };
        const bucket = byArticle.get(article);
        if (bucket) bucket.push(entry);
        else byArticle.set(article, [entry]);
    }
    return Array.from(byArticle.keys())
        .sort()
        .map((article) => ({ article, label: article, clauses: byArticle.get(article)! }));
})();
