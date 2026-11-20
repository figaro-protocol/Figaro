/**
 * planSubOrderSellers (the per-clause binding cursor) + resolveSubOrderPricing
 * (live contributor pricing, fixed + rate). Migrated from the frontend's
 * assemblySubOrderPlan suite when checkout planning promoted to the SDK.
 */
import { describe, expect, it } from "vitest";
import { geohashCentroidDistanceKm } from "../src/derive/geo.js";
import {
    planSubOrderSellers,
    resolveSubOrderPricing,
    profileValuesFor,
    registerRateQuantitySource,
    listRateQuantitySources,
    getRateQuantityResolver,
    type BoundProcessPlanInput,
    type PricingCatalog,
} from "../src/checkoutPlan.js";
import { buildOrderAgreement } from "../src/projection.js";
import { keyOf, rawSpecOf, specSourceFromFixtures, specSourceOf, viewOf } from "./specFixtures.js";
import { hydrateAuthored } from "./hydrate.js";

// The kit-assembly diamond: A (lead, root) → B, A → C, B → D, C → D.
// B + D carry proximity-policy, C carries emissions. Proximity is bound
// to [Swift, Mercato], so the per-clause cursor hands B→Swift, D→Mercato by
// commit order. Structure + clauses come straight off the registered agreements —
// party-agnostic, no baked payment. Parents are each entry's own `follows`
// (planSubOrderSellers reads them via processDesignFollows).
const MERCATO = "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f" as const;
const SWIFT = "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955" as const;
const ROSSO = "0x976EA74026E726554dB657fA54763abd0C3a0aa9" as const;

const PROX = keyOf("figaro-proximity-policy");
const EMISSIONS = keyOf("figaro-emissions");

const NO_SPECS = specSourceFromFixtures([]);
const GEO_SPECS = specSourceFromFixtures(["figaro-geolocation"]);
// The geolocation spec with no declared default for its standard, read under
// the same key, so an omitted standard stays absent in what commits.
const GEO_SPECS_NO_DEFAULT = (() => {
    const raw = rawSpecOf("figaro-geolocation");
    const fields = (raw.fields as Array<Record<string, unknown>>).map((field) => {
        if (field.name !== "geocodeStandard") return field;
        const { default: _omitted, ...rest } = field;
        return rest;
    });
    return specSourceOf([{ ...viewOf({ ...raw, fields }), clauseKey: keyOf("figaro-geolocation") }]);
})();
const SCHEDULE_SPECS = specSourceFromFixtures(["figaro-schedule"]);

const assembly: BoundProcessPlanInput = {
    coSellerBindings: [
        { clauseKey: PROX, addresses: [SWIFT, MERCATO] },
        { clauseKey: EMISSIONS, addresses: [ROSSO] },
    ],
    hydratedAssembly: hydrateAuthored({
        name: "Kit",
        agreements: [
            { id: "A", clauses: {}, follows: [] },
            { id: "B", clauses: { [PROX]: {} }, follows: ["A"] },
            { id: "C", clauses: { [EMISSIONS]: {} }, follows: ["A"] },
            { id: "D", clauses: { [PROX]: {} }, follows: ["B", "C"] },
        ],
    }),
};

// Every seller — the lead included — prices from its OWN catalog's component
// item at the item's published price.
const catalogs = [
    {
        address: SWIFT,
        items: [{
            id: "kit-fastening", name: "Fastening", category: "component",
            price: "0.6", available: true,
        }],
    },
    {
        address: ROSSO,
        items: [{
            id: "kit-housing", name: "Housing", category: "component",
            price: "0.55", available: true,
        }],
    },
    {
        address: MERCATO,
        items: [{
            id: "kit-assemble", name: "Assemble", category: "component",
            price: "0.25", available: true,
        }],
    },
] as unknown as PricingCatalog[];

const orderById = (id: string) =>
    planSubOrderSellers(assembly).map((p) => p.node).find((o) => o.nodeId === id)!;
const payArgs = (node: { clauses: Record<string, Record<string, unknown>> }, seller: `0x${string}`) => ({
    node, seller, sellerCatalogs: catalogs, tokenDecimals: 18, specs: NO_SPECS,
});

