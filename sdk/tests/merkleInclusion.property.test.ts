/**
 * Property-based merkle inclusion (fast-check) — for ANY committed field set
 * (arbitrary valid agreements: unique clause keys, arbitrary versions and
 * JSON-safe data), every section's inclusion proof verifies against the
 * computed `agreementHash` root; the root is section-order-insensitive; and a
 * tampered section can never reuse the original proof.
 *
 * Complements (never replaces) the fixture suite in `agreement.test.ts`.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
    buildSectionInclusionProof,
    computeAgreementHash,
    computeSectionLeaf,
    verifyInclusionProof,
    type Agreement,
} from "../src/agreement.js";
import { agreementArb } from "./propertyArbs.js";

describe("agreement merkle — property inclusion", () => {
    it("every section of any agreement proves inclusion against the computed root", () => {
        fc.assert(
            fc.property(agreementArb(1), (agreement) => {
                const root = computeAgreementHash(agreement);
                for (const section of agreement.sections) {
                    const { leaf, proof } = buildSectionInclusionProof(agreement, section.clause);
                    expect(leaf).toBe(computeSectionLeaf(section));
                    expect(verifyInclusionProof(root, leaf, proof)).toBe(true);
                }
            }),
        );
    });

    it("the root is insensitive to section order (identity is the SET of committed sections)", () => {
        const shuffledPairArb = agreementArb(1).chain((agreement) =>
            fc
                .shuffledSubarray(agreement.sections, {
                    minLength: agreement.sections.length,
                    maxLength: agreement.sections.length,
                })
                .map((sections) => ({ agreement, shuffled: { ...agreement, sections } as Agreement })),
        );
        fc.assert(
            fc.property(shuffledPairArb, ({ agreement, shuffled }) => {
                expect(computeAgreementHash(shuffled)).toBe(computeAgreementHash(agreement));
            }),
        );
    });

    it("a tampered section's original proof never verifies against the tampered root", () => {
        const withIndexArb = agreementArb(1).chain((agreement) =>
            fc
                .integer({ min: 0, max: agreement.sections.length - 1 })
                .map((i) => ({ agreement, i })),
        );
        fc.assert(
            fc.property(withIndexArb, ({ agreement, i }) => {
                const target = agreement.sections[i];
                const { leaf, proof } = buildSectionInclusionProof(agreement, target.clause);
                // Tamper with the committed data of ONE section ("__tampered" is
                // longer than any generated key, so it is always a real change).
                const tampered: Agreement = {
                    ...agreement,
                    sections: agreement.sections.map((s, j) =>
                        j === i ? { ...s, data: { ...s.data, __tampered: 1 } } : s,
                    ),
                };
                const tamperedRoot = computeAgreementHash(tampered);
                // The tampered tree commits to different bytes…
                expect(computeSectionLeaf(tampered.sections[i])).not.toBe(leaf);
                // …so the original leaf + proof can never verify against it.
                expect(verifyInclusionProof(tamperedRoot, leaf, proof)).toBe(false);
            }),
        );
    });
});
