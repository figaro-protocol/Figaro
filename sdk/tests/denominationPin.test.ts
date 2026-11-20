/**
 * The sign gate's token-pin check, on a stranger's clause.
 *
 * `specDenominationPinField` reads the spec's hints, lifted from its `block`:
 * assembly scope, the `denomination` article, and exactly one designer-filled
 * `address-hex` field. `validateCommitmentAgreement` then refuses a
 * commitment whose token differs from the pinned one. The `block` is outside
 * the clause key, so the same clause served under another article, or with
 * no hints at all, pins nothing and gets no check. These cases pin that
 * behavior as `docs/CLAUSES.md` (the `denomination` article) states it.
 */
import { describe, expect, it } from "vitest";
import { computeClauseKey } from "../src/discovery.js";
import { buildOrderAgreement, specDenominationPinField, validateCommitmentAgreement } from "../src/projection.js";
import type { Commitment } from "../src/types.js";
import { specSourceOf, viewOf } from "./specFixtures.js";

const BUYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
const SELLER = "0x2546BcD3c84621e976D8185a91A922aE77ECEc30" as const;
const SIGNED_TOKEN = "0x0000000000000000000000000000000000000001" as const;
const PINNED_TOKEN = "0x0000000000000000000000000000000000000002" as const;

const COMMITMENT: Commitment = {
    processId: `0x${"00".repeat(32)}`,
    buyer: BUYER,
    seller: SELLER,
    token: SIGNED_TOKEN,
    payment: 1n,
    runningTotal: 1n,
    checkoutHash: `0x${"00".repeat(32)}`,
    salt: 0n,
    commitDeadline: 0n,
};

/** A clause no repository file carries: its own id and its own field name. */
const settlementAsset = (article: string) => ({
    clauseId: "acme-settlement-asset",
    version: 1,
    title: "Settlement asset",
    description: "The token the composition settles in.",
    fields: [{ name: "settleIn", type: "string", format: "address-hex", required: true }],
    stages: {},
    block: { design: { article, scope: "assembly", fills: ["settleIn"] } },
});

const PINNED = viewOf(settlementAsset("denomination"));
const FILED_ELSEWHERE = viewOf(settlementAsset("terms"));

function check(view: typeof PINNED, settleIn: string) {
    const specs = specSourceOf([view]);
    const { agreement, checkoutHash } = buildOrderAgreement(BUYER, SELLER, { [view.clauseKey]: { settleIn } }, specs);
    return validateCommitmentAgreement(agreement, checkoutHash, specs, COMMITMENT, null);
}

describe("the sign gate's token-pin check on a stranger's clause", () => {
    it("the article is in the block, so both filings are one clause under one key", () => {
        expect(FILED_ELSEWHERE.clauseKey).toBe(PINNED.clauseKey);
        expect(computeClauseKey(settlementAsset("denomination"))).toBe(computeClauseKey(settlementAsset("terms")));
    });

    it("under the denomination article, the field is the pin whatever its name", () => {
        expect(specDenominationPinField(PINNED)).toBe("settleIn");
    });

    it("under the denomination article, a commitment in another token is refused", () => {
        const { ok, issues } = check(PINNED, PINNED_TOKEN);
        expect(ok).toBe(false);
        expect(issues).toEqual([expect.objectContaining({
            clause: PINNED.clauseKey,
            path: "settleIn",
            message: expect.stringMatching(/denominated by design .* contradicts the pinned term/),
        })]);
    });

    it("under the denomination article, a commitment in the pinned token passes", () => {
        expect(check(PINNED, SIGNED_TOKEN)).toEqual({ ok: true, issues: [] });
    });

    it("filed under another article, the same clause pins nothing and gets no check", () => {
        expect(specDenominationPinField(FILED_ELSEWHERE)).toBeUndefined();
        expect(check(FILED_ELSEWHERE, PINNED_TOKEN)).toEqual({ ok: true, issues: [] });
    });

    it("served with no hints, the same clause pins nothing and gets no check", () => {
        const bare = { ...PINNED, hints: {} };
        expect(specDenominationPinField(bare)).toBeUndefined();
        expect(check(bare, PINNED_TOKEN)).toEqual({ ok: true, issues: [] });
    });
});
