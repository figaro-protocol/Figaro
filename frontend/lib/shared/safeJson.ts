/**
 * safeJson — JSON parsing helpers hardened against prototype pollution.
 *
 * Threat-model 🟡 Priority 3 (UI ↔ MetaMask injection). Untrusted JSON
 * fetched from IPFS, the registry endpoint, or any external network source
 * may contain `__proto__`, `constructor`, or `prototype` keys. Modern V8
 * does NOT install these as prototype links during `JSON.parse()`, but the
 * parsed object retains them as own properties. Downstream code that does
 * `Object.assign(target, parsed)` or `{...parsed}` then triggers the
 * prototype-setter side effect, contaminating Object.prototype globally.
 *
 * The helpers below strip the dangerous keys at parse time using a
 * `JSON.parse` reviver. Any property whose key is `__proto__`,
 * `constructor`, or `prototype` is dropped (reviver returns `undefined`).
 * The resulting object is safe to spread, Object.assign, or otherwise
 * propagate without polluting the prototype chain.
 *
 * Usage:
 *
 *   // Parsing a string:
 *   const data = safeJsonParse<MyType>(text);
 *   if (!data) handleParseError();
 *
 *   // Parsing a Response (typical IPFS / registry fetch):
 *   const res = await fetch(url);
 *   const data = await safeJsonFromResponse<MyType>(res);
 *
 * Both helpers return `null` on failure (parse error, polluted-only object,
 * non-OK response) so consumers can branch cleanly without try/catch.
 *
 * Note: the helpers do NOT do clause validation. They only ensure the
 * result is structurally safe to consume. Callers that need typed access
 * (specific fields with specific types) should still validate the shape
 * via Zod / parseClauseSpec / hand-rolled checks.
 */

import { strippingReviver } from "@figaro/sdk";

/**
 * The reviver itself lives in `@figaro/sdk` (it guards the relayed
 * commitment envelope there too); re-exported here so frontend callers that
 * need the original parse-error to propagate (rather than being swallowed
 * into `null` like `safeJsonParse`) can pass it directly:
 *
 *   const data = JSON.parse(json, strippingReviver);
 */
export { strippingReviver };

/**
 * Parse a JSON string with prototype-pollution defenses. Returns `null`
 * on parse failure or if the input is not a string.
 */
export function safeJsonParse<T = unknown>(text: unknown): T | null {
    if (typeof text !== "string") return null;
    try {
        return JSON.parse(text, strippingReviver) as T;
    } catch {
        return null;
    }
}

/**
 * Minimal Response duck-type — accepts the standard Fetch `Response` plus
 * any test stub or fetcher abstraction that exposes the same OK/text shape.
 */
export interface SafeJsonResponse {
    ok: boolean;
    text(): Promise<string>;
}

/**
 * Read a response body as text and pipe through `safeJsonParse`. Returns
 * `null` if the response is not OK or the body fails to parse. Use this
 * instead of `await res.json()` for any network-fetched, attacker-influenceable
 * content (IPFS pins, registry endpoints, external APIs, postMessage payloads).
 *
 * Accepts the standard Fetch `Response` plus any duck-typed `{ ok, text }`
 * stub for testing or alternate fetcher abstractions.
 */
export async function safeJsonFromResponse<T = unknown>(res: SafeJsonResponse): Promise<T | null> {
    if (!res.ok) return null;
    try {
        const text = await res.text();
        return safeJsonParse<T>(text);
    } catch {
        return null;
    }
}
