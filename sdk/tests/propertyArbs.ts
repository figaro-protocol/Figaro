/**
 * Shared fast-check arbitraries for the SDK property-based tests — generators
 * of VALID domain inputs (hex shapes, address forms, JSON-safe clause data,
 * unique clause keys) reused by the codec round-trip, checkout conservation,
 * and merkle inclusion properties. Complements (never replaces) the pinned
 * golden vectors and the EIP-712 parity hard gate.
 */
import fc from "fast-check";
import type { Agreement, AgreementSection } from "../src/agreement.js";
import type { Commitment } from "../src/types.js";

/** Fixed-width lowercase hex string of `bytes` bytes (0x-prefixed). */
export function hexOf(bytes: number): fc.Arbitrary<`0x${string}`> {
    return fc
        .bigInt({ min: 0n, max: (1n << BigInt(bytes * 8)) - 1n })
        .map((v) => `0x${v.toString(16).padStart(bytes * 2, "0")}` as `0x${string}`);
}

export const addressArb = hexOf(20);
export const bytes32Arb = hexOf(32);
export const uint256Arb = fc.bigInt({ min: 0n, max: (1n << 256n) - 1n });

/** Object keys that survive the prototype-pollution stripping reviver (the
 *  deserializer DROPS `__proto__`/`constructor`/`prototype` by design, so a
 *  round-trip generator must never emit them). */
const safeKeyArb = fc
    .string({ minLength: 1, maxLength: 8 })
    .filter((k) => !["__proto__", "constructor", "prototype"].includes(k));

/** JSON-safe scalar (no bigints — canonical agreement data carries none, and
 *  no -0/NaN/Infinity, which JSON cannot round-trip). */
const jsonLeafArb = fc.oneof(
    fc.string({ maxLength: 12 }),
    fc.integer(),
    fc.boolean(),
    fc.constant(null),
);

/** A clause section's `data`: a JSON-safe record, one level of nesting. */
export const clauseDataArb: fc.Arbitrary<Record<string, unknown>> = fc.dictionary(
    safeKeyArb,
    fc.oneof(
        jsonLeafArb,
        fc.array(jsonLeafArb, { maxLength: 3 }),
        fc.dictionary(safeKeyArb, jsonLeafArb, { maxKeys: 3 }),
    ),
    { maxKeys: 4 },
);

export const sectionArb: fc.Arbitrary<AgreementSection> = fc.record({
    clause: fc.string({ minLength: 1, maxLength: 24 }),
    version: fc.integer({ min: 1, max: 9 }),
    data: clauseDataArb,
});

/** A valid Agreement: unique clause keys (computeAgreementHash rejects
 *  duplicates), any wallet as buyer/seller. */
export function agreementArb(minSections: number): fc.Arbitrary<Agreement> {
    return fc.record({
        version: fc.constant("a1" as const),
        buyer: addressArb,
        seller: addressArb,
        sections: fc.uniqueArray(sectionArb, {
            selector: (s) => s.clause,
            minLength: minSections,
            maxLength: 6,
        }),
    });
}

/** A fully populated Commitment struct (the shape the kernel's EIP-712
 *  signature covers — every field a valid width). */
export const commitmentArb: fc.Arbitrary<Commitment> = fc.record({
    processId: bytes32Arb,
    buyer: addressArb,
    seller: addressArb,
    currency: addressArb,
    payment: uint256Arb,
    expectedCumulativeValue: uint256Arb,
    agreementHash: bytes32Arb,
    salt: uint256Arb,
    deadline: uint256Arb,
});
