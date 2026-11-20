/**
 * CheckoutView — the swap legs of one checkout are checked together.
 *
 * Each swap-funded order's swap pulls its own signed maximum input through
 * Permit2 from the one allowance (`WitnessSwapAndCommitCoordinator._fund`),
 * one commit after another. So the funding panel is asked for the cap of
 * each order's buyer bond, one leg per order; every order of one attempt is
 * quoted together before the first signature (`quoteBuyerFunding`), and
 * each sign receives the request that quote returned. A new attempt quotes
 * again.
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const SELLER = "0x00000000000000000000000000000000000000aa";
const FUNDING_TOKEN = "0x00000000000000000000000000000000000000f1";

const H = vi.hoisted(() => ({
    /** The funding request each sign of each attempt received. */
    attempts: [] as unknown[][],
    /** Each request `quoteBuyerFunding` returned, and how many orders it quoted. */
    quoted: [] as Array<{ request: Record<string, unknown>; orders: number }>,
    /** The bonds the funding panel was asked about, per render. */
    marginAsked: [] as unknown[],
}));

vi.mock("wagmi", () => ({ useChainId: () => 31337, usePublicClient: () => ({ chain: { id: 31337 } }) }));
const CATALOG_LIST = vi.hoisted(() => [
    {
        address: "0x00000000000000000000000000000000000000aa",
        name: "Kitchen",
        defaultTokenAddress: "0x00000000000000000000000000000000000000d2",
        acceptedTokens: [
            { address: "0x00000000000000000000000000000000000000d2", symbol: "DNM" },
            { address: "0x00000000000000000000000000000000000000f1", symbol: "FND" },
        ],
        items: [],
    },
]);
const CATALOGS = { read: { status: "present", value: CATALOG_LIST } };
vi.mock("@/lib/registries/useRegisteredCatalogs", () => ({ useRegisteredCatalogs: () => CATALOGS }));
const BOUND_LIST = vi.hoisted(() => [{
    slug: "two",
    name: "Two",
    hydratedAssembly: { assembly: { agreements: [{ id: "agreement-0" }, { id: "agreement-1" }], assemblyClauses: {} } },
    coSellerBindings: [],
}]);
const BOUND = { status: "present", value: BOUND_LIST };
vi.mock("@/lib/registries/useMemberBoundAssemblies", () => ({
    useMemberBoundAssemblies: () => BOUND,
    withBoundCoSellers: (a: unknown) => a,
}));
vi.mock("@figaro-protocol/sdk", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@figaro-protocol/sdk")>()),
    readUtilityTokenPin: () => "0x00000000000000000000000000000000000000d2",
    agreementClauses: () => ({}),
    processDesignHashOf: () => `0x${"ab".repeat(32)}`,
    planSubOrderSellers: () => [{ node: { nodeId: "agreement-1", clauses: {} }, seller: undefined, itemId: undefined }],
}));
const signRoot = vi.fn(async (_p: unknown, funding: unknown) => { H.attempts[H.attempts.length - 1].push(funding); return {}; });
const signAndShare = vi.fn(async (_p: unknown, funding: unknown) => { H.attempts[H.attempts.length - 1].push(funding); return {}; });
vi.mock("@/lib/checkout", () => ({
    useCommerce: () => ({ address: "0x00000000000000000000000000000000000000b1" }),
    useCheckout: () => ({
        decimals: 18, decimalsReady: true, balance: 10n ** 30n, needsAuthorization: () => false, authorize: vi.fn(),
        authorization: { isPending: false, isConfirming: false, isSuccess: false, isError: false },
        signRoot, signAndShare,
        quoteBuyerFunding: async (previews: unknown[], funding: Record<string, unknown>) => {
            const request = { ...funding, legs: new Map() };
            H.quoted.push({ request, orders: previews.length });
            return request;
        },
        order: { step: "idle", error: null, payload: null },
    }),
}));
const CART = { items: [{ sellerId: SELLER, catalogItemId: "meal", name: "Meal", price: "5", quantity: 1 }] };
vi.mock("@/lib/checkout/assemblyCheckout", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/checkout/assemblyCheckout")>()),
    checkoutMeasureRefusals: () => [],
    // The walk builds three orders, prepares their signatures, signs two
    // sub-orders, then the root, and the attempt fails so the buyer can
    // place again.
    executeAssemblyCheckout: async (_params: unknown, deps: {
        prepareSignatures?: (previews: unknown[]) => Promise<void>;
        signRoot: (p: unknown) => Promise<unknown>;
        signAndShare: (p: unknown) => Promise<unknown>;
    }) => {
        H.attempts.push([]);
        await deps.prepareSignatures?.([{}, {}, {}]);
        await deps.signAndShare({});
        await deps.signAndShare({});
        await deps.signRoot({});
        throw new Error("the relay refused");
    },
}));
vi.mock("@/lib/checkout/cartStore", () => ({ useCartStore: () => CART }));
vi.mock("@/lib/checkout/dispatchRace", () => ({
    useDispatchRace: () => ({
        result: {
            nodeId: "agreement-1",
            blinding: {},
            selection: { seller: "0x00000000000000000000000000000000000000cc", price: "2", item: { id: "ride", name: "Ride" } },
            salt: () => 1n,
            deadline: 9_999_999_999n,
            race: {},
        },
        start: async () => undefined,
        reset: () => undefined,
    }),
    postToAgentEndpoint: vi.fn(),
}));
// The buyer chose a funding token and authorized Permit2 for 1000 of it.
vi.mock("@/lib/composability/useSwapFunding", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/composability/useSwapFunding")>()),
    useSwapFunding: () => ({
        contracts: null,
        candidates: [{ address: "0x00000000000000000000000000000000000000f1", symbol: "FND" }],
        fundingToken: "0x00000000000000000000000000000000000000f1",
        setFundingToken: () => undefined,
        authorizationFor: () => "ready",
        allowance: 1000n,
        authorize: () => undefined,
        authorizeFailed: false,
    }),
}));
vi.mock("@/lib/composability/useFundingMargin", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/composability/useFundingMargin")>()),
    useFundingMargin: () => ({
        marginFor: (bonds: unknown) => {
            H.marginAsked.push(bonds);
            return { text: "1", bps: 100, quotedInput: 900n, maxInput: 909n, refusal: null, venue: "uniswap-v3", decimals: 18, symbol: "FND", onChange: () => undefined };
        },
    }),
}));
vi.mock("@/hooks/useTokenApproval", () => ({ default: () => ({ needsApproval: () => false, allowanceKnown: true }) }));
vi.mock("@/hooks/useApproveThenAct", () => ({ useApproveThenAct: () => ({ runWithApproval: (_amount: unknown, act: () => void) => act() }) }));
vi.mock("@/hooks/useTokenSymbol", () => ({ useTokenSymbol: () => ({ data: undefined }) }));
vi.mock("@/hooks/useTokenDecimals", () => ({ default: () => ({ decimals: 18 }) }));
vi.mock("@/hooks/useTokenBalance", () => ({ default: () => ({ read: { status: "present", value: 10n ** 30n }, refetch: () => {} }) }));
vi.mock("@/hooks/useConnectInjected", () => ({ useConnectInjected: () => vi.fn() }));
vi.mock("@/lib/registries/useClauseSpecs", () => ({ useClauseSpecs: () => ({ loaded: true, version: 0 }) }));
vi.mock("@/components/runtime/DispatchRacePanel", () => ({ DispatchRacePanel: () => null }));
vi.mock("@/components/runtime/SellerCatalogPicker", () => ({ SellerCatalogPicker: () => null }));
vi.mock("@/components/runtime/CommitmentSharePanel", () => ({ CommitmentSharePanel: () => null }));
vi.mock("@/app/(app)/s/checkout/_components/SwapFundingPanel", () => ({ SwapFundingPanel: () => null }));

