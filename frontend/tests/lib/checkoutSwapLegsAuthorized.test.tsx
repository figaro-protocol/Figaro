/**
 * A swap-funded checkout of several orders, end to end through the client:
 * the funding panel's cap (`useFundingMargin`), the quote of every leg before
 * the first signature (`quoteBuyerFunding`) and the checkout walk
 * (`executeAssemblyCheckout`).
 *
 * Each order's swap pulls its own whole cap through Permit2 from the one
 * allowance (`WitnessSwapAndCommitCoordinator._fund`), one commit after
 * another. The panel asks for the sum of each leg's own cap, quoted and
 * rounded up the way each leg is; an authorization of exactly that lets every
 * order sign, and one unit less refuses the checkout before any signature.
 * The venue here rounds its quote up, so the sum of the legs' caps is above
 * one cap over the whole locked total.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { agreementHashOf, hashCommitmentStruct, type Hex, type HydratedProcessDesign } from "@figaro-protocol/sdk";

const INPUT_TOKEN = "0x00000000000000000000000000000000000000f1" as const;

vi.mock("wagmi", () => ({
    useAccount: () => ({ address: "0x1111111111111111111111111111111111111111" }),
    useChainId: () => 31337,
    usePublicClient: () => ({ chain: { id: 31337 } }),
    useWalletClient: () => ({ data: null }),
    useSignTypedData: () => ({ signTypedDataAsync: async () => `0x${"11".repeat(65)}` }),
}));
vi.mock("@/lib/core/contracts", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/core/contracts")>();
    return { ...actual, CONTRACTS: { ...actual.CONTRACTS, core: "0x0Dac9D673a37cEAfc220eb0B5646375A6Eb88cb5" } };
});
vi.mock("@/lib/composability/contracts", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/composability/contracts")>()),
    getWitnessSwapAndCommitCoordinator: () => "0x00000000000000000000000000000000000000c0",
    getPermit2: () => "0x00000000000000000000000000000000000000a2",
    getSwapRouter: () => "0x00000000000000000000000000000000000000d0",
}));
// A venue whose input for an exact output is 3/7 of it, rounded up, with a
// margin of 1%: one venue for the panel's quotes and the legs' quotes alike.
vi.mock("@/lib/composability/swapVenue", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/composability/swapVenue")>()),
    detectSwapVenue: async () => ({
        kind: "uniswap-v3",
        router: "0x00000000000000000000000000000000000000d0",
        slippageBps: 100,
        quote: async (_in: Hex, _out: Hex, amountOut: bigint) => ({
            amountIn: (amountOut * 3n + 6n) / 7n,
            route: () => "0xdead" as Hex,
        }),
    }),
}));
vi.mock("@/hooks/useTokenDecimals", () => ({ default: () => ({ decimals: 6 }) }));
vi.mock("@/hooks/useTokenBalance", () => ({ default: () => ({ read: { status: "present", value: 10n ** 30n } }) }));
vi.mock("@/lib/core/useFigaroActions", () => ({ useFigaroActions: () => ({ commit: vi.fn() }) }));
vi.mock("@/lib/composability/useSwapAndCommitActions", () => ({ useSwapAndCommitActions: () => ({ swapAndCommit: vi.fn() }) }));
vi.mock("@/lib/shared/runtimeServicesContext", () => ({ useRuntimeServices: () => ({}) }));

import { loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";
import { capWithSlippage } from "@/lib/composability/swapVenue";
import { executeAssemblyCheckout, planProcessOrders, type AssemblyCheckoutParams } from "@/lib/checkout/assemblyCheckout";
import { useOrderCommitmentFlow, type BuyerFundingRequest } from "@/lib/checkout/orderCommitmentFlow";
import { useFundingMargin } from "@/lib/composability/useFundingMargin";
import type { OrderPreview } from "@/lib/checkout/orderPreview";
import type { BoundAssembly } from "@/lib/registries/useMemberBoundAssemblies";
import { canonicalFileBytes, keyOf, pinSpec, primeClauseSpecs } from "./primeClauseSpecs";

const BUYER = "0x1111111111111111111111111111111111111111" as const;
const LEAD = "0x2222222222222222222222222222222222222222" as const;
const TOKEN = "0x3333333333333333333333333333333333333333" as const;

// A made-up clause for the sub-orders, with no committed field.
const SERVICE = pinSpec({
    clauseId: "test-swap-legs-service",
    version: 1,
    title: "A service",
    description: "A made-up clause with no committed field.",
    fields: [],
    stages: { "1": [{ name: "note", type: "string", required: true }] },
});

let hydrated: HydratedProcessDesign;
let params: AssemblyCheckoutParams & { salt: (nodeId: string) => bigint; deadline: bigint };

beforeAll(async () => {
    await primeClauseSpecs(["figaro-commerce"]);
    setClauseSpecFetcher(async (uri) => (uri === "mem://swap-legs-service" ? SERVICE.bytes : canonicalFileBytes(uri)));
    await loadClauseSpec(SERVICE.clauseKey, "mem://swap-legs-service");
    const root = { [keyOf("figaro-commerce")]: {} };
    const sub = { [SERVICE.clauseKey]: {} };
    const rootHash = agreementHashOf({ clauses: root });
    const subHash = agreementHashOf({ clauses: sub });
    hydrated = {
        assembly: {
            agreements: [
                { id: "agreement-0", agreementHash: rootHash, clauses: {}, follows: [] },
                { id: "agreement-1", agreementHash: subHash, clauses: {}, follows: ["agreement-0"] },
                { id: "agreement-2", agreementHash: subHash, clauses: {}, follows: ["agreement-0"] },
            ],
        },
        agreements: {
            [rootHash.toLowerCase() as Hex]: { clauses: root },
            [subHash.toLowerCase() as Hex]: { clauses: sub },
        },
    };
    params = {
        buyer: BUYER,
        leadSellerAddress: LEAD,
        currency: TOKEN,
        payment: 1_000_001n,
        lineItems: [{ itemId: "i1", name: "Coffee", quantity: 1, unitPrice: "1000001" }],
        assembly: { slug: "asm-legs", name: "Legs", hydratedAssembly: hydrated, coSellerBindings: [] } as BoundAssembly,
        sellerCatalogs: [],
        tokenDecimals: 6,
        salt: () => 7n,
        deadline: 4_000_000_000n,
        subOrderSelections: {
            "agreement-1": { seller: "0x4444444444444444444444444444444444444444", price: "0.000117", item: { id: "a", name: "A" } },
            "agreement-2": { seller: "0x5555555555555555555555555555555555555555", price: "0.000117", item: { id: "b", name: "B" } },
        },
    };
});

/** The panel's cap for the checkout's orders, as the page asks for it: each
 *  order's buyer bond is one leg. */
