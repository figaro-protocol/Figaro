import { describe, expect, it } from "vitest";
import {
    planSubOrderSellers,
    resolveSubOrderPayment,
    type ManifestOrder,
} from "@/lib/core/assemblySubOrderPlan";
import type { BoundAssembly } from "@/lib/mechanisms/useAssemblyRegistry";
import type { SellerCatalogue } from "@/lib/seller/types";

// The kit-assembly diamond: A (lead, root) → B, A → C, B → D, C → D.
// B carries proximity-policy, C carries ghg-measurement, D carries
// proximity-policy (shared with B). Proximity is bound to [Swift, Mercato],
// so the per-clause cursor hands B→Swift, D→Mercato by commit order.
const MERCATO = "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f" as const;
const SWIFT = "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955" as const;
const ROSSO = "0x976EA74026E726554dB657fA54763abd0C3a0aa9" as const;

const PROX = "figaro-proximity-policy-v1";
const GHG = "figaro-ghg-measurement-v1";
const TOPO = "figaro-topology-v1";

function agreement(parents: string[], roleClause?: string) {
    return {
        version: "a1" as const,
        buyer: MERCATO,
        seller: MERCATO,
        sections: [
            { clause: TOPO, data: { parentOrderHashes: parents } },
            ...(roleClause ? [{ clause: roleClause, data: {} }] : []),
        ],
    };
}

// payment as decimal-wei STRINGS — the manifest's JSON shape (no bigint).
const assembly = {
    slug: "kit-assembly",
    name: "Kit",
    fulfilmentMethod: null,
    counterpartyBindings: [
        { clauseId: PROX, addresses: [SWIFT, MERCATO] },
        { clauseId: GHG, addresses: [ROSSO] },
    ],
    manifest: {
        slug: "kit-assembly",
        name: "Kit",
        processId: "0x0",
        nextOrderIndex: 4,
        nextSellerIndex: 4,
        orders: [
            { id: "A", agreementHash: "0xA", payment: "1000000000000000000" },
            { id: "B", agreementHash: "0xB", payment: "500000000000000000" },
            { id: "C", agreementHash: "0xC", payment: "500000000000000000" },
            { id: "D", agreementHash: "0xD", payment: "250000000000000000" },
        ],
        agreements: {
            "0xA": agreement([]),
            "0xB": agreement(["A"], PROX),
            "0xC": agreement(["A"], GHG),
            "0xD": agreement(["B", "C"], PROX),
        },
    },
} as unknown as BoundAssembly;

// Each contributor's component lives in its OWN catalogue, with a rate
// negotiated for Mercato (0.5) below its public price.
const catalogues = [
    {
        address: SWIFT,
        name: "Swift Courier",
        menu: [{
            id: "kit-fastening", name: "Fastening", category: "component",
            price: "0.6", pricingPolicy: "fixed",
            negotiatedPrices: [{ counterparty: MERCATO, price: "0.5" }], available: true,
        }],
    },
    {
        address: ROSSO,
        name: "Rosso Kitchen",
        menu: [{
            id: "kit-housing", name: "Housing", category: "component",
            price: "0.55", pricingPolicy: "fixed",
            negotiatedPrices: [{ counterparty: MERCATO, price: "0.5" }], available: true,
        }],
    },
] as unknown as SellerCatalogue[];

const orderById = (id: string): ManifestOrder =>
    assembly.manifest.orders.find((o) => o.id === id)!;
const payArgs = (node: ManifestOrder, seller: `0x${string}`) => ({
    node, seller, leadAddress: MERCATO, sellerCatalogues: catalogues, tokenDecimals: 18,
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
    it("prices a contributor node live from its negotiated rate", () => {
        expect(resolveSubOrderPayment(payArgs(orderById("B"), SWIFT))).toBe(500000000000000000n);
    });

    it("prices the lead's own node from the manifest figure", () => {
        expect(resolveSubOrderPayment(payArgs(orderById("D"), MERCATO))).toBe(250000000000000000n);
    });

    it("falls back to the manifest figure when the contributor has no component item", () => {
        expect(resolveSubOrderPayment({ ...payArgs(orderById("B"), SWIFT), sellerCatalogues: [] }))
            .toBe(500000000000000000n);
    });

    it("sums to the displayed total with bigint arithmetic (regression: no string-concat)", () => {
        const plan = planSubOrderSellers(assembly);
        const rootPayment = 1000000000000000000n; // sellerTotalAmount (product price)
        const total = plan.reduce(
            (sum, { node, seller }) => sum + resolveSubOrderPayment(payArgs(node, seller!)),
            rootPayment,
        );
        // 1 + 0.5 + 0.5 + 0.25 = 2.25. A `bigint + string` regression would
        // make this a concatenated string, not this bigint.
        expect(total).toBe(2250000000000000000n);
    });
});
