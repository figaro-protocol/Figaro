import { afterEach, describe, expect, it } from "vitest";
import { projectDocuments, type DocumentTemplate } from "@/lib/audit/documentProjection";
import { DOCUMENT_TEMPLATES } from "@/lib/audit/documentTemplates";
import { OrderState, type Order } from "@/lib/kernel/store";
import type { Agreement } from "@figaro/sdk";
import { _resetClauseSpecCache_TESTING_ONLY } from "@/lib/shared/clauseSpecSource";
import { primeClauseSpecs } from "./primeClauseSpecs";

afterEach(() => {
    _resetClauseSpecCache_TESTING_ONLY();
});

const ALL = [
    "figaro-commerce", "figaro-topology", "figaro-courier-process",
    "figaro-geolocation", "figaro-cargo", "figaro-freight-class", "figaro-handoff",
];

const mkOrder = (o: Partial<Order> & Pick<Order, "orderHash" | "seller">): Order => ({
    processId: "0xPROC", buyer: "0xBUYER", currency: "0xToKeN",
    cumulativeValue: 0n, payment: 0n, state: OrderState.Active,
    sellerBond: 0n, buyerBond: 0n, salt: 0n, deadline: 0n, ...o,
});

const agreement = (sections: { clause: string; data: Record<string, unknown> }[]): Agreement =>
    ({ sections: sections.map((s) => ({ ...s, version: 1 })) } as unknown as Agreement);

const commerce = (lineItems: { name: string; quantity: number }[]) =>
    ({ clause: "figaro-commerce", data: { currency: "0xtoken", payment: "0", lineItems } });

const doc = (docs: ReturnType<typeof projectDocuments>, genre: string) => docs.filter((d) => d.genre === genre);

describe("projectDocuments — generic engine over declared templates", () => {
    it("commercial-invoice: one per SELLER, applies where a commerce leaf exists", async () => {
        await primeClauseSpecs(ALL);
        const orders = [
            mkOrder({ orderHash: "0xA", seller: "0xMERCHANT", payment: 100n, agreementHash: "0xhA" }),
            mkOrder({ orderHash: "0xB", seller: "0xCOURIER", payment: 40n, agreementHash: "0xhB" }),
        ];
        const agreements = new Map<string, Agreement>([
            ["0xhA", agreement([commerce([{ name: "Margherita", quantity: 1 }])])],
            ["0xhB", agreement([commerce([{ name: "Delivery", quantity: 1 }])])],
        ]);
        const docs = projectDocuments(DOCUMENT_TEMPLATES, orders, agreements);
        const invoices = doc(docs, "commercial-invoice");
        expect(invoices).toHaveLength(2); // one per seller — not one per process

        const merchant = invoices.find((d) => d.header.some((h) => h.value === "0xMERCHANT"))!;
        expect(merchant.header.map((h) => h.label)).toContain("Seller (BG-4)");
        expect(merchant.lines!.rows).toEqual([["0xA", "Margherita", "100"]]);
        expect(merchant.lines!.total).toMatchObject({ value: "100" });
    });

    it("bill-of-lading: one per CARRIAGE LEG, with generic cargo/freight leaf sections", async () => {
        await primeClauseSpecs(ALL);
        const carriage = agreement([
            { clause: "figaro-topology", data: { parentOrderHashes: ["0xPARENT"] } },
            { clause: "figaro-courier-process", data: {} },
            { clause: "figaro-geolocation", data: { originGeohash: "9q8yy", destinationGeohash: "9q8yyk8yu" } },
            { clause: "figaro-cargo", data: { massGrams: 500, volumeMl: 1000 } },
            { clause: "figaro-freight-class", data: { nmfcClass: "100" } },
            { clause: "figaro-handoff", data: { handoff: "face-to-face" } },
            commerce([{ name: "Delivery", quantity: 1 }]),
        ]);
        const docs = projectDocuments(
            DOCUMENT_TEMPLATES,
            [mkOrder({ orderHash: "0xC", seller: "0xCOURIER", payment: 40n, agreementHash: "0xh" })],
            new Map([["0xh", carriage]]),
        );
        const bols = doc(docs, "bill-of-lading");
        expect(bols).toHaveLength(1);
        const bol = bols[0];
        expect(bol.header.find((h) => h.label === "Carrier")!.value).toBe("0xCOURIER");
        expect(bol.header.find((h) => h.label === "Destination (geohash)")!.value).toBe("9q8yyk8yu");
        const cargoSection = bol.leafSections!.find((s) => s.label === "Cargo")!;
        expect(cargoSection.entries).toEqual(expect.arrayContaining([
            { key: "massGrams", value: "500" },
            { key: "volumeMl", value: "1000" },
        ]));
        expect(bol.leafSections!.map((s) => s.label)).toContain("Freight class");
        // The carriage order also has a commerce leaf → the courier's invoice emits too.
        expect(doc(docs, "commercial-invoice")).toHaveLength(1);
    });

    it("emits NO bill-of-lading for a non-carriage order", async () => {
        await primeClauseSpecs(ALL);
        const docs = projectDocuments(
            DOCUMENT_TEMPLATES,
            [mkOrder({ orderHash: "0xA", seller: "0xS", payment: 10n, agreementHash: "0xh" })],
            new Map([["0xh", agreement([commerce([{ name: "Item", quantity: 1 }])])]]),
        );
        expect(doc(docs, "bill-of-lading")).toHaveLength(0);
        expect(doc(docs, "commercial-invoice")).toHaveLength(1);
    });

    it("a NEW genre is a data entry — the engine renders an unseen template with zero code", async () => {
        await primeClauseSpecs(["figaro-commerce"]);
        const packingList: DocumentTemplate = {
            genre: "packing-list", title: "Packing list", scope: "order",
            appliesWhen: { hasLeafField: "lineItems" },
            header: [{ label: "For order", ref: { orderHash: true } }],
            lines: { fields: [{ label: "Item", ref: { lineItemNames: true } }] },
        };
        const docs = projectDocuments(
            [packingList],
            [mkOrder({ orderHash: "0xA", seller: "0xS", agreementHash: "0xh" })],
            new Map([["0xh", agreement([commerce([{ name: "Widget", quantity: 2 }])])]]),
        );
        expect(docs).toHaveLength(1);
        expect(docs[0].title).toBe("Packing list");
        expect(docs[0].lines!.rows).toEqual([["Widget ×2"]]);
    });
});

