/**
 * Property tests for the composition tree and the agreement hash: every agreement
 * own membership proof verifies under its own assembly's root and under
 * no other; every composed clause's proof verifies under its own agreement
 * hash and under no other; the agreement hash ignores editorial prose and
 * moves with any clause value; the two-key provenance bytes decode back to
 * their keys.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
    agreementHashOf,
    buildRegisteredClauseInclusionProof,
    buildAgreementInclusionProof,
    assemblyCompositionHash,
} from "../src/assembly.js";
import { decodeProvenanceContent, provenanceLeafBytes, verifyInclusionProof } from "../src/agreement.js";
import { bytes32Arb, registeredAgreementArb, assemblyArb } from "./propertyArbs.js";

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

describe("the agreement hash", () => {
    it("every composed clause's membership proof verifies under the agreement hash", () => {
        fc.assert(fc.property(registeredAgreementArb, (doc) => {
            const key = agreementHashOf(doc);
            for (const clauseKey of Object.keys(doc.clauses) as `0x${string}`[]) {
                const { leaf, proof } = buildRegisteredClauseInclusionProof(doc, clauseKey);
                expect(verifyInclusionProof(key, leaf, proof)).toBe(true);
            }
        }));
    });

    it("a clause's proof does not verify under a different agreement's hash", () => {
        fc.assert(fc.property(registeredAgreementArb, registeredAgreementArb, (a, b) => {
            const keyA = agreementHashOf(a);
            const keyB = agreementHashOf(b);
            fc.pre(keyA !== keyB);
            const [first] = Object.keys(a.clauses) as `0x${string}`[];
            const { leaf, proof } = buildRegisteredClauseInclusionProof(a, first);
            expect(verifyInclusionProof(keyB, leaf, proof)).toBe(false);
        }));
    });

    it("ignores the editorial fields", () => {
        fc.assert(fc.property(registeredAgreementArb, fc.string(), (doc, description) => {
            expect(agreementHashOf({ ...doc, description, name: `${doc.name ?? ""}!` })).toBe(agreementHashOf({ clauses: doc.clauses }));
        }));
    });

    it("moves with any clause value", () => {
        fc.assert(fc.property(registeredAgreementArb, (doc) => {
            const [first] = Object.keys(doc.clauses) as `0x${string}`[];
            const changed = { clauses: { ...doc.clauses, [first]: { ...doc.clauses[first], __moved: true } } };
            expect(agreementHashOf(changed)).not.toBe(agreementHashOf(doc));
        }));
    });
});

describe("the two-key provenance bytes", () => {
    it("decode back to the two keys they name", () => {
        fc.assert(fc.property(bytes32Arb, bytes32Arb, (agreementHash, compositionHash) => {
            expect(decodeProvenanceContent(provenanceLeafBytes(agreementHash, compositionHash)))
                .toEqual({ agreementHash, compositionHash });
        }));
    });
});
