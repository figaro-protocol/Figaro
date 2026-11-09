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
    type BoundAssemblyPlanInput,
    type PricingCatalog,
} from "../src/checkoutPlan.js";
import { buildOrderAgreement } from "../src/projection.js";
import { keyOf, rawSpecOf, specSourceFromFixtures, specSourceOf, viewOf } from "./specFixtures.js";
import { hydrateAuthored } from "./hydrate.js";

// The kit-assembly diamond: A (lead, root) → B, A → C, B → D, C → D.
// B + D carry proximity-policy, C carries emissions. Proximity is bound
// to [Swift, Mercato], so the per-clause cursor hands B→Swift, D→Mercato by
// commit order. Structure + clauses come straight off the registered agreements —
// party-agnostic, no baked payment. Parents live INSIDE the topology clause
// (the real assembly shape — planSubOrderSellers reads them via
// assemblyFollows; a node-level follows field is the
// retired pre-topology-clause shape and is never read).
const MERCATO = "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f" as const;
const SWIFT = "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955" as const;
const ROSSO = "0x976EA74026E726554dB657fA54763abd0C3a0aa9" as const;

const PROX = keyOf("figaro-proximity-policy");
const EMISSIONS = keyOf("figaro-emissions");
const TOPO = keyOf("figaro-topology");
const parents = (ids: string[]) => ({ [TOPO]: { follows: ids } });

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

const assembly: BoundAssemblyPlanInput = {
    coSellerBindings: [
        { clauseKey: PROX, addresses: [SWIFT, MERCATO] },
        { clauseKey: EMISSIONS, addresses: [ROSSO] },
    ],
    hydratedAssembly: hydrateAuthored({
        name: "Kit",
        agreements: [
            { id: "A", clauses: { ...parents([]) } },
            { id: "B", clauses: { [PROX]: {}, ...parents(["A"]) } },
            { id: "C", clauses: { [EMISSIONS]: {}, ...parents(["A"]) } },
            { id: "D", clauses: { [PROX]: {}, ...parents(["B", "C"]) } },
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
        const unbound: BoundAssemblyPlanInput = { ...assembly, coSellerBindings: [] };
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
    const named: BoundAssemblyPlanInput = {
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
    ({ clauses: { ...clauses, ...parents(["A"]) } });

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
