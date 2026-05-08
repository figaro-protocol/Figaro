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