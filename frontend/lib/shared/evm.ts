import type { Address, Hex } from "viem";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
export const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;
export const ZERO_PROCESS_ID = ZERO_BYTES32;

/**
 * Case-insensitive equality for any 0x-hex value: addresses (which
 * may carry EIP-55 mixed-case checksums), keccak hashes, schema IDs,
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