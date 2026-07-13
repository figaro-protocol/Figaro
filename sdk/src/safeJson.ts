/**
 * safeJson — prototype-pollution defense for parsed envelopes.
 *
 * Untrusted JSON (a relayed commitment envelope, IPFS content, any network
 * body) may carry `__proto__`, `constructor`, or `prototype` keys. Modern V8
 * does not install these as prototype links during `JSON.parse()`, but the
 * parsed object retains them as own properties — downstream `Object.assign`
 * or spread then triggers the prototype-setter side effect and contaminates
 * `Object.prototype` globally.
 */

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * `JSON.parse` reviver that drops `__proto__`, `constructor`, and
 * `prototype` keys to defuse prototype-pollution:
 *
 *   const data = JSON.parse(json, strippingReviver);
 */
export function strippingReviver(key: string, value: unknown): unknown {
    if (DANGEROUS_KEYS.has(key)) return undefined;
    return value;
}