// ── Financial statements as documents ──────────────────────────────────────────

import { projectFinancialStatements, projectAllFinancialStatements } from "@/lib/audit/documentProjection";
import { calculateBonds } from "@figaro/sdk";

const withBonds = (o: Partial<Order> & Pick<Order, "orderHash" | "seller">): Order => {
    const base = mkOrder({ payment: 100n, cumulativeValue: 100n, ...o });
    const { buyerBond, sellerBond } = calculateBonds(base.cumulativeValue, base.payment);
    return { ...base, buyerBond, sellerBond };
};

describe("projectFinancialStatements — the 3 statements AS a document (no duplicate invoice)", () => {
    it("emits balance sheet + income statement sections and a cash-flow table; identity holds", () => {
        const doc = projectFinancialStatements(
            [withBonds({ orderHash: "0xA", seller: "0xS", payment: 100n, cumulativeValue: 100n })],
            "process", "0xPROC",
        );
        const c = "0xtoken";
        const bs = doc.leafSections!.find((s) => s.label === `Balance sheet · ${c}`)!;
        const val = (k: string) => BigInt(bs.entries.find((e) => e.key.startsWith(k))!.value);
        // assets (custody) = liabilities (refunds) + retained earnings
        expect(val("Buyer custody") + val("Seller custody"))
            .toBe(val("Refund owed to buyer") + val("Refund owed to seller") + val("Retained earnings"));
        // cash flow: 2 commit events for one active order
        expect(doc.lines!.rows).toHaveLength(2);
        expect(doc.lines!.columns).toEqual(["kind", "order", "party", "amount"]);
        // NO invoice/line-item concept in the financial statements
        expect((doc as unknown as { lineItems?: unknown }).lineItems).toBeUndefined();
    });

    it("projectAllFinancialStatements: one per seller + one consolidated", () => {
        const orders = [
            withBonds({ orderHash: "0xA", seller: "0xS1", payment: 100n, cumulativeValue: 100n }),
            withBonds({ orderHash: "0xB", seller: "0xS2", payment: 40n, cumulativeValue: 140n }),
        ];
        const docs = projectAllFinancialStatements(orders, "0xPROC");
        expect(docs.filter((d) => d.genre === "financial-statements-seller")).toHaveLength(2);
        expect(docs.filter((d) => d.genre === "financial-statements-process")).toHaveLength(1);
    });
});
