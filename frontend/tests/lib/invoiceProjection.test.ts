import { afterEach, describe, expect, it } from "vitest";
import { projectInvoice } from "@/lib/audit/invoiceProjection";
import { OrderState, type Order } from "@/lib/kernel/store";
import type { Agreement } from "@figaro/core";
import { _resetClauseSpecCache_TESTING_ONLY } from "@/lib/shared/clauseSpecSource";
import { primeClauseSpecs } from "./primeClauseSpecs";

afterEach(() => {
    _resetClauseSpecCache_TESTING_ONLY();
});

const mkOrder = (o: Partial<Order> & Pick<Order, "id" | "seller" | "payment">): Order => ({
    processId: "0xPROC",
    buyer: "0xBUYER",
    currency: "0xToKeN",
    cumulativeValue: o.payment,
    state: OrderState.Active,
    sellerBond: 0n, buyerBond: 0n, salt: 0n, deadline: 0n,
    ...o,
});

const commerceAgreement = (lineItems: { name: string; quantity: number }[]): Agreement =>
    ({ sections: [{ clause: "figaro-commerce", data: { lineItems }, version: 1 }] } as unknown as Agreement);

describe("projectInvoice — EN 16931 core, derived from committed leaves", () => {
    it("maps orders to invoice lines and sums the net total (§7 BG-25 / BT-106)", async () => {
        await primeClauseSpecs(["figaro-commerce"]);
        const orders = [
            mkOrder({ id: "0xA", seller: "0xMERCHANT", payment: 100n, agreementHash: "0xhA" }),
            mkOrder({ id: "0xB", seller: "0xCOURIER", payment: 40n, agreementHash: "0xhB" }),
        ];
        const agreements = new Map<string, Agreement>([
            ["0xhA", commerceAgreement([{ name: "Margherita", quantity: 1 }])],
            ["0xhB", commerceAgreement([{ name: "Delivery", quantity: 1 }])],
        ]);
        const inv = projectInvoice(orders, agreements, "0xPROC");

        expect(inv.invoiceNumber).toBe("0xPROC");
        expect(inv.typeCode).toBe("380");
        expect(inv.currency).toBe("0xtoken"); // lowercased
        expect(inv.buyer).toBe("0xBUYER");
        expect(inv.netTotal).toBe(140n);
        expect(inv.lines).toHaveLength(2);
        expect(inv.lines[0]).toMatchObject({ orderId: "0xA", seller: "0xMERCHANT", lineNetAmount: 100n, description: "Margherita" });
        expect(inv.lines[1]).toMatchObject({ orderId: "0xB", seller: "0xCOURIER", lineNetAmount: 40n, description: "Delivery" });
    });

    it("shows quantity in the line description when > 1", async () => {
        await primeClauseSpecs(["figaro-commerce"]);
        const inv = projectInvoice(
            [mkOrder({ id: "0xA", seller: "0xS", payment: 50n, agreementHash: "0xh" })],
            new Map([["0xh", commerceAgreement([{ name: "Coffee", quantity: 3 }])]]),
            "0xPROC",
        );
        expect(inv.lines[0].description).toBe("Coffee ×3");
    });

    it("carries no issue date until the process resolves; takes the resolution timestamp when it does", async () => {
        await primeClauseSpecs(["figaro-commerce"]);
        const active = projectInvoice([mkOrder({ id: "0xA", seller: "0xS", payment: 10n })], new Map(), "0xP");
        expect(active.issueDate).toBeUndefined();

        const resolved = projectInvoice(
            [mkOrder({ id: "0xA", seller: "0xS", payment: 10n, state: OrderState.Resolved, resolvedAt: 1_700_000_000 })],
            new Map(),
            "0xP",
        );
        expect(resolved.issueDate).toBe(1_700_000_000);
    });

    it("an order with no committed commerce leaf yields an empty description (not a throw)", async () => {
        await primeClauseSpecs(["figaro-commerce"]);
        const inv = projectInvoice(
            [mkOrder({ id: "0xA", seller: "0xS", payment: 10n, agreementHash: "0xh" })],
            new Map([["0xh", { sections: [{ clause: "figaro-topology", data: {}, version: 1 }] } as unknown as Agreement]]),
            "0xP",
        );
        expect(inv.lines[0].description).toBe("");
    });
});
