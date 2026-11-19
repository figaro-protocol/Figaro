import { describe, it, expect } from "vitest";
import { calculateBonds, calculateResolution } from "@figaro-protocol/sdk";
import { deriveProcessModelFromRuntime } from "@/lib/semantic/deriveProcessModelFromRuntime";
import { OrderState, type Order } from "@/lib/core/store";
import type { ProcessSummary } from "@/lib/core/walletProcessQueries";

// The receipt after resolution states what came BACK to this wallet. The
// buyer's bond carried the payment, so its refund is the bond less that
// payment; the seller's bond is refunded whole. The beta panel's buyer read
// "Bond returned: 6" for a 3 MOCK order — the locked amount, not the refund.
const BUYER = "0x1111111111111111111111111111111111111111";
const SELLER = "0x2222222222222222222222222222222222222222";
const PROCESS = `0x${"ab".repeat(32)}`;

const order: Order = {
    orderHash: `0x${"cd".repeat(32)}`,
    processId: PROCESS,
    buyer: BUYER,
    seller: SELLER,
    token: `0x${"33".repeat(20)}`,
    runningTotal: 3n,
    payment: 3n,
    state: OrderState.Resolved,
    sellerBond: 6n,
    buyerBond: 6n,
    salt: 1n,
    commitDeadline: 0n,
};

const summary: ProcessSummary = {
    processId: PROCESS,
    orderCount: 1,
    hasActive: false,
    createdAt: 0,
    orders: [],
};

const refundFor = (address: string) => {
    const model = deriveProcessModelFromRuntime(summary, [order], new Map(), address);
    return model.orders[0]?.resolutionBreakdown;
};

describe("what resolution refunds, per party", () => {
    it("refunds the buyer its bond less the payment it carried", () => {
        const breakdown = refundFor(BUYER);
        expect(breakdown?.lockedBond?.amount).toBe(6n);
        expect(breakdown?.settledAvailable?.amount).toBe(3n);
    });

    it("refunds the seller its bond whole", () => {
        const breakdown = refundFor(SELLER);
        expect(breakdown?.lockedBond?.amount).toBe(6n);
        expect(breakdown?.settledAvailable?.amount).toBe(6n);
    });
});

describe("what resolution refunds on a sub-order whose running total is not its payment", () => {
    // The root order: payment 3, running total 3. The sub-order: payment 2,
    // running total 5. Each order's bonds are the SDK's calculateBonds; the
    // buyer's refund is the SDK's calculateResolution(...).buyerPayout.
    const SUB_SELLER = "0x4444444444444444444444444444444444444444";
    const root: Order = order;
    const subBonds = calculateBonds(5n, 2n);
    const sub: Order = {
        ...order,
        orderHash: `0x${"ef".repeat(32)}`,
        seller: SUB_SELLER,
        payment: 2n,
        runningTotal: 5n,
        sellerBond: subBonds.sellerBond,
        buyerBond: subBonds.buyerBond,
    };
    const breakdownOf = (address: string) => {
        const model = deriveProcessModelFromRuntime({ ...summary, orderCount: 2 }, [root, sub], new Map(), address);
        return model.orders.find((o) => o.orderId === sub.orderHash)?.resolutionBreakdown;
    };

    it("the buyer is refunded the SDK's buyerPayout for the sub-order", () => {
        const expected = calculateResolution(2n, subBonds.sellerBond, subBonds.buyerBond).buyerPayout;
        expect(breakdownOf(BUYER)?.settledAvailable?.amount).toBe(expected);
        expect(expected).toBe(2n);
    });

    it("the sub-order's seller is refunded its bond, twice the running total, whole", () => {
        expect(breakdownOf(SUB_SELLER)?.settledAvailable?.amount).toBe(subBonds.sellerBond);
        expect(subBonds.sellerBond).toBe(10n);
    });
});
