import { afterEach, describe, expect, it } from "vitest";
import { projectDocuments, type DocumentLayout } from "@/lib/data/audit/documentProjection";
import { DOCUMENT_LAYOUTS } from "@/lib/data/audit/documentLayouts";
import { OrderState, type Order } from "@/lib/core/store";
import type { Agreement } from "@figaro-protocol/sdk";
import { _resetClauseSpecCache_TESTING_ONLY, loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";
import { keyOf, pinSpec, primeClauseSpecs } from "./primeClauseSpecs";

afterEach(() => {
    _resetClauseSpecCache_TESTING_ONLY();
});

const ALL = [
    "figaro-commerce", "figaro-courier-process",
    "figaro-geolocation", "figaro-cargo", "figaro-freight-class", "figaro-handoff",
];

const mkOrder = (o: Partial<Order> & Pick<Order, "orderHash" | "seller">): Order => ({
    processId: "0xPROC", buyer: "0xBUYER", token: "0xToKeN",
    runningTotal: 0n, payment: 0n, state: OrderState.Active,
    sellerBond: 0n, buyerBond: 0n, salt: 0n, commitDeadline: 0n, ...o,
});

/** An agreement over the named clauses; `follows`, when given, is its
 *  topology leaf — the orders it follows. */
const agreement = (clauseEntries: { clause: string; data: Record<string, unknown> }[], follows?: string[]): Agreement =>
    ({ clauses: clauseEntries.map((s) => ({ ...s, clause: keyOf(s.clause) })), ...(follows === undefined ? {} : { follows }) } as unknown as Agreement);

const commerce = (lineItems: { name: string; quantity: number }[]) =>
    ({ clause: "figaro-commerce", data: { lineItems } });

const doc = (docs: ReturnType<typeof projectDocuments>, genre: string) => docs.filter((d) => d.genre === genre);

describe("projectDocuments — generic engine over declared assemblies", () => {
    it("commercial-invoice: one per SELLER, applies where a commerce leaf exists", async () => {
        await primeClauseSpecs(ALL);
        const orders = [
            mkOrder({ orderHash: "0xA", seller: "0xMERCHANT", payment: 100n, checkoutHash: "0xhA" }),
            mkOrder({ orderHash: "0xB", seller: "0xCOURIER", payment: 40n, checkoutHash: "0xhB" }),
        ];
        const agreements = new Map<string, Agreement>([
            ["0xhA", agreement([commerce([{ name: "Margherita", quantity: 1 }])])],
            ["0xhB", agreement([commerce([{ name: "Delivery", quantity: 1 }])])],
        ]);
        const docs = projectDocuments(DOCUMENT_LAYOUTS, orders, agreements);
        const invoices = doc(docs, "commercial-invoice");
        expect(invoices).toHaveLength(2); // one per seller — not one per process

        const merchant = invoices.find((d) => d.header.some((h) => h.value === "0xMERCHANT"))!;
        expect(merchant.header.map((h) => h.label)).toContain("Seller (BG-4)");
        expect(merchant.lines!.rows).toEqual([["0xA", "Margherita", "100"]]);
        expect(merchant.lines!.total).toMatchObject({ value: "100" });
    });

    it("commercial-invoice: the currency is the commitment's token, never a clause's copy", async () => {
        await primeClauseSpecs(ALL);
        const currencyOf = (agreements: Map<string, Agreement>) => doc(
            projectDocuments(DOCUMENT_LAYOUTS, [mkOrder({ orderHash: "0xA", seller: "0xS", payment: 5n, checkoutHash: "0xh" })], agreements),
            "commercial-invoice",
        )[0].header.find((h) => h.label === "Currency (BT-5)")!.value;
        // No clause names a token: the commitment's stands.
        expect(currencyOf(new Map([["0xh", agreement([commerce([{ name: "Part", quantity: 1 }])])]]))).toBe("0xToKeN");
        // A clause that names another token is not read.
        const disagreeing = agreement([commerce([{ name: "Part", quantity: 1 }])]);
        disagreeing.clauses[0].data = { ...disagreeing.clauses[0].data, currency: "0xOTHER" };
        expect(currencyOf(new Map([["0xh", disagreeing]]))).toBe("0xToKeN");
    });

    it("bill-of-lading: one per CARRIAGE LEG, with generic cargo/freight leaf sections", async () => {
        await primeClauseSpecs(ALL);
        const carriage = agreement([
            { clause: "figaro-courier-process", data: {} },
            { clause: "figaro-geolocation", data: { origin: "9q8yy", destination: "9q8yyk8yu" } },
            { clause: "figaro-cargo", data: { massGrams: 500, volumeMl: 1000 } },
            { clause: "figaro-freight-class", data: { nmfcClass: "100" } },
            { clause: "figaro-handoff", data: { handoff: "face-to-face" } },
            commerce([{ name: "Delivery", quantity: 1 }]),
        ], ["0xPARENT"]);
        const docs = projectDocuments(
            DOCUMENT_LAYOUTS,
            [mkOrder({ orderHash: "0xC", seller: "0xCOURIER", payment: 40n, checkoutHash: "0xh" })],
            new Map([["0xh", carriage]]),
        );
        const bols = doc(docs, "bill-of-lading");
        expect(bols).toHaveLength(1);
        const bol = bols[0];
        expect(bol.header.find((h) => h.label === "Carrier")!.value).toBe("0xCOURIER");
        expect(bol.header.find((h) => h.label === "Origin")!.value).toBe("9q8yy");
        expect(bol.header.find((h) => h.label === "Destination")!.value).toBe("9q8yyk8yu");
        const cargoClause = bol.leafSections!.find((s) => s.label === "Cargo")!;
        expect(cargoClause.entries).toEqual(expect.arrayContaining([
            { key: "massGrams", value: "500" },
            { key: "volumeMl", value: "1000" },
        ]));
        expect(bol.leafSections!.map((s) => s.label)).toContain("Freight class");
        // The carriage order also has a commerce leaf → the courier's invoice emits too.
        expect(doc(docs, "commercial-invoice")).toHaveLength(1);
    });

    it("bill-of-lading parties come from the topology: shipper = the followed order's seller, consignee = the buyer", async () => {
        await primeClauseSpecs(ALL);
        const PARENT = `0x${"0a".repeat(32)}`;
        const leg = agreement([
            { clause: "figaro-courier-process", data: {} },
            { clause: "figaro-geolocation", data: { origin: "9q8yy", destination: "9q8yyk8yu" } },
            { clause: "figaro-handoff", data: { handoff: "face-to-face" } },
        ], [PARENT]);
        const root = agreement([commerce([{ name: "Pizza", quantity: 1 }])], []);
        const docs = projectDocuments(
            DOCUMENT_LAYOUTS,
            [
                mkOrder({ orderHash: PARENT, seller: "0xMERCHANT", checkoutHash: "0xhRoot" }),
                mkOrder({ orderHash: "0xLEG", seller: "0xCOURIER", checkoutHash: "0xhLeg" }),
            ],
            new Map([["0xhRoot", root], ["0xhLeg", leg]]),
        );
        const bols = doc(docs, "bill-of-lading");
        expect(bols).toHaveLength(1);
        const value = (label: string) => bols[0].header.find((h) => h.label === label)!.value;
        expect(value("Carrier")).toBe("0xCOURIER");
        expect(value("Shipper / consignor")).toBe("0xMERCHANT");
        expect(value("Consignee")).toBe("0xBUYER");
        expect(value("Shipper / consignor")).not.toBe(value("Consignee"));
    });

    it("emits NO bill-of-lading for a sub-order whose clauses do not make it a shipment", async () => {
        await primeClauseSpecs([...ALL, "figaro-merchant-process", "figaro-content-handoff"]);
        const subOrder = (clauses: { clause: string; data: Record<string, unknown> }[]) => agreement(clauses, ["0xPARENT"]);
        for (const shape of [
            // a merchant's process log (an inspection, a customs filing): no route, no hand-off of goods
            [{ clause: "figaro-merchant-process", data: {} }],
            // a forwarder's leg: a route and a log, but nobody carries the goods
            [{ clause: "figaro-merchant-process", data: {} }, { clause: "figaro-geolocation", data: { origin: "a", destination: "b" } }],
            // a digital deliverable: a hand-off of content, not of goods
            [{ clause: "figaro-content-handoff", data: { contentHandoff: "ipfs" } }, { clause: "figaro-geolocation", data: { origin: "a", destination: "b" } }],
        ]) {
            const docs = projectDocuments(
                DOCUMENT_LAYOUTS,
                [mkOrder({ orderHash: "0xS", seller: "0xS", checkoutHash: "0xh" })],
                new Map([["0xh", subOrder(shape)]]),
            );
            expect(doc(docs, "bill-of-lading")).toHaveLength(0);
        }
    });

    it("emits NO bill-of-lading for a non-carriage order", async () => {
        await primeClauseSpecs(ALL);
        const docs = projectDocuments(
            DOCUMENT_LAYOUTS,
            [mkOrder({ orderHash: "0xA", seller: "0xS", payment: 10n, checkoutHash: "0xh" })],
            new Map([["0xh", agreement([commerce([{ name: "Item", quantity: 1 }])])]]),
        );
        expect(doc(docs, "bill-of-lading")).toHaveLength(0);
        expect(doc(docs, "commercial-invoice")).toHaveLength(1);
    });

    it("a NEW genre is a data entry — the engine renders an unseen assembly with zero code", async () => {
        await primeClauseSpecs(["figaro-commerce"]);
        const packingList: DocumentLayout = {
            genre: "packing-list", title: "Packing list", scope: "order",
            appliesWhen: { hasPricedLines: true },
            header: [{ label: "For order", ref: { orderHash: true } }],
            lines: { fields: [{ label: "Item", ref: { lineItemNames: true } }] },
        };
        const docs = projectDocuments(
            [packingList],
            [mkOrder({ orderHash: "0xA", seller: "0xS", checkoutHash: "0xh" })],
            new Map([["0xh", agreement([commerce([{ name: "Widget", quantity: 2 }])])]]),
        );
        expect(docs).toHaveLength(1);
        expect(docs[0].title).toBe("Packing list");
        expect(docs[0].lines!.rows).toEqual([["Widget ×2"]]);
    });
});

// ── A document reads the marks a spec declares, never a field's name ──────────

/** Serve one spec of the test's own to the spec cache, as the registry read does. */
async function serveSpec(spec: Record<string, unknown>): Promise<string> {
    const pinned = pinSpec(spec);
    setClauseSpecFetcher(async () => pinned.bytes);
    await loadClauseSpec(pinned.clauseKey, `mem://${String(spec.clauseId)}`);
    return pinned.clauseKey;
}

const strangerSpec = (clauseId: string, fields: { name: string; type: string; values?: string[] }[], block: Record<string, unknown>) => ({
    clauseId, version: 1, title: clauseId, description: "A clause no reference spec matches.",
    fields: fields.map((f) => ({ required: true, ...f })),
    stages: {},
    block: { design: { article: "logistics" }, ...block },
});

const byKey = (clauses: { clause: string; data: Record<string, unknown> }[], follows?: string[]): Agreement =>
    ({ clauses, ...(follows === undefined ? {} : { follows }) } as unknown as Agreement);

const bolOf = (agreementUnderTest: Agreement) => doc(projectDocuments(
    DOCUMENT_LAYOUTS,
    [mkOrder({ orderHash: "0xC", seller: "0xCARRIER", checkoutHash: "0xh" })],
    new Map([["0xh", agreementUnderTest]]),
), "bill-of-lading");

describe("document layouts read the marks a clause's spec declares", () => {
    it("a stranger's route, carriage and cargo clauses, under their own field names, make a bill of lading", async () => {
        const route = await serveSpec(strangerSpec("stranger-lane",
            [{ name: "pickupCell", type: "string" }, { name: "dropoffCell", type: "string" }],
            { checkout: { endpoints: { from: "pickupCell", to: "dropoffCell" } } }));
        const carriage = await serveSpec(strangerSpec("stranger-tender",
            [{ name: "tenderedHow", type: "string" }],
            { runtime: { documentPart: "carriage" } }));
        const cargo = await serveSpec(strangerSpec("stranger-load",
            [{ name: "loadKg", type: "integer" }],
            { runtime: { documentPart: "cargo" } }));
        const bols = bolOf(byKey([
            { clause: route, data: { pickupCell: "u4pru", dropoffCell: "u4prv" } },
            { clause: carriage, data: { tenderedHow: "dock" } },
            { clause: cargo, data: { loadKg: 12 } },
        ], ["0xPARENT"]));
        expect(bols).toHaveLength(1);
        const value = (label: string) => bols[0].header.find((h) => h.label === label)!.value;
        expect(value("Origin")).toBe("u4pru");
        expect(value("Destination")).toBe("u4prv");
        expect(bols[0].leafSections).toEqual([
            { label: "Cargo", entries: [{ key: "loadKg", value: "12" }] },
            { label: "Mode of carriage", entries: [{ key: "tenderedHow", value: "dock" }] },
        ]);
    });

    it("a stranger's delivery-terms clause fills the invoice's delivery terms", async () => {
        await primeClauseSpecs(["figaro-commerce"]);
        const terms = await serveSpec(strangerSpec("stranger-terms",
            [{ name: "termCode", type: "string" }],
            { runtime: { documentPart: "delivery-terms" } }));
        const agreementUnderTest = agreement([commerce([{ name: "Part", quantity: 1 }])]);
        agreementUnderTest.clauses.push({ clause: terms, data: { termCode: "DAP" } } as Agreement["clauses"][number]);
        const invoice = doc(projectDocuments(
            DOCUMENT_LAYOUTS,
            [mkOrder({ orderHash: "0xA", seller: "0xS", payment: 5n, checkoutHash: "0xh" })],
            new Map([["0xh", agreementUnderTest]]),
        ), "commercial-invoice")[0];
        expect(invoice.leafSections).toEqual([{ label: "Delivery terms", entries: [{ key: "termCode", value: "DAP" }] }]);
    });

    it("the reference clauses, with their marks, fill the bill of lading's sections", async () => {
        await primeClauseSpecs([...ALL, "figaro-incoterms"]);
        const bols = doc(projectDocuments(
            DOCUMENT_LAYOUTS,
            [mkOrder({ orderHash: "0xC", seller: "0xCOURIER", checkoutHash: "0xh" })],
            new Map([["0xh", agreement([
                { clause: "figaro-geolocation", data: { origin: "9q8yy", destination: "9q8yyk8yu" } },
                { clause: "figaro-cargo", data: { massGrams: 500 } },
                { clause: "figaro-freight-class", data: { nmfcClass: "100" } },
                { clause: "figaro-incoterms", data: { incotermsRule: "FOB" } },
                { clause: "figaro-handoff", data: { handoff: "face-to-face" } },
            ], ["0xPARENT"])]]),
        ), "bill-of-lading");
        expect(bols).toHaveLength(1);
        expect(bols[0].leafSections!.map((s) => s.label)).toEqual(["Cargo", "Freight class", "Delivery terms", "Mode of carriage"]);
    });

    it("clauses with fields of the reference's names and no marks make no bill of lading and fill no section", async () => {
        const route = await serveSpec(strangerSpec("unmarked-route",
            [{ name: "origin", type: "string" }, { name: "destination", type: "string" }], {}));
        const handoff = await serveSpec(strangerSpec("unmarked-handoff", [{ name: "handoff", type: "string" }], {}));
        const cargo = await serveSpec(strangerSpec("unmarked-cargo", [{ name: "massGrams", type: "integer" }], {}));
        const terms = await serveSpec(strangerSpec("unmarked-terms", [{ name: "incotermsRule", type: "string" }], {}));
        const clauses = [
            { clause: route, data: { origin: "a", destination: "b" } },
            { clause: handoff, data: { handoff: "face-to-face" } },
            { clause: cargo, data: { massGrams: 1 } },
            { clause: terms, data: { incotermsRule: "FOB" } },
        ];
        expect(bolOf(byKey(clauses, ["0xPARENT"]))).toHaveLength(0);
        const always: DocumentLayout = {
            genre: "probe", title: "Probe", scope: "order", appliesWhen: { always: true },
            header: [{ label: "Origin", ref: { routeEnd: "from" } }],
            leafSections: [{ label: "Cargo", part: "cargo" }, { label: "Delivery terms", part: "delivery-terms" }],
        };
        const [probe] = projectDocuments([always], [mkOrder({ orderHash: "0xC", seller: "0xS", checkoutHash: "0xh" })], new Map([["0xh", byKey(clauses)]]));
        expect(probe.header).toEqual([{ label: "Origin", value: "" }]);
        expect(probe.leafSections).toEqual([]);
    });

    it("a route mark the spec's own fields contradict marks nothing", async () => {
        const route = await serveSpec(strangerSpec("contradicted-lane",
            [{ name: "pickupCell", type: "string" }],
            { checkout: { endpoints: { from: "pickupCell", to: "dropoffCell" } } }));
        const carriage = await serveSpec(strangerSpec("stranger-tender-2",
            [{ name: "tenderedHow", type: "string" }],
            { runtime: { documentPart: "carriage" } }));
        expect(bolOf(byKey([
            { clause: route, data: { pickupCell: "u4pru", dropoffCell: "u4prv" } },
            { clause: carriage, data: { tenderedHow: "dock" } },
        ], ["0xPARENT"]))).toHaveLength(0);
    });
});

// ── Financial statements as documents ──────────────────────────────────────────

import { projectFinancialStatements, projectAllFinancialStatements } from "@/lib/data/audit/documentProjection";
import { calculateBonds } from "@figaro-protocol/sdk";

const withBonds = (o: Partial<Order> & Pick<Order, "orderHash" | "seller">): Order => {
    const base = mkOrder({ payment: 100n, runningTotal: 100n, ...o });
    const { buyerBond, sellerBond } = calculateBonds(base.runningTotal, base.payment);
    return { ...base, buyerBond, sellerBond };
};

describe("projectFinancialStatements — the 3 statements AS a document (no duplicate invoice)", () => {
    it("emits balance sheet + income statement clauses and a cash-flow table; identity holds", () => {
        const doc = projectFinancialStatements(
            [withBonds({ orderHash: "0xA", seller: "0xS", payment: 100n, runningTotal: 100n })],
            "process", "0xPROC",
        );
        const c = "0xtoken";
        const bs = doc.leafSections!.find((s) => s.label === `Balance sheet · ${c}`)!;
        const val = (k: string) => BigInt(bs.entries.find((e) => e.key.startsWith(k))!.value);
        // assets (bonds) = liabilities (refunds) + retained earnings
        expect(val("Buyer bonds") + val("Seller bonds"))
            .toBe(val("Refund owed to buyer") + val("Refund owed to seller") + val("Retained earnings"));
        // cash flow: 2 commit events for one active order
        expect(doc.lines!.rows).toHaveLength(2);
        expect(doc.lines!.columns).toEqual(["kind", "order", "party", "amount"]);
        // NO invoice/line-item concept in the financial statements
        expect((doc as unknown as { lineItems?: unknown }).lineItems).toBeUndefined();
    });

    it("projectAllFinancialStatements: one per seller + one consolidated", () => {
        const orders = [
            withBonds({ orderHash: "0xA", seller: "0xS1", payment: 100n, runningTotal: 100n }),
            withBonds({ orderHash: "0xB", seller: "0xS2", payment: 40n, runningTotal: 140n }),
        ];
        const docs = projectAllFinancialStatements(orders, "0xPROC");
        expect(docs.filter((d) => d.genre === "financial-statements-seller")).toHaveLength(2);
        expect(docs.filter((d) => d.genre === "financial-statements-process")).toHaveLength(1);
    });
});

// ── The legend: every label the statements emit is explained ───────────────────

import { FINANCIAL_STATEMENT_LEGEND } from "@/lib/data/audit/documentProjection";

describe("financial statements legend — derived from the projection's own labels", () => {
    // One open order and one resolved order, so every row key AND every
    // cash-flow kind (commit and resolve) is emitted.
    const docs = projectAllFinancialStatements([
        withBonds({ orderHash: "0xA", seller: "0xS1", payment: 100n, runningTotal: 100n }),
        withBonds({ orderHash: "0xB", seller: "0xS2", payment: 40n, runningTotal: 140n, state: OrderState.Resolved }),
    ], "0xPROC");

    it("every emitted row key and cash-flow kind has a legend entry, on every statement", () => {
        for (const d of docs) {
            const emitted = [
                ...d.leafSections!.flatMap((s) => s.entries.map((e) => e.key)),
                ...d.lines!.rows.map((r) => r[0]),
            ];
            const legendKeys = d.legend!.map((l) => l.key);
            for (const key of emitted) {
                expect(Object.keys(FINANCIAL_STATEMENT_LEGEND), key).toContain(key);
                expect(legendKeys, key).toContain(key);
            }
            // …and the legend explains nothing the statement does not show.
            for (const key of legendKeys) expect(emitted, key).toContain(key);
        }
    });

    it("the consolidated statement explains every label in the map", () => {
        const consolidated = docs.find((d) => d.genre === "financial-statements-process")!;
        expect(consolidated.legend!.map((l) => l.key)).toEqual(Object.keys(FINANCIAL_STATEMENT_LEGEND));
        expect(consolidated.legend!.every((l) => l.description.length > 0)).toBe(true);
    });

    it("Σ2P and Σ2G are the bonds: the buyer's twice the payment, the sellers' twice the cumulative value", () => {
        expect(FINANCIAL_STATEMENT_LEGEND["Buyer bonds (Σ2P)"]).toMatch(/buyer's bonds.*twice each payment/);
        expect(FINANCIAL_STATEMENT_LEGEND["Seller bonds (Σ2G)"]).toMatch(/sellers' bonds.*twice each order's cumulative value/);
    });

    it("no orders: no rows, no legend", () => {
        expect(projectFinancialStatements([], "process", "0xPROC").legend).toBeUndefined();
    });
});
