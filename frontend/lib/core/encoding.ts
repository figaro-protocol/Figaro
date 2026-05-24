// Encoding helpers for frontend -> bytes32 conversions
import { ZERO_BYTES32, bytesToHex } from "@/lib/shared/evm";

/**
 * Structural type for per-order manifest content carried in the agreement.
 * The on-chain `bytes manifest` codec was retired (no consumer); this type
 * survives as the contract between `buildOrderAgreement` and its callers,
 * who project it into the agreement object directly.
 */
export interface ManifestFields {
    origin: string;
    destination?: string;
    mass?: string;         // e.g. "5 kg"
    volume?: string;       // e.g. "10 L"
    class_?: string;       // freight/hazmat class, e.g. "Perishables", "Hazmat A"
    /** Attestations-tab per-role process-log flags. When true, buildOrderAgreement
     *  anchors the matching figaro-merchant-process-v1 / figaro-courier-process-v1
     *  clause in this order's agreement so the per-role attestation flow has an
     *  inclusion-proof anchor at runtime. */
    merchantProcessIncluded?: boolean;
    courierProcessIncluded?: boolean;
    [extra: string]: string | string[] | boolean | Array<Record<string, string>> | undefined; // extensible
}

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
