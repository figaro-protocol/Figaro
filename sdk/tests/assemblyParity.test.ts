/**
 * Assembly parity vectors — the cross-language lock for the composition tree
 * and the two-key provenance leaf.
 *
 * The SDK builds an assembly's `compositionHash` (the merkle root over its
 * order slot leaves and its assembly-terms leaf), each order slot's
 * membership proof, and the provenance leaf every instantiated order
 * carries. `UsageCounter` rebuilds the provenance leaf from the two keys and
 * verifies the order slot leaf under `compositionHash`; the guest does the
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
    buildSlotInclusionProof,
    slotSectionBytes,
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
    "agreements[]: { label, agreementKey, keyBytes } — keyBytes is the canonical JSON {\"clauses\":{…}} " +
    "whose keccak256 is agreementKey. assemblies[]: { label, compositionHash, slots[], terms|null }. " +
    "slots[i]: { id, agreementKey, slotBytes, slotContentHash, leaf, membershipProof, provenance } — " +
    "slotBytes is the canonical JSON {\"clauses\":{…},\"slot\":i}, slotContentHash = keccak256(slotBytes), " +
    "leaf = keccak256(keccak256(agreementKey ‖ slotContentHash)), membershipProof is the sorted-pair proof of leaf " +
    "under compositionHash. terms: { leafKey (keccak256(\"figaro-assembly-terms\")), termsBytes (canonical JSON of " +
    "assemblyClauses), sectionHash, leaf } or null when no assembly-scoped clause is composed. " +
    "provenance: { leafKey (keccak256(\"figaro-agreement-provenance\")), agreementKey, compositionHash, sectionData " +
    "(canonical JSON {\"agreementKey\":\"0x…\",\"compositionHash\":\"0x…\"}, lowercase hex), sectionHash = " +
    "keccak256(sectionData), leaf = keccak256(keccak256(leafKey ‖ sectionHash)) }. compositionHash is the " +
    "sorted-pair merkle root over every slot leaf and the terms leaf; a one-leaf tree's root is its leaf.";

function agreementVector(label: string, composed: ComposedAgreement) {
    return { label, agreementKey: agreementKeyOf(composed), keyBytes: canonicalize({ clauses: composed.clauses }) };
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
        slots: template.agreements.map((slot, i) => {
            const { leaf, proof, slotContentHash } = buildSlotInclusionProof(template, i);
            const sectionData = utf8(provenanceSectionBytes(slot.agreementKey, compositionHash));
            return {
                id: slot.id,
                agreementKey: slot.agreementKey,
                slotBytes: utf8(slotSectionBytes(slot, i)),
                slotContentHash,
                leaf,
                membershipProof: proof,
                provenance: {
                    leafKey: PROVENANCE_LEAF_KEY,
                    agreementKey: slot.agreementKey,
                    compositionHash,
                    sectionData,
                    sectionHash: provenanceContentRef(slot.agreementKey, compositionHash),
                    leaf: computeProvenanceLeaf(slot.agreementKey, compositionHash),
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
            assemblyVector("one-slot", ASSEMBLY_ONE),
            assemblyVector("two-slots", ASSEMBLY_TWO),
            assemblyVector("three-slots-a-parent-edge-and-terms", ASSEMBLY_THREE),
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
            expect(keccak256(toHex(a.keyBytes))).toBe(a.agreementKey);
        }
        for (const asm of frozen.assemblies) {
            for (const slot of asm.slots) {
                expect(keccak256(toHex(slot.slotBytes))).toBe(slot.slotContentHash);
                expect(computeSectionLeaf({ clause: slot.agreementKey, dataHash: slot.slotContentHash })).toBe(slot.leaf);
                expect(verifyInclusionProof(asm.compositionHash, slot.leaf, slot.membershipProof)).toBe(true);
                expect(keccak256(toHex(slot.provenance.sectionData))).toBe(slot.provenance.sectionHash);
                expect(computeSectionLeaf({ clause: slot.provenance.leafKey, dataHash: slot.provenance.sectionHash }))
                    .toBe(slot.provenance.leaf);
            }
            const leaves = [...asm.slots.map((slot: { leaf: Hex }) => slot.leaf), ...(asm.terms ? [asm.terms.leaf] : [])];
            if (asm.terms) {
                expect(keccak256(toHex(asm.terms.termsBytes))).toBe(asm.terms.sectionHash);
                expect(computeSectionLeaf({ clause: asm.terms.leafKey, dataHash: asm.terms.sectionHash })).toBe(asm.terms.leaf);
            }
            expect(buildMerkleRoot(sortLeaves(leaves))).toBe(asm.compositionHash);
        }
    });

    it("a membership proof does not verify under another assembly's root", () => {
        const two = templateCompositionHash(ASSEMBLY_TWO);
        const { leaf, proof } = buildSlotInclusionProof(ASSEMBLY_THREE, 2);
        expect(verifyInclusionProof(templateCompositionHash(ASSEMBLY_THREE), leaf, proof)).toBe(true);
        expect(verifyInclusionProof(two, leaf, proof)).toBe(false);
    });
});