async function panelCap(): Promise<{ cap: bigint; bps: number; bonds: bigint[] }> {
    const orders = await planProcessOrders(params, { chainId: 31337 });
    const bonds = orders.map((o) => 2n * o.commitment.payment);
    const { result } = renderHook(() => useFundingMargin({ party: BUYER, currency: TOKEN, fundingToken: INPUT_TOKEN, fundingSymbol: "FND" }).marginFor(bonds));
    await waitFor(() => expect(result.current.maxInput).not.toBeNull());
    return { cap: result.current.maxInput!, bps: result.current.bps!, bonds };
}

async function checkout(approvedInput: bigint, bps: number) {
    const { result: flow } = renderHook(() => useOrderCommitmentFlow());
    const signed: { preview: OrderPreview; funding: BuyerFundingRequest | undefined }[] = [];
    let funding: BuyerFundingRequest | undefined;
    const run = executeAssemblyCheckout(params, {
        chainId: 31337,
        readResolveCap: async () => 10,
        prepareSignatures: async (previews) => {
            funding = await flow.current.quoteBuyerFunding(previews, { inputToken: INPUT_TOKEN, slippageBps: bps, approvedInput });
        },
        signAndShare: async (preview) => { signed.push({ preview, funding }); return {} as never; },
        signRoot: async (preview) => { signed.push({ preview, funding }); return {} as never; },
    });
    return { run, signed };
}

describe("a swap-funded checkout of several orders under one allowance", () => {
    it("the panel asks for the sum of each leg's own cap, above one cap over the whole locked total", async () => {
        const { cap, bps, bonds } = await panelCap();
        const quote = (b: bigint) => (b * 3n + 6n) / 7n;
        expect(cap).toBe(bonds.reduce((sum, b) => sum + capWithSlippage(quote(b), bps), 0n));
        const total = bonds.reduce((sum, b) => sum + b, 0n);
        expect(cap).toBeGreaterThan(capWithSlippage(quote(total), bps));
        // Each leg's margin is rounded up on its own, as each leg's cap is.
        expect(cap).toBeGreaterThan(capWithSlippage(bonds.reduce((sum, b) => sum + quote(b), 0n), bps));
    });

    it("an authorization of exactly the panel's cap lets every order sign, each with its own quote, the quotes summing to the cap", async () => {
        const { cap, bps } = await panelCap();
        const { run, signed } = await checkout(cap, bps);
        await run;
        expect(signed).toHaveLength(3);
        const legs = signed[0].funding!.legs!;
        expect(legs.size).toBe(3);
        for (const { preview, funding } of signed) {
            expect(funding).toBe(signed[0].funding);
            expect(legs.has(hashCommitmentStruct(preview.commitment))).toBe(true);
        }
        expect([...legs.values()].reduce((sum, q) => sum + q.maxInput, 0n)).toBe(cap);
    });

    it("an authorization one unit short refuses the checkout before any signature", async () => {
        const { cap, bps } = await panelCap();
        const { run, signed } = await checkout(cap - 1n, bps);
        await expect(run).rejects.toThrow(/together may pull .* above the .* you authorized/);
        expect(signed).toEqual([]);
    });
});
