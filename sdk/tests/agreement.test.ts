import { describe, it, expect } from "vitest";
import {
    computeSectionLeaf,
    computeAgreementHash,
    buildSectionInclusionProof,
    verifyInclusionProof,
    type Agreement,
    type AgreementSection,
} from "../src/agreement.js";

const BUYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`;
const SELLER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as `0x${string}`;
const CURRENCY = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as `0x${string}`;

const COMMERCE: AgreementSection = {
    clause: "figaro-commerce",
    version: 1,
    data: { currency: CURRENCY, payment: "1000000000000000000", lineItems: [] },
};
const GEO: AgreementSection = {
    clause: "figaro-geo",
    version: 2,
    data: {
        originGeohash: "dr5reg",
        destinationGeohash: "dr5reh",
        massGrams: 500,
        volumeMl: 1000,
        classOfService: "S",
    },
};
const GHG: AgreementSection = {
    clause: "figaro-ghg-iso-14064",
    version: 1,
    // Standard identity lives in the clauseId; data carries only scope.
    // Category-2 clauses use ABI encoding for sectionData — the clause values
    // must be encoder-valid.
    data: { scope: 1 },
};
const MODALITIES: AgreementSection = {
    clause: "figaro-modalities",
    version: 1,
    data: { modality: "pickup" },
};

function agreement(sections: AgreementSection[]): Agreement {
    return {
        version: "a1",
        buyer: BUYER,
        seller: SELLER,
        sections: [...sections].sort((a, b) => a.clause.localeCompare(b.clause)),
    };
}

describe("computeSectionLeaf", () => {
    it("returns a bytes32 hex", () => {
        expect(computeSectionLeaf(COMMERCE)).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it("is deterministic for the same section", () => {
        expect(computeSectionLeaf(COMMERCE)).toBe(computeSectionLeaf(COMMERCE));
    });

    it("changes when section data changes", () => {
        const modified = { ...COMMERCE, data: { ...COMMERCE.data, payment: "2000000000000000000" } };
        expect(computeSectionLeaf(COMMERCE)).not.toBe(computeSectionLeaf(modified));
    });

    it("changes when clause key changes with identical data", () => {
        const leafA = computeSectionLeaf({ clause: "a", version: 1, data: { x: 1 } });
        const leafB = computeSectionLeaf({ clause: "b", version: 1, data: { x: 1 } });
        expect(leafA).not.toBe(leafB);
    });
});

describe("computeAgreementHash", () => {
    it("empty agreement yields zero root", () => {
        expect(computeAgreementHash(agreement([]))).toBe(`0x${"0".repeat(64)}`);
    });

    it("single-section root equals the leaf", () => {
        const a = agreement([COMMERCE]);
        expect(computeAgreementHash(a)).toBe(computeSectionLeaf(COMMERCE));
    });

    it("is deterministic and order-insensitive", () => {
        const h1 = computeAgreementHash(agreement([COMMERCE, GEO, GHG]));
        const h2 = computeAgreementHash(agreement([GHG, COMMERCE, GEO]));
        expect(h1).toBe(h2);
    });

    it("changes when any section changes", () => {
        const h1 = computeAgreementHash(agreement([COMMERCE, GHG]));
        const modified = { ...GHG, data: { ...GHG.data, scope: 2 } };
        const h2 = computeAgreementHash(agreement([COMMERCE, modified]));
        expect(h1).not.toBe(h2);
    });

    it("rejects agreements with duplicate clause keys", () => {
        const dup = { ...GHG, data: { ...GHG.data, scope: 2 } };
        expect(() => computeAgreementHash(agreement([GHG, dup])))
            .toThrow(/Duplicate clause keys.*figaro-ghg-iso-14064/);
    });
});

describe("buildSectionInclusionProof + verifyInclusionProof", () => {
    it("single section: empty proof verifies", () => {
        const a = agreement([COMMERCE]);
        const root = computeAgreementHash(a);
        const { leaf, proof } = buildSectionInclusionProof(a, "figaro-commerce");
        expect(proof).toHaveLength(0);
        expect(verifyInclusionProof(root, leaf, proof)).toBe(true);
    });

    it("two sections: proof has one sibling per section", () => {
        const a = agreement([COMMERCE, GHG]);
        const root = computeAgreementHash(a);
        for (const s of a.sections) {
            const { leaf, proof } = buildSectionInclusionProof(a, s.clause);
            expect(proof).toHaveLength(1);
            expect(verifyInclusionProof(root, leaf, proof)).toBe(true);
        }
    });

    it("four sections: every section proves inclusion", () => {
        const a = agreement([COMMERCE, GEO, GHG, MODALITIES]);
        const root = computeAgreementHash(a);
        for (const s of a.sections) {
            const { leaf, proof } = buildSectionInclusionProof(a, s.clause);
            expect(verifyInclusionProof(root, leaf, proof)).toBe(true);
        }
    });

    it("odd section count: promoted leaf proves inclusion", () => {
        const a = agreement([COMMERCE, GEO, GHG]);
        const root = computeAgreementHash(a);
        for (const s of a.sections) {
            const { leaf, proof } = buildSectionInclusionProof(a, s.clause);
            expect(verifyInclusionProof(root, leaf, proof)).toBe(true);
        }
    });

    it("rejects a proof against a different root", () => {
        const a1 = agreement([COMMERCE, GHG]);
        const a2 = agreement([COMMERCE, MODALITIES]);
        const { leaf, proof } = buildSectionInclusionProof(a1, "figaro-commerce");
        expect(verifyInclusionProof(computeAgreementHash(a2), leaf, proof)).toBe(false);
    });

    it("throws when the section is absent", () => {
        const a = agreement([COMMERCE]);
        expect(() => buildSectionInclusionProof(a, "figaro-ghg-iso-14064"))
            .toThrow(/Section not found/);
    });
});
