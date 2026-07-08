import { afterEach, describe, expect, it } from "vitest";
import { projectInvoice, projectSellerInvoices } from "@/lib/audit/invoiceProjection";
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

describe("projectSellerInvoices — one invoice PER SELLER (EN 16931 single supplier)", () => {
    it("splits a multi-seller process into one single-supplier invoice each", async () => {
        await primeClauseSpecs(["figaro-commerce"]);
        const orders = [
            mkOrder({ id: "0xA", seller: "0xMERCHANT", payment: 100n, agreementHash: "0xhA" }),
            mkOrder({ id: "0xB", seller: "0xCOURIER", payment: 40n, agreementHash: "0xhB" }),
        ];
        const agreements = new Map<string, Agreement>([
            ["0xhA", commerceAgreement([{ name: "Margherita", quantity: 1 }])],
            ["0xhB", commerceAgreement([{ name: "Delivery", quantity: 1 }])],
        ]);
        const invoices = projectSellerInvoices(orders, agreements);

        expect(invoices).toHaveLength(2); // one per seller, NOT one per process
        const merchant = invoices.find((i) => i.seller === "0xMERCHANT")!;
        const courier = invoices.find((i) => i.seller === "0xCOURIER")!;
        expect(merchant).toMatchObject({ invoiceNumber: "0xA", buyer: "0xBUYER", currency: "0xtoken", netTotal: 100n });
        expect(merchant.lines).toEqual([{ orderId: "0xA", lineNetAmount: 100n, description: "Margherita" }]);
        expect(courier).toMatchObject({ seller: "0xCOURIER", netTotal: 40n });
    });

    it("groups a seller's multiple orders into one invoice, summing the net total", async () => {
        await primeClauseSpecs(["figaro-commerce"]);
        const orders = [
            mkOrder({ id: "0xA", seller: "0xS", payment: 100n, agreementHash: "0xhA" }),
            mkOrder({ id: "0xB", seller: "0xS", payment: 25n, agreementHash: "0xhB" }),
        ];
        const agreements = new Map<string, Agreement>([
            ["0xhA", commerceAgreement([{ name: "Coffee", quantity: 3 }])],
            ["0xhB", commerceAgreement([{ name: "Pastry", quantity: 1 }])],
        ]);
        const invoices = projectSellerInvoices(orders, agreements);
        expect(invoices).toHaveLength(1);
        expect(invoices[0].netTotal).toBe(125n);
        expect(invoices[0].lines.map((l) => l.description)).toEqual(["Coffee ×3", "Pastry"]);
    });
});

describe("projectInvoice — a single seller's EN 16931 core invoice", () => {
    it("names the supplier at the document level, type 380, lowercased currency", async () => {
        await primeClauseSpecs(["figaro-commerce"]);
        const inv = projectInvoice(
            [mkOrder({ id: "0xA", seller: "0xMERCHANT", payment: 100n, agreementHash: "0xh" })],
            new Map([["0xh", commerceAgreement([{ name: "Margherita", quantity: 1 }])]]),
            "0xMERCHANT",
        );
        expect(inv).toMatchObject({ seller: "0xMERCHANT", typeCode: "380", currency: "0xtoken", buyer: "0xBUYER", netTotal: 100n });
    });

    it("carries no issue date until the process resolves; takes the resolution timestamp when it does", async () => {
        await primeClauseSpecs(["figaro-commerce"]);
        const active = projectInvoice([mkOrder({ id: "0xA", seller: "0xS", payment: 10n })], new Map(), "0xS");
        expect(active.issueDate).toBeUndefined();

        const resolved = projectInvoice(
            [mkOrder({ id: "0xA", seller: "0xS", payment: 10n, state: OrderState.Resolved, resolvedAt: 1_700_000_000 })],
            new Map(),
            "0xS",
        );
        expect(resolved.issueDate).toBe(1_700_000_000);
    });

    it("an order with no committed commerce leaf yields an empty description (not a throw)", async () => {
        await primeClauseSpecs(["figaro-commerce"]);
        const inv = projectInvoice(
            [mkOrder({ id: "0xA", seller: "0xS", payment: 10n, agreementHash: "0xh" })],
            new Map([["0xh", { sections: [{ clause: "figaro-topology", data: {}, version: 1 }] } as unknown as Agreement]]),
            "0xS",
        );
        expect(inv.lines[0].description).toBe("");
    });
});
