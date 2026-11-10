/**
 * coSellerNamedItem — a seller's co-seller binding may name ONE item in each
 * co-seller's own catalog. The buyer's breakdown and the checkout walk price
 * that co-seller's sub-order from the named item; an item the co-seller's
 * catalog no longer offers refuses the checkout, never a payment of zero and
 * never another item in its place. Without a named item, the co-seller's first
 * available item prices it, as before.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { planAssemblyOrders } from "@/lib/checkout/assemblyCheckout";
import { deriveKitBreakdown } from "@/lib/checkout/checkoutDerivations";
import { requiredCoSellerClauses } from "@/lib/protocol/assemblyChoices";
import type { BoundAssembly } from "@/lib/member/useMemberBoundAssemblies";
import { primeClauseSpecs, referenceAssembly } from "./primeClauseSpecs";

vi.mock("@/lib/kernel/contracts", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/kernel/contracts")>();
    return { ...actual, CONTRACTS: { ...actual.CONTRACTS, core: "0x0Dac9D673a37cEAfc220eb0B5646375A6Eb88cb5" } };
});

const BUYER = "0x1111111111111111111111111111111111111111" as const;
const LEAD = "0x2222222222222222222222222222222222222222" as const;
const COURIER = "0x4444444444444444444444444444444444444444" as const;
const TOKEN = "0x3333333333333333333333333333333333333333" as const;

const catalogsWith = (courierItems: Array<{ id: string; name: string; price: string; available: boolean }>) => [
    { address: LEAD, name: "Kitchen", items: [] },
    { address: COURIER, name: "Courier", items: courierItems },
] as never;

const bound = (itemIds?: Record<string, string>): BoundAssembly => {
    const hydratedAssembly = referenceAssembly("local-commerce.json");
    const [clauseKey] = requiredCoSellerClauses(hydratedAssembly);
    return {
        slug: "asm-test",
        name: "Local commerce",
        hydratedAssembly,
        coSellerBindings: [{ clauseKey: clauseKey as `0x${string}`, addresses: [COURIER], ...(itemIds ? { itemIds } : {}) }],
    };
};

const ITEMS = [
    { id: "ride-short", name: "Short ride", price: "2", available: true },
    { id: "ride-long", name: "Long ride", price: "5", available: true },
];

const breakdown = (assembly: BoundAssembly, items: typeof ITEMS) => deriveKitBreakdown({
    pickedAssembly: assembly,
    leadAddress: LEAD,
    sellerCatalogs: catalogsWith(items),
    cartTotal: 10n,
    clauseFills: {},
    subOrderQuantities: {},
    subOrderUnitPrices: {},
    tokenDecimals: 0,
    raceOutcome: null,
    sellerSelection: null,
});

const plan = (assembly: BoundAssembly, items: typeof ITEMS) => planAssemblyOrders(
    {
        buyer: BUYER,
        leadSellerAddress: LEAD,
        currency: TOKEN,
        payment: 10n,
        lineItems: [{ itemId: "meal", name: "Meal", quantity: 1, unitPrice: "10" }],
        assembly,
        sellerCatalogs: catalogsWith(items),
        tokenDecimals: 0,
        salt: () => 1n,
        deadline: 4_000_000_000n,
    },
    { chainId: 31337 },
);

describe("the buyer's breakdown row for a co-seller's named item", () => {
    beforeAll(async () => { await primeClauseSpecs(); });

    it("named and offered: the row prices the named item", () => {
        const row = breakdown(bound({ [COURIER]: "ride-long" }), ITEMS)!.rows[1]!;
        expect(row.pricing?.item?.id).toBe("ride-long");
        expect(row.payment).toBe(5n);
    });

    it("named and no longer offered: the row carries the refusal, never another item", () => {
        const row = breakdown(bound({ [COURIER]: "ride-long" }), [ITEMS[0]!])!.rows[1]!;
        expect(row.pricing?.issue).toBe("named-item-not-offered");
        expect(row.pricing?.item).toBeNull();
    });

    it("a refused row: the breakdown names the refusal and sums no total", () => {
        const kit = breakdown(bound({ [COURIER]: "ride-long" }), [ITEMS[0]!])!;
        expect(kit.total).toBeNull();
        expect(kit.refusals).toEqual([
            "The seller named an item from Courier for this order, and Courier no longer offers it. This order cannot be placed.",
        ]);
    });

    it("no available item: the row carries its own refusal and the breakdown sums no total", () => {
        const kit = breakdown(bound(), [])!;
        expect(kit.rows[1]!.pricing?.issue).toBe("no-item");
        expect(kit.total).toBeNull();
        expect(kit.refusals).toEqual([
            "Courier offers no available item for this order, or its catalog could not be read. This order cannot be placed.",
        ]);
    });

    it("every row priced: the total sums every row and nothing is refused", () => {
        const kit = breakdown(bound(), ITEMS)!;
        expect(kit.total).toBe(12n);
        expect(kit.refusals).toEqual([]);
    });

    it("unnamed: the row prices the co-seller's first available item", () => {
        const row = breakdown(bound(), ITEMS)!.rows[1]!;
        expect(row.pricing?.item?.id).toBe("ride-short");
        expect(row.payment).toBe(2n);
    });
});

describe("the checkout walk for a co-seller's named item", () => {
    beforeAll(async () => { await primeClauseSpecs(); });

    it("named and offered: the sub-order commits the named item's payment and line item", async () => {
        const orders = await plan(bound({ [COURIER]: "ride-long" }), ITEMS);
        const sub = orders.find((o) => o.commitment.seller.toLowerCase() === COURIER)!;
        expect(sub.commitment.payment).toBe(5n);
        expect(JSON.stringify(sub.agreement.clauses)).toContain("ride-long");
    });

    it("named and no longer offered: the walk refuses, naming the item, and commits nothing", async () => {
        await expect(plan(bound({ [COURIER]: "ride-long" }), [ITEMS[0]!])).rejects.toThrow(
            `The seller named the item "ride-long" from ${COURIER} for this order, and that catalog no longer offers it.`,
        );
    });

    it("no available item: the walk refuses, naming the co-seller, and commits nothing", async () => {
        await expect(plan(bound(), [])).rejects.toThrow(
            `The co-seller ${COURIER} offers no available catalog item to price this order, or its catalog could not be read.`,
        );
    });

    it("unnamed: the sub-order commits the first available item, as before", async () => {
        const orders = await plan(bound(), ITEMS);
        const sub = orders.find((o) => o.commitment.seller.toLowerCase() === COURIER)!;
        expect(sub.commitment.payment).toBe(2n);
    });
});