describe("planSubOrderSellers", () => {
    it("orders sub-orders topologically (parents before children)", () => {
        expect(planSubOrderSellers(assembly).map((p) => p.node.nodeId)).toEqual(["B", "C", "D"]);
    });

    it("assigns sellers by binding, drawing shared-clause siblings by commit order", () => {
        const plan = planSubOrderSellers(assembly);
        expect(plan.find((p) => p.node.nodeId === "B")!.seller).toBe(SWIFT); // proximity cursor 0
        expect(plan.find((p) => p.node.nodeId === "C")!.seller).toBe(ROSSO); // emissions
        expect(plan.find((p) => p.node.nodeId === "D")!.seller).toBe(MERCATO); // proximity cursor 1
    });

    it("returns a null seller when no binding covers the order's clause", () => {
        const unbound: BoundProcessPlanInput = { ...assembly, coSellerBindings: [] };
        expect(planSubOrderSellers(unbound).every((p) => p.seller === null)).toBe(true);
    });
});

describe("a co-seller binding that names an item in the co-seller's catalog", () => {
    // Swift publishes two items; the binding names the second for Swift and
    // nothing for Mercato.
    const twoItemCatalogs = [
        {
            address: SWIFT,
            items: [
                { id: "kit-fastening", name: "Fastening", price: "0.6", available: true },
                { id: "kit-rivets", name: "Rivets", price: "0.9", available: true },
            ],
        },
        { address: MERCATO, items: [{ id: "kit-assemble", name: "Assemble", price: "0.25", available: true }] },
    ] as unknown as PricingCatalog[];
    const named: BoundProcessPlanInput = {
        ...assembly,
        coSellerBindings: [
            { clauseKey: PROX, addresses: [SWIFT, MERCATO], itemIds: { [SWIFT.toLowerCase()]: "kit-rivets" } },
            { clauseKey: EMISSIONS, addresses: [ROSSO] },
        ],
    };
    const planned = (id: string) => planSubOrderSellers(named).find((p) => p.node.nodeId === id)!;

    it("the plan hands each sub-order the item named for its seller, and null where none is named", () => {
        expect(planned("B").itemId).toBe("kit-rivets"); // Swift, named
        expect(planned("D").itemId).toBeNull(); // Mercato, not named
        expect(planned("C").itemId).toBeNull(); // Rosso, no map on its binding
    });

    it("named and available: prices from the named item, not the first available one", () => {
        const { node, seller, itemId } = planned("B");
        const p = resolveSubOrderPricing({
            node, seller: seller!, itemId: itemId ?? undefined,
            sellerCatalogs: twoItemCatalogs, tokenDecimals: 18, specs: NO_SPECS,
        });
        expect(p.item?.id).toBe("kit-rivets");
        expect(p.payment).toBe(900000000000000000n);
        expect(p.issue).toBeUndefined();
    });

    it("named and gone from the catalog: refuses with named-item-not-offered and prices nothing", () => {
        const gone = [
            { address: SWIFT, items: [{ id: "kit-rivets-v2", name: "Rivets", price: "0.9", available: true }] },
        ] as unknown as PricingCatalog[];
        const p = resolveSubOrderPricing({
            node: planned("B").node, seller: SWIFT, itemId: "kit-rivets",
            sellerCatalogs: gone, tokenDecimals: 18, specs: NO_SPECS,
        });
        expect(p.issue).toBe("named-item-not-offered");
        expect(p.item).toBeNull();
        expect(p.payment).toBe(0n);
    });

    it("named and marked unavailable: refuses the same way, never falls back to another item", () => {
        const off = [
            {
                address: SWIFT,
                items: [
                    { id: "kit-fastening", name: "Fastening", price: "0.6", available: true },
                    { id: "kit-rivets", name: "Rivets", price: "0.9", available: false },
                ],
            },
        ] as unknown as PricingCatalog[];
        const p = resolveSubOrderPricing({
            node: planned("B").node, seller: SWIFT, itemId: "kit-rivets",
            sellerCatalogs: off, tokenDecimals: 18, specs: NO_SPECS,
        });
        expect(p.issue).toBe("named-item-not-offered");
        expect(p.payment).toBe(0n);
    });

    it("unnamed: prices from the first available item, as before", () => {
        const p = resolveSubOrderPricing({
            node: planned("B").node, seller: SWIFT,
            sellerCatalogs: twoItemCatalogs, tokenDecimals: 18, specs: NO_SPECS,
        });
        expect(p.item?.id).toBe("kit-fastening");
        expect(p.payment).toBe(600000000000000000n);
    });
});

