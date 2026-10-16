/**
 * Property tests for the composition tree and the agreement key: every agreement
 * own membership proof verifies under its own assembly's root and under
 * no other; every composed clause's proof verifies under its own agreement
 * key and under no other; the agreement key ignores editorial prose and
 * moves with any clause value; the two-key provenance bytes decode back to
 * their keys.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
    agreementKeyOf,
    buildClauseInclusionProof,
    buildAgreementInclusionProof,
    assemblyCompositionHash,
} from "../src/assembly.js";
import { decodeProvenanceContent, provenanceSectionBytes, verifyInclusionProof } from "../src/agreement.js";
import { bytes32Arb, composedAgreementArb, assemblyArb } from "./propertyArbs.js";

describe("the composition tree", () => {
    it("every agreement's membership proof verifies under its assembly's root", () => {
        fc.assert(fc.property(assemblyArb, (assembly) => {
            const root = assemblyCompositionHash(assembly);
            assembly.agreements.forEach((_, i) => {
                const { leaf, proof } = buildAgreementInclusionProof(assembly, i);
                expect(verifyInclusionProof(root, leaf, proof)).toBe(true);
            });
        }));
    });

    it("an agreement's proof does not verify under a different assembly's root", () => {
        fc.assert(fc.property(assemblyArb, assemblyArb, (a, b) => {
            const rootA = assemblyCompositionHash(a);
            const rootB = assemblyCompositionHash(b);
            fc.pre(rootA !== rootB);
            const { leaf, proof } = buildAgreementInclusionProof(a, 0);
            expect(verifyInclusionProof(rootB, leaf, proof)).toBe(false);
        }));
    });

    it("editorial prose never moves the root", () => {
        fc.assert(fc.property(assemblyArb, fc.string(), (assembly, name) => {
            expect(assemblyCompositionHash({ ...assembly, name } as typeof assembly)).toBe(assemblyCompositionHash(assembly));
        }));
    });
});

describe("the agreement key", () => {
    it("every composed clause's membership proof verifies under the agreement key", () => {
        fc.assert(fc.property(composedAgreementArb, (doc) => {
            const key = agreementKeyOf(doc);
            for (const clauseKey of Object.keys(doc.clauses) as `0x${string}`[]) {
                const { leaf, proof } = buildClauseInclusionProof(doc, clauseKey);
                expect(verifyInclusionProof(key, leaf, proof)).toBe(true);
            }
        }));
    });

    it("a clause's proof does not verify under a different agreement's key", () => {
        fc.assert(fc.property(composedAgreementArb, composedAgreementArb, (a, b) => {
            const keyA = agreementKeyOf(a);
            const keyB = agreementKeyOf(b);
            fc.pre(keyA !== keyB);
            const [first] = Object.keys(a.clauses) as `0x${string}`[];
            const { leaf, proof } = buildClauseInclusionProof(a, first);
            expect(verifyInclusionProof(keyB, leaf, proof)).toBe(false);
        }));
    });

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
