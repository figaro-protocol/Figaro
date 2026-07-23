/**
 * Property-based codec round-trips (fast-check) — for arbitrary VALID inputs,
 * decode(encode(x)) is deep-equal to x and re-encoding is byte-stable.
 *
 * Covers the SDK's two encode/decode pairs:
 *   - `serializeCommitmentPayload` / `deserializeCommitmentPayload` (the agent
 *     offer envelope; bigints → hex strings → bigints)
 *   - `serializeAssemblyTemplate` (canonical JSON) / `JSON.parse` — the pinned
 *     template document's reader path, whose integrity check is recomputing
 *     `templateCompositionHash` from the parsed document.
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
import { serializeAssemblyTemplate } from "../src/projection.js";
import { templateCompositionHash, type AssemblyTemplate } from "../src/assembly.js";
import {
    addressArb,
    agreementArb,
    clauseDataArb,
    commitmentArb,
    hexOf,
    uint256Arb,
} from "./propertyArbs.js";

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

/** A template: node 0 is the root; every later node's topology clause parents
 *  it on earlier local ids (acyclic by construction). Editorial prose optional. */
const templateArb: fc.Arbitrary<AssemblyTemplate> = fc
    .integer({ min: 1, max: 4 })
    .chain((n) =>
        fc.record(
            {
                name: fc.string({ maxLength: 16 }),
                summary: fc.string({ maxLength: 24 }),
                agreements: fc.tuple(
                    ...Array.from({ length: n }, (_, i) =>
                        fc.record({
                            id: fc.constant(`order-${i}`),
                            clauses: fc
                                .tuple(
                                    i === 0
                                        ? fc.constant<string[]>([])
                                        : fc.uniqueArray(fc.integer({ min: 0, max: i - 1 }), {
                                              minLength: 1,
                                              maxLength: Math.min(i, 2),
                                          }).map((ps) => ps.map((p) => `order-${p}`)),
                                    clauseDataArb,
                                )
                                .map(([parents, data]) => ({
                                    "figaro-topology": { parentOrderHashes: parents },
                                    "figaro-commerce": data,
                                })),
                        }),
                    ),
                ),
            },
            { requiredKeys: ["agreements"] },
        ),
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

describe("AssemblyTemplate document — property round-trip", () => {
    it("JSON.parse(serialize(t).json) deep-equals t, and the reader's recomputed compositionHash matches", () => {
        fc.assert(
            fc.property(templateArb, (template) => {
                const { json, compositionHash } = serializeAssemblyTemplate(template);
                const parsed = JSON.parse(json) as AssemblyTemplate;
                expect(parsed).toEqual(template);
                // Reader-side integrity check: recompute from the fetched doc.
                expect(templateCompositionHash(parsed)).toBe(compositionHash);
            }),
        );
    });

    it("identity is composition-derived: editorial prose never forks the hash; the composition always does", () => {
        fc.assert(
            fc.property(templateArb, fc.string({ maxLength: 16 }), (template, prose) => {
                const { compositionHash } = serializeAssemblyTemplate(template);
                // Renaming never forks the slug…
                const renamed = { ...template, name: prose, description: prose };
                expect(serializeAssemblyTemplate(renamed).compositionHash).toBe(compositionHash);
                // …but touching the composition always does.
                const grown: AssemblyTemplate = {
                    ...template,
                    agreements: template.agreements.map((a, i) =>
                        i === 0
                            ? { ...a, clauses: { ...a.clauses, "figaro-consent": { doc: prose } } }
                            : a,
                    ),
                };
                expect(serializeAssemblyTemplate(grown).compositionHash).not.toBe(compositionHash);
            }),
        );
    });
});
