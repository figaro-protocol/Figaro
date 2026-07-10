import { beforeAll, describe, expect, it } from "vitest";
import { geohashCentroidDistanceKm } from "@figaro/core/extensions";
import {
    planSubOrderSellers,
    resolveSubOrderPricing,
} from "@/lib/checkout/assemblySubOrderPlan";
import type { AssemblyTemplateAgreement } from "@/lib/shared/assemblyTemplate";
import type { BoundAssembly } from "@/lib/seller/useSellerBoundAssemblies";
import type { SellerCatalogue } from "@/lib/seller/types";
import { primeClauseSpecs } from "./primeClauseSpecs";

// The kit-assembly diamond: A (lead, root) → B, A → C, B → D, C → D.
// B + D carry proximity-policy, C carries emissions. Proximity is bound
// to [Swift, Mercato], so the per-clause cursor hands B→Swift, D→Mercato by
// commit order. Structure + clauses come straight off the template agreements —
// party-agnostic, no baked payment. Parents live INSIDE the topology clause
// (the real template shape — planSubOrderSellers reads them via
// templateParentOrderHashes; a node-level parentOrderHashes field is the
// retired pre-topology-clause shape and is never read).
const MERCATO = "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f" as const;
const SWIFT = "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955" as const;
const ROSSO = "0x976EA74026E726554dB657fA54763abd0C3a0aa9" as const;

const PROX = "figaro-proximity-policy";
const EMISSIONS = "figaro-emissions";
const TOPO = "figaro-topology";
const parents = (ids: string[]) => ({ [TOPO]: { parentOrderHashes: ids } });

const assembly = {
    slug: "kit-assembly",
    name: "Kit",
    canonicalMethod: null,
    counterpartyBindings: [
        { clauseId: PROX, addresses: [SWIFT, MERCATO] },
        { clauseId: EMISSIONS, addresses: [ROSSO] },
    ],
    assemblyTemplate: {
        slug: "kit-assembly",
        name: "Kit",
        agreements: [
            { id: "A", clauses: { ...parents([]) } },
            { id: "B", clauses: { [PROX]: {}, ...parents(["A"]) } },
            { id: "C", clauses: { [EMISSIONS]: {}, ...parents(["A"]) } },
            { id: "D", clauses: { [PROX]: {}, ...parents(["B", "C"]) } },
        ],
    },
} as unknown as BoundAssembly;

// Every seller — the lead included — prices from its OWN catalogue's component
// item at the item's published price.
const catalogues = [
    {
        address: SWIFT,
        name: "Swift Courier",
        items: [{
            id: "kit-fastening", name: "Fastening", category: "component",
            price: "0.6", available: true,
        }],
    },
    {
        address: ROSSO,
        name: "Rosso Kitchen",
        items: [{
            id: "kit-housing", name: "Housing", category: "component",
            price: "0.55", available: true,
        }],
    },
    {
        address: MERCATO,
        name: "Mercato",
        items: [{
            id: "kit-assemble", name: "Assemble", category: "component",
            price: "0.25", available: true,
        }],
    },
] as unknown as SellerCatalogue[];

const orderById = (id: string): AssemblyTemplateAgreement =>
    assembly.assemblyTemplate.agreements.find((o) => o.id === id)!;
const payArgs = (node: AssemblyTemplateAgreement, seller: `0x${string}`) => ({
    node, seller, sellerCatalogues: catalogues, tokenDecimals: 18,
});

describe("planSubOrderSellers", () => {
    it("orders sub-orders topologically (parents before children)", () => {
        expect(planSubOrderSellers(assembly).map((p) => p.node.id)).toEqual(["B", "C", "D"]);
    });

    it("assigns sellers by binding, drawing shared-clause siblings by commit order", () => {
        const plan = planSubOrderSellers(assembly);
        expect(plan.find((p) => p.node.id === "B")!.seller).toBe(SWIFT); // proximity cursor 0
        expect(plan.find((p) => p.node.id === "C")!.seller).toBe(ROSSO); // emissions
        expect(plan.find((p) => p.node.id === "D")!.seller).toBe(MERCATO); // proximity cursor 1
    });

    it("returns a null seller when no binding covers the order's clause", () => {
        const unbound = { ...assembly, counterpartyBindings: [] } as unknown as BoundAssembly;
        expect(planSubOrderSellers(unbound).every((p) => p.seller === null)).toBe(true);
    });
});

