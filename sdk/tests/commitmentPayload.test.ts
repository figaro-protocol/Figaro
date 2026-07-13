/**
 * CommitmentPayload envelope — byte-exactness against the promotion golden
 * vectors (recorded from the live frontend implementation before the
 * unification; see frontend/tests/lib/promotionGoldenVectors.test.ts), plus
 * the prototype-pollution stripping the deserializer carries.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
    deserializeCommitmentPayload,
    serializeCommitmentPayload,
} from "../src/agent/coordination.js";

const vectors = JSON.parse(
    readFileSync(path.resolve(__dirname, "fixtures/promotion-golden-vectors.json"), "utf8"),
) as { commitmentPayload: { serialized: string } };

describe("CommitmentPayload — golden-vector byte-exactness", () => {
    it("deserialize → serialize reproduces the frozen envelope byte-for-byte", () => {
        const frozen = vectors.commitmentPayload.serialized;
        const payload = deserializeCommitmentPayload(frozen);
        // The frozen envelope came from the pre-unification frontend serializer.
        expect(serializeCommitmentPayload(payload)).toBe(frozen);
        // The commitment's numeric fields revive as bigints.
        expect(typeof payload.commitment.payment).toBe("bigint");
        expect(typeof payload.commitment.salt).toBe("bigint");
        expect(typeof payload.commitment.deadline).toBe("bigint");
        expect(typeof payload.commitment.expectedCumulativeValue).toBe("bigint");
    });

    it("deserialize strips prototype-pollution keys from a malicious envelope", () => {
        const malicious = vectors.commitmentPayload.serialized.replace(
            '"buyerSig"',
            '"__proto__":{"polluted":true},"buyerSig"',
        );
        const parsed = deserializeCommitmentPayload(malicious);
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
        expect(Object.prototype.hasOwnProperty.call(parsed, "__proto__")).toBe(false);
    });
});