describe("resolveSubOrderPricing — fixed items", () => {
    it("prices a contributor node live from its published catalog price", () => {
        const p = resolveSubOrderPricing(payArgs(orderById("B"), SWIFT));
        expect(p.payment).toBe(600000000000000000n);
        // Fixed items commit as quantity 1 × the full payment.
        expect(p.billedQuantity).toBe(1);
        expect(p.unitPrice).toBe(p.payment);
        expect(p.issue).toBeUndefined();
    });

    it("prices the lead's own node from the lead's own catalog", () => {
        expect(resolveSubOrderPricing(payArgs(orderById("D"), MERCATO)).payment).toBe(250000000000000000n);
    });

    it("returns 0 + no-item when the seller publishes no component item", () => {
        const p = resolveSubOrderPricing({ ...payArgs(orderById("B"), SWIFT), sellerCatalogs: [] });
        expect(p.payment).toBe(0n);
        expect(p.item).toBeNull();
        expect(p.issue).toBe("no-item");
    });

    it("sums to the displayed total with bigint arithmetic (regression: no string-concat)", () => {
        const plan = planSubOrderSellers(assembly);
        const rootPayment = 1000000000000000000n; // product price on the lead/root
        const total = plan.reduce(
            (sum, { node, seller }) => sum + resolveSubOrderPricing(payArgs(node, seller!)).payment,
            rootPayment,
        );
        // 1 + 0.6 (B/Swift) + 0.55 (C/Rosso) + 0.25 (D/Mercato) = 2.40. A
        // `bigint + string` regression would concatenate, not sum to this.
        expect(total).toBe(2400000000000000000n);
    });
});

// ── Rate pricing: payment = rate × billed units (per started unit) ──────────

const GEO = keyOf("figaro-geolocation");
const SCHEDULE = keyOf("figaro-schedule");
// 9q8yy ≈ San Francisco, 9q5ct ≈ Los Angeles — several hundred km apart.
const SF = "9q8yy";
const LA = "9q5ct";

const rateCatalog = (item: Record<string, unknown>): PricingCatalog[] =>
    [{ address: SWIFT, items: [item] }] as unknown as PricingCatalog[];

const nodeWithClauses = (clauses: Record<string, Record<string, unknown>>) =>
    ({ clauses: { ...clauses } });

