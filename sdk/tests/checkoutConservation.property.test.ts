/**
 * Property-based checkout conservation (fast-check) — the payment figures the
 * commitments sign always add up:
 *
 *   - `reconstructOrdersFromTemplate` (the ONE template → orders walk): for
 *     any acyclic template and any per-node payments, each order's
 *     `cumulativeValue` is the exact prefix sum in commit order, the final
 *     order's equals the sum of ALL node payments (what the kernel's
 *     `expectedCumulativeValue` check enforces), and every sub-order's
 *     topology section carries its parents' REAL order hashes.
 *   - `resolveSubOrderPricing` (live contributor pricing): the replay
 *     invariant the module promises — `payment = unitPrice × billedQuantity`,
 *     with rate items billed per STARTED unit (max(1, ceil(units))).
 *
 * Complements (never replaces) the fixture suites in
 * `reconstructOrders.test.ts` / `subOrderPlan.test.ts`.
 */
import fc from "fast-check";
import { parseUnits } from "viem";
import { describe, expect, it } from "vitest";
import { reconstructOrdersFromTemplate } from "../src/reconstructOrders.js";
import { resolveSubOrderPricing, type PricingCatalogue } from "../src/checkoutPlan.js";
import type { AssemblyTemplate, TemplateAgreement } from "../src/assembly.js";
import { specSourceFromFixtures } from "./specFixtures.js";
import { addressArb } from "./propertyArbs.js";

const BUYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
const SELLER = "0x2546BcD3c84621e976D8185a91A922aE77ECEc30" as const;
const CURRENCY = "0x0000000000000000000000000000000000000001" as const;
const CORE = "0x00000000000000000000000000000000000000c0" as const;
const NO_SPECS = specSourceFromFixtures([]);
const SPECS = specSourceFromFixtures(["figaro-commerce", "figaro-topology"]);

// ── Arbitraries ─────────────────────────────────────────────────────────────

/** An acyclic chain shape: node 0 is the root; node i>0 parents 1–2 earlier
 *  nodes. Payments are per-node uint96-ish values (no overflow at depth 6). */
const chainArb = fc.integer({ min: 1, max: 6 }).chain((n) =>
    fc.record({
        payments: fc.array(fc.bigInt({ min: 0n, max: (1n << 96n) - 1n }), {
            minLength: n,
            maxLength: n,
        }),
        parents: fc.tuple(
            ...Array.from({ length: n }, (_, i) =>
                i === 0
                    ? fc.constant<number[]>([])
                    : fc.uniqueArray(fc.integer({ min: 0, max: i - 1 }), {
                          minLength: 1,
                          maxLength: Math.min(i, 2),
                      }),
            ),
        ),
    }),
);

function templateFrom(parents: readonly number[][]): AssemblyTemplate {
    return {
        agreements: parents.map((ps, i) => ({
            id: `n${i}`,
            clauses: {
                "figaro-commerce": {},
                "figaro-topology": { parentOrderHashes: ps.map((p) => `n${p}`) },
            },
        })),
    };
}

/** A decimal price string valid for `parseUnits(price, decimals)`: up to
 *  `decimals` fractional digits. */
const priceArb = fc
    .integer({ min: 0, max: 18 })
    .chain((decimals) =>
        fc.record({
            decimals: fc.constant(decimals),
            whole: fc.integer({ min: 0, max: 1_000_000 }),
            frac: fc.array(fc.integer({ min: 0, max: 9 }), { maxLength: decimals }),
        }),
    )
    .map(({ decimals, whole, frac }) => ({
        decimals,
        price: frac.length > 0 ? `${whole}.${frac.join("")}` : `${whole}`,
    }));

// ── Properties ──────────────────────────────────────────────────────────────

