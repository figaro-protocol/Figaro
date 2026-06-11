// Encoding helpers for frontend -> bytes32 conversions
import { ZERO_BYTES32, bytesToHex } from "@/lib/shared/evm";

/**
 * Per-order clause content — the SINGLE shape shared by the assembly template,
 * the designer, and the commit path. Keyed by clauseId; each value is that
 * clause's spec-named field values. An agreement section is a near-identity
 * projection of an entry: `{ clause: clauseId, data: values }`.
 *
 * Structurally identical to `@figaro/core`'s template `ClauseValues`, so a
 * template order's `clauses` feeds checkout with zero translation.
 */
export type ClauseFields = Record<string, Record<string, unknown>>;

function encodeToBytes32(s: string): `0x${string}` {
    const str = (s || "").toString();
    if (!str) return ZERO_BYTES32;
    if (str.startsWith("0x") && str.length === 66) return str as `0x${string}`;
    const enc = new TextEncoder().encode(str);
    const buf = new Uint8Array(32);
    buf.fill(0);
    for (let i = 0; i < Math.min(enc.length, 32); i++) buf[i] = enc[i];
    return `0x${bytesToHex(buf)}` as `0x${string}`;
}

/**
 * Decode a bytes32 location value back into a human-readable string.
 * The contract stores the value as a null-padded UTF-8 byte sequence:
 *   encodeLocationBytes32("NYC", "LAX") → bytes32("NYC|LAX\0…\0")
 * Returns an empty string when the value is zero or unparseable.
 */
export function decodeLocationBytes32(hex: string): string {
    if (!hex || hex === ZERO_BYTES32) return "";
    try {
        const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
        const bytes = new Uint8Array((clean.match(/.{2}/g) ?? []).map(b => parseInt(b, 16)));
        let end = bytes.indexOf(0);
        if (end === -1) end = bytes.length;
        return new TextDecoder().decode(bytes.slice(0, end));
    } catch {
        return "";
    }
}

export function encodeLocationBytes32(origin: string, destination?: string): `0x${string}` {
    const trimmedOrigin = (origin || "").trim();
    const trimmedDestination = (destination || "").trim();
    const payload = trimmedDestination ? `${trimmedOrigin}|${trimmedDestination}` : trimmedOrigin;
    if (!payload) return ZERO_BYTES32;
    // A8: warn when the combined string exceeds 32 bytes; bytes beyond that are silently dropped
    const byteLength = new TextEncoder().encode(payload).length;
    if (byteLength > 32) {
        console.warn(
            `[encodeLocationBytes32] payload "${payload}" is ${byteLength} bytes — exceeds 32-byte limit. ` +
            `The last ${byteLength - 32} byte(s) will be truncated in the on-chain bytes32 value.`
        );
    }
    return encodeToBytes32(payload);
}
