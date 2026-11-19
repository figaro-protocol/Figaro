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

/**
 * The path of the first `__proto__`, `constructor` or `prototype` key at any
 * depth of `value` (`$.fields[0].constructor`), or `null` when it carries
 * none. A document hashed with such a key hashes bytes no reader parsing with
 * `strippingReviver` reproduces.
 */
export function strippedKeyPath(value: unknown, path = "$"): string | null {
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
            const found = strippedKeyPath(value[i], `${path}[${i}]`);
            if (found !== null) return found;
        }
        return null;
    }
    if (value === null || typeof value !== "object") return null;
    for (const key of Object.keys(value)) {
        if (DANGEROUS_KEYS.has(key)) return `${path}.${key}`;
        const found = strippedKeyPath((value as Record<string, unknown>)[key], `${path}.${key}`);
        if (found !== null) return found;
    }
    return null;
}
