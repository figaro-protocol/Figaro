import { describe, expect, it, beforeEach } from "vitest";
import { assemblyToSyntheticOrders } from "@/lib/designer/assemblyToSyntheticOrders";
import {
    DIRECT_SALE_REFERENCE_ASSEMBLY,
    LOCAL_COMMERCE_REFERENCE_ASSEMBLY,
    FIGARO_PROCUREMENT_REFERENCE_ASSEMBLY,
    FIGARO_DISCLOSURE_REFERENCE_ASSEMBLY,
    FIGARO_EQUIPMENT_RENTAL_REFERENCE_ASSEMBLY,
    FIGARO_FREELANCE_REFERENCE_ASSEMBLY,
    type Assembly,
} from "@/lib/shared/assembly";
import { deriveFulfilmentMethod } from "@/lib/designer/syntheticProcess";
import { loadAgreement } from "@/lib/core/agreementStore";
import { getTopologyParentOrderHashes } from "@/lib/core/orderAgreement";

describe("assemblyToSyntheticOrders", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("seeds the local-commerce reference into a 2-node DAG (root + 1 sub-order via Dutch auction)", () => {
        const { session, orders } = assemblyToSyntheticOrders(LOCAL_COMMERCE_REFERENCE_ASSEMBLY);

        // Local commerce has 3 roles: buyer, merchant, courier → 1 buyer + 2
        // sellers → 1 root order + 1 sub-order.
        expect(orders).toHaveLength(2);

        const [root, sub] = orders;

        // Root: buyer → merchant
        expect(root.buyer).toBe(session.buyerAddress);
        expect(root.processId).toBe(session.processId);
        expect(root.cumulativeValue).toBe(root.payment);
        expect(root.sellerBond).toBe(root.cumulativeValue * 2n);
        expect(root.buyerBond).toBe(root.payment * 2n);

        // Local-commerce declares defaultRootFulfilment="deliver:seller-assigned"
        // — the root's fulfilment should match.
        expect(deriveFulfilmentMethod(root)).toBe("deliver:seller-assigned");

        // Sub: same buyer (root buyer dominance), new seller
        expect(sub.buyer).toBe(session.buyerAddress);
        expect(sub.processId).toBe(session.processId);
        expect(sub.seller).not.toBe(root.seller);

        // Sub-order's agreement must reference the root as parent
        const subAgreement = loadAgreement(sub.agreementHash);
        const subParents = getTopologyParentOrderHashes(subAgreement) ?? [];
        expect(subParents).toEqual([root.id]);

        // Local-commerce has the courier-auction mechanism (kind=auction, enabled),
        // so the last (and only) sub-order should be deliver:dutch-auction.
        expect(deriveFulfilmentMethod(sub)).toBe("deliver:dutch-auction");
    });

    it("seeds the direct-sale reference into a 1-node DAG with consume-onsite root", () => {
        const { orders } = assemblyToSyntheticOrders(DIRECT_SALE_REFERENCE_ASSEMBLY);

        // Direct-sale has 2 roles (buyer + merchant) → 1 seller → 1-node graph.
        expect(orders).toHaveLength(1);
        const [root] = orders;

        // Root inherits the assembly's defaultRootFulfilment.
        expect(deriveFulfilmentMethod(root)).toBe("consume-onsite");

        // No parents on the root.
        const parents = getTopologyParentOrderHashes(loadAgreement(root.agreementHash)) ?? [];
        expect(parents).toEqual([]);
    });

    it("dumps a human-readable shape for visual inspection", () => {
        const { session, orders } = assemblyToSyntheticOrders(LOCAL_COMMERCE_REFERENCE_ASSEMBLY);

        const dump = orders.map((o, i) => ({
            index: i,
            role: i === 0 ? "ROOT" : `SUB-${i}`,
            buyer: o.buyer,
            seller: o.seller,
            payment: o.payment.toString(),
            cumulativeValue: o.cumulativeValue.toString(),
            sellerBond: o.sellerBond.toString(),
            buyerBond: o.buyerBond.toString(),
            currency: o.currency,
            agreementHash: o.agreementHash,
            fulfilment: deriveFulfilmentMethod(o),
            parents: getTopologyParentOrderHashes(loadAgreement(o.agreementHash)) ?? [],
        }));

        // eslint-disable-next-line no-console
        console.log("LOCAL-COMMERCE SEEDED DAG:", JSON.stringify({ session, dump }, null, 2));

        // Sanity that dump matches the orders we just built
        expect(dump).toHaveLength(orders.length);
    });

    it.each<[string, Assembly]>([
        ["figaro-procurement", FIGARO_PROCUREMENT_REFERENCE_ASSEMBLY],
        ["figaro-disclosure-review", FIGARO_DISCLOSURE_REFERENCE_ASSEMBLY],
        ["figaro-equipment-rental", FIGARO_EQUIPMENT_RENTAL_REFERENCE_ASSEMBLY],
        ["figaro-freelance", FIGARO_FREELANCE_REFERENCE_ASSEMBLY],
    ])("seeds %s", (slug, assembly) => {
        const { session, orders } = assemblyToSyntheticOrders(assembly);
        const sellerRoles = assembly.roles.filter((r) => r.roleKind !== "buyer");
        const expectedNodes = Math.max(1, sellerRoles.length);

        // Shape sanity
        expect(orders).toHaveLength(expectedNodes);
        expect(orders[0].buyer).toBe(session.buyerAddress);
        for (const order of orders) {
            expect(order.processId).toBe(session.processId);
            expect(order.buyer).toBe(session.buyerAddress);
            expect(order.sellerBond).toBe(order.cumulativeValue * 2n);
            expect(order.buyerBond).toBe(order.payment * 2n);
        }
        // Root honors the assembly's declared defaultRootFulfilment when present.
        if (assembly.defaultRootFulfilment) {
            expect(deriveFulfilmentMethod(orders[0])).toBe(assembly.defaultRootFulfilment);
        }
        // Sub-orders are children of the root
        if (orders.length > 1) {
            for (const sub of orders.slice(1)) {
                const parents = getTopologyParentOrderHashes(loadAgreement(sub.agreementHash)) ?? [];
                expect(parents).toEqual([orders[0].id]);
            }
        }

        // Dump for visual inspection
        const dump = orders.map((o, i) => ({
            index: i,
            role: i === 0 ? "ROOT" : `SUB-${i}`,
            roleKind: i === 0 ? sellerRoles[0]?.roleKind : sellerRoles[i]?.roleKind,
            buyer: o.buyer,
            seller: o.seller,
            payment: o.payment.toString(),
            cumulativeValue: o.cumulativeValue.toString(),
            sellerBond: o.sellerBond.toString(),
            buyerBond: o.buyerBond.toString(),
            fulfilment: deriveFulfilmentMethod(o),
        }));
        const auctionMechanisms = assembly.mechanisms
            .filter((m) => m.kind === "auction" && m.enabled)
            .map((m) => m.mechanismId);
        // eslint-disable-next-line no-console
        console.log(
            `${slug.toUpperCase()} SEEDED DAG (${expectedNodes} node${expectedNodes === 1 ? "" : "s"}; auction mechanisms: [${auctionMechanisms.join(", ") || "none"}]):`,
            JSON.stringify(dump, null, 2),
        );
    });
});
