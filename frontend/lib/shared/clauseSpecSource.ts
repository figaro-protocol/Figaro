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