import { CheckoutView } from "@/app/(app)/s/checkout/_components/CheckoutView";

describe("CheckoutView — the swap legs of one checkout", () => {
    it("the panel is asked for each order's buyer bond, one leg each", async () => {
        const view = render(<CheckoutView sellerAddress={SELLER} />);
        await screen.findByTestId("btn-place-order");
        // The root's payment is the cart (5 tokens of 18 decimals), the raced
        // sub-order's the winner's price (2 tokens): bonds of twice each.
        expect(H.marginAsked.at(-1)).toEqual([10n * 10n ** 18n, 4n * 10n ** 18n]);
        view.unmount();
    });

    it("every order of one attempt is quoted together before the first signature, each sign receives that quote's request, and a new attempt quotes again", async () => {
        H.attempts = [];
        H.quoted = [];
        const view = render(<CheckoutView sellerAddress={SELLER} />);
        fireEvent.click(await screen.findByTestId("btn-place-order"));
        await waitFor(() => expect(H.attempts[0]).toHaveLength(3));
        expect(H.quoted).toHaveLength(1);
        expect(H.quoted[0].orders).toBe(3);
        expect(H.quoted[0].request).toMatchObject({ inputToken: FUNDING_TOKEN, approvedInput: 1000n });
        for (const funding of H.attempts[0]) expect(funding).toBe(H.quoted[0].request);

        await waitFor(() => expect(screen.getByText(/the relay refused/)).toBeTruthy());
        view.rerender(<CheckoutView sellerAddress={SELLER} />);
        fireEvent.click(screen.getByTestId("btn-place-order"));
        await waitFor(() => expect(H.attempts[1]).toHaveLength(3));
        expect(H.quoted).toHaveLength(2);
        for (const funding of H.attempts[1]) expect(funding).toBe(H.quoted[1].request);
        expect(H.quoted[1].request).not.toBe(H.quoted[0].request);
        view.unmount();
    });
});