describe("resolveSubOrderPricing — rate items", () => {
    it("checkout-quantity: payment = rate × the buyer's entered units", () => {
        const p = resolveSubOrderPricing({
            node: nodeWithClauses({}),
            seller: SWIFT,
            sellerCatalogs: rateCatalog({
                id: "consulting", name: "Consulting", price: "0.5", available: true,
                pricingPolicy: "rate", rateUnit: "hour", rateQuantitySource: "checkout-quantity",
            }),
            tokenDecimals: 18,
            specs: GEO_SPECS,
            checkoutQuantity: 16,
        });
        expect(p.billedQuantity).toBe(16);
        expect(p.unitPrice).toBe(500000000000000000n);
        expect(p.payment).toBe(8000000000000000000n); // 0.5 × 16 = 8
        expect(p.payment).toBe(p.unitPrice * BigInt(p.billedQuantity)); // replayable
    });

    it("checkout-quantity without an entered value is unresolvable, never defaulted", () => {
        const p = resolveSubOrderPricing({
            node: nodeWithClauses({}),
            seller: SWIFT,
            sellerCatalogs: rateCatalog({
                id: "consulting", name: "Consulting", price: "0.5", available: true,
                pricingPolicy: "rate", rateUnit: "hour", rateQuantitySource: "checkout-quantity",
            }),
            tokenDecimals: 18,
            specs: GEO_SPECS,
        });
        expect(p.payment).toBe(0n);
        expect(p.issue).toBe("unresolvable-quantity");
    });

    it("order-geodistance: payment = rate × ceil(centroid km), from the order's own committed endpoints", () => {
        const p = resolveSubOrderPricing({
            node: nodeWithClauses({ [GEO]: { geocodeStandard: "geohash", origin: SF, destination: LA } }),
            seller: SWIFT,
            sellerCatalogs: rateCatalog({
                id: "haul", name: "Haul", price: "0.01", available: true,
                pricingPolicy: "rate", rateUnit: "km", rateQuantitySource: "order-geodistance",
            }),
            tokenDecimals: 18,
            specs: GEO_SPECS,
        });
        const km = geohashCentroidDistanceKm(SF, LA);
        expect(p.resolvedUnits).toBeCloseTo(km, 6);
        expect(p.billedQuantity).toBe(Math.ceil(km)); // per started unit
        expect(p.unitPrice).toBe(10000000000000000n);
        expect(p.payment).toBe(p.unitPrice * BigInt(p.billedQuantity)); // replayable
    });

    it("order-geodistance bills min 1 unit for a same-cell (zero-distance) order", () => {
        const p = resolveSubOrderPricing({
            node: nodeWithClauses({ [GEO]: { geocodeStandard: "geohash", origin: SF, destination: SF } }),
            seller: SWIFT,
            sellerCatalogs: rateCatalog({
                id: "haul", name: "Haul", price: "0.01", available: true,
                pricingPolicy: "rate", rateUnit: "km", rateQuantitySource: "order-geodistance",
            }),
            tokenDecimals: 18,
            specs: GEO_SPECS,
        });
        expect(p.billedQuantity).toBe(1);
        expect(p.payment).toBe(10000000000000000n);
    });

    it.each([
        ["absent, under a spec that declares no default,", {}, GEO_SPECS_NO_DEFAULT],
        ["empty", { geocodeStandard: "" }, GEO_SPECS],
    ])("order-geodistance with an %s geocodeStandard prices nothing, never reads the codes as geohash", (_label, standard, specs) => {
        const p = resolveSubOrderPricing({
            node: nodeWithClauses({ [GEO]: { ...standard, origin: SF, destination: LA } }),
            seller: SWIFT,
            sellerCatalogs: rateCatalog({
                id: "haul", name: "Haul", price: "0.01", available: true,
                pricingPolicy: "rate", rateUnit: "km", rateQuantitySource: "order-geodistance",
            }),
            tokenDecimals: 18,
            specs,
        });
        expect(p.payment).toBe(0n);
        expect(p.issue).toBe("unresolvable-quantity");
    });

    it("order-geodistance with an absent geocodeStandard prices by the spec's declared default, the value the agreement commits", () => {
        // The buyer leaves the standard at the spec's default; the agreement
        // projection fills that default into what is signed, so the price
        // is read from the same values.
        const clauses = { [GEO]: { origin: SF, destination: LA } };
        const p = resolveSubOrderPricing({
            node: nodeWithClauses(clauses),
            seller: SWIFT,
            sellerCatalogs: rateCatalog({
                id: "haul", name: "Haul", price: "0.01", available: true,
                pricingPolicy: "rate", rateUnit: "km", rateQuantitySource: "order-geodistance",
            }),
            tokenDecimals: 18,
            specs: GEO_SPECS,
        });
        const committed = buildOrderAgreement(ROSSO, SWIFT, clauses, GEO_SPECS);
        expect(committed.agreement.clauses.find((c) => c.clause === GEO)?.data.geocodeStandard).toBe("geohash");
        expect(p.issue).toBeUndefined();
        expect(p.billedQuantity).toBe(Math.ceil(geohashCentroidDistanceKm(SF, LA)));
    });

    it("order-geodistance on an order without committed endpoints is unresolvable", () => {
        const p = resolveSubOrderPricing({
            node: nodeWithClauses({}),
            seller: SWIFT,
            sellerCatalogs: rateCatalog({
                id: "haul", name: "Haul", price: "0.01", available: true,
                pricingPolicy: "rate", rateUnit: "km", rateQuantitySource: "order-geodistance",
            }),
            tokenDecimals: 18,
            specs: GEO_SPECS,
        });
        expect(p.payment).toBe(0n);
        expect(p.issue).toBe("unresolvable-quantity");
    });

    it("booking-window: payment = rate × ceil(hours), from the order's committed window", () => {
        // A 3.5-hour window (09:00 → 12:30) bills 4 started hours.
        const p = resolveSubOrderPricing({
            node: nodeWithClauses({
                [SCHEDULE]: { windowStart: "2026-07-22T09:00:00Z", windowEnd: "2026-07-22T12:30:00Z" },
            }),
            seller: SWIFT,
            sellerCatalogs: rateCatalog({
                id: "consulting", name: "Consulting", price: "0.5", available: true,
                pricingPolicy: "rate", rateUnit: "hour", rateQuantitySource: "booking-window",
            }),
            tokenDecimals: 18,
            specs: SCHEDULE_SPECS,
        });
        expect(p.resolvedUnits).toBeCloseTo(3.5, 6);
        expect(p.billedQuantity).toBe(4); // per started hour
        expect(p.unitPrice).toBe(500000000000000000n);
        expect(p.payment).toBe(p.unitPrice * BigInt(p.billedQuantity)); // replayable
    });

    it("booking-window bills min 1 hour for a sub-hour window", () => {
        const p = resolveSubOrderPricing({
            node: nodeWithClauses({
                [SCHEDULE]: { windowStart: "2026-07-22T09:00:00Z", windowEnd: "2026-07-22T09:20:00Z" },
            }),
            seller: SWIFT,
            sellerCatalogs: rateCatalog({
                id: "consulting", name: "Consulting", price: "0.5", available: true,
                pricingPolicy: "rate", rateUnit: "hour", rateQuantitySource: "booking-window",
            }),
            tokenDecimals: 18,
            specs: SCHEDULE_SPECS,
        });
        expect(p.billedQuantity).toBe(1);
        expect(p.payment).toBe(500000000000000000n);
    });

    it("booking-window with a reversed or malformed window is unresolvable, never junk-priced", () => {
        for (const window of [
            { windowStart: "2026-07-22T12:00:00Z", windowEnd: "2026-07-22T09:00:00Z" }, // reversed
            { windowStart: "not-a-date", windowEnd: "2026-07-22T12:00:00Z" },            // malformed
            {},                                                                          // no window
        ]) {
            const p = resolveSubOrderPricing({
                node: nodeWithClauses({ [SCHEDULE]: window }),
                seller: SWIFT,
                sellerCatalogs: rateCatalog({
                    id: "consulting", name: "Consulting", price: "0.5", available: true,
                    pricingPolicy: "rate", rateUnit: "hour", rateQuantitySource: "booking-window",
                }),
                tokenDecimals: 18,
                specs: SCHEDULE_SPECS,
            });
            expect(p.payment).toBe(0n);
            expect(p.issue).toBe("unresolvable-quantity");
        }
    });

    it("an unregistered quantity source is unresolvable — never silently fixed-priced", () => {
        const p = resolveSubOrderPricing({
            node: nodeWithClauses({}),
            seller: SWIFT,
            sellerCatalogs: rateCatalog({
                id: "x", name: "X", price: "0.5", available: true,
                pricingPolicy: "rate", rateUnit: "unit", rateQuantitySource: "never-seen-source",
            }),
            tokenDecimals: 18,
            specs: GEO_SPECS,
        });
        expect(p.payment).toBe(0n);
        expect(p.issue).toBe("unresolvable-quantity");
    });
});

