/**
 * provenanceLeaf.test.ts — the agreement format's reserved leaf. An agreement
 * names the registered agreement and the registered assembly it instantiates
 * through one leaf whose key is a constant of the format
 * (`PROVENANCE_LEAF_KEY`) and whose bytes are reproduced from the two keys —
 * never a clause, never a registry read.
 */
import { keccak256, toHex, concat } from "viem";
import { describe, expect, it } from "vitest";
import {
    PROVENANCE_LEAF_KEY,
    PROVENANCE_LEAF_LABEL,
    agreementLeaves,
    buildProvenanceInclusionProof,
    buildSignedClauseInclusionProof,
    computeAgreementHash,
    computeProvenanceLeaf,
    computeClauseLeaf,
    provenanceLeafBytes,
    provenanceContentRef,
    provenanceLeafAttestation,
    decodeProvenanceContent,
    verifyInclusionProof,
    type Agreement,
} from "../src/agreement.js";

const K = (label: string): `0x${string}` => keccak256(toHex(label));

const COMPOSITION = "0x1111111111111111111111111111111111111111111111111111111111111111" as const;
const AGREEMENT = "0x2222222222222222222222222222222222222222222222222222222222222222" as const;
const bare: Agreement = {
    version: "a1",
    buyer: "0x0000000000000000000000000000000000000001",
    seller: "0x0000000000000000000000000000000000000002",
    sections: [
        { clause: K("figaro-commerce"), data: { payment: "10", currency: "0x00" } },
        { clause: K("figaro-topology"), data: { parentOrderHashes: [] } },
    ],
};
const withDesign: Agreement = { ...bare, provenance: { agreementKey: AGREEMENT, compositionHash: COMPOSITION } };

describe("the reserved provenance leaf", () => {
    it("keys on the hash of the label, a shape no registered clause key can take", () => {
        expect(PROVENANCE_LEAF_KEY).toBe(keccak256(toHex(PROVENANCE_LEAF_LABEL)));
    });

    it("commits exactly the bytes the counter reproduces: both keys, lowercase, canonical JSON", () => {
        const upper = (h: string) => h.toUpperCase().replace("0X", "0x") as `0x${string}`;
        expect(provenanceLeafBytes(upper(AGREEMENT), upper(COMPOSITION))).toBe(
            toHex(new TextEncoder().encode(`{"agreementKey":"${AGREEMENT}","compositionHash":"${COMPOSITION}"}`)),
        );
        expect(computeProvenanceLeaf(AGREEMENT, COMPOSITION)).toBe(
            keccak256(keccak256(concat([PROVENANCE_LEAF_KEY, keccak256(provenanceLeafBytes(AGREEMENT, COMPOSITION))]))),
        );
        // The two keys are not interchangeable.
        expect(computeProvenanceLeaf(COMPOSITION, AGREEMENT)).not.toBe(computeProvenanceLeaf(AGREEMENT, COMPOSITION));
    });

    it("enters the root: an agreement that names its design hashes differently from the same terms without one", () => {
        expect(computeAgreementHash(withDesign)).not.toBe(computeAgreementHash(bare));
        expect(agreementLeaves(withDesign)).toHaveLength(3);
        expect(agreementLeaves(withDesign)).toContain(computeProvenanceLeaf(AGREEMENT, COMPOSITION));
    });

    it("is provable under the signed root, beside every clause's own proof", () => {
        const root = computeAgreementHash(withDesign);
        const { leaf, proof } = buildProvenanceInclusionProof(withDesign);
        expect(leaf).toBe(computeProvenanceLeaf(AGREEMENT, COMPOSITION));
        expect(verifyInclusionProof(root, leaf, proof)).toBe(true);
        // A wrong agreement key in the provenance bytes derives a leaf that is not in the tree.
        expect(verifyInclusionProof(root, computeProvenanceLeaf(`0x${"33".repeat(32)}`, COMPOSITION), proof)).toBe(false);
        const clauseEntry = buildSignedClauseInclusionProof(withDesign, K("figaro-commerce"));
        expect(clauseEntry.leaf).toBe(computeClauseLeaf(withDesign.sections[0]));
        expect(verifyInclusionProof(root, clauseEntry.leaf, clauseEntry.proof)).toBe(true);
    });

    it("refuses a provenance key that is not 32 bytes, as the counter's bytes32 does", () => {
        expect(() => provenanceLeafBytes("0x1234", COMPOSITION)).toThrow(/agreementKey is not a 32-byte/);
        expect(() => provenanceLeafBytes(AGREEMENT, "0x1234")).toThrow(/compositionHash is not a 32-byte/);
        expect(() => computeAgreementHash({ ...bare, provenance: { agreementKey: AGREEMENT, compositionHash: "0xzz" } })).toThrow(/32-byte/);
    });

    it("refuses to prove a design the agreement does not name", () => {
        expect(() => buildProvenanceInclusionProof(bare)).toThrow(/names no assembly/);
    });
});

describe("attesting the provenance leaf", () => {
    it("hands the existing attest helpers the reserved key, the leaf's fingerprint, its proof and its content ref", () => {
        const inputs = provenanceLeafAttestation(withDesign);
        expect(inputs.clauseId).toBe(PROVENANCE_LEAF_KEY);
        expect(inputs.clauseDataHash).toBe(keccak256(provenanceLeafBytes(AGREEMENT, COMPOSITION)));
        expect(inputs.contentRef).toBe(inputs.clauseDataHash);
        expect(inputs.contentRef).toBe(provenanceContentRef(AGREEMENT, COMPOSITION));
        expect(inputs.stage).toBe(0);
        // The coordinator's leaf shape over (clauseId, clauseDataHash) opens against the signed root.
        const leaf = keccak256(keccak256(concat([inputs.clauseId, inputs.clauseDataHash])));
        expect(verifyInclusionProof(computeAgreementHash(withDesign), leaf, inputs.proof)).toBe(true);
    });

    it("refuses an agreement that names no assembly", () => {
        expect(() => provenanceLeafAttestation(bare)).toThrow(/names no assembly/);
    });

    it("decodes the leaf's bytes back to both keys only when they are the format's bytes exactly", () => {
        expect(decodeProvenanceContent(provenanceLeafBytes(AGREEMENT, COMPOSITION)))
            .toEqual({ agreementKey: AGREEMENT, compositionHash: COMPOSITION });
        const enc = (text: string) => toHex(new TextEncoder().encode(text));
        expect(decodeProvenanceContent(enc(`{ "agreementKey": "${AGREEMENT}", "compositionHash": "${COMPOSITION}" }`))).toBeNull();
        expect(decodeProvenanceContent(enc(`{"agreementKey":"0x${"AB".repeat(32)}","compositionHash":"${COMPOSITION}"}`))).toBeNull();
        // The single-key bytes, and the keys in the wrong order, are not the format's.
        expect(decodeProvenanceContent(enc(`{"compositionHash":"${COMPOSITION}"}`))).toBeNull();
        expect(decodeProvenanceContent(enc(`{"compositionHash":"${COMPOSITION}","agreementKey":"${AGREEMENT}"}`))).toBeNull();
        expect(decodeProvenanceContent(toHex(new TextEncoder().encode("not json")))).toBeNull();
        expect(decodeProvenanceContent("0xzz" as `0x${string}`)).toBeNull();
    });
});
