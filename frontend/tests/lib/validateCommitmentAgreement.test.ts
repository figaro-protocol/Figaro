import { beforeAll, describe, it, expect } from "vitest";
import { validateCommitmentAgreement } from "@/lib/core/orderAgreement";
import { primeClauseSpecs } from "./primeClauseSpecs";
import {
    computeAgreementHash,
    type Agreement,
    type AgreementSection,
} from "@/lib/core/agreement";

// Tests may name clauses; production code may not.
const MERCHANT_PROCESS_CLAUSE_KEY = "figaro-merchant-process";
const MODALITIES_CLAUSE_KEY = "figaro-modalities";
const COORDINATION_CLAUSE_KEY = "figaro-coordination";
const HANDOFF_CLAUSE_KEY = "figaro-handoff";
const GEO_CLAUSE_KEY = "figaro-geolocation";

// Layer A, run on BOTH sides of the bilateral commit (buyer before initiating,
// seller before counter-signing). Two checks: merkle integrity (the signed hash
// matches the agreement's computed root) + content validity (every PRESENT
// non-runtime section conforms to its spec).

const BUYER = `0x${"11".repeat(20)}` as `0x${string}`;
const SELLER = `0x${"22".repeat(20)}` as `0x${string}`;

// Content validation resolves each section's spec from the chain-fed cache —
// prime it with the canonical Layer-A specs.
beforeAll(async () => {
    await primeClauseSpecs();
});

function agreement(sections: AgreementSection[]): Agreement {
    return { version: "a1", buyer: BUYER, seller: SELLER, sections } as Agreement;
}

describe("validateCommitmentAgreement (Layer A, pre-commit)", () => {
    it("passes a valid agreement when the hash matches the content", () => {
        const a = agreement([
            { clause: MODALITIES_CLAUSE_KEY, version: 1, data: { modality: "delivery" } },
            { clause: COORDINATION_CLAUSE_KEY, version: 1, data: { coordination: "seller-assigned" } },
            { clause: HANDOFF_CLAUSE_KEY, version: 1, data: { handoff: ["face-to-face"] } },
        ]);
        const result = validateCommitmentAgreement(a, computeAgreementHash(a));
        expect(result.ok).toBe(true);
        expect(result.issues).toHaveLength(0);
    });

    it("flags a merkle mismatch — signing a hash that isn't this agreement's root", () => {
        const a = agreement([{ clause: MODALITIES_CLAUSE_KEY, version: 1, data: { modality: "pickup" } }]);
        const result = validateCommitmentAgreement(a, `0x${"00".repeat(32)}`);
        expect(result.ok).toBe(false);
        expect(result.issues.some((i) => i.clause === "(merkle)")).toBe(true);
    });

    it("flags malformed clause content (empty geohash — the on-site capture bug)", () => {
        // The exact failure that motivated this: an on-site order carrying a geo
        // section with empty geohashes. Geo is in the agreement, so its content
        // must be valid — not skipped. (Content is checked before the merkle
        // hash, so the unencodable content is reported, not thrown.)
        const a = agreement([{ clause: GEO_CLAUSE_KEY, version: 2, data: { originGeohash: "", destinationGeohash: "" } }]);
        const result = validateCommitmentAgreement(a, `0x${"00".repeat(32)}`);
        expect(result.ok).toBe(false);
        expect(result.issues.some((i) => i.clause === GEO_CLAUSE_KEY)).toBe(true);
    });

    it("skips runtime runtime presence-markers (merchant-process {} is attested later)", () => {
        // merchant-process {} would fail its spec (eventType required) IF validated.
        // It must be SKIPPED at commit — content is attested + validated on-chain later.
        const a = agreement([{ clause: MERCHANT_PROCESS_CLAUSE_KEY, version: 1, data: {} }]);
        const result = validateCommitmentAgreement(a, computeAgreementHash(a));
        expect(result.issues.some((i) => i.clause === MERCHANT_PROCESS_CLAUSE_KEY)).toBe(false);
        expect(result.ok).toBe(true);
    });
});