describe("resolveSubOrderPricing — fixed items", () => {
    it("prices a contributor node live from its published catalogue price", () => {
        const p = resolveSubOrderPricing(payArgs(orderById("B"), SWIFT));
        expect(p.payment).toBe(600000000000000000n);
        // Fixed items commit as quantity 1 × the full payment.
        expect(p.billedQuantity).toBe(1);
        expect(p.unitPrice).toBe(p.payment);
        expect(p.issue).toBeUndefined();
    });

    it("prices the lead's own node from the lead's own catalogue", () => {
        expect(resolveSubOrderPricing(payArgs(orderById("D"), MERCATO)).payment).toBe(250000000000000000n);
    });

    it("returns 0 + no-item when the seller publishes no component item", () => {
        const p = resolveSubOrderPricing({ ...payArgs(orderById("B"), SWIFT), sellerCatalogues: [] });
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

const GEO = "figaro-geolocation";
// 9q8yy ≈ San Francisco, 9q5ct ≈ Los Angeles — several hundred km apart.
const SF = "9q8yy";
const LA = "9q5ct";

const rateCatalogue = (item: Record<string, unknown>): SellerCatalogue[] =>
    [{ address: SWIFT, name: "Swift Courier", items: [item] }] as unknown as SellerCatalogue[];

const nodeWithClauses = (clauses: Record<string, Record<string, unknown>>): AssemblyTemplateAgreement =>
    ({ id: "R", clauses: { ...clauses, ...parents(["A"]) } }) as unknown as AssemblyTemplateAgreement;

describe("resolveSubOrderPricing — rate items", () => {
    beforeAll(async () => {
        await primeClauseSpecs([GEO]);
    });

    it("checkout-quantity: payment = rate × the buyer's entered units", () => {
        const p = resolveSubOrderPricing({
            node: nodeWithClauses({}),
            seller: SWIFT,
            sellerCatalogues: rateCatalogue({
                id: "consulting", name: "Consulting", price: "0.5", available: true,
                pricingPolicy: "rate", rateUnit: "hour", rateQuantitySource: "checkout-quantity",
            }),
            tokenDecimals: 18,
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
            sellerCatalogues: rateCatalogue({
                id: "consulting", name: "Consulting", price: "0.5", available: true,
                pricingPolicy: "rate", rateUnit: "hour", rateQuantitySource: "checkout-quantity",
            }),
            tokenDecimals: 18,
        });
        expect(p.payment).toBe(0n);
        expect(p.issue).toBe("unresolvable-quantity");
    });

    it("order-geodistance: payment = rate × ceil(centroid km), from the order's own committed endpoints", () => {
        const p = resolveSubOrderPricing({
            node: nodeWithClauses({ [GEO]: { originGeohash: SF, destinationGeohash: LA } }),
            seller: SWIFT,
            sellerCatalogues: rateCatalogue({
                id: "haul", name: "Haul", price: "0.01", available: true,
                pricingPolicy: "rate", rateUnit: "km", rateQuantitySource: "order-geodistance",
            }),
            tokenDecimals: 18,
        });
        const km = geohashCentroidDistanceKm(SF, LA);
        expect(p.resolvedUnits).toBeCloseTo(km, 6);
        expect(p.billedQuantity).toBe(Math.ceil(km)); // per started unit
        expect(p.unitPrice).toBe(10000000000000000n);
        expect(p.payment).toBe(p.unitPrice * BigInt(p.billedQuantity)); // replayable
    });

    it("order-geodistance bills min 1 unit for a same-cell (zero-distance) order", () => {
        const p = resolveSubOrderPricing({
            node: nodeWithClauses({ [GEO]: { originGeohash: SF, destinationGeohash: SF } }),
            seller: SWIFT,
            sellerCatalogues: rateCatalogue({
                id: "haul", name: "Haul", price: "0.01", available: true,
                pricingPolicy: "rate", rateUnit: "km", rateQuantitySource: "order-geodistance",
            }),
            tokenDecimals: 18,
        });
        expect(p.billedQuantity).toBe(1);
        expect(p.payment).toBe(10000000000000000n);
    });

    it("order-geodistance on an order without committed endpoints is unresolvable", () => {
        const p = resolveSubOrderPricing({
            node: nodeWithClauses({}),
            seller: SWIFT,
            sellerCatalogues: rateCatalogue({
                id: "haul", name: "Haul", price: "0.01", available: true,
                pricingPolicy: "rate", rateUnit: "km", rateQuantitySource: "order-geodistance",
            }),
            tokenDecimals: 18,
        });
        expect(p.payment).toBe(0n);
        expect(p.issue).toBe("unresolvable-quantity");
    });

    it("an unregistered quantity source is unresolvable — never silently fixed-priced", () => {
        const p = resolveSubOrderPricing({
            node: nodeWithClauses({}),
            seller: SWIFT,
            sellerCatalogues: rateCatalogue({
                id: "x", name: "X", price: "0.5", available: true,
                pricingPolicy: "rate", rateUnit: "unit", rateQuantitySource: "never-seen-source",
            }),
            tokenDecimals: 18,
        });
        expect(p.payment).toBe(0n);
        expect(p.issue).toBe("unresolvable-quantity");
    });
});
