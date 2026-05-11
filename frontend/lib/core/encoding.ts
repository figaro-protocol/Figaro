// Encoding helpers for frontend -> bytes32 conversions
import { ZERO_BYTES32 } from "@/lib/shared/evm";

function encodeToBytes32(s: string): `0x${string}` {
    const str = (s || "").toString();
    if (!str) return ZERO_BYTES32;
    if (str.startsWith("0x") && str.length === 66) return str as `0x${string}`;
    const enc = new TextEncoder().encode(str);
    const buf = new Uint8Array(32);
    buf.fill(0);
    for (let i = 0; i < Math.min(enc.length, 32); i++) buf[i] = enc[i];
    return ("0x" + Array.from(buf).map(b => b.toString(16).padStart(2, "0")).join("")) as `0x${string}`;
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

/**
 * Encode a plain-text string as a UTF-8 bytes manifest for the FigaroCore
 * `bytes manifest` parameter.  Returns a 0x-prefixed hex string that viem
 * will ABI-encode as dynamic bytes.  Always returns at least 0x01 so the
 * contract's `require(manifest.length > 0)` check is satisfied.
 *
 * @internal — prefer encodeManifestFields / decodeManifestFields for structured use.
 */
export function encodeManifest(payload: string): `0x${string}` {
    const trimmed = (payload || "").trim();
    if (!trimmed) return "0x01";
    const bytes = new TextEncoder().encode(trimmed);
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
    return `0x${hex}`;
}

/**
 * Decode a manifest hex string back to a UTF-8 string.  Returns "" for empty
 * or unparseable input.
 *
 * @internal — prefer decodeManifestFields for structured use.
 */
export function decodeManifest(hex: string): string {
    if (!hex || hex === "0x" || hex === "0x01") return "";
    try {
        const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
        // Reject excessively large payloads to prevent DoS via memory exhaustion
        if (clean.length > 65536) return "";
        const bytes = new Uint8Array((clean.match(/.{2}/g) ?? []).map(b => parseInt(b, 16)));
        return new TextDecoder().decode(bytes).replace(/\u0000/g, "");
    } catch {
        return "";
    }
}

// ---------------------------------------------------------------------------
// Structured manifest (key:value pipe-separated)
// Serialisation format:  o:Origin|d:Destination|mass:5kg|vol:10L|class:B
// Keys:  o = origin (required), d = destination, mass, vol, class
// Backward-compatible: "Origin|Destination" (no keys) is also decoded.
// ---------------------------------------------------------------------------

/** All recognised manifest fields. `class_` avoids the JS reserved word.
 *  Values may be strings, string-arrays, or arrays of string-keyed records
 *  (the latter for multi-valued composite schemas like consent documents).
 *  The on-chain manifest-bytes encoder only writes string values; arrays of
 *  any kind are agreement-only and skipped at the manifest-bytes layer. */
export interface ManifestFields {
    origin: string;
    destination?: string;
    mass?: string;         // e.g. "5 kg"
    volume?: string;       // e.g. "10 L"
    class_?: string;       // freight/hazmat class, e.g. "Perishables", "Hazmat A"
    [extra: string]: string | string[] | Array<Record<string, string>> | undefined; // extensible
}

const KV_SEP = ":";
const PART_SEP = "|";

/**
 * Encode structured fields into a `bytes` manifest hex string.
 * Produces `o:Origin|d:Dest|mass:5kg|vol:10L|class:B` and then UTF-8 encodes it.
 * Empty / undefined fields are omitted.
 */
export function encodeManifestFields(fields: ManifestFields): `0x${string}` {
    const parts: string[] = [];
    if (fields.origin?.trim()) parts.push(`o${KV_SEP}${fields.origin.trim()}`);
    if (fields.destination?.trim()) parts.push(`d${KV_SEP}${fields.destination.trim()}`);
    if (fields.mass?.trim()) parts.push(`mass${KV_SEP}${fields.mass.trim()}`);
    if (fields.volume?.trim()) parts.push(`vol${KV_SEP}${fields.volume.trim()}`);
    if (fields.class_?.trim()) parts.push(`class${KV_SEP}${fields.class_.trim()}`);
    // Any extra keys (future extensibility). Array-valued fields are skipped
    // — they live in the agreement, not the on-chain manifest-bytes string.
    for (const [k, v] of Object.entries(fields)) {
        if (["origin", "destination", "mass", "volume", "class_"].includes(k)) continue;
        if (typeof v === "string" && v.trim()) parts.push(`${k}${KV_SEP}${v.trim()}`);
    }
    return encodeManifest(parts.join(PART_SEP));
}

/**
 * Decode a manifest hex string back to structured `ManifestFields`.
 * Handles both the new `o:Origin|d:Dest|…` format and the legacy
 * `Origin|Destination` (plain pipe-separated) format.
 */
export function decodeManifestFields(hex: string): ManifestFields {
    const text = decodeManifest(hex);
    if (!text) return { origin: "" };

    // New key:value format — any part contains a colon
    if (text.includes(KV_SEP)) {
        const result: ManifestFields = { origin: "" };
        for (const part of text.split(PART_SEP)) {
            const idx = part.indexOf(KV_SEP);
            if (idx === -1) continue;
            const k = part.slice(0, idx).trim();
            const v = part.slice(idx + 1).trim();
            switch (k) {
                case "o": result.origin = v; break;
                case "d": result.destination = v || undefined; break;
                case "mass": result.mass = v || undefined; break;
                case "vol": result.volume = v || undefined; break;
                case "class": result.class_ = v || undefined; break;
                default: if (v) result[k] = v; break;
            }
        }
        return result;
    }

    // Legacy pipe-separated format: "Origin|Destination"
    if (text.includes(PART_SEP)) {
        const [origin, destination] = text.split(PART_SEP, 2);
        return { origin, destination: destination || undefined };
    }

    // Unrecognised format — treat the whole string as origin
    return { origin: text };
}

