/**
 * deriveProcessModelGhg.test.ts
 *
 * Verifies that `deriveProcessModelFromRuntime` emits the seller-side
 * GHG disclosure capabilities — `submit-disclosure-commitment` and
 * `submit-disclosure-inventory` — when an order's committed agreement
 * carries the corresponding clause.
 *
 * Pre-fix, the GHGWorkflowPanel read for these capabilities but the
 * runtime never emitted them; the submit affordances were unreachable
 * in production. The fix landed in
 * `lib/semantic/deriveProcessModelFromRuntime.ts:roleCapabilities`.
 */
import { describe, expect, it } from "vitest";
import {
    GHG_MEASUREMENT_CLAUSE_KEY,
    GHG_CLAUSE_KEY,
    type Agreement,
    computeAgreementHash,
} from "@/lib/core/agreement";
import { deriveProcessModelFromRuntime } from "@/lib/semantic/deriveProcessModelFromRuntime";
import { type Order, OrderState } from "@/lib/core/store";
import { ANVIL_ACCOUNTS } from "../anvilAccounts";
import type { Hex } from "viem";

const BUYER = ANVIL_ACCOUNTS[0];
const SELLER = ANVIL_ACCOUNTS[1];
const CURRENCY = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as `0x${string}`;
const PROCESS_ID = ("0x" + "ab".repeat(32)) as Hex;
const ORDER_ID = ("0x" + "cd".repeat(32)) as Hex;

function buildAgreement(clauses: string[]): Agreement {
    return {
        version: "a1",
        buyer: BUYER as Hex,
        seller: SELLER as Hex,
        sections: clauses.map((clause) => {
            // GHG_CLAUSE_KEY (figaro-ghg-iso-14064-v1) is Cat-2 and needs a
            // typed payload that the SDK encoder accepts; measurement-v1 is
            // Cat-1 and accepts plain JSON.
            if (clause === GHG_CLAUSE_KEY) {
                return { clause, data: { standard: "iso-14064-1", scope: 1 } };
            }
            return { clause, data: {} };
        }),
    };
}

function buildOrder(agreementHash: Hex): Order {
    return {
        id: ORDER_ID,
        processId: PROCESS_ID,
        buyer: BUYER,
        seller: SELLER,
        currency: CURRENCY,
        agreementHash,
        cumulativeValue: 100n,
        payment: 100n,
        state: OrderState.Active,
        sellerBond: 200n,
        buyerBond: 200n,
        salt: 0n,
        deadline: 0n,
    };
}

function buildSummary() {
    return {
        processId: PROCESS_ID,
        orderCount: 1,
        hasActive: true,
        createdAt: 0,
        orders: [{ id: ORDER_ID, state: OrderState.Active }],
    };
}

describe("deriveProcessModelFromRuntime — GHG disclosure capabilities", () => {
    it("emits submit-disclosure-commitment when agreement carries figaro-ghg-iso-14064-v1, for the seller only", () => {
        const agreement = buildAgreement([GHG_CLAUSE_KEY]);
        const agreementHash = computeAgreementHash(agreement);
        const agreements = new Map<string, Agreement>([[agreementHash, agreement]]);

        const order = buildOrder(agreementHash);
        const sellerModel = deriveProcessModelFromRuntime(buildSummary(), [order], agreements, SELLER);
        const buyerModel = deriveProcessModelFromRuntime(buildSummary(), [order], agreements, BUYER);

        const sellerCaps = sellerModel.orders[0]?.capabilities ?? [];
        expect(sellerCaps.find((c) => c.actionKind === "submit-disclosure-commitment")).toBeTruthy();
        expect(sellerCaps.find((c) => c.actionKind === "submit-disclosure-inventory")).toBeUndefined();

        const buyerCaps = buyerModel.orders[0]?.capabilities ?? [];
        expect(buyerCaps.find((c) => c.actionKind === "submit-disclosure-commitment")).toBeUndefined();
        // Buyer still gets compose-sub-order on an active root order.
        expect(buyerCaps.find((c) => c.actionKind === "open-sub-order-composer")).toBeTruthy();
    });

    it("emits submit-disclosure-inventory when agreement carries figaro-ghg-measurement-v1, for the seller only", () => {
        const agreement = buildAgreement([GHG_MEASUREMENT_CLAUSE_KEY]);
        const agreementHash = computeAgreementHash(agreement);
        const agreements = new Map<string, Agreement>([[agreementHash, agreement]]);

        const order = buildOrder(agreementHash);
        const sellerModel = deriveProcessModelFromRuntime(buildSummary(), [order], agreements, SELLER);

        const sellerCaps = sellerModel.orders[0]?.capabilities ?? [];
        expect(sellerCaps.find((c) => c.actionKind === "submit-disclosure-inventory")).toBeTruthy();
        expect(sellerCaps.find((c) => c.actionKind === "submit-disclosure-commitment")).toBeUndefined();
    });

    it("emits BOTH capabilities when both clauses are committed", () => {
        const agreement = buildAgreement([GHG_CLAUSE_KEY, GHG_MEASUREMENT_CLAUSE_KEY]);
        const agreementHash = computeAgreementHash(agreement);
        const agreements = new Map<string, Agreement>([[agreementHash, agreement]]);

        const order = buildOrder(agreementHash);
        const sellerModel = deriveProcessModelFromRuntime(buildSummary(), [order], agreements, SELLER);

        const sellerCaps = sellerModel.orders[0]?.capabilities ?? [];
        expect(sellerCaps.find((c) => c.actionKind === "submit-disclosure-commitment")).toBeTruthy();
        expect(sellerCaps.find((c) => c.actionKind === "submit-disclosure-inventory")).toBeTruthy();
    });

    it("emits no GHG capabilities when the agreement is not in the hydrated map (unwitnessed)", () => {
        // Empty agreements map — simulates a wallet that didn't witness
        // the order. Event-driven behavior: capability surfaces only for
        // the seller who holds the hydrated agreement.
        const order = buildOrder(("0x" + "ef".repeat(32)) as Hex);
        const sellerModel = deriveProcessModelFromRuntime(buildSummary(), [order], new Map(), SELLER);

        const sellerCaps = sellerModel.orders[0]?.capabilities ?? [];
        expect(sellerCaps.find((c) => c.actionKind === "submit-disclosure-commitment")).toBeUndefined();
        expect(sellerCaps.find((c) => c.actionKind === "submit-disclosure-inventory")).toBeUndefined();
    });

    it("emits no GHG capabilities when the order is not Active", () => {
        const agreement = buildAgreement([GHG_CLAUSE_KEY, GHG_MEASUREMENT_CLAUSE_KEY]);
        const agreementHash = computeAgreementHash(agreement);
        const agreements = new Map<string, Agreement>([[agreementHash, agreement]]);

        const resolvedOrder: Order = { ...buildOrder(agreementHash), state: OrderState.Resolved };
        const sellerModel = deriveProcessModelFromRuntime(
            { ...buildSummary(), hasActive: false, orders: [{ id: ORDER_ID, state: OrderState.Resolved }] },
            [resolvedOrder],
            agreements,
            SELLER,
        );

        const sellerCaps = sellerModel.orders[0]?.capabilities ?? [];
        expect(sellerCaps).toEqual([]);
    });
});
