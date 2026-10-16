/**
 * Assembly parity vectors — the cross-language lock for the composition tree
 * and the two-key provenance leaf.
 *
 * The SDK builds an assembly's `compositionHash` (the merkle root over its
 * agreement leaves and its assembly-terms leaf), each agreement's
 * membership proof, and the provenance leaf every instantiated order
 * carries. `UsageCounter` rebuilds the provenance leaf from the two keys and
 * verifies the agreement leaf under `compositionHash`; the guest does the
 * same on the batch path. This file freezes SDK-built bytes, leaves, roots
 * and proofs into `test/fixtures/assembly-vectors.json`; the Solidity and
 * Rust parity tests read it.
 *
 *   1. Regenerate the fixture on `HARVEST_ASSEMBLY_VECTORS=1`.
 *   2. Otherwise, assert the SDK still reproduces the frozen bytes.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { keccak256, toHex, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import {
    ASSEMBLY_TERMS_LEAF_KEY,
    agreementKeyOf,
    buildClauseInclusionProof,
    buildAgreementInclusionProof,
    agreementLeafBytes,
    templateCompositionHash,
    type AssemblyTemplate,
    type ComposedAgreement,
} from "../src/assembly.js";
import {
    PROVENANCE_LEAF_KEY,
    buildMerkleRoot,
    canonicalize,
    computeProvenanceLeaf,
    sortLeaves,
    computeSectionLeaf,
    provenanceContentRef,
    provenanceSectionBytes,
    verifyInclusionProof,
} from "../src/agreement.js";
import {
    ASSEMBLY_ONE, ASSEMBLY_THREE, ASSEMBLY_TWO, COMPOSED_DESIGN, COMPOSED_ONE, COMPOSED_THREE,
} from "./assemblyVectors.js";

const FIXTURE_PATH = path.resolve(__dirname, "../../test/fixtures/assembly-vectors.json");

const utf8 = (hex: Hex): string => Buffer.from(hex.slice(2), "hex").toString("utf8");

const SHAPE =
    "agreements[]: { label, agreementKey, clauses[] } — clauses[j]: { clauseKey, fillsBytes, fillsHash, leaf, " +
    "membershipProof }: fillsBytes is the canonical JSON of the designer's fills for that clause, fillsHash = " +
    "keccak256(fillsBytes), leaf = keccak256(keccak256(clauseKey ‖ fillsHash)), membershipProof is the sorted-pair " +
    "proof of leaf under agreementKey, and agreementKey is the sorted-pair merkle root over every clause leaf " +
    "(a one-clause agreement's key is its leaf). assemblies[]: { label, compositionHash, entries[], terms|null }. " +
    "slots[i]: { id, agreementKey, agreementBytes, slotContentHash, leaf, membershipProof, provenance } — " +
    "agreementBytes is the canonical JSON {\"clauses\":{…},\"slot\":i}, slotContentHash = keccak256(agreementBytes), " +
    "leaf = keccak256(keccak256(agreementKey ‖ slotContentHash)), membershipProof is the sorted-pair proof of leaf " +
    "under compositionHash. terms: { leafKey (keccak256(\"figaro-assembly-terms\")), termsBytes (canonical JSON of " +
    "assemblyClauses), sectionHash, leaf } or null when no assembly-scoped clause is composed. " +
    "provenance: { leafKey (keccak256(\"figaro-agreement-provenance\")), agreementKey, compositionHash, sectionData " +
    "(canonical JSON {\"agreementKey\":\"0x…\",\"compositionHash\":\"0x…\"}, lowercase hex), sectionHash = " +
    "keccak256(sectionData), leaf = keccak256(keccak256(leafKey ‖ sectionHash)) }. compositionHash is the " +
    "sorted-pair merkle root over every entry leaf and the terms leaf; a one-leaf tree's root is its leaf.";

function agreementVector(label: string, composed: ComposedAgreement) {
    return {
        label,
        agreementKey: agreementKeyOf(composed),
        clauses: Object.entries(composed.clauses).map(([clauseKey, fills]) => {
            const { leaf, proof, fillsHash } = buildClauseInclusionProof(composed, clauseKey as Hex);
            return { clauseKey, fillsBytes: canonicalize(fills), fillsHash, leaf, membershipProof: proof };
        }),
    };
}

function assemblyVector(label: string, template: AssemblyTemplate) {
    const compositionHash = templateCompositionHash(template);
    const terms = template.assemblyClauses && Object.keys(template.assemblyClauses).length > 0
        ? (() => {
            const termsBytes = canonicalize(template.assemblyClauses);
            return {
                leafKey: ASSEMBLY_TERMS_LEAF_KEY,
                termsBytes,
                sectionHash: keccak256(toHex(termsBytes)),
                leaf: computeSectionLeaf({ clause: ASSEMBLY_TERMS_LEAF_KEY, data: template.assemblyClauses }),
            };
        })()
        : null;
    return {
        label,
        compositionHash,
        agreements: template.agreements.map((entry, i) => {
            const { leaf, proof, slotContentHash } = buildAgreementInclusionProof(template, i);
            const sectionData = utf8(provenanceSectionBytes(entry.agreementKey, compositionHash));
            return {
                id: entry.id,
                agreementKey: entry.agreementKey,
                agreementBytes: utf8(agreementLeafBytes(entry, i)),
                slotContentHash,
                leaf,
                membershipProof: proof,
                provenance: {
                    leafKey: PROVENANCE_LEAF_KEY,
                    agreementKey: entry.agreementKey,
                    compositionHash,
                    sectionData,
                    sectionHash: provenanceContentRef(entry.agreementKey, compositionHash),
                    leaf: computeProvenanceLeaf(entry.agreementKey, compositionHash),
                },
            };
        }),
        terms,
    };
}

function build() {
    return {
        shape: SHAPE,
        agreements: [
            agreementVector("three-sections", COMPOSED_THREE),
            agreementVector("one-section", COMPOSED_ONE),
            agreementVector("two-sections-and-a-design", COMPOSED_DESIGN),
        ],
        assemblies: [
            assemblyVector("one-agreement", ASSEMBLY_ONE),
            assemblyVector("two-agreements", ASSEMBLY_TWO),
            assemblyVector("three-entries-a-parent-edge-and-terms", ASSEMBLY_THREE),
        ],
    };
}

describe("Assembly parity vectors — the composition tree's lock", () => {
    if (process.env.HARVEST_ASSEMBLY_VECTORS === "1") {
        it("regenerates test/fixtures/assembly-vectors.json", () => {
            mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
            writeFileSync(FIXTURE_PATH, `${JSON.stringify(build(), null, 4)}\n`);
        });
        return;
    }

    it("the SDK reproduces the frozen fixture byte-for-byte", () => {
        expect(existsSync(FIXTURE_PATH), "fixture missing — harvest with HARVEST_ASSEMBLY_VECTORS=1").toBe(true);
        const frozen = readFileSync(FIXTURE_PATH, "utf8");
        expect(`${JSON.stringify(build(), null, 4)}\n`).toBe(frozen);
    });

    it("every frozen value is rebuilt from its bytes the way the two consumers rebuild it", () => {
        const frozen = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
        for (const a of frozen.agreements) {
            for (const c of a.clauses) {
                expect(keccak256(toHex(c.fillsBytes))).toBe(c.fillsHash);
                expect(computeSectionLeaf({ clause: c.clauseKey, dataHash: c.fillsHash })).toBe(c.leaf);
                expect(verifyInclusionProof(a.agreementKey, c.leaf, c.membershipProof)).toBe(true);
            }
            expect(buildMerkleRoot(sortLeaves(a.clauses.map((c: { leaf: Hex }) => c.leaf)))).toBe(a.agreementKey);
        }
        for (const asm of frozen.assemblies) {
            for (const entry of asm.agreements) {
                expect(keccak256(toHex(entry.agreementBytes))).toBe(entry.slotContentHash);
                expect(computeSectionLeaf({ clause: entry.agreementKey, dataHash: entry.slotContentHash })).toBe(entry.leaf);
                expect(verifyInclusionProof(asm.compositionHash, entry.leaf, entry.membershipProof)).toBe(true);
                expect(keccak256(toHex(entry.provenance.sectionData))).toBe(entry.provenance.sectionHash);
                expect(computeSectionLeaf({ clause: entry.provenance.leafKey, dataHash: entry.provenance.sectionHash }))
                    .toBe(entry.provenance.leaf);
            }
            const leaves = [...asm.agreements.map((entry: { leaf: Hex }) => entry.leaf), ...(asm.terms ? [asm.terms.leaf] : [])];
            if (asm.terms) {
                expect(keccak256(toHex(asm.terms.termsBytes))).toBe(asm.terms.sectionHash);
                expect(computeSectionLeaf({ clause: asm.terms.leafKey, dataHash: asm.terms.sectionHash })).toBe(asm.terms.leaf);
            }
            expect(buildMerkleRoot(sortLeaves(leaves))).toBe(asm.compositionHash);
        }
    });

    it("a membership proof does not verify under another assembly's root", () => {
        const two = templateCompositionHash(ASSEMBLY_TWO);
        const { leaf, proof } = buildAgreementInclusionProof(ASSEMBLY_THREE, 2);
        expect(verifyInclusionProof(templateCompositionHash(ASSEMBLY_THREE), leaf, proof)).toBe(true);
        expect(verifyInclusionProof(two, leaf, proof)).toBe(false);
    });
});
