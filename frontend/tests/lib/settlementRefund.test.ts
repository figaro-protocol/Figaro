import { describe, it, expect } from "vitest";
import { deriveProcessModelFromRuntime } from "@/lib/semantic/deriveProcessModelFromRuntime";
import { OrderState, type Order } from "@/lib/kernel/store";
import type { ProcessSummary } from "@/lib/kernel/walletProcessQueries";

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
    currency: `0x${"33".repeat(20)}`,
    cumulativeValue: 3n,
    payment: 3n,
    state: OrderState.Resolved,
    sellerBond: 6n,
    buyerBond: 6n,
    salt: 1n,
    deadline: 0n,
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
    return model.orders[0]?.settlementBreakdown;
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
