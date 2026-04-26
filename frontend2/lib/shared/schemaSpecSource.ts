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
import topologySpecRaw from "@/lib/shared/schemas/figaro-topology-v1.json";
import handoffSpecRaw from "@/lib/shared/schemas/figaro-handoff-v1.json";

const SPEC_CACHE = new Map<string, SchemaSpec>();
const SPEC_LOAD_ERRORS = new Map<string, string>();

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

// ── Pre-load built-in specs ─────────────────────────────────────────────────

preload(topologySpecRaw, "figaro-topology-v1");
preload(handoffSpecRaw, "figaro-handoff-v1");

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
    preload(topologySpecRaw, "figaro-topology-v1");
    preload(handoffSpecRaw, "figaro-handoff-v1");
}
