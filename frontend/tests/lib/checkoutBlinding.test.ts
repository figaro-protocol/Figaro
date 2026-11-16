/**
 * The checkout draws the blinding value of each private clause of each order
 * once, and keeps it with the draft: every rebuild of the draft before signing
 * (the dispatch race's dry walk, then the commit walk) reproduces the same
 * `checkoutHash`, and a new draft draws new values.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { agreementHashOf, type Hex, type HydratedAssembly } from "@figaro-protocol/sdk";
import { loadClauseSpec, setClauseSpecFetcher, specSource } from "@/lib/shared/clauseSpecSource";
import { planAssemblyOrders } from "@/lib/checkout/assemblyCheckout";
import { withCheckoutBlinding, type CheckoutFills } from "@/lib/checkout/checkoutBlinding";
import type { BoundAssembly } from "@/lib/member/useMemberBoundAssemblies";
import { canonicalFileBytes, keyOf, pinSpec, primeClauseSpecs } from "./primeClauseSpecs";

vi.mock("@/lib/core/contracts", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/core/contracts")>();
    return { ...actual, CONTRACTS: { ...actual.CONTRACTS, core: "0x0Dac9D673a37cEAfc220eb0B5646375A6Eb88cb5" } };
});

const BUYER = "0x1111111111111111111111111111111111111111" as const;
const SELLER = "0x2222222222222222222222222222222222222222" as const;
const TOKEN = "0x3333333333333333333333333333333333333333" as const;

const PRIVATE_SPEC = {
    clauseId: "test-private-grade",
    version: 1,
    title: "Private grade",
    description: "A private committed value with few possibilities.",
    fields: [
        { name: "grade", type: "enum", values: ["a", "b", "c"], required: true, disposition: "private" },
        { name: "blinding", type: "string", format: "bytes32-hex", required: true, disposition: "private", blinding: true },
    ],
};
const PRIVATE = pinSpec(PRIVATE_SPEC);

let hydrated: HydratedAssembly;
let commerceKey: Hex;

beforeAll(async () => {
    await primeClauseSpecs(["figaro-commerce"]);
    setClauseSpecFetcher(async (uri) => (uri === "mem://private-grade" ? PRIVATE.bytes : canonicalFileBytes(uri)));
    await loadClauseSpec(PRIVATE.clauseKey, "mem://private-grade");
    commerceKey = keyOf("figaro-commerce");
    const clauses = { [commerceKey]: {}, [PRIVATE.clauseKey]: {} };
    const agreementHash = agreementHashOf({ clauses });
    hydrated = {
        assembly: { agreements: [{ id: "agreement-0", agreementHash, clauses: {}, follows: [] }] },
        agreements: { [agreementHash.toLowerCase() as Hex]: { clauses } },
    };
});

const isBlindingValue = (v: unknown): boolean => typeof v === "string" && /^0x[0-9a-f]{64}$/.test(v);

describe("withCheckoutBlinding", () => {
    it("draws a blinding value for the private clause of each order, and none for a public clause", () => {
        const fills: CheckoutFills = { "agreement-0": { [PRIVATE.clauseKey]: { grade: "b" } } };
        const out = withCheckoutBlinding(hydrated, fills, specSource(), {});
        expect(out["agreement-0"][PRIVATE.clauseKey].grade).toBe("b");
        expect(isBlindingValue(out["agreement-0"][PRIVATE.clauseKey].blinding)).toBe(true);
        expect(out["agreement-0"][commerceKey]).toBeUndefined();
    });

    it("keeps the drawn value with the draft: a second call over the same draft returns the same value", () => {
        const kept: CheckoutFills = {};
        const fills: CheckoutFills = { "agreement-0": { [PRIVATE.clauseKey]: { grade: "b" } } };
        const one = withCheckoutBlinding(hydrated, fills, specSource(), kept);
        const two = withCheckoutBlinding(hydrated, { "agreement-0": { [PRIVATE.clauseKey]: { grade: "c" } } }, specSource(), kept);
        expect(two["agreement-0"][PRIVATE.clauseKey].blinding).toBe(one["agreement-0"][PRIVATE.clauseKey].blinding);
        expect(two["agreement-0"][PRIVATE.clauseKey].grade).toBe("c");
    });

    it("never overwrites a value the fills already carry", () => {
        const held = `0x${"56".repeat(32)}`;
        const out = withCheckoutBlinding(hydrated, { "agreement-0": { [PRIVATE.clauseKey]: { grade: "a", blinding: held } } }, specSource(), {});
        expect(out["agreement-0"][PRIVATE.clauseKey].blinding).toBe(held);
    });
});

describe("a rebuild of a checkout draft keeps its checkoutHash", () => {
    const params = (clauseFills: CheckoutFills) => ({
        buyer: BUYER,
        leadSellerAddress: SELLER,
        currency: TOKEN,
        payment: 1_000_000n,
        lineItems: [{ itemId: "i1", name: "Coffee", quantity: 1, unitPrice: "1000000" }],
        assembly: { slug: "asm-test", name: "Private grade", hydratedAssembly: hydrated, coSellerBindings: [] } as BoundAssembly,
        sellerCatalogs: [],
        tokenDecimals: 6,
        salt: () => 1n,
        deadline: 4_000_000_000n,
        clauseFills,
    });

    it("two walks over one draft build one checkoutHash; a new draft builds another", async () => {
        const fills: CheckoutFills = { "agreement-0": { [PRIVATE.clauseKey]: { grade: "b" } } };
        const kept: CheckoutFills = {};
        const draft = withCheckoutBlinding(hydrated, fills, specSource(), kept);
        const [first] = await planAssemblyOrders(params(draft), { chainId: 31337 });
        const [rebuilt] = await planAssemblyOrders(params(withCheckoutBlinding(hydrated, fills, specSource(), kept)), { chainId: 31337 });
        expect(rebuilt.checkoutHash).toBe(first.checkoutHash);
        const committed = first.agreement.clauses.find((c) => c.clause.toLowerCase() === PRIVATE.clauseKey.toLowerCase());
        expect(committed?.data?.blinding).toBe(draft["agreement-0"][PRIVATE.clauseKey].blinding);
        const [another] = await planAssemblyOrders(params(withCheckoutBlinding(hydrated, fills, specSource(), {})), { chainId: 31337 });
        expect(another.checkoutHash).not.toBe(first.checkoutHash);
    });
});
