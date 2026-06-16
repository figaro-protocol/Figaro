import { describe, expect, it } from "vitest";
import {
    planSubOrderSellers,
    resolveSubOrderPayment,
} from "@/lib/commerce/assemblySubOrderPlan";
import type { AssemblyTemplateOrder } from "@/lib/designer/assemblyTemplate";
import type { BoundAssembly } from "@/lib/mechanisms/useAssemblyRegistry";
import type { SellerCatalogue } from "@/lib/seller/types";

// The kit-assembly diamond: A (lead, root) → B, A → C, B → D, C → D.
// B + D carry proximity-policy, C carries ghg-measurement. Proximity is bound
// to [Swift, Mercato], so the per-clause cursor hands B→Swift, D→Mercato by
// commit order. Structure + clauses come straight off the template orders —
// no agreements, no baked payment.
const MERCATO = "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f" as const;
const SWIFT = "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955" as const;
const ROSSO = "0x976EA74026E726554dB657fA54763abd0C3a0aa9" as const;

const PROX = "figaro-proximity-policy";
const GHG = "figaro-ghg-measurement";

const assembly = {
    slug: "kit-assembly",
    name: "Kit",
    canonicalMethod: null,
    counterpartyBindings: [
        { clauseId: PROX, addresses: [SWIFT, MERCATO] },
        { clauseId: GHG, addresses: [ROSSO] },
    ],
    assemblyTemplate: {
        slug: "kit-assembly",
        name: "Kit",
        orders: [
            { id: "A", buyer: MERCATO, seller: MERCATO, parentOrderIds: [], clauses: {} },
            { id: "B", buyer: MERCATO, seller: SWIFT, parentOrderIds: ["A"], clauses: { [PROX]: {} } },
            { id: "C", buyer: MERCATO, seller: ROSSO, parentOrderIds: ["A"], clauses: { [GHG]: {} } },
            { id: "D", buyer: MERCATO, seller: MERCATO, parentOrderIds: ["B", "C"], clauses: { [PROX]: {} } },
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

const orderById = (id: string): AssemblyTemplateOrder =>
    assembly.assemblyTemplate.orders.find((o) => o.id === id)!;
const payArgs = (node: AssemblyTemplateOrder, seller: `0x${string}`) => ({
    node, seller, sellerCatalogues: catalogues, tokenDecimals: 18,
});

describe("planSubOrderSellers", () => {
    it("orders sub-orders topologically (parents before children)", () => {
        expect(planSubOrderSellers(assembly).map((p) => p.node.id)).toEqual(["B", "C", "D"]);
    });

    it("assigns sellers by binding, drawing shared-clause siblings by commit order", () => {
        const plan = planSubOrderSellers(assembly);
        expect(plan.find((p) => p.node.id === "B")!.seller).toBe(SWIFT); // proximity cursor 0
        expect(plan.find((p) => p.node.id === "C")!.seller).toBe(ROSSO); // ghg
        expect(plan.find((p) => p.node.id === "D")!.seller).toBe(MERCATO); // proximity cursor 1
    });

    it("returns a null seller when no binding covers the order's clause", () => {
        const unbound = { ...assembly, counterpartyBindings: [] } as unknown as BoundAssembly;
        expect(planSubOrderSellers(unbound).every((p) => p.seller === null)).toBe(true);
    });
});

describe("resolveSubOrderPayment", () => {
    it("prices a contributor node live from its published catalogue price", () => {
        expect(resolveSubOrderPayment(payArgs(orderById("B"), SWIFT))).toBe(600000000000000000n);
    });

    it("prices the lead's own node from the lead's own catalogue", () => {
        expect(resolveSubOrderPayment(payArgs(orderById("D"), MERCATO))).toBe(250000000000000000n);
    });

    it("returns 0 when the seller publishes no component item", () => {
        expect(resolveSubOrderPayment({ ...payArgs(orderById("B"), SWIFT), sellerCatalogues: [] }))
            .toBe(0n);
    });

    it("sums to the displayed total with bigint arithmetic (regression: no string-concat)", () => {
        const plan = planSubOrderSellers(assembly);
        const rootPayment = 1000000000000000000n; // product price on the lead/root
        const total = plan.reduce(
            (sum, { node, seller }) => sum + resolveSubOrderPayment(payArgs(node, seller!)),
            rootPayment,
        );
        // 1 + 0.6 (B/Swift) + 0.55 (C/Rosso) + 0.25 (D/Mercato) = 2.40. A
        // `bigint + string` regression would concatenate, not sum to this.
        expect(total).toBe(2400000000000000000n);
    });
});
