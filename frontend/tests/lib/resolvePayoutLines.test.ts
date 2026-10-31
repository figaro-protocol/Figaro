/**
 * resolvePayoutLines — what the resolve confirm states before the buyer
 * resolves: each committed order's seller and what that seller receives (the
 * payment plus its bond back, 2 × cumulative value + payment), then what
 * comes back to the buyer (the rest of its bonds, 2 × payment − payment per
 * order). Every figure is the SDK's `calculateResolution` over the committed
 * order structs.
 */
import { describe, expect, it } from "vitest";
import { calculateBonds, calculateResolution } from "@figaro-protocol/sdk";
import { resolvePayoutLines } from "@/hooks/useSemanticProcessWorkspace";

const S1 = "0x00000000000000000000000000000000000000a1";
const S2 = "0x00000000000000000000000000000000000000a2";

function order(seller: string, cumulativeValue: bigint, payment: bigint) {
    const { sellerBond, buyerBond } = calculateBonds(cumulativeValue, payment);
    return { seller, payment, sellerBond, buyerBond };
}

const figure = (n: bigint) => `${n.toString()} T`;

describe("resolvePayoutLines", () => {
    it("names every order's seller and payout, and the buyer's refund, from the SDK's resolution math", () => {
        const root = order(S1, 100n, 100n);
        const sub = order(S2, 160n, 60n); // a sub-order: cumulative ≠ payment
        const lines = resolvePayoutLines([root, sub], figure);
        const r1 = calculateResolution(root.payment, root.sellerBond, root.buyerBond);
        const r2 = calculateResolution(sub.payment, sub.sellerBond, sub.buyerBond);
        expect(r1.sellerPayout).toBe(300n); // 2 × 100 + 100
        expect(r2.sellerPayout).toBe(380n); // 2 × 160 + 60
        expect(lines).toEqual([
            `Seller ${S1} receives 300 T: the payment 100 T and its bond 200 T back.`,
            `Seller ${S2} receives 380 T: the payment 60 T and its bond 320 T back.`,
            `You receive 160 T: the rest of your bonds 320 T after the payments 160 T.`,
        ]);
        expect(r1.buyerPayout + r2.buyerPayout).toBe(160n);
    });

    it("lists one line per order when one seller holds two orders", () => {
        const lines = resolvePayoutLines([order(S1, 10n, 10n), order(S1, 30n, 20n)], figure);
        expect(lines.filter((l) => l.startsWith(`Seller ${S1}`))).toHaveLength(2);
    });

    it("states nothing for a process whose orders have not loaded", () => {
        expect(resolvePayoutLines([], figure)).toEqual([]);
    });
});