describe("reconstructOrdersFromTemplate — payment conservation", () => {
    it("cumulativeValue is the exact prefix sum; the final order carries the total of all node payments", async () => {
        await fc.assert(
            fc.asyncProperty(chainArb, async ({ payments, parents }) => {
                const template = templateFrom(parents);
                const paymentOf = new Map(payments.map((p, i) => [`n${i}`, p]));
                const orders = await reconstructOrdersFromTemplate(template, {
                    buyer: BUYER,
                    currency: CURRENCY,
                    chainId: 31337,
                    core: CORE,
                    specs: SPECS,
                    nodes: (planned) => ({ seller: SELLER, payment: paymentOf.get(planned.nodeId)! }),
                    salt: () => 1n,
                    deadline: 1770000000n,
                });

                // Conservation: running total is the prefix sum in commit order…
                let running = 0n;
                for (const order of orders) {
                    running += order.payment;
                    expect(order.cumulativeValue).toBe(running);
                    // …and it is exactly what the signed struct names.
                    expect(order.commitment.expectedCumulativeValue).toBe(order.cumulativeValue);
                    expect(order.commitment.payment).toBe(order.payment);
                    // THE MERKLE-LEAF SEAM: the commerce section's currency leaf
                    // never diverges from the commitment struct, on every order.
                    const commerce = order.agreement.sections.find((s) => s.clause === "figaro-commerce");
                    expect(commerce?.data.currency).toBe(order.commitment.currency);
                }
                // The final order's total is the sum of ALL node payments.
                const total = payments.reduce((s, p) => s + p, 0n);
                expect(orders[orders.length - 1].cumulativeValue).toBe(total);
            }),
        );
    });

    it("every sub-order's topology section carries its parents' REAL order hashes", async () => {
        await fc.assert(
            fc.asyncProperty(chainArb, async ({ payments, parents }) => {
                const template = templateFrom(parents);
                const paymentOf = new Map(payments.map((p, i) => [`n${i}`, p]));
                const orders = await reconstructOrdersFromTemplate(template, {
                    buyer: BUYER,
                    currency: CURRENCY,
                    chainId: 31337,
                    core: CORE,
                    specs: SPECS,
                    nodes: (planned) => ({ seller: SELLER, payment: paymentOf.get(planned.nodeId)! }),
                    salt: () => 1n,
                    deadline: 1770000000n,
                });
                const hashOf = new Map(orders.map((o) => [o.nodeId, o.orderHash]));
                for (const order of orders) {
                    const i = Number(order.nodeId.slice(1));
                    const topo = order.agreement.sections.find((s) => s.clause === "figaro-topology");
                    expect(topo?.data.parentOrderHashes).toEqual(
                        parents[i].map((p) => hashOf.get(`n${p}`)),
                    );
                    // THE MERKLE-LEAF SEAM: same guarantee on this property too.
                    const commerce = order.agreement.sections.find((s) => s.clause === "figaro-commerce");
                    expect(commerce?.data.currency).toBe(order.commitment.currency);
                }
            }),
        );
    });
});

describe("resolveSubOrderPricing — replay invariant", () => {
    const node: TemplateAgreement = { id: "R", clauses: { "figaro-commerce": {} } };

    it("fixed items: payment = unitPrice, billedQuantity = 1, exactly the published price", () => {
        fc.assert(
            fc.property(priceArb, addressArb, ({ price, decimals }, seller) => {
                const catalogues = [
                    { address: seller, items: [{ id: "i", name: "I", price, available: true }] },
                ] as unknown as PricingCatalogue[];
                const p = resolveSubOrderPricing({
                    node,
                    seller,
                    sellerCatalogues: catalogues,
                    tokenDecimals: decimals,
                    specs: NO_SPECS,
                });
                expect(p.billedQuantity).toBe(1);
                expect(p.unitPrice).toBe(parseUnits(price, decimals));
                expect(p.payment).toBe(p.unitPrice * BigInt(p.billedQuantity));
                expect(p.issue).toBeUndefined();
            }),
        );
    });

    it("rate items: payment = unitPrice × billedQuantity, billed per STARTED unit", () => {
        const unitsArb = fc.integer({ min: 1, max: 100_000 }).map((v) => v / 100); // 0.01 … 1000.00
        fc.assert(
            fc.property(priceArb, addressArb, unitsArb, ({ price, decimals }, seller, units) => {
                const catalogues = [
                    {
                        address: seller,
                        items: [{
                            id: "i", name: "I", price, available: true,
                            pricingPolicy: "rate", rateUnit: "unit",
                            rateQuantitySource: "checkout-quantity",
                        }],
                    },
                ] as unknown as PricingCatalogue[];
                const p = resolveSubOrderPricing({
                    node,
                    seller,
                    sellerCatalogues: catalogues,
                    tokenDecimals: decimals,
                    specs: NO_SPECS,
                    checkoutQuantity: units,
                });
                expect(p.billedQuantity).toBe(Math.max(1, Math.ceil(units)));
                expect(p.unitPrice).toBe(parseUnits(price, decimals));
                // The replay invariant: the committed line item reproduces the
                // signed payment with no reference back to the catalogue.
                expect(p.payment).toBe(p.unitPrice * BigInt(p.billedQuantity));
            }),
        );
    });
});
