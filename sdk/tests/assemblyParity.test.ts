/**
 * Assembly parity vectors — the cross-language lock for the composition tree
 * and the two-key provenance leaf.
 *
 * The SDK builds an assembly's `assemblyHash` (the merkle root over its
 * agreement leaves and its assembly-terms leaf), each agreement's
 * membership proof, and the provenance leaf every instantiated order
 * carries. `UsageCounter` rebuilds the provenance leaf from the two keys and
 * verifies the agreement leaf under `assemblyHash`; the guest does the
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
    computeAssemblyLeaf,
    ASSEMBLY_TERMS_LEAF_KEY,
    agreementHashOf,
    buildRegisteredClauseInclusionProof,
    buildAgreementInclusionProof,
    agreementLeafBytes,
    assemblyHashOf,
    type Assembly,
    type RegisteredAgreement,
} from "../src/assembly.js";
import {
    hashClauseData,
    PROVENANCE_LEAF_KEY,
    buildMerkleRoot,
    canonicalize,
    computeProvenanceLeaf,
    sortLeaves,
    computeClauseLeaf,
    provenanceContentRef,
    provenanceLeafBytes,
    verifyInclusionProof,
} from "../src/agreement.js";
import {
    ASSEMBLY_ONE, ASSEMBLY_THREE, ASSEMBLY_TWO, REGISTERED_DESIGN, REGISTERED_ONE, REGISTERED_THREE,
} from "./assemblyVectors.js";

const FIXTURE_PATH = path.resolve(__dirname, "../../test/fixtures/assembly-vectors.json");

const utf8 = (hex: Hex): string => Buffer.from(hex.slice(2), "hex").toString("utf8");

const SHAPE =
    "agreements[]: { label, agreementHash, clauses[] } — clauses[j]: { clauseKey, fillsBytes, fillsHash, leaf, " +
    "membershipProof }: fillsBytes is the canonical JSON of the designer's fills for that clause, fillsHash = " +
    "keccak256(fillsBytes), leaf = keccak256(keccak256(clauseKey ‖ fillsHash)), membershipProof is the sorted-pair " +
    "proof of leaf under agreementHash, and agreementHash is the sorted-pair merkle root over every clause leaf " +
    "(a one-clause agreement's hash is its leaf). assemblies[]: { label, assemblyHash, entries[], terms|null }. " +
    "slots[i]: { id, agreementHash, agreementBytes, slotContentHash, leaf, membershipProof, provenance } — " +
    "agreementBytes is the canonical JSON {\"clauses\":{…},\"slot\":i}, slotContentHash = keccak256(agreementBytes), " +
    "leaf = keccak256(keccak256(assemblyLeafDomain ‖ agreementHash ‖ slotContentHash)) with assemblyLeafDomain = keccak256(\"figaro-assembly-leaf\"), the assembly tree's own leaf shape (the terms leaf takes it too), membershipProof is the sorted-pair proof of leaf " +
    "under assemblyHash. terms: { leafKey (keccak256(\"figaro-assembly-terms\")), termsBytes (canonical JSON of " +
    "assemblyClauses), clauseDataHash, leaf } or null when no assembly-scoped clause is composed. " +
    "provenance: { leafKey (keccak256(\"figaro-agreement-provenance\")), agreementHash, assemblyHash, clauseData " +
    "(canonical JSON {\"agreementHash\":\"0x…\",\"assemblyHash\":\"0x…\"}, lowercase hex), clauseDataHash = " +
    "keccak256(clauseData), leaf = keccak256(keccak256(leafKey ‖ clauseDataHash)) }. assemblyHash is the " +
    "sorted-pair merkle root over every entry leaf and the terms leaf; a one-leaf tree's root is its leaf.";

function agreementVector(label: string, composed: RegisteredAgreement) {
    return {
        label,
        agreementHash: agreementHashOf(composed),
        clauses: Object.entries(composed.clauses).map(([clauseKey, fills]) => {
            const { leaf, proof, fillsHash } = buildRegisteredClauseInclusionProof(composed, clauseKey as Hex);
            return { clauseKey, fillsBytes: canonicalize(fills), fillsHash, leaf, membershipProof: proof };
        }),
    };
}

function assemblyVector(label: string, assembly: Assembly) {
    const assemblyHash = assemblyHashOf(assembly);
    const terms = assembly.assemblyClauses && Object.keys(assembly.assemblyClauses).length > 0
        ? (() => {
            const termsBytes = canonicalize(assembly.assemblyClauses);
            return {
                leafKey: ASSEMBLY_TERMS_LEAF_KEY,
                termsBytes,
                clauseDataHash: keccak256(toHex(termsBytes)),
                leaf: computeAssemblyLeaf(ASSEMBLY_TERMS_LEAF_KEY, hashClauseData({ clause: ASSEMBLY_TERMS_LEAF_KEY, data: assembly.assemblyClauses })),
            };
        })()
        : null;
    return {
        label,
        assemblyHash,
        agreements: assembly.agreements.map((entry, i) => {
            const { leaf, proof, slotContentHash } = buildAgreementInclusionProof(assembly, i);
            const clauseData = utf8(provenanceLeafBytes(entry.agreementHash, assemblyHash));
            return {
                id: entry.id,
                agreementHash: entry.agreementHash,
                agreementBytes: utf8(agreementLeafBytes(entry, i)),
                slotContentHash,
                leaf,
                membershipProof: proof,
                provenance: {
                    leafKey: PROVENANCE_LEAF_KEY,
                    agreementHash: entry.agreementHash,
                    assemblyHash,
                    clauseData,
                    clauseDataHash: provenanceContentRef(entry.agreementHash, assemblyHash),
                    leaf: computeProvenanceLeaf(entry.agreementHash, assemblyHash),
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
            agreementVector("three-clauses", REGISTERED_THREE),
            agreementVector("one-clause", REGISTERED_ONE),
            agreementVector("two-clauses-and-a-design", REGISTERED_DESIGN),
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
                expect(computeClauseLeaf({ clause: c.clauseKey, dataHash: c.fillsHash })).toBe(c.leaf);
                expect(verifyInclusionProof(a.agreementHash, c.leaf, c.membershipProof)).toBe(true);
            }
            expect(buildMerkleRoot(sortLeaves(a.clauses.map((c: { leaf: Hex }) => c.leaf)))).toBe(a.agreementHash);
        }
        for (const asm of frozen.assemblies) {
            for (const entry of asm.agreements) {
                expect(keccak256(toHex(entry.agreementBytes))).toBe(entry.slotContentHash);
                expect(computeAssemblyLeaf(entry.agreementHash, entry.slotContentHash)).toBe(entry.leaf);
                expect(verifyInclusionProof(asm.assemblyHash, entry.leaf, entry.membershipProof)).toBe(true);
                expect(keccak256(toHex(entry.provenance.clauseData))).toBe(entry.provenance.clauseDataHash);
                expect(computeClauseLeaf({ clause: entry.provenance.leafKey, dataHash: entry.provenance.clauseDataHash }))
                    .toBe(entry.provenance.leaf);
            }
            const leaves = [...asm.agreements.map((entry: { leaf: Hex }) => entry.leaf), ...(asm.terms ? [asm.terms.leaf] : [])];
            if (asm.terms) {
                expect(keccak256(toHex(asm.terms.termsBytes))).toBe(asm.terms.clauseDataHash);
                expect(computeAssemblyLeaf(asm.terms.leafKey, asm.terms.clauseDataHash)).toBe(asm.terms.leaf);
            }
            expect(buildMerkleRoot(sortLeaves(leaves))).toBe(asm.assemblyHash);
        }
    });

    it("a membership proof does not verify under another assembly's root", () => {
        const two = assemblyHashOf(ASSEMBLY_TWO);
        const { leaf, proof } = buildAgreementInclusionProof(ASSEMBLY_THREE, 2);
        expect(verifyInclusionProof(assemblyHashOf(ASSEMBLY_THREE), leaf, proof)).toBe(true);
        expect(verifyInclusionProof(two, leaf, proof)).toBe(false);
    });
});
