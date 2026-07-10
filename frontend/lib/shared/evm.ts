import { isAddress, getAddress, type Address, type Hex } from "viem";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
export const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;
// The kernel's root-commitment sentinel — single home is the SDK.
export { ZERO_PROCESS_ID } from "@figaro/core";

/**
 * Case-insensitive equality for any 0x-hex value: addresses (which
 * may carry EIP-55 mixed-case checksums), keccak hashes, clause IDs,
 * merkle leaves. Returns `false` if either side is `null` or
 * `undefined` so call sites can drop their explicit guards.
 *
 * Replaces the inlined `a.toLowerCase() === b.toLowerCase()` pattern
 * that was scattered across the codebase as the de-facto comparison
 * primitive for 0x-hex values.
 */
export function hexEqual(
    a: string | null | undefined,
    b: string | null | undefined,
): boolean {
    if (a == null || b == null) return false;
    return a.toLowerCase() === b.toLowerCase();
}

/**
 * True when a hex string carries no bytes — `null`, `undefined`, `""`, or the
 * bare `"0x"` prefix. Sentinel values like `ZERO_BYTES32` (zero-valued bytes32)
 * carry distinct semantic meaning and should be compared against directly
 * rather than folded in here.
 *
 * Type predicate so call sites can rely on negative narrowing — after
 * `if (isEmptyHex(x)) ...` an `else` branch (or post-guard early return)
 * sees `x` as the non-empty subtype.
 */
export function isEmptyHex<T extends string>(
    hex: T | null | undefined,
): hex is (T & ("" | "0x")) | null | undefined {
    return !hex || hex === "0x";
}

/**
 * True iff `addr` is a 0x-prefixed 20-byte hex string. Format-only: accepts
 * lowercase, valid checksum, AND mixed-case-with-bad-checksum (the last is
 * flagged `checksum-invalid` by `addressIntegrity`, but it's still a
 * syntactically valid 40-hex address). Returns a type predicate so callers can
 * narrow `string` to `` `0x${string}` `` inside an `if` block.
 */
export function isValidAddress(addr: string): addr is `0x${string}` {
    return isAddress(addr, { strict: false });
}

export type AddressIntegrity =
    /** Empty string. */
    | "empty"
    /** Doesn't match the 0x + 40 hex pattern at all. */
    | "not-address"
    /** All-lowercase (checksum not asserted by the user). */
    | "lowercase"
    /** Mixed case AND the EIP-55 checksum is correct. */
    | "checksum-valid"
    /** Mixed case BUT the EIP-55 checksum is wrong — likely typo. */
    | "checksum-invalid"
    /** The all-zero address (passes regex but is never a real token). */
    | "zero";

export function addressIntegrity(addr: string): AddressIntegrity {
    if (!addr) return "empty";
    if (!isAddress(addr, { strict: false })) return "not-address";
    if (hexEqual(addr, ZERO_ADDRESS)) return "zero";
    if (addr === addr.toLowerCase()) return "lowercase";
    try {
        return addr === getAddress(addr) ? "checksum-valid" : "checksum-invalid";
    } catch {
        return "checksum-invalid";
    }
}

/**
 * Encode a byte sequence as a hex string (no `0x` prefix). Replaces the
 * `Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("")`
 * pattern that was reinvented across handoff / encoding / store / dispute /
 * ClientInit. Callers that want a 0x-prefixed value wrap the result.
 */
export function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

/**
 * Decode a hex string (with or without `0x`) to bytes — the inverse of
 * `bytesToHex`. Replaces the per-byte `parseInt` loop that was reinvented
 * across handoff (ecdh, xmtpChannel) and core encoding.
 */
export function hexToBytes(hex: string): Uint8Array {
    const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

/**
 * Truncate the UTF-8 encoding of `text` to 32 bytes (64 hex chars) and
 * return the 0x-prefixed form. Used by mock and synthetic-id paths that
 * need a bytes32-shaped key derived from a label. Does NOT zero-pad —
 * inputs shorter than 32 bytes produce a shorter hex string; callers
 * supply enough entropy to fill the 32 bytes.
 */
export function textToBytes32(text: string): string {
    return `0x${bytesToHex(new TextEncoder().encode(text)).slice(0, 64)}`;
}

/**
 * Normalize a route-param address into the two forms a seller/checkout surface
 * needs together: `lower` (lowercased, for comparisons + keys) and `typed`
 * (the `0x`-typed form, or `undefined` when the param isn't 0x-prefixed).
 */
export function normalizeAddressParam(raw: string): {
    lower: string;
    typed: `0x${string}` | undefined;
} {
    const lower = raw.toLowerCase();
    const typed = lower.startsWith("0x") ? (lower as `0x${string}`) : undefined;
    return { lower, typed };
}