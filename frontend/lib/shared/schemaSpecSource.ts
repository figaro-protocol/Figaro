/**
 * Schema-spec source — fetches and caches schema specs by schemaId.
 *
 * The on-chain `SchemaRegistry` anchors `(schemaId, uriHash)` pairs;
 * actual specs live off-chain at the URI (typically IPFS). This module:
 *
 *   1. Maintains an in-memory cache keyed by schemaId
 *   2. Resolves a schemaId → SchemaSpec via either:
 *      - a bundled built-in spec (for schemas we ship in the repo), or
 *      - a fetcher (URI → JSON), pluggable for testing
 *
 * All built-in specs are pre-loaded at module import — no async on the
 * happy path for clauses we ship.
 */

import { parseSchemaSpec, type SchemaSpec } from "@figaro/core/schemas";
import { safeJsonFromResponse } from "@/lib/shared/safeJson";
import commerceSpecRaw from "@/lib/shared/schemas/figaro-commerce-v1.json";
import consentSpecRaw from "@/lib/shared/schemas/figaro-consent-v1.json";
import courierProcessSpecRaw from "@/lib/shared/schemas/figaro-courier-process-v1.json";
import fulfilmentV2SpecRaw from "@/lib/shared/schemas/figaro-fulfilment-v2.json";
import geoV2SpecRaw from "@/lib/shared/schemas/figaro-geo-v2.json";
import ghgCustomSpecRaw from "@/lib/shared/schemas/figaro-ghg-custom-v1.json";
import ghgEn16258SpecRaw from "@/lib/shared/schemas/figaro-ghg-en-16258-v1.json";
import ghgIso14064SpecRaw from "@/lib/shared/schemas/figaro-ghg-iso-14064-v1.json";
import ghgMeasurementSpecRaw from "@/lib/shared/schemas/figaro-ghg-measurement-v1.json";
import ghgPas2050SpecRaw from "@/lib/shared/schemas/figaro-ghg-pas-2050-v1.json";
import ghgProtocolSpecRaw from "@/lib/shared/schemas/figaro-ghg-protocol-v1.json";
import jurisdictionSpecRaw from "@/lib/shared/schemas/figaro-jurisdiction-v1.json";
import merchantProcessSpecRaw from "@/lib/shared/schemas/figaro-merchant-process-v1.json";
import proximityPolicySpecRaw from "@/lib/shared/schemas/figaro-proximity-policy-v1.json";
import proximityProofSpecRaw from "@/lib/shared/schemas/figaro-proximity-proof-v1.json";
import topologySpecRaw from "@/lib/shared/schemas/figaro-topology-v1.json";

const SPEC_CACHE = new Map<string, SchemaSpec>();
const SPEC_LOAD_ERRORS = new Map<string, string>();

/** Tuple of (raw spec, expected schemaId) for every built-in spec.
 *  Single source of truth; `_resetSchemaSpecCache_TESTING_ONLY` re-runs it. */
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
    [jurisdictionSpecRaw, "figaro-jurisdiction-v1"],
    [merchantProcessSpecRaw, "figaro-merchant-process-v1"],
    [proximityPolicySpecRaw, "figaro-proximity-policy-v1"],
    [proximityProofSpecRaw, "figaro-proximity-proof-v1"],
    [topologySpecRaw, "figaro-topology-v1"],
];

function preload(raw: unknown, expectedSchemaId: string): void {
    const parsed = parseSchemaSpec(raw);
    if (!parsed.ok) {
        SPEC_LOAD_ERRORS.set(expectedSchemaId, `built-in spec failed to parse: ${parsed.errors.map((e) => `${e.path}: ${e.message}`).join("; ")}`);
        return;
    }
    if (parsed.spec.schemaId !== expectedSchemaId) {
        SPEC_LOAD_ERRORS.set(expectedSchemaId, `built-in spec schemaId mismatch: file says "${parsed.spec.schemaId}", expected "${expectedSchemaId}"`);
        return;
    }
    SPEC_CACHE.set(parsed.spec.schemaId, parsed.spec);
}

function preloadAllBuiltIns(): void {
    for (const [raw, schemaId] of BUILT_IN_SPECS) {
        preload(raw, schemaId);
    }
}

// ── Pre-load built-in specs ─────────────────────────────────────────────────

preloadAllBuiltIns();

// ── API ─────────────────────────────────────────────────────────────────────

/** Synchronous lookup — returns a cached spec, or `undefined` if absent. */
export function getSchemaSpec(schemaId: string): SchemaSpec | undefined {
    return SPEC_CACHE.get(schemaId);
}

/** Returns the load error for a schemaId, if any. Used by dev / debug surfaces. */
export function getSchemaSpecLoadError(schemaId: string): string | undefined {
    return SPEC_LOAD_ERRORS.get(schemaId);
}

/** Returns all built-in / cached schema IDs. */
export function listKnownSchemaIds(): readonly string[] {
    return Array.from(SPEC_CACHE.keys());
}

/**
 * Optional fetcher hook — used by `loadSchemaSpec` for non-built-in specs.
 * Defaults to a `fetch`-based loader; tests can swap in a stub.
 */
export type SchemaSpecFetcher = (uri: string) => Promise<unknown>;

let activeFetcher: SchemaSpecFetcher = async (uri) => {
    const response = await fetch(uri);
    if (!response.ok) throw new Error(`Failed to fetch schema spec at ${uri}: ${response.status} ${response.statusText}`);
    const parsed = await safeJsonFromResponse(response);
    if (parsed === null) {
        throw new Error(`Failed to parse schema spec at ${uri}: invalid JSON or pollution-stripped to empty`);
    }
    return parsed;
};

/** Replace the default fetcher (test-only). */
export function setSchemaSpecFetcher(fetcher: SchemaSpecFetcher): void {
    activeFetcher = fetcher;
}

/**
 * Async load — fetches a spec from a URI (e.g. IPFS gateway), parses it,
 * caches it, and returns it. Subsequent `getSchemaSpec(schemaId)` calls
 * resolve synchronously. Throws on parse / network failure.
 */
export async function loadSchemaSpec(schemaId: string, uri: string): Promise<SchemaSpec> {
    const cached = SPEC_CACHE.get(schemaId);
    if (cached !== undefined) return cached;
    const raw = await activeFetcher(uri);
    const parsed = parseSchemaSpec(raw);
    if (!parsed.ok) {
        const detail = parsed.errors.map((e) => `${e.path}: ${e.message}`).join("; ");
        throw new Error(`Schema spec at ${uri} failed to parse: ${detail}`);
    }
    if (parsed.spec.schemaId !== schemaId) {
        throw new Error(`Schema spec at ${uri} declares schemaId "${parsed.spec.schemaId}", expected "${schemaId}"`);
    }
    SPEC_CACHE.set(schemaId, parsed.spec);
    return parsed.spec;
}

/** Test-only — clear all caches. */
export function _resetSchemaSpecCache_TESTING_ONLY(): void {
    SPEC_CACHE.clear();
    SPEC_LOAD_ERRORS.clear();
    preloadAllBuiltIns();
}
