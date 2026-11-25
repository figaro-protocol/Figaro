/**
 * The checkout walk over a clause that declares a composition with
 * composition fields. The fields are presentation (`block.checkout`): no
 * fingerprint reads them and the walk returns nothing from them into an
 * order. So the walk places every order, the root, a bound sub-order and an
 * unbound sub-order alike, and asks its caller for no composition step: a
 * clause spec cannot make the browser call a contract it names
 * (`docs/VERIFICATION_MAP.md` § 17.1, U-19). The clause is a stranger's,
 * built here, with an id, an interface and field names the repository has
 * never seen.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { agreementHashOf, type Hex, type HydratedProcessDesign } from "@figaro-protocol/sdk";

vi.mock("@/lib/core/contracts", async (importOriginal) =>
    (await import("../support/contractsMock")).contractsMock(await importOriginal<typeof import("@/lib/core/contracts")>(), { core: "0x0Dac9D673a37cEAfc220eb0B5646375A6Eb88cb5" }));

import { loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";
import { executeAssemblyCheckout, type AssemblyCheckoutDeps } from "@/lib/checkout/assemblyCheckout";
import type { BoundAssembly } from "@/lib/registries/useMemberBoundAssemblies";
import { canonicalFileBytes, keyOf, pinSpec, primeClauseSpecs } from "./primeClauseSpecs";

const BUYER = "0x1111111111111111111111111111111111111111" as const;
const LEAD = "0x2222222222222222222222222222222222222222" as const;
const BOUND_SELLER = "0x5555555555555555555555555555555555555555" as const;
const PICKED_SELLER = "0x4444444444444444444444444444444444444444" as const;
const TOKEN = "0x3333333333333333333333333333333333333333" as const;

// A stranger's clause that composes a contract under an interface no one in
// the repository has named, and asks for two composition inputs, one required.
const COMPOSING = pinSpec({
    clauseId: "zq-escrow-bridge-7",
    version: 1,
    title: "Bridge escrow",
    description: "A clause from outside the repository that composes a contract it names by interface.",
    fields: [],
    block: {
        design: { article: "zq-article", scope: "agreement", nestsUnder: null, fills: [], composes: { interface: "zq-bridge-escrow" } },
        checkout: {
            catalogueFills: [], profileFills: [],
            compositionFields: [
                { name: "zqBridgeTarget", type: "string", required: true },
                { name: "zqMemo", type: "string", required: false },
            ],
        },
        runtime: { interaction: null },
    },
});
// A second stranger's clause the lead seller binds a co-seller under.
const BINDING = pinSpec({
    clauseId: "zq-leg-binding-7",
    version: 1,
    title: "Leg binding",
    description: "A clause from outside the repository a seller binds a co-seller under.",
    fields: [],
    block: {
        design: { article: "zq-article", scope: "agreement", nestsUnder: null, fills: [] },
        checkout: { catalogueFills: [], profileFills: [] },
        runtime: { interaction: null },
    },
});

let hydrated: HydratedProcessDesign;

beforeAll(async () => {
    await primeClauseSpecs(["figaro-commerce"]);
    setClauseSpecFetcher(async (uri) =>
        uri === "mem://composing" ? COMPOSING.bytes
        : uri === "mem://binding" ? BINDING.bytes
        : canonicalFileBytes(uri));
    await loadClauseSpec(COMPOSING.clauseKey, "mem://composing");
    await loadClauseSpec(BINDING.clauseKey, "mem://binding");
    const root = { [keyOf("figaro-commerce")]: {}, [COMPOSING.clauseKey]: {} };
    const bound = { [COMPOSING.clauseKey]: {}, [BINDING.clauseKey]: {} };
    const unbound = { [COMPOSING.clauseKey]: {} };
    const [rootHash, boundHash, unboundHash] = [root, bound, unbound].map((clauses) => agreementHashOf({ clauses }));
    hydrated = {
        assembly: {
            agreements: [
                { id: "agreement-0", agreementHash: rootHash!, clauses: {}, follows: [] },
                { id: "agreement-1", agreementHash: boundHash!, clauses: {}, follows: ["agreement-0"] },
                { id: "agreement-2", agreementHash: unboundHash!, clauses: {}, follows: ["agreement-0"] },
            ],
        },
        agreements: {
            [rootHash!.toLowerCase() as Hex]: { clauses: root },
            [boundHash!.toLowerCase() as Hex]: { clauses: bound },
            [unboundHash!.toLowerCase() as Hex]: { clauses: unbound },
        },
    };
});

describe("the checkout walk over a declared composition", () => {
    it("places the root, the bound sub-order and the unbound sub-order, and reads no composition step from its caller", async () => {
        const signRoot = vi.fn(async () => ({}) as never);
        const signAndShare = vi.fn(async () => ({}) as never);
        const deps: AssemblyCheckoutDeps = { chainId: 31337, readResolveCap: async () => 10, signRoot, signAndShare };
        // Every capability the walk asks its caller for, by name.
        const asked = new Set<string>();
        const watched = new Proxy(deps, {
            get(target, key, receiver) {
                asked.add(String(key));
                return Reflect.get(target, key, receiver);
            },
        });
        await executeAssemblyCheckout(
            {
                buyer: BUYER,
                leadSellerAddress: LEAD,
                currency: TOKEN,
                payment: 1_000_000n,
                lineItems: [{ itemId: "i1", name: "Coffee", quantity: 1, unitPrice: "1000000" }],
                assembly: {
                    slug: "asm-zq",
                    name: "Stranger",
                    hydratedAssembly: hydrated,
                    coSellerBindings: [{ clauseKey: BINDING.clauseKey, addresses: [BOUND_SELLER] }],
                } as BoundAssembly,
                sellerCatalogs: [
                    { address: BOUND_SELLER, name: "Bound", items: [{ id: "leg", name: "Leg", price: "0.25", available: true }] },
                ] as never,
                tokenDecimals: 6,
                salt: () => 7n,
                deadline: 4_000_000_000n,
                subOrderSelections: {
                    "agreement-2": { seller: PICKED_SELLER as Hex, price: "0.0005", item: { id: "svc", name: "Service" } },
                },
            },
            watched,
        );
        expect(signAndShare).toHaveBeenCalledTimes(2);
        expect(signRoot).toHaveBeenCalledTimes(1);
        const subSellers = signAndShare.mock.calls.map((call) => ((call as unknown[])[0] as { commitment: { seller: string } }).commitment.seller.toLowerCase());
        expect(subSellers.sort()).toEqual([PICKED_SELLER, BOUND_SELLER].sort());
        expect([...asked].filter((k) => !["chainId", "readResolveCap", "signRoot", "signAndShare", "prepareSignatures"].includes(k))).toEqual([]);
    });
});
