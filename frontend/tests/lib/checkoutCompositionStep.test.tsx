/**
 * The checkout's composition step (`useCompositionActions`), on a real
 * checkout walk. A sub-order whose clause declares `block.design.composes`
 * with composition fields hands its interface to `compose`, and no interface has
 * a handler: the step refuses, naming the interface, and the composing
 * sub-order is never signed, nor is the root, which the walk signs last.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { agreementHashOf, type Hex, type HydratedProcessDesign } from "@figaro-protocol/sdk";

vi.mock("wagmi", () => ({ useAccount: () => ({ address: "0x1111111111111111111111111111111111111111" }) }));
vi.mock("@/lib/core/contracts", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/core/contracts")>();
    return { ...actual, CONTRACTS: { ...actual.CONTRACTS, core: "0x0Dac9D673a37cEAfc220eb0B5646375A6Eb88cb5" } };
});

import { loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";
import { executeAssemblyCheckout } from "@/lib/checkout/assemblyCheckout";
import { useCompositionActions } from "@/lib/composition/useCompositionActions";
import type { BoundAssembly } from "@/lib/member/useMemberBoundAssemblies";
import { canonicalFileBytes, keyOf, pinSpec, primeClauseSpecs } from "./primeClauseSpecs";

const BUYER = "0x1111111111111111111111111111111111111111" as const;
const LEAD = "0x2222222222222222222222222222222222222222" as const;
const CO_SELLER = "0x4444444444444444444444444444444444444444" as const;
const TOKEN = "0x3333333333333333333333333333333333333333" as const;

// A made-up clause that composes an on-network contract under an interface
// no handler knows, and asks the buyer for one composition input at checkout.
const COMPOSING = pinSpec({
    clauseId: "test-composing",
    version: 1,
    title: "Composes a contract",
    description: "A made-up clause that declares a composition with a composition field.",
    fields: [],
    block: {
        design: { article: "test-article", scope: "agreement", nestsUnder: null, fills: [], composes: { interface: "test-interface" } },
        checkout: { catalogueFills: [], profileFills: [], compositionFields: [{ name: "target", type: "string", required: true }] },
        runtime: { interaction: null },
    },
});

let hydrated: HydratedProcessDesign;

beforeAll(async () => {
    await primeClauseSpecs(["figaro-commerce"]);
    setClauseSpecFetcher(async (uri) => (uri === "mem://composing" ? COMPOSING.bytes : canonicalFileBytes(uri)));
    await loadClauseSpec(COMPOSING.clauseKey, "mem://composing");
    const root = { [keyOf("figaro-commerce")]: {} };
    const sub = { [COMPOSING.clauseKey]: {} };
    const rootHash = agreementHashOf({ clauses: root });
    const subHash = agreementHashOf({ clauses: sub });
    hydrated = {
        assembly: {
            agreements: [
                { id: "agreement-0", agreementHash: rootHash, clauses: {}, follows: [] },
                { id: "agreement-1", agreementHash: subHash, clauses: {}, follows: ["agreement-0"] },
            ],
        },
        agreements: {
            [rootHash.toLowerCase() as Hex]: { clauses: root },
            [subHash.toLowerCase() as Hex]: { clauses: sub },
        },
    };
});

describe("the checkout's composition step", () => {
    it("refuses every interface, naming it: no handler is registered", async () => {
        const { result } = renderHook(() => useCompositionActions());
        await expect(result.current.compose({
            interface: "test-interface", fieldValues: {}, processId: `0x${"00".repeat(32)}`, currency: TOKEN, tokenDecimals: 6,
        })).rejects.toThrow('No runtime handler for composition interface "test-interface".');
    });

    it("on a checkout walk, a composing sub-order stops the walk before it or the root is signed", async () => {
        const { result } = renderHook(() => useCompositionActions());
        const signRoot = vi.fn();
        const signAndShare = vi.fn();
        await expect(executeAssemblyCheckout(
            {
                buyer: BUYER,
                leadSellerAddress: LEAD,
                currency: TOKEN,
                payment: 1_000_000n,
                lineItems: [{ itemId: "i1", name: "Coffee", quantity: 1, unitPrice: "1000000" }],
                assembly: { slug: "asm-compose", name: "Compose", hydratedAssembly: hydrated, coSellerBindings: [] } as BoundAssembly,
                sellerCatalogs: [],
                tokenDecimals: 6,
                salt: () => 7n,
                deadline: 4_000_000_000n,
                subOrderSelections: {
                    "agreement-1": { seller: CO_SELLER as Hex, price: "0.0005", item: { id: "svc", name: "Service" } },
                },
                subOrderCompositions: { "agreement-1": { interface: "test-interface", fieldValues: { target: "x" } } },
            },
            { chainId: 31337, readResolveCap: async () => 10, signRoot, signAndShare, compose: result.current.compose },
        )).rejects.toThrow('No runtime handler for composition interface "test-interface".');
        expect(signAndShare).not.toHaveBeenCalled();
        expect(signRoot).not.toHaveBeenCalled();
    });
});
