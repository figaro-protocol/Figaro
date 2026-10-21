/**
 * Property-based merkle inclusion (fast-check) — for ANY committed field set
 * (arbitrary valid agreements: unique clause keys, arbitrary versions and
 * JSON-safe data), every clause's inclusion proof verifies against the
 * computed `checkoutHash` root; the root is clause-order-insensitive; and a
 * tampered clause can never reuse the original proof.
 *
 * Complements (never replaces) the fixture suite in `agreement.test.ts`.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
    buildSignedClauseInclusionProof,
    computeCheckoutHash,
    computeClauseLeaf,
    verifyInclusionProof,
    type Agreement,
} from "../src/agreement.js";
import { agreementArb } from "./propertyArbs.js";

describe("agreement merkle — property inclusion", () => {
    it("every clause of any agreement proves inclusion against the computed root", () => {
        fc.assert(
            fc.property(agreementArb(1), (agreement) => {
                const root = computeCheckoutHash(agreement);
                for (const clauseEntry of agreement.clauses) {
                    const { leaf, proof } = buildSignedClauseInclusionProof(agreement, clauseEntry.clause);
                    expect(leaf).toBe(computeClauseLeaf(clauseEntry));
                    expect(verifyInclusionProof(root, leaf, proof)).toBe(true);
                }
            }),
        );
    });

    it("the root is insensitive to clause order (identity is the SET of committed clauseEntries)", () => {
        const shuffledPairArb = agreementArb(1).chain((agreement) =>
            fc
                .shuffledSubarray(agreement.clauses, {
                    minLength: agreement.clauses.length,
                    maxLength: agreement.clauses.length,
                })
                .map((clauseEntries) => ({ agreement, shuffled: { ...agreement, clauseEntries } as Agreement })),
        );
        fc.assert(
            fc.property(shuffledPairArb, ({ agreement, shuffled }) => {
                expect(computeCheckoutHash(shuffled)).toBe(computeCheckoutHash(agreement));
            }),
        );
    });

    it("a tampered clause's original proof never verifies against the tampered root", () => {
        const withIndexArb = agreementArb(1).chain((agreement) =>
            fc
                .integer({ min: 0, max: agreement.clauses.length - 1 })
                .map((i) => ({ agreement, i })),
        );
        fc.assert(
            fc.property(withIndexArb, ({ agreement, i }) => {
                const target = agreement.clauses[i];
                const { leaf, proof } = buildSignedClauseInclusionProof(agreement, target.clause);
                // Tamper with the committed data of ONE clause ("__tampered" is
                // longer than any generated key, so it is always a real change).
                const tampered: Agreement = {
                    ...agreement,
                    clauses: agreement.clauses.map((s, j) =>
                        j === i ? { ...s, data: { ...s.data, __tampered: 1 } } : s,
                    ),
                };
                const tamperedRoot = computeCheckoutHash(tampered);
                // The tampered tree commits to different bytes…
                expect(computeClauseLeaf(tampered.clauses[i])).not.toBe(leaf);
                // …so the original leaf + proof can never verify against it.
                expect(verifyInclusionProof(tamperedRoot, leaf, proof)).toBe(false);
            }),
        );
    });
});
