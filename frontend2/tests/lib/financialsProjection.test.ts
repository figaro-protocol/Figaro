import { describe, expect, it } from "vitest";
import {
    projectFinancials,
    checkBalanceSheetIdentity,
} from "@/lib/semantic/financialsProjection";
import type { Order } from "@/lib/core/types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BUYER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const SELLER1 = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const SELLER2 = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
const TOKEN_A = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const TOKEN_B = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

function makeOrder(overrides: Partial<Order> = {}): Order {
    return {
        id: "0xORDER1",
        processId: "0xPROCESS1",
        buyer: BUYER,
        seller: SELLER1,
        currency: TOKEN_A,
        payment: 100n,
        cumulativeValue: 100n,
        state: "Active",
        agreementHash: "0xAGREEMENT1",
        salt: 1n,
        deadline: 9999999999n,
        ...overrides,
    };
}

// ── Single active order ───────────────────────────────────────────────────────

describe("projectFinancials — single active order", () => {
    const order = makeOrder({ payment: 100n, cumulativeValue: 100n });
    const model = projectFinancials([order], "order", order.id);

    it("uses 2P for buyer custody and 2G for seller custody (NOT 3P + 2G)", () => {
        const bs = model.balanceSheet[TOKEN_A.toLowerCase()];
        expect(bs.buyerCustody).toBe(200n); // 2 * 100
        expect(bs.sellerCustody).toBe(200n); // 2 * 100
        // Total custody = 2P + 2G = 400, NOT 3P + 2G = 500.
        expect(bs.buyerCustody + bs.sellerCustody).toBe(400n);
    });

    it("splits liabilities correctly: P refund to buyer, 2G refund to seller", () => {
        const bs = model.balanceSheet[TOKEN_A.toLowerCase()];
        expect(bs.refundOwedToBuyer).toBe(100n); // P
        expect(bs.refundOwedToSeller).toBe(200n); // 2G
    });

    it("treats payment as retained earnings", () => {
        const bs = model.balanceSheet[TOKEN_A.toLowerCase()];
        expect(bs.retainedEarnings).toBe(100n); // P
    });

    it("satisfies the bookkeeping identity (assets = liabilities + retained earnings)", () => {
        const bs = model.balanceSheet[TOKEN_A.toLowerCase()];
        expect(checkBalanceSheetIdentity(bs)).toBe(true);
    });

    it("recognizes sales at commit but no cost yet (active)", () => {
        const ist = model.incomeStatement[TOKEN_A.toLowerCase()];
        expect(ist.sales).toBe(100n);
        expect(ist.cost).toBe(0n);
        expect(ist.netIncome).toBe(100n);
    });

    it("emits 2 cash-flow entries (commit-buyer + commit-seller, no resolve)", () => {
        expect(model.cashFlow).toHaveLength(2);
        const buyerDeposit = model.cashFlow.find((e) => e.kind === "commit-buyer-deposit");
        const sellerDeposit = model.cashFlow.find((e) => e.kind === "commit-seller-deposit");
        expect(buyerDeposit?.amount).toBe(200n); // 2P
        expect(sellerDeposit?.amount).toBe(200n); // 2G
        expect(model.cashFlow.find((e) => e.kind === "resolve-buyer-refund")).toBeUndefined();
        expect(model.cashFlow.find((e) => e.kind === "resolve-seller-payout")).toBeUndefined();
    });
});

// ── Single resolved order ─────────────────────────────────────────────────────

describe("projectFinancials — single resolved order", () => {
    const order = makeOrder({ payment: 100n, cumulativeValue: 100n, state: "Resolved" });
    const model = projectFinancials([order], "order", order.id);

    it("zeros out all balance-sheet accounts after resolve", () => {
        const bs = model.balanceSheet[TOKEN_A.toLowerCase()];
        expect(bs.buyerCustody).toBe(0n);
        expect(bs.sellerCustody).toBe(0n);
        expect(bs.refundOwedToBuyer).toBe(0n);
        expect(bs.refundOwedToSeller).toBe(0n);
        expect(bs.retainedEarnings).toBe(0n);
    });

    it("recognizes equal sales and cost; net income = 0", () => {
        const ist = model.incomeStatement[TOKEN_A.toLowerCase()];
        expect(ist.sales).toBe(100n);
        expect(ist.cost).toBe(100n);
        expect(ist.netIncome).toBe(0n);
    });

    it("emits 4 cash-flow entries (commits + resolve payouts)", () => {
        expect(model.cashFlow).toHaveLength(4);
        const refund = model.cashFlow.find((e) => e.kind === "resolve-buyer-refund");
        const payout = model.cashFlow.find((e) => e.kind === "resolve-seller-payout");
        expect(refund?.amount).toBe(100n); // P returned to buyer
        expect(payout?.amount).toBe(300n); // 2G + P paid to seller
    });

    it("payouts at resolve sum to total custody at commit (escrow clears to zero)", () => {
        const totalCustodyAtCommit = 200n + 200n; // 2P + 2G
        const refund = model.cashFlow.find((e) => e.kind === "resolve-buyer-refund")!;
        const payout = model.cashFlow.find((e) => e.kind === "resolve-seller-payout")!;
        expect(refund.amount + payout.amount).toBe(totalCustodyAtCommit);
    });
});

