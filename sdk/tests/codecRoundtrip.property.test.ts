/**
 * Property-based codec round-trips (fast-check) — for arbitrary VALID inputs,
 * decode(encode(x)) is deep-equal to x and re-encoding is byte-stable.
 *
 * Covers the SDK's two encode/decode pairs:
 *   - `serializeCommitmentPayload` / `deserializeCommitmentPayload` (the agent
 *     offer envelope; bigints → hex strings → bigints)
 *   - `serializeAssembly` (canonical JSON) / `JSON.parse` — the pinned
 *     assembly document's reader path, whose integrity check is recomputing
 *     `assemblyCompositionHash` from the parsed document.
 *
 * Complements (never replaces) the pinned golden vectors in
 * `commitmentPayload.test.ts` and the EIP-712 parity hard gate.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
    deserializeCommitmentPayload,
    serializeCommitmentPayload,
    type CommitmentPayload,
} from "../src/agent/coordination.js";
import { serializeAssembly } from "../src/projection.js";
import { assemblyCompositionHash, type Assembly } from "../src/assembly.js";
import {
    addressArb,
    agreementArb,
    commitmentArb,
    hexOf,
    assemblyArb,
    uint256Arb,
} from "./propertyArbs.js";
import { keyOf } from "./specFixtures.js";

// ── Arbitraries ─────────────────────────────────────────────────────────────

const fundingLegArb = fc.record({
    enabled: fc.boolean(),
    inputToken: addressArb,
    maxInput: uint256Arb,
    permitNonce: uint256Arb,
    permitDeadline: uint256Arb,
    permitSignature: hexOf(65),
    swapData: hexOf(16),
});

const quoteRequestArb = fc.record({
    pricedFields: fc.array(
        fc.record({
            clause: fc.string({ minLength: 1, maxLength: 24 }),
            path: fc.string({ minLength: 1, maxLength: 24 }),
        }),
        { maxLength: 3 },
    ),
});

/** A valid offer envelope at any signing stage: signatures/funding/quote
 *  terms present or absent, agreement data JSON-safe (no bigints). */
const payloadArb: fc.Arbitrary<CommitmentPayload> = fc.record(
    {
        commitment: commitmentArb,
        agreement: agreementArb(0),
        buyerSig: hexOf(65),
        sellerSig: hexOf(65),
        buyerFunding: fundingLegArb,
        quoteRequest: quoteRequestArb,
    },
    { requiredKeys: ["commitment", "agreement"] },
);

// ── Properties ──────────────────────────────────────────────────────────────

describe("CommitmentPayload codec — property round-trip", () => {
    it("deserialize(serialize(p)) deep-equals p, with bigints revived", () => {
        fc.assert(
            fc.property(payloadArb, (payload) => {
                const decoded = deserializeCommitmentPayload(serializeCommitmentPayload(payload));
                expect(decoded).toEqual(payload);
                expect(typeof decoded.commitment.payment).toBe("bigint");
                expect(typeof decoded.commitment.salt).toBe("bigint");
                if (payload.buyerFunding) {
                    expect(typeof decoded.buyerFunding?.maxInput).toBe("bigint");
                }
            }),
        );
    });

    it("re-serialization is byte-stable (serialize ∘ deserialize ∘ serialize = serialize)", () => {
        fc.assert(
            fc.property(payloadArb, (payload) => {
                const wire = serializeCommitmentPayload(payload);
                expect(serializeCommitmentPayload(deserializeCommitmentPayload(wire))).toBe(wire);
            }),
        );
    });
});

describe("Assembly document — property round-trip", () => {
    it("JSON.parse(serialize(t).json) deep-equals t, and the reader's recomputed compositionHash matches", () => {
        fc.assert(
            fc.property(assemblyArb, (assembly) => {
                const { json, compositionHash } = serializeAssembly(assembly);
                const parsed = JSON.parse(json) as Assembly;
                expect(parsed).toEqual(assembly);
                // Reader-side integrity check: recompute from the fetched doc.
                expect(assemblyCompositionHash(parsed)).toBe(compositionHash);
            }),
        );
    });

    it("identity is composition-derived: editorial prose never forks the hash; the composition always does", () => {
        fc.assert(
            fc.property(assemblyArb, fc.string({ maxLength: 16 }), (assembly, prose) => {
                const { compositionHash } = serializeAssembly(assembly);
                // Renaming never forks the slug…
                const renamed = { ...assembly, name: prose, description: prose };
                expect(serializeAssembly(renamed).compositionHash).toBe(compositionHash);
                // …but touching the composition always does.
                const grown: Assembly = {
                    ...assembly,
                    agreements: assembly.agreements.map((a, i) =>
                        i === 0
                            ? { ...a, clauses: { ...a.clauses, [keyOf("figaro-consent")]: { doc: prose } } }
                            : a,
                    ),
                };
                expect(serializeAssembly(grown).compositionHash).not.toBe(compositionHash);
            }),
        );
    });
});