describe("profileValuesFor — a seller's profile-filled clause values from its catalog", () => {
    const values = { [PROX]: { radiusKm: 12 } };
    const catalogs: PricingCatalog[] = [
        { address: SWIFT, items: [] },
        { address: MERCATO, items: [], profileClauseValues: values },
    ];

    it("returns the values of the catalog whose address is the seller, whatever the letter case", () => {
        expect(profileValuesFor(MERCATO, catalogs)).toBe(values);
        expect(profileValuesFor(MERCATO.toLowerCase() as `0x${string}`, catalogs)).toBe(values);
    });

    it("is undefined for a seller that stores none, and for a seller with no catalog", () => {
        expect(profileValuesFor(SWIFT, catalogs)).toBeUndefined();
        expect(profileValuesFor(ROSSO, catalogs)).toBeUndefined();
    });
});

describe("the rate-quantity source registry", () => {
    it("lists the three in-file derivations with their labels", () => {
        const listed = listRateQuantitySources();
        expect(listed).toEqual(expect.arrayContaining([
            { source: "checkout-quantity", label: "Entered at checkout" },
            { source: "order-geodistance", label: "Distance between the order's committed endpoints (km)" },
            { source: "booking-window", label: "Hours from the order's committed schedule window" },
        ]));
    });

    it("registers a tenant the picker then lists and the pricing site then resolves", () => {
        const tenant = () => 42;
        registerRateQuantitySource("acme-routed-distance", tenant, { label: "Routed distance (km)" });
        expect(listRateQuantitySources()).toContainEqual({ source: "acme-routed-distance", label: "Routed distance (km)" });
        expect(getRateQuantityResolver("acme-routed-distance")).toBe(tenant);
    });

    it("lists an unlabeled tenant under its source id", () => {
        registerRateQuantitySource("acme-unlabeled", () => null);
        expect(listRateQuantitySources()).toContainEqual({ source: "acme-unlabeled", label: "acme-unlabeled" });
    });

    it("lets the last registration win", () => {
        const second = () => 2;
        registerRateQuantitySource("acme-replaced", () => 1);
        registerRateQuantitySource("acme-replaced", second);
        expect(getRateQuantityResolver("acme-replaced")).toBe(second);
        expect(listRateQuantitySources().filter((s) => s.source === "acme-replaced")).toHaveLength(1);
    });
});

// ── The quantity sources read the marks a spec declares ─────────────────────
//
// Clauses no repository file carries, written here: their field names share
// nothing with the reference clauses. A source reads the mark the spec
// declares in `block.checkout` (`endpoints` for the route's two endpoints,
// `timeWindow` for the window's start and end), never the shape of the
// fields, a field name or a clause id. A clause with no mark yields no
// quantity, so the item stays unpriced.

