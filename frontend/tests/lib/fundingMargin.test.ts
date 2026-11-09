/**
 * fundingMargin — the slippage margin a party sets in the funding-token
 * chooser, before the quote its signature binds. The margin decides the cap
 * the party authorizes (`maxInput`): the coordinator pulls that whole cap from
 * the party through Permit2 (`WitnessSwapAndCommitCoordinator.sol`, `_fund`),
 * so a margin the party's balance cannot cover is refused, as is one outside
 * [0, 10%]. Refused, never clamped: a clamp would sign a figure the party did
 * not type.
 */
import { describe, expect, it } from "vitest";
import { fundingMargin, marginBlocksTheAct } from "@/lib/composition/useFundingMargin";

const base = { text: null, defaultBps: 100, quotedInput: 1_000n, balance: 10_000n } as const;

describe("fundingMargin — the margin the party sets, and the cap it yields", () => {
    it("shows the venue's own margin until the party edits it", () => {
        const m = fundingMargin(base);
        expect(m).toMatchObject({ text: "1", bps: 100, maxInput: 1_010n, refusal: null });
        expect(fundingMargin({ ...base, defaultBps: 0 })).toMatchObject({ text: "0", bps: 0, maxInput: 1_000n });
    });

    it("the cap follows the margin the party types", () => {
        expect(fundingMargin({ ...base, text: "2" })).toMatchObject({ bps: 200, maxInput: 1_020n, refusal: null });
        expect(fundingMargin({ ...base, text: "10" })).toMatchObject({ bps: 1_000, maxInput: 1_100n, refusal: null });
        expect(fundingMargin({ ...base, text: "0" })).toMatchObject({ bps: 0, maxInput: 1_000n, refusal: null });
    });

    it("refuses a margin below 0 or above 10%, and the act waits", () => {
        for (const text of ["-1", "10.5", "11"]) {
            const m = fundingMargin({ ...base, text });
            expect(m).toMatchObject({ text, bps: null, maxInput: null, refusal: "range" });
            expect(marginBlocksTheAct(m)).toBe(true);
        }
    });

    it("refuses a margin whose cap the party's balance cannot cover", () => {
        const m = fundingMargin({ ...base, text: "5", balance: 1_049n });
        expect(m).toMatchObject({ bps: 500, maxInput: 1_050n, refusal: "balance" });
        expect(marginBlocksTheAct(m)).toBe(true);
        expect(marginBlocksTheAct(fundingMargin({ ...base, text: "5", balance: 1_050n }))).toBe(false);
    });

    it("holds no cap while the quote or the venue is unread, and does not hold the act for it", () => {
        const noQuote = fundingMargin({ ...base, quotedInput: null });
        expect(noQuote).toMatchObject({ bps: 100, maxInput: null, refusal: null });
        expect(marginBlocksTheAct(noQuote)).toBe(false);
        const noVenue = fundingMargin({ ...base, defaultBps: null });
        expect(noVenue).toMatchObject({ text: "", bps: null, maxInput: null, refusal: null });
        expect(marginBlocksTheAct(noVenue)).toBe(false);
    });

    it("an unread balance refuses nothing", () => {
        expect(fundingMargin({ ...base, text: "10", balance: null }).refusal).toBeNull();
    });
});
