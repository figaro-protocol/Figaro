import { describe, it, expect } from "vitest";
import {
    calculateBonds,
    calculateSettlement,
    calculateRootApproval,
    calculateSubOrderApproval,
    validateBonds,
    assertApprovalCoversBond,
} from "../src/bonds.js";

describe("calculateBonds", () => {
    it("applies 2× multiplier to both sides", () => {
        const result = calculateBonds(1000n, 500n);
        expect(result.sellerBond).toBe(2000n);
        expect(result.buyerBond).toBe(1000n);
        expect(result.totalLocked).toBe(3000n);
    });

    it("handles root order where cumulativeValue === payment", () => {
        const result = calculateBonds(100n, 100n);
        expect(result.sellerBond).toBe(200n);
        expect(result.buyerBond).toBe(200n);
        expect(result.totalLocked).toBe(400n);
    });

    it("handles large values", () => {
        const payment = 10n ** 18n; // 1 token (18 decimals)
        const cumVal = 5n * 10n ** 18n;
        const result = calculateBonds(cumVal, payment);
        expect(result.sellerBond).toBe(10n * 10n ** 18n);
        expect(result.buyerBond).toBe(2n * 10n ** 18n);
    });
});

describe("calculateSettlement", () => {
    it("settles correctly: seller gets payment + bond, buyer gets bond - payment", () => {
        const payment = 500n;
        const sellerBond = 2000n;
        const buyerBond = 1000n;
        const result = calculateSettlement(payment, sellerBond, buyerBond);
        expect(result.sellerPayout).toBe(2500n);
        expect(result.buyerPayout).toBe(500n);
        expect(result.netTransfer).toBe(500n);
    });

    it("conserves total locked value", () => {
        const payment = 100n;
        const sellerBond = 200n;
        const buyerBond = 200n;
        const result = calculateSettlement(payment, sellerBond, buyerBond);
        expect(result.sellerPayout + result.buyerPayout).toBe(sellerBond + buyerBond);
    });
});

describe("calculateRootApproval", () => {
    it("returns 2× payment for both parties", () => {
        const result = calculateRootApproval(100n);
        expect(result.buyerApproval).toBe(200n);
        expect(result.sellerApproval).toBe(200n);
    });
});

describe("calculateSubOrderApproval", () => {
    it("returns full per-order bonds — the kernel offsets nothing", () => {
        // FigaroCore pulls 2×payment from the buyer and 2×cumulativeValue
        // from the seller on EVERY commit (root bonds stay held in parallel).
        const result = calculateSubOrderApproval(5n, 27n);
        expect(result.buyerApproval).toBe(10n);
        expect(result.sellerApproval).toBe(54n);
    });
});

describe("assertApprovalCoversBond", () => {
    it("passes silently when approval matches the calculator output exactly", () => {
        const calc = calculateSubOrderApproval(5n, 27n);
        expect(() => assertApprovalCoversBond(calc, calc)).not.toThrow();
    });

    it("passes when approval exceeds what's required", () => {
        const calc = calculateSubOrderApproval(5n, 27n);
        const generousApproval = { buyerApproval: calc.buyerApproval * 10n, sellerApproval: calc.sellerApproval * 10n };
        expect(() => assertApprovalCoversBond(generousApproval, calc)).not.toThrow();
    });

    it("catches the classic increment-only sub-order bug (seller side)", () => {
        // A process at cumulativeValue 20 grows to 27 with a new order of payment 5.
        // The classic bug approves 2×(27-20)=14 instead of the full 2×27=54.
        const previousCumulativeValue = 20n;
        const newCumulativeValue = 27n;
        const calc = calculateSubOrderApproval(5n, newCumulativeValue);
        const buggyApproval = {
            buyerApproval: calc.buyerApproval,
            sellerApproval: (newCumulativeValue - previousCumulativeValue) * 2n,
        };
        expect(() => assertApprovalCoversBond(buggyApproval, calc)).toThrow(/Seller approval/);
        expect(() => assertApprovalCoversBond(buggyApproval, calc)).toThrow(/increment/);
    });

    it("catches an under-approved buyer side", () => {
        const calc = calculateSubOrderApproval(5n, 27n);
        const buggyApproval = { buyerApproval: calc.buyerApproval - 1n, sellerApproval: calc.sellerApproval };
        expect(() => assertApprovalCoversBond(buggyApproval, calc)).toThrow(/Buyer approval/);
    });

    it("works against calculateRootApproval too", () => {
        const calc = calculateRootApproval(100n);
        expect(() => assertApprovalCoversBond(calc, calc)).not.toThrow();
        const under = { buyerApproval: 50n, sellerApproval: 50n };
        expect(() => assertApprovalCoversBond(under, calc)).toThrow(/Buyer approval/);
    });
});

describe("validateBonds", () => {
    it("passes valid bonds", () => {
        const result = validateBonds(100n, 100n, 200n, 200n);
        expect(result.valid).toBe(true);
        expect(result.reason).toBeUndefined();
    });

    it("rejects zero payment", () => {
        const result = validateBonds(0n, 100n, 200n, 200n);
        expect(result.valid).toBe(false);
        expect(result.reason).toContain("positive");
    });

    it("rejects cumulativeValue < payment", () => {
        const result = validateBonds(200n, 100n, 200n, 400n);
        expect(result.valid).toBe(false);
        expect(result.reason).toContain("cumulativeValue");
    });

    it("rejects wrong seller bond", () => {
        const result = validateBonds(100n, 100n, 100n, 200n);
        expect(result.valid).toBe(false);
        expect(result.reason).toContain("sellerBond");
    });

    it("rejects wrong buyer bond", () => {
        const result = validateBonds(100n, 100n, 200n, 100n);
        expect(result.valid).toBe(false);
        expect(result.reason).toContain("buyerBond");
    });
});
