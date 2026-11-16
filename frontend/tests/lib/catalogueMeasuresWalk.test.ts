/**
 * catalogueMeasuresWalk — a clause reads some of its fields from the order's
 * catalog items (`block.checkout.catalogueMeasures`): the checkout walk sums
 * each declared measure from the items, and an order whose items do not
 * supply a REQUIRED measure is refused before anything is signed, naming the
 * measure. Nothing invents a number for it. The clause here is the shipped
 * cargo spec, read from `clauses/`; no rule names it.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { checkoutMeasureRefusals, planAssemblyOrders } from "@/lib/checkout/assemblyCheckout";
import type { BoundAssembly } from "@/lib/member/useMemberBoundAssemblies";
import { hydrateAuthored, keyOf, primeClauseSpecs } from "./primeClauseSpecs";

vi.mock("@/lib/core/contracts", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/core/contracts")>();
    return { ...actual, CONTRACTS: { ...actual.CONTRACTS, core: "0x0Dac9D673a37cEAfc220eb0B5646375A6Eb88cb5" } };
});

const BUYER = "0x1111111111111111111111111111111111111111" as const;
const LEAD = "0x2222222222222222222222222222222222222222" as const;
const TOKEN = "0x3333333333333333333333333333333333333333" as const;

const shipment = (): BoundAssembly => ({
    slug: "asm-test",
    name: "Shipment",
    hydratedAssembly: hydrateAuthored({ agreements: [{ clauses: { "figaro-cargo": {} } }] }),
    coSellerBindings: [],
});

const inputs = (catalogItem: Record<string, unknown> | undefined) => ({
    leadSellerAddress: LEAD,
    currency: TOKEN,
    payment: 10n,
    lineItems: [{ itemId: "crate", name: "Crate", quantity: 2, unitPrice: "5", ...(catalogItem ? { catalogItem } : {}) }],
    assembly: shipment(),
    sellerCatalogs: [{ address: LEAD, name: "Shipper", items: [] }] as never,
    tokenDecimals: 0,
});

const plan = (catalogItem: Record<string, unknown> | undefined) => planAssemblyOrders(
    {
        buyer: BUYER,
        leadSellerAddress: LEAD,
        currency: TOKEN,
        payment: 10n,
        lineItems: [{ itemId: "crate", name: "Crate", quantity: 2, unitPrice: "5", ...(catalogItem ? { catalogItem } : {}) }],
        assembly: shipment(),
        sellerCatalogs: [{ address: LEAD, name: "Shipper", items: [] }] as never,
        tokenDecimals: 0,
        salt: () => 1n,
        deadline: 4_000_000_000n,
    },
    { chainId: 31337 },
);

describe("the checkout walk over a clause's declared catalog measures", () => {
    beforeAll(async () => { await primeClauseSpecs(); });

    it("sums each measure from the line's catalog item × quantity onto the committed leaf", async () => {
        const [root] = await plan({ massGrams: 500, volumeMl: 1000 });
        const cargo = root!.agreement.clauses.find((c) => c.clause.toLowerCase() === keyOf("figaro-cargo").toLowerCase());
        expect(cargo?.data).toMatchObject({ massGrams: 1000, volumeMl: 2000 });
    });

    it("an item without a required measure: the walk refuses, naming it, and invents no number", async () => {
        await expect(plan({ volumeMl: 1000 })).rejects.toThrow(
            /needs "[^"]+", which it reads from each catalog item's "massGrams"/,
        );
        await expect(plan(undefined)).rejects.toThrow(/reads from each catalog item's/);
    });

    it("the page reads the same refusal before the click: the walk's own sentence, and none when supplied", () => {
        expect(checkoutMeasureRefusals(inputs({ volumeMl: 1000 }))).toEqual([
            expect.stringMatching(/needs "[^"]+", which it reads from each catalog item's "massGrams"/),
        ]);
        expect(checkoutMeasureRefusals(inputs({ massGrams: 500, volumeMl: 1000 }))).toEqual([]);
    });
});
