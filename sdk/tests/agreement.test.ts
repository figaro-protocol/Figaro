import { keccak256, toHex } from "viem";
import { describe, it, expect } from "vitest";
import {
    computeClauseLeaf,
    computeCheckoutHash,
    buildSignedClauseInclusionProof,
    verifyInclusionProof,
    getClauseDataBytes,
    hashClauseData,
    withholdClauseContent,
    type Agreement,
    type AgreementClause,
} from "../src/agreement.js";

const K = (label: string): `0x${string}` => keccak256(toHex(label));

const BUYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`;
const SELLER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as `0x${string}`;
const CURRENCY = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as `0x${string}`;

const COMMERCE: AgreementClause = {
    clause: K("figaro-commerce"),
    data: { currency: CURRENCY, payment: "1000000000000000000", lineItems: [] },
};
const GEO: AgreementClause = {
    clause: K("figaro-geolocation"),
    data: {
        originGeohash: "dr5reg",
        destinationGeohash: "dr5reh",
    },
};
const GHG: AgreementClause = {
    clause: K("figaro-emissions"),
    // The methodology is a free-form `standard` value on the clause; no scope
    // is stored (a reader derives it from topology). cross-checked clauses use
    // ABI encoding for clauseData — the clause values must be encoder-valid.
    data: { standard: "ISO 14064" },
};
const MODALITIES: AgreementClause = {
    clause: K("figaro-modalities"),
    data: { modality: "pickup" },
};

function agreement(clauses: AgreementClause[]): Agreement {
    return {
        version: "a1",
        buyer: BUYER,
        seller: SELLER,
        clauses: [...clauses].sort((a, b) => a.clause.localeCompare(b.clause)),
    };
}

describe("computeClauseLeaf", () => {
    it("returns a bytes32 hex", () => {
        expect(computeClauseLeaf(COMMERCE)).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it("is deterministic for the same clause", () => {
        expect(computeClauseLeaf(COMMERCE)).toBe(computeClauseLeaf(COMMERCE));
    });

    it("changes when clause data changes", () => {
        const modified = { ...COMMERCE, data: { ...COMMERCE.data, payment: "2000000000000000000" } };
        expect(computeClauseLeaf(COMMERCE)).not.toBe(computeClauseLeaf(modified));
    });

    it("changes when clause key changes with identical data", () => {
        const leafA = computeClauseLeaf({ clause: K("a"), data: { x: 1 } });
        const leafB = computeClauseLeaf({ clause: K("b"), data: { x: 1 } });
        expect(leafA).not.toBe(leafB);
    });
});

describe("computeCheckoutHash", () => {
    it("empty agreement yields zero root", () => {
        expect(computeCheckoutHash(agreement([]))).toBe(`0x${"0".repeat(64)}`);
    });

    it("single-clause root equals the leaf", () => {
        const a = agreement([COMMERCE]);
        expect(computeCheckoutHash(a)).toBe(computeClauseLeaf(COMMERCE));
    });

    it("is deterministic and order-insensitive", () => {
        const h1 = computeCheckoutHash(agreement([COMMERCE, GEO, GHG]));
        const h2 = computeCheckoutHash(agreement([GHG, COMMERCE, GEO]));
        expect(h1).toBe(h2);
    });

    it("changes when any clause changes", () => {
        const h1 = computeCheckoutHash(agreement([COMMERCE, GHG]));
        const modified = { ...GHG, data: { ...GHG.data, standard: "PAS 2050" } };
        const h2 = computeCheckoutHash(agreement([COMMERCE, modified]));
        expect(h1).not.toBe(h2);
    });

    it("rejects agreements with duplicate clause keys", () => {
        const dup = { ...GHG, data: { ...GHG.data, standard: "PAS 2050" } };
        expect(() => computeCheckoutHash(agreement([GHG, dup])))
            .toThrow(/Duplicate clause keys/);
    });
});

describe("buildSignedClauseInclusionProof + verifyInclusionProof", () => {
    it("single clauseEntry: empty proof verifies", () => {
        const a = agreement([COMMERCE]);
        const root = computeCheckoutHash(a);
        const { leaf, proof } = buildSignedClauseInclusionProof(a, K("figaro-commerce"));
        expect(proof).toHaveLength(0);
        expect(verifyInclusionProof(root, leaf, proof)).toBe(true);
    });

    it("two clauses: proof has one sibling per clause", () => {
        const a = agreement([COMMERCE, GHG]);
        const root = computeCheckoutHash(a);
        for (const s of a.clauses) {
            const { leaf, proof } = buildSignedClauseInclusionProof(a, s.clause);
            expect(proof).toHaveLength(1);
            expect(verifyInclusionProof(root, leaf, proof)).toBe(true);
        }
    });

    it("four clauses: every clause proves inclusion", () => {
        const a = agreement([COMMERCE, GEO, GHG, MODALITIES]);
        const root = computeCheckoutHash(a);
        for (const s of a.clauses) {
            const { leaf, proof } = buildSignedClauseInclusionProof(a, s.clause);
            expect(verifyInclusionProof(root, leaf, proof)).toBe(true);
        }
    });

    it("odd clause count: promoted leaf proves inclusion", () => {
        const a = agreement([COMMERCE, GEO, GHG]);
        const root = computeCheckoutHash(a);
        for (const s of a.clauses) {
            const { leaf, proof } = buildSignedClauseInclusionProof(a, s.clause);
            expect(verifyInclusionProof(root, leaf, proof)).toBe(true);
        }
    });

    it("rejects a proof against a different root", () => {
        const a1 = agreement([COMMERCE, GHG]);
        const a2 = agreement([COMMERCE, MODALITIES]);
        const { leaf, proof } = buildSignedClauseInclusionProof(a1, K("figaro-commerce"));
        expect(verifyInclusionProof(computeCheckoutHash(a2), leaf, proof)).toBe(false);
    });

    it("throws when the clause is absent", () => {
        const a = agreement([COMMERCE]);
        expect(() => buildSignedClauseInclusionProof(a, K("figaro-emissions")))
            .toThrow(/Clause not found/);
    });
});

describe("content-withheld clauseEntries (the private side of the data seam)", () => {
    it("a withheld clause yields the identical leaf — the plaintext is not needed to build it", () => {
        const withheld = withholdClauseContent(GEO);
        expect(withheld.data).toBeUndefined();
        expect(withheld.dataHash).toBe(hashClauseData(GEO));
        expect(computeClauseLeaf(withheld)).toBe(computeClauseLeaf(GEO));
    });

    it("an agreement root is unchanged when a clause is withheld", () => {
        const full = agreement([COMMERCE, GEO, GHG]);
        const partlyWithheld = agreement([COMMERCE, withholdClauseContent(GEO), GHG]);
        expect(computeCheckoutHash(partlyWithheld)).toBe(computeCheckoutHash(full));
    });

    it("a withheld clause still proves inclusion against the root", () => {
        const a = agreement([COMMERCE, withholdClauseContent(GEO), GHG]);
        const root = computeCheckoutHash(a);
        const { leaf, proof } = buildSignedClauseInclusionProof(a, K("figaro-geolocation"));
        expect(verifyInclusionProof(root, leaf, proof)).toBe(true);
    });

    it("getClauseDataBytes refuses a withheld clauseEntry (only its fingerprint is known)", () => {
        const withheld = withholdClauseContent(GEO);
        expect(() => getClauseDataBytes(withheld)).toThrow(/content-withheld/);
    });
});