// ── Multi-order process ───────────────────────────────────────────────────────

describe("projectFinancials — process consolidation (2 active orders, same currency)", () => {
    const root = makeOrder({ id: "0xR", payment: 100n, cumulativeValue: 100n });
    const sub = makeOrder({
        id: "0xS",
        seller: SELLER2,
        payment: 50n,
        cumulativeValue: 150n, // root P + sub P
        processId: "0xPROCESS1",
    });
    const model = projectFinancials([root, sub], "process", "0xPROCESS1");

    it("aggregates buyer custody as sum of 2P across active orders", () => {
        const bs = model.balanceSheet[TOKEN_A.toLowerCase()];
        // 2*100 + 2*50 = 300
        expect(bs.buyerCustody).toBe(300n);
    });

    it("aggregates seller custody as sum of 2G across active orders", () => {
        const bs = model.balanceSheet[TOKEN_A.toLowerCase()];
        // 2*100 + 2*150 = 500
        expect(bs.sellerCustody).toBe(500n);
    });

    it("aggregates retained earnings as sum of P", () => {
        const bs = model.balanceSheet[TOKEN_A.toLowerCase()];
        expect(bs.retainedEarnings).toBe(150n); // 100 + 50
    });

    it("preserves the bookkeeping identity at process scope", () => {
        expect(checkBalanceSheetIdentity(model.balanceSheet[TOKEN_A.toLowerCase()])).toBe(true);
    });

    it("aggregates sales across all orders", () => {
        const ist = model.incomeStatement[TOKEN_A.toLowerCase()];
        expect(ist.sales).toBe(150n);
        expect(ist.cost).toBe(0n);
    });

    it("emits 4 cash-flow entries (2 per active order)", () => {
        expect(model.cashFlow).toHaveLength(4);
    });

    it("includes both order ids in orderIds", () => {
        expect(model.orderIds).toEqual(["0xR", "0xS"]);
    });
});

// ── Mixed-state process ───────────────────────────────────────────────────────

describe("projectFinancials — process with one resolved + one active order", () => {
    const resolvedOrder = makeOrder({ id: "0xR", state: "Resolved", payment: 100n, cumulativeValue: 100n });
    const activeOrder = makeOrder({
        id: "0xA",
        seller: SELLER2,
        payment: 50n,
        cumulativeValue: 150n,
    });
    const model = projectFinancials([resolvedOrder, activeOrder], "process", "0xPROCESS1");

    it("only counts the active order in balance-sheet position", () => {
        const bs = model.balanceSheet[TOKEN_A.toLowerCase()];
        expect(bs.buyerCustody).toBe(100n); // 2 * 50 (only active)
        expect(bs.sellerCustody).toBe(300n); // 2 * 150 (only active)
        expect(bs.retainedEarnings).toBe(50n); // only active P
    });

    it("recognizes sales for both orders + cost only for the resolved", () => {
        const ist = model.incomeStatement[TOKEN_A.toLowerCase()];
        expect(ist.sales).toBe(150n); // 100 + 50
        expect(ist.cost).toBe(100n); // resolved order only
        expect(ist.netIncome).toBe(50n); // pending retained earnings on active
    });
});

// ── Multi-currency segregation ────────────────────────────────────────────────

describe("projectFinancials — multi-currency", () => {
    const orderA = makeOrder({ id: "0xA", currency: TOKEN_A, payment: 100n, cumulativeValue: 100n });
    const orderB = makeOrder({
        id: "0xB",
        currency: TOKEN_B,
        seller: SELLER2,
        payment: 50n,
        cumulativeValue: 50n,
    });
    const model = projectFinancials([orderA, orderB], "process", "0xPROCESS1");

    it("does not sum across currencies", () => {
        expect(model.currencies).toEqual([TOKEN_A.toLowerCase(), TOKEN_B.toLowerCase()]);
        expect(model.balanceSheet[TOKEN_A.toLowerCase()].buyerCustody).toBe(200n);
        expect(model.balanceSheet[TOKEN_B.toLowerCase()].buyerCustody).toBe(100n);
    });

    it("preserves the bookkeeping identity for each currency segment", () => {
        for (const cur of model.currencies) {
            expect(checkBalanceSheetIdentity(model.balanceSheet[cur])).toBe(true);
        }
    });
});

// ── Empty input ───────────────────────────────────────────────────────────────

describe("projectFinancials — empty input", () => {
    it("returns empty projection when no orders are passed", () => {
        const model = projectFinancials([], "process", "0xEMPTY");
        expect(model.currencies).toEqual([]);
        expect(model.cashFlow).toEqual([]);
        expect(model.orderIds).toEqual([]);
        expect(Object.keys(model.balanceSheet)).toEqual([]);
    });
});