type FieldDoc = Record<string, unknown>;
const standardField = (name: string): FieldDoc =>
    ({ name, type: "string", required: true, minLength: 1, maxLength: 64, default: "geohash" });
const pointField = (name: string, from: string): FieldDoc =>
    ({ name, type: "string", required: true, minLength: 1, maxLength: 32, formatFromField: from });
const strangerView = (clauseId: string, fields: FieldDoc[], checkout?: Record<string, unknown>) =>
    viewOf({ clauseId, version: 1, title: clauseId, description: "", fields, stages: {}, ...(checkout && { block: { checkout } }) });

const ROUTE_FIELDS = [
    standardField("cellSystem"),
    pointField("pickupCell", "cellSystem"),
    pointField("dropoffCell", "cellSystem"),
];
const ROUTE = strangerView("acme-route", ROUTE_FIELDS, { endpoints: { from: "pickupCell", to: "dropoffCell" } });
const geodistance = (clauses: Record<string, Record<string, unknown>>, specs: ReturnType<typeof specSourceOf>) =>
    getRateQuantityResolver("order-geodistance")!({ clauses, specs });

describe("order-geodistance — the endpoints the spec marks", () => {
    it("prices a stranger's clause that marks its endpoints under its own field names", () => {
        const specs = specSourceOf([ROUTE]);
        const km = geodistance({ [ROUTE.clauseKey]: { cellSystem: "geohash", pickupCell: SF, dropoffCell: LA } }, specs);
        expect(km).toBe(geohashCentroidDistanceKm(SF, LA));
        const p = resolveSubOrderPricing({
            node: nodeWithClauses({ [ROUTE.clauseKey]: { pickupCell: SF, dropoffCell: LA } }),
            seller: SWIFT,
            sellerCatalogs: rateCatalog({
                id: "haul", name: "Haul", price: "0.01", available: true,
                pricingPolicy: "rate", rateUnit: "km", rateQuantitySource: "order-geodistance",
            }),
            tokenDecimals: 18,
            specs,
        });
        // The standard left at the spec's default prices as it is signed.
        expect(p.issue).toBeUndefined();
        expect(p.billedQuantity).toBe(Math.ceil(geohashCentroidDistanceKm(SF, LA)));
    });

    it("gives the reference location clause from clauses/ the centroid distance between its marked endpoints", () => {
        const km = geodistance({ [GEO]: { geocodeStandard: "geohash", origin: SF, destination: LA } }, GEO_SPECS);
        expect(km).toBe(geohashCentroidDistanceKm(SF, LA));
    });

    it("reads no distance from a clause with two geohash endpoint fields and no mark", () => {
        const unmarked = strangerView("acme-unmarked-route", ROUTE_FIELDS);
        expect(geodistance(
            { [unmarked.clauseKey]: { cellSystem: "geohash", pickupCell: SF, dropoffCell: LA } },
            specSourceOf([unmarked]),
        )).toBeNull();
        const p = resolveSubOrderPricing({
            node: nodeWithClauses({ [unmarked.clauseKey]: { cellSystem: "geohash", pickupCell: SF, dropoffCell: LA } }),
            seller: SWIFT,
            sellerCatalogs: rateCatalog({
                id: "haul", name: "Haul", price: "0.01", available: true,
                pricingPolicy: "rate", rateUnit: "km", rateQuantitySource: "order-geodistance",
            }),
            tokenDecimals: 18,
            specs: specSourceOf([unmarked]),
        });
        expect(p.payment).toBe(0n);
        expect(p.issue).toBe("unresolvable-quantity");
    });

    it("reads no distance when the committed standard is not geohash", () => {
        const specs = specSourceOf([ROUTE]);
        expect(geodistance({ [ROUTE.clauseKey]: { cellSystem: "h3", pickupCell: SF, dropoffCell: LA } }, specs)).toBeNull();
    });

    it("prices a clause with three geohash fields by the two its mark names", () => {
        const three = strangerView("acme-leg", [
            standardField("cellSystem"),
            pointField("aCell", "cellSystem"),
            pointField("bCell", "cellSystem"),
            pointField("cCell", "cellSystem"),
        ], { endpoints: { from: "aCell", to: "cCell" } });
        expect(geodistance(
            { [three.clauseKey]: { cellSystem: "geohash", aCell: SF, bCell: SF, cCell: LA } },
            specSourceOf([three]),
        )).toBe(geohashCentroidDistanceKm(SF, LA));
    });

    it("reads no distance when two clauses of the order each mark endpoints, in either order", () => {
        const specs = specSourceOf([ROUTE, viewOf(rawSpecOf("figaro-geolocation"))]);
        const route = { cellSystem: "geohash", pickupCell: SF, dropoffCell: SF };
        const geo = { geocodeStandard: "geohash", origin: SF, destination: LA };
        expect(geodistance({ [ROUTE.clauseKey]: route, [GEO]: geo }, specs)).toBeNull();
        expect(geodistance({ [GEO]: geo, [ROUTE.clauseKey]: route }, specs)).toBeNull();
    });

    it("prices from the one marked clause when another clause carries unmarked geohash fields", () => {
        const unmarked = strangerView("acme-unmarked-route", ROUTE_FIELDS);
        const specs = specSourceOf([ROUTE, unmarked]);
        expect(geodistance({
            [unmarked.clauseKey]: { cellSystem: "geohash", pickupCell: SF, dropoffCell: SF },
            [ROUTE.clauseKey]: { cellSystem: "geohash", pickupCell: SF, dropoffCell: LA },
        }, specs)).toBe(geohashCentroidDistanceKm(SF, LA));
    });

    it.each([
        ["names a field the spec does not declare", { from: "pickupCell", to: "elsewhere" }],
        ["names one field twice", { from: "pickupCell", to: "pickupCell" }],
    ])("reads no distance from a mark that %s", (_label, endpoints) => {
        const bad = strangerView("acme-bad-mark", ROUTE_FIELDS, { endpoints });
        expect(geodistance(
            { [bad.clauseKey]: { cellSystem: "geohash", pickupCell: SF, dropoffCell: LA, elsewhere: LA } },
            specSourceOf([bad]),
        )).toBeNull();
    });

    it("reads no distance when a marked field's formatFromField names a field the spec does not declare", () => {
        const dangling = strangerView("acme-dangling", [
            pointField("pickupCell", "cellSystem"),
            pointField("dropoffCell", "cellSystem"),
        ], { endpoints: { from: "pickupCell", to: "dropoffCell" } });
        expect(geodistance(
            { [dangling.clauseKey]: { cellSystem: "geohash", pickupCell: SF, dropoffCell: LA } },
            specSourceOf([dangling]),
        )).toBeNull();
    });

    it("reads no distance from marked fields with a static geohash format: the order's content declares no standard", () => {
        const fixed = strangerView("acme-fixed", [
            { name: "aCell", type: "string", required: true, minLength: 1, maxLength: 32, format: "geohash" },
            { name: "bCell", type: "string", required: true, minLength: 1, maxLength: 32, format: "geohash" },
        ], { endpoints: { from: "aCell", to: "bCell" } });
        expect(geodistance({ [fixed.clauseKey]: { aCell: SF, bCell: LA } }, specSourceOf([fixed]))).toBeNull();
    });

    it("reads no distance from a malformed committed code", () => {
        const specs = specSourceOf([ROUTE]);
        expect(geodistance(
            { [ROUTE.clauseKey]: { cellSystem: "geohash", pickupCell: SF, dropoffCell: "not!a!cell" } },
            specs,
        )).toBeNull();
    });
});

