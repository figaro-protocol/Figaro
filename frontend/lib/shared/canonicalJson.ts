/**
 * lib/shared/canonicalJson.ts — the one canonical-JSON convention.
 *
 * Both hash-anchored artifact families (clause specs on `ClauseRegistry`,
 * assembly templates on `AssemblyRegistry`) hash the SAME canonical form:
 * sorted object keys at every depth, no whitespace. One convention means a
 * reader can verify any fetched document by re-canonicalizing the parsed
 * JSON — no dependence on the pinned byte formatting or the transport.
 *
 * Publishers hash with `canonicalContentHash`; readers verify with it after
 * fetch. The node-side seed scripts (`populate-clauses.mjs`,
 * `populate-test-data.mjs`) mirror this function byte for byte — they cannot
 * import TS; keep them in lockstep when changing it.
 */

import { keccak256, toHex } from "viem";

/** Stable JSON serialization — sorted object keys at every depth. The
 *  serialized value must carry no bigints. */
export function canonicalize(value: unknown): string {
    return JSON.stringify(value, (_key, raw) => {
        if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return raw;
        const sorted: Record<string, unknown> = {};
        for (const k of Object.keys(raw).sort()) sorted[k] = (raw as Record<string, unknown>)[k];
        return sorted;
    });
}

/** keccak256 over the canonical serialization — the digest both registries
 *  anchor (`contentHash` for clause specs, `compositionHash` for assembly
 *  compositions). */
export function canonicalContentHash(value: unknown): `0x${string}` {
    return keccak256(toHex(canonicalize(value)));
}
