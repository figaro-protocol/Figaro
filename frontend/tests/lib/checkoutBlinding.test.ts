/**
 * The checkout draws the blinding value of each private clause of each order
 * once, and keeps it with the draft: every rebuild of the draft before signing
 * (the dispatch race's dry walk, then the commit walk) reproduces the same
 * `checkoutHash`, and a new draft draws new values.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { agreementHashOf, validateCommitmentAgreement, type Hex, type HydratedAssembly } from "@figaro-protocol/sdk";
import { loadClauseSpec, setClauseSpecFetcher, specSource } from "@/lib/shared/clauseSpecSource";
import { planAssemblyOrders } from "@/lib/checkout/assemblyCheckout";
import { freshBlindingStore, withCheckoutBlinding, type CheckoutFills } from "@/lib/checkout/checkoutBlinding";
import { mergeAssemblyTermFills } from "@/lib/checkout/checkoutDerivations";
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

    it("keeps only the draft's own draw: a value the fills carry is drawn over, since the fills fold in the design's values", () => {
        const designed = `0x${"56".repeat(32)}`;
        const fills: CheckoutFills = { "agreement-0": { [PRIVATE.clauseKey]: mergeAssemblyTermFills({ blinding: designed }, { grade: "a" }) } };
        const out = withCheckoutBlinding(hydrated, fills, specSource(), {});
        expect(isBlindingValue(out["agreement-0"][PRIVATE.clauseKey].blinding)).toBe(true);
        expect(out["agreement-0"][PRIVATE.clauseKey].blinding).not.toBe(designed);
        expect(out["agreement-0"][PRIVATE.clauseKey].grade).toBe("a");
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

describe("a design that carries a blinding value never gives the signed one", () => {
    const DESIGNED = `0x${"5d".repeat(32)}`;
    const designWith = (where: "agreement" | "assembly"): HydratedAssembly => {
        const clauses = where === "agreement"
            ? { [commerceKey]: {}, [PRIVATE.clauseKey]: { blinding: DESIGNED } }
            : { [commerceKey]: {} };
        const agreementHash = agreementHashOf({ clauses });
        return {
            assembly: {
                ...(where === "assembly" ? { assemblyClauses: { [PRIVATE.clauseKey]: { blinding: DESIGNED } } } : {}),
                agreements: [{ id: "agreement-0", agreementHash, clauses: {}, follows: [] }],
            },
            agreements: { [agreementHash.toLowerCase() as Hex]: { clauses } },
        };
    };

    it.each(["agreement", "assembly"] as const)("the checkout draws its own value over the one the design's %s clause data carries", async (where) => {
        const design = designWith(where);
        // The checkout page's own merge: an assembly clause's designer values
        // are the floor of the buyer's fills (`mergeAssemblyTermFills`).
        const assemblyEntry = design.assembly.assemblyClauses?.[PRIVATE.clauseKey];
        const fills: CheckoutFills = {
            "agreement-0": { [PRIVATE.clauseKey]: assemblyEntry ? mergeAssemblyTermFills(assemblyEntry, { grade: "b" }) : { grade: "b" } },
        };
        const draft = withCheckoutBlinding(design, fills, specSource(), {});
        const [order] = await planAssemblyOrders({
            buyer: BUYER, leadSellerAddress: SELLER, currency: TOKEN, payment: 1_000_000n,
            lineItems: [{ itemId: "i1", name: "Coffee", quantity: 1, unitPrice: "1000000" }],
            assembly: { slug: "asm-test", name: "Private grade", hydratedAssembly: design, coSellerBindings: [] } as BoundAssembly,
            sellerCatalogs: [], tokenDecimals: 6, salt: () => 1n, deadline: 4_000_000_000n, clauseFills: draft,
        }, { chainId: 31337 });
        const signed = order.agreement.clauses.find((c) => c.clause.toLowerCase() === PRIVATE.clauseKey.toLowerCase())?.data?.blinding;
        expect(isBlindingValue(signed)).toBe(true);
        expect(signed).not.toBe(DESIGNED);
        expect(signed).toBe(draft["agreement-0"][PRIVATE.clauseKey].blinding);
    });
});

describe("a retry after a failed checkout attempt draws again", () => {
    it("freshBlindingStore gives a new attempt an empty store, so every order draws anew", () => {
        const kept: CheckoutFills = {};
        const fills: CheckoutFills = { "agreement-0": { [PRIVATE.clauseKey]: { grade: "b" } } };
        const failed = withCheckoutBlinding(hydrated, fills, specSource(), kept);
        const retried = withCheckoutBlinding(hydrated, fills, specSource(), freshBlindingStore(kept, null));
        expect(isBlindingValue(retried["agreement-0"][PRIVATE.clauseKey].blinding)).toBe(true);
        expect(retried["agreement-0"][PRIVATE.clauseKey].blinding).not.toBe(failed["agreement-0"][PRIVATE.clauseKey].blinding);
    });

    it("after a race keeps the whole store, the winner's values for its order: the race fixed every order", () => {
        const won = { [PRIVATE.clauseKey]: { blinding: `0x${"9a".repeat(32)}` } };
        const other = { [PRIVATE.clauseKey]: { blinding: `0x${"3c".repeat(32)}` } };
        const store = freshBlindingStore({ "agreement-0": {}, "agreement-9": other }, { nodeId: "agreement-0", blinding: won });
        expect(store).toEqual({ "agreement-0": won, "agreement-9": other });
        const out = withCheckoutBlinding(hydrated, { "agreement-0": { [PRIVATE.clauseKey]: { grade: "b" } } }, specSource(), store);
        expect(out["agreement-0"][PRIVATE.clauseKey].blinding).toBe(won[PRIVATE.clauseKey].blinding);
    });
});

describe("without Web Crypto the checkout refuses in words and never throws", () => {
    afterEach(() => { vi.unstubAllGlobals(); });

    it("withCheckoutBlinding draws nothing, names the refusal, and the sign gate refuses the order", async () => {
        vi.stubGlobal("crypto", undefined);
        const refusals: string[] = [];
        const fills: CheckoutFills = { "agreement-0": { [PRIVATE.clauseKey]: { grade: "b" } } };
        let out: CheckoutFills = {};
        expect(() => { out = withCheckoutBlinding(hydrated, fills, specSource(), {}, (r) => refusals.push(r)); }).not.toThrow();
        expect(out["agreement-0"]?.[PRIVATE.clauseKey]?.blinding).toBeUndefined();
        expect(refusals).toEqual([expect.stringMatching(/cannot be placed.*random value/)]);
        vi.unstubAllGlobals();
        const [order] = await planAssemblyOrders({
            buyer: BUYER, leadSellerAddress: SELLER, currency: TOKEN, payment: 1_000_000n,
            lineItems: [{ itemId: "i1", name: "Coffee", quantity: 1, unitPrice: "1000000" }],
            assembly: { slug: "asm-test", name: "Private grade", hydratedAssembly: hydrated, coSellerBindings: [] } as BoundAssembly,
            sellerCatalogs: [], tokenDecimals: 6, salt: () => 1n, deadline: 4_000_000_000n, clauseFills: out,
        }, { chainId: 31337 });
        const check = validateCommitmentAgreement(order.agreement, order.checkoutHash, specSource(), order.commitment, hydrated);
        expect(check.ok).toBe(false);
        expect(check.issues).toContainEqual(expect.objectContaining({ path: expect.stringMatching(/blinding/) }));
    });
});
