import { describe, it, expect } from "vitest";
import { validateCommitmentAgreement } from "@/lib/core/orderAgreement";
import {
    computeAgreementHash,
    MERCHANT_PROCESS_CLAUSE_KEY,
    FULFILMENT_V2_CLAUSE_KEY,
    GEO_CLAUSE_KEY,
    type Agreement,
    type AgreementSection,
} from "@/lib/core/agreement";

// Layer A, run on BOTH sides of the bilateral commit (buyer before initiating,
// seller before counter-signing). Two checks: merkle integrity (the signed hash
// matches the agreement's computed root) + content validity (every PRESENT
// non-category-1 section conforms to its spec).

const BUYER = `0x${"11".repeat(20)}` as `0x${string}`;
const SELLER = `0x${"22".repeat(20)}` as `0x${string}`;

function agreement(sections: AgreementSection[]): Agreement {
    return { version: "a1", buyer: BUYER, seller: SELLER, sections } as Agreement;
}

describe("validateCommitmentAgreement (Layer A, pre-commit)", () => {
    it("passes a valid agreement when the hash matches the content", () => {
        const a = agreement([
            { clause: FULFILMENT_V2_CLAUSE_KEY, data: { modalities: ["delivery"], delivery: { coordination: ["seller-assigned"] }, handoff: ["face-to-face"] } },
        ]);
        const result = validateCommitmentAgreement(a, computeAgreementHash(a));
        expect(result.ok).toBe(true);
        expect(result.issues).toHaveLength(0);
    });

    it("flags a merkle mismatch — signing a hash that isn't this agreement's root", () => {
        const a = agreement([{ clause: FULFILMENT_V2_CLAUSE_KEY, data: { modalities: ["pickup"] } }]);
        const result = validateCommitmentAgreement(a, `0x${"00".repeat(32)}`);
        expect(result.ok).toBe(false);
        expect(result.issues.some((i) => i.clause === "(merkle)")).toBe(true);
    });

    it("flags malformed clause content (empty geohash — the on-site capture bug)", () => {
        // The exact failure that motivated this: an on-site order carrying a geo
        // section with empty geohashes. Geo is in the agreement, so its content
        // must be valid — not skipped. (Content is checked before the merkle
        // hash, so the unencodable content is reported, not thrown.)
        const a = agreement([{ clause: GEO_CLAUSE_KEY, data: { originGeohash: "", destinationGeohash: "" } }]);
        const result = validateCommitmentAgreement(a, `0x${"00".repeat(32)}`);
        expect(result.ok).toBe(false);
        expect(result.issues.some((i) => i.clause === GEO_CLAUSE_KEY)).toBe(true);
    });

    it("skips category-1 runtime presence-markers (merchant-process {} is attested later)", () => {
        // merchant-process {} would fail its spec (eventType required) IF validated.
        // It must be SKIPPED at commit — content is attested + validated on-chain later.
        const a = agreement([{ clause: MERCHANT_PROCESS_CLAUSE_KEY, data: {} }]);
        const result = validateCommitmentAgreement(a, computeAgreementHash(a));
        expect(result.issues.some((i) => i.clause === MERCHANT_PROCESS_CLAUSE_KEY)).toBe(false);
        expect(result.ok).toBe(true);
    });
});
