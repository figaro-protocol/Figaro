/**
 * provenanceLeaf.test.ts — the agreement format's reserved leaf. An agreement
 * names the registered assembly it instantiates through one leaf whose key is
 * a constant of the format (`PROVENANCE_LEAF_KEY`) and whose bytes are
 * reproduced from the composition hash — never a clause, never a registry read.
 */
import { keccak256, toHex, concat } from "viem";
import { describe, expect, it } from "vitest";
import {
    PROVENANCE_LEAF_KEY,
    PROVENANCE_LEAF_LABEL,
    agreementLeaves,
    buildProvenanceInclusionProof,
    buildSectionInclusionProof,
    computeAgreementHash,
    computeProvenanceLeaf,
    computeSectionLeaf,
    provenanceSectionBytes,
    provenanceContentRef,
    provenanceLeafAttestation,
    decodeProvenanceContent,
    verifyInclusionProof,
    type Agreement,
} from "../src/agreement.js";

const COMPOSITION = "0x1111111111111111111111111111111111111111111111111111111111111111" as const;
const bare: Agreement = {
    version: "a1",
    buyer: "0x0000000000000000000000000000000000000001",
    seller: "0x0000000000000000000000000000000000000002",
    sections: [
        { clause: "figaro-commerce", version: 1, data: { payment: "10", currency: "0x00" } },
        { clause: "figaro-topology", version: 1, data: { parentOrderHashes: [] } },
    ],
};
const withDesign: Agreement = { ...bare, provenance: COMPOSITION };

describe("the reserved provenance leaf", () => {
    it("keys on the hash of the label, a shape no registered clause key can take", () => {
        expect(PROVENANCE_LEAF_KEY).toBe(keccak256(toHex(PROVENANCE_LEAF_LABEL)));
    });

    it("commits exactly the bytes the counter reproduces: {\"compositionHash\":\"0x…\"} in lowercase", () => {
        const upper = COMPOSITION.toUpperCase().replace("0X", "0x") as `0x${string}`;
        expect(provenanceSectionBytes(upper)).toBe(toHex(new TextEncoder().encode(`{"compositionHash":"${COMPOSITION}"}`)));
        expect(computeProvenanceLeaf(COMPOSITION)).toBe(
            keccak256(keccak256(concat([PROVENANCE_LEAF_KEY, keccak256(provenanceSectionBytes(COMPOSITION))]))),
        );
    });

    it("enters the root: an agreement that names its design hashes differently from the same terms without one", () => {
        expect(computeAgreementHash(withDesign)).not.toBe(computeAgreementHash(bare));
        expect(agreementLeaves(withDesign)).toHaveLength(3);
        expect(agreementLeaves(withDesign)).toContain(computeProvenanceLeaf(COMPOSITION));
    });

    it("is provable under the signed root, beside every section's own proof", () => {
        const root = computeAgreementHash(withDesign);
        const { leaf, proof } = buildProvenanceInclusionProof(withDesign);
        expect(leaf).toBe(computeProvenanceLeaf(COMPOSITION));
        expect(verifyInclusionProof(root, leaf, proof)).toBe(true);
        const section = buildSectionInclusionProof(withDesign, "figaro-commerce");
        expect(section.leaf).toBe(computeSectionLeaf(withDesign.sections[0]));
        expect(verifyInclusionProof(root, section.leaf, section.proof)).toBe(true);
    });

    it("refuses a provenance that is not a 32-byte hash, as the counter's bytes32 does", () => {
        expect(() => provenanceSectionBytes("0x1234" as `0x${string}`)).toThrow(/32-byte/);
        expect(() => computeAgreementHash({ ...bare, provenance: "0xzz" as `0x${string}` })).toThrow(/32-byte/);
    });

    it("refuses to prove a design the agreement does not name", () => {
        expect(() => buildProvenanceInclusionProof(bare)).toThrow(/names no assembly/);
    });
});

describe("attesting the provenance leaf", () => {
    it("hands the existing attest helpers the reserved key, the leaf's fingerprint, its proof and its content ref", () => {
        const inputs = provenanceLeafAttestation(withDesign);
        expect(inputs.clauseId).toBe(PROVENANCE_LEAF_KEY);
        expect(inputs.sectionHash).toBe(keccak256(provenanceSectionBytes(COMPOSITION)));
        expect(inputs.contentRef).toBe(inputs.sectionHash);
        expect(inputs.contentRef).toBe(provenanceContentRef(COMPOSITION));
        expect(inputs.stage).toBe(0);
        // The coordinator's leaf shape over (clauseId, sectionHash) opens against the signed root.
        const leaf = keccak256(keccak256(concat([inputs.clauseId, inputs.sectionHash])));
        expect(verifyInclusionProof(computeAgreementHash(withDesign), leaf, inputs.proof)).toBe(true);
    });

    it("refuses an agreement that names no assembly", () => {
        expect(() => provenanceLeafAttestation(bare)).toThrow(/names no assembly/);
    });

    it("decodes the leaf's bytes back to the hash only when they are the format's bytes exactly", () => {
        expect(decodeProvenanceContent(provenanceSectionBytes(COMPOSITION))).toBe(COMPOSITION);
        const spaced = toHex(new TextEncoder().encode(`{ "compositionHash": "${COMPOSITION}" }`));
        expect(decodeProvenanceContent(spaced)).toBeNull();
        const upper = toHex(new TextEncoder().encode(`{"compositionHash":"0x${"AB".repeat(32)}"}`));
        expect(decodeProvenanceContent(upper)).toBeNull();
        expect(decodeProvenanceContent(toHex(new TextEncoder().encode("not json")))).toBeNull();
        expect(decodeProvenanceContent("0xzz" as `0x${string}`)).toBeNull();
    });
});
