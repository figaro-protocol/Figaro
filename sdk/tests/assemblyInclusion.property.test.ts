/**
 * Property tests for the composition tree and the agreement key: every order
 * slot's membership proof verifies under its own assembly's root and under
 * no other; the agreement key ignores editorial prose and moves with any
 * clause value; the two-key provenance bytes decode back to their keys.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
    agreementKeyOf,
    buildSlotInclusionProof,
    templateCompositionHash,
} from "../src/assembly.js";
import { decodeProvenanceContent, provenanceSectionBytes, verifyInclusionProof } from "../src/agreement.js";
import { bytes32Arb, composedAgreementArb, templateArb } from "./propertyArbs.js";

describe("the composition tree", () => {
    it("every order slot's membership proof verifies under its assembly's root", () => {
        fc.assert(fc.property(templateArb, (template) => {
            const root = templateCompositionHash(template);
            template.agreements.forEach((_, i) => {
                const { leaf, proof } = buildSlotInclusionProof(template, i);
                expect(verifyInclusionProof(root, leaf, proof)).toBe(true);
            });
        }));
    });

    it("an order slot's proof does not verify under a different assembly's root", () => {
        fc.assert(fc.property(templateArb, templateArb, (a, b) => {
            const rootA = templateCompositionHash(a);
            const rootB = templateCompositionHash(b);
            fc.pre(rootA !== rootB);
            const { leaf, proof } = buildSlotInclusionProof(a, 0);
            expect(verifyInclusionProof(rootB, leaf, proof)).toBe(false);
        }));
    });

    it("editorial prose never moves the root", () => {
        fc.assert(fc.property(templateArb, fc.string(), (template, name) => {
            expect(templateCompositionHash({ ...template, name } as typeof template)).toBe(templateCompositionHash(template));
        }));
    });
});

describe("the agreement key", () => {
    it("ignores the editorial fields", () => {
        fc.assert(fc.property(composedAgreementArb, fc.string(), (doc, description) => {
            expect(agreementKeyOf({ ...doc, description, name: `${doc.name ?? ""}!` })).toBe(agreementKeyOf({ clauses: doc.clauses }));
        }));
    });

    it("moves with any clause value", () => {
        fc.assert(fc.property(composedAgreementArb, (doc) => {
            const [first] = Object.keys(doc.clauses) as `0x${string}`[];
            const changed = { clauses: { ...doc.clauses, [first]: { ...doc.clauses[first], __moved: true } } };
            expect(agreementKeyOf(changed)).not.toBe(agreementKeyOf(doc));
        }));
    });
});

describe("the two-key provenance bytes", () => {
    it("decode back to the two keys they name", () => {
        fc.assert(fc.property(bytes32Arb, bytes32Arb, (agreementKey, compositionHash) => {
            expect(decodeProvenanceContent(provenanceSectionBytes(agreementKey, compositionHash)))
                .toEqual({ agreementKey, compositionHash });
        }));
    });
});