const instantField = (name: string): FieldDoc =>
    ({ name, type: "string", required: true, format: "iso-datetime" });
// The mark names the start and the end; declaration order says nothing.
const RENTAL = strangerView("acme-rental", [instantField("returnBy"), instantField("pickUpAt")],
    { timeWindow: { start: "pickUpAt", end: "returnBy" } });
const bookingHours = (clauses: Record<string, Record<string, unknown>>, specs: ReturnType<typeof specSourceOf>) =>
    getRateQuantityResolver("booking-window")!({ clauses, specs });
const NINE = "2026-07-22T09:00:00Z";
const HALF_PAST_TWELVE = "2026-07-22T12:30:00Z";

describe("booking-window — the window the spec marks", () => {
    it("prices hours on a stranger's clause that marks its window under its own field names", () => {
        const specs = specSourceOf([RENTAL]);
        expect(bookingHours({ [RENTAL.clauseKey]: { pickUpAt: NINE, returnBy: HALF_PAST_TWELVE } }, specs)).toBe(3.5);
        const p = resolveSubOrderPricing({
            node: nodeWithClauses({ [RENTAL.clauseKey]: { pickUpAt: NINE, returnBy: HALF_PAST_TWELVE } }),
            seller: SWIFT,
            sellerCatalogs: rateCatalog({
                id: "rental", name: "Rental", price: "0.5", available: true,
                pricingPolicy: "rate", rateUnit: "hour", rateQuantitySource: "booking-window",
            }),
            tokenDecimals: 18,
            specs,
        });
        expect(p.issue).toBeUndefined();
        expect(p.billedQuantity).toBe(4);
    });

    it("bills nothing for a clause with two unrelated date-time fields and no mark", () => {
        const certificate = strangerView("acme-certificate", [instantField("issuedAt"), instantField("expiresAt")]);
        const specs = specSourceOf([certificate]);
        expect(bookingHours({ [certificate.clauseKey]: { issuedAt: NINE, expiresAt: HALF_PAST_TWELVE } }, specs)).toBeNull();
        const p = resolveSubOrderPricing({
            node: nodeWithClauses({ [certificate.clauseKey]: { issuedAt: NINE, expiresAt: HALF_PAST_TWELVE } }),
            seller: SWIFT,
            sellerCatalogs: rateCatalog({
                id: "consulting", name: "Consulting", price: "0.5", available: true,
                pricingPolicy: "rate", rateUnit: "hour", rateQuantitySource: "booking-window",
            }),
            tokenDecimals: 18,
            specs,
        });
        expect(p.payment).toBe(0n);
        expect(p.issue).toBe("unresolvable-quantity");
    });

    it("gives the reference schedule clause from clauses/ the hours between its marked instants", () => {
        expect(bookingHours({ [SCHEDULE]: { windowStart: NINE, windowEnd: HALF_PAST_TWELVE } }, SCHEDULE_SPECS)).toBe(3.5);
    });

    it("a window whose marked end is not after its marked start prices nothing", () => {
        const specs = specSourceOf([RENTAL]);
        expect(bookingHours({ [RENTAL.clauseKey]: { pickUpAt: HALF_PAST_TWELVE, returnBy: NINE } }, specs)).toBeNull();
        expect(bookingHours({ [RENTAL.clauseKey]: { pickUpAt: NINE, returnBy: NINE } }, specs)).toBeNull();
    });

    it("prices a clause with three date-time fields by the two its mark names", () => {
        const three = strangerView("acme-legs", [instantField("aAt"), instantField("bAt"), instantField("cAt")],
            { timeWindow: { start: "aAt", end: "cAt" } });
        expect(bookingHours(
            { [three.clauseKey]: { aAt: NINE, bAt: NINE, cAt: HALF_PAST_TWELVE } },
            specSourceOf([three]),
        )).toBe(3.5);
    });

    it("reads no window when two clauses of the order each mark a window, in either order", () => {
        const specs = specSourceOf([RENTAL, viewOf(rawSpecOf("figaro-schedule"))]);
        const rental = { pickUpAt: NINE, returnBy: HALF_PAST_TWELVE };
        const schedule = { windowStart: NINE, windowEnd: HALF_PAST_TWELVE };
        expect(bookingHours({ [RENTAL.clauseKey]: rental, [SCHEDULE]: schedule }, specs)).toBeNull();
        expect(bookingHours({ [SCHEDULE]: schedule, [RENTAL.clauseKey]: rental }, specs)).toBeNull();
    });

    it("prices from the one marked clause when another clause carries unmarked date-time fields", () => {
        const certificate = strangerView("acme-certificate", [instantField("issuedAt"), instantField("expiresAt")]);
        expect(bookingHours({
            [certificate.clauseKey]: { issuedAt: NINE, expiresAt: NINE },
            [RENTAL.clauseKey]: { pickUpAt: NINE, returnBy: HALF_PAST_TWELVE },
        }, specSourceOf([RENTAL, certificate]))).toBe(3.5);
    });

    it.each([
        ["names a field the spec does not declare", [instantField("fromAt"), instantField("toAt")], { start: "fromAt", end: "untilAt" }],
        ["names one field twice", [instantField("fromAt"), instantField("toAt")], { start: "fromAt", end: "fromAt" }],
        ["names a field that declares another format", [instantField("fromAt"), { name: "toText", type: "string", required: true, format: "date" }], { start: "fromAt", end: "toText" }],
        ["names a field that declares no format", [instantField("fromAt"), { name: "toText", type: "string", required: true }], { start: "fromAt", end: "toText" }],
    ])("reads no window from a mark that %s", (_label, fields, timeWindow) => {
        const bad = strangerView("acme-bad-window", fields as FieldDoc[], { timeWindow });
        expect(bookingHours(
            { [bad.clauseKey]: { fromAt: NINE, toAt: HALF_PAST_TWELVE, untilAt: HALF_PAST_TWELVE, toText: HALF_PAST_TWELVE } },
            specSourceOf([bad]),
        )).toBeNull();
    });
});
