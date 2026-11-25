/**
 * CheckoutView — the connected buyer is also the seller of an order of the
 * checkout: the lead, a bound co-seller, or the co-seller the buyer picks.
 * The Core and the SDK admit such an order; this frontend's accept does not
 * add the seller's signature to it. So the page says so in one line, before
 * the first signature prompt (the place-order button opens it), and refuses
 * nothing: the button stays as it would be. With no wallet connected the
 * page shows only what it read.
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

const SELLER = "0x00000000000000000000000000000000000000aa";
const CO_SELLER = "0x00000000000000000000000000000000000000cc";
const STRANGER = "0x00000000000000000000000000000000000000bb";
const DENOM = "0x00000000000000000000000000000000000000d2";

const m = vi.hoisted(() => ({
    buyer: undefined as string | undefined,
    agreements: [{ id: "agreement-0" }] as { id: string }[],
    // The co-seller each sub-order is bound to (null: the buyer picks).
    bound: [] as { nodeId: string; seller: string | null }[],
}));

vi.mock("wagmi", async () => (await import("../support/wagmiMock")).wagmiMock({ address: () => m.buyer }));
const CATALOGS = vi.hoisted(() => ({
    read: {
        status: "present",
        value: [
            {
                address: "0x00000000000000000000000000000000000000aa",
                name: "Kitchen",
                defaultTokenAddress: "0x00000000000000000000000000000000000000d2",
                acceptedTokens: [{ address: "0x00000000000000000000000000000000000000d2", symbol: "DNM" }],
                items: [{ id: "meal", name: "Meal", price: "5", available: true }],
            },
            {
                address: "0x00000000000000000000000000000000000000cc",
                name: "Courier",
                defaultTokenAddress: "0x00000000000000000000000000000000000000d2",
                acceptedTokens: [{ address: "0x00000000000000000000000000000000000000d2", symbol: "DNM" }],
                items: [{ id: "ride", name: "Ride", price: "2", available: true }],
            },
        ],
    },
}));
vi.mock("@/lib/registries/useRegisteredCatalogs", () => ({ useRegisteredCatalogs: () => CATALOGS }));
vi.mock("@/lib/registries/useMemberBoundAssemblies", () => ({
    useMemberBoundAssemblies: () => ({
        status: "present",
        value: [{
            slug: "plain",
            name: "Plain",
            hydratedAssembly: { assembly: { agreements: m.agreements, assemblyClauses: {} } },
            coSellerBindings: [],
        }],
    }),
    withBoundCoSellers: (a: unknown) => a,
}));
vi.mock("@figaro-protocol/sdk", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@figaro-protocol/sdk")>()),
    readUtilityTokenPin: () => DENOM,
    processDesignHashOf: () => `0x${"00".repeat(32)}`,
    agreementClauses: () => ({}),
    planSubOrderSellers: () => m.bound.map(({ nodeId, seller }) => ({ node: { nodeId, clauses: {} }, seller, itemId: null })),
}));
vi.mock("@/lib/checkout", () => ({
    useCommerce: () => ({ address: m.buyer }),
    useCheckout: () => ({
        decimals: 18, decimalsReady: true, balance: undefined, needsAuthorization: () => false, authorize: vi.fn(),
        authorization: { isPending: false, isConfirming: false, isSuccess: false, isError: false },
        signRoot: vi.fn(), signAndShare: vi.fn(),
        order: { step: "idle", error: null, payload: null },
    }),
}));
const CART = { items: [{ sellerId: SELLER, catalogItemId: "meal", name: "Meal", price: "5", quantity: 1 }] };
vi.mock("@/lib/checkout/cartStore", () => ({ useCartStore: () => CART }));
vi.mock("@/lib/checkout/dispatchRace", () => ({ useDispatchRace: () => ({ result: null }), postToAgentEndpoint: vi.fn() }));
vi.mock("@/hooks/useTokenApproval", () => ({ default: () => ({ needsApproval: () => false, allowanceKnown: true }) }));
vi.mock("@/hooks/useApproveThenAct", () => ({ useApproveThenAct: () => ({ runWithApproval: vi.fn() }) }));
vi.mock("@/hooks/useTokenSymbol", () => ({ useTokenSymbol: () => ({ data: "DNM" }) }));
vi.mock("@/hooks/useTokenDecimals", async () => (await import("../support/tokenDecimalsMock")).tokenDecimalsMock(18));
vi.mock("@/hooks/useTokenBalance", () => ({ default: () => ({ read: { status: "present", value: 10n ** 30n }, refetch: () => {} }) }));
vi.mock("@/hooks/useConnectInjected", () => ({ useConnectInjected: () => vi.fn() }));
vi.mock("@/lib/registries/useClauseSpecs", () => ({ useClauseSpecs: () => ({ loaded: true, version: 0 }) }));
vi.mock("@/components/runtime/DispatchRacePanel", () => ({ DispatchRacePanel: () => null }));
vi.mock("@/components/runtime/SellerCatalogPicker", () => ({ SellerCatalogPicker: () => null }));
vi.mock("@/components/runtime/CommitmentSharePanel", () => ({ CommitmentSharePanel: () => null }));
vi.mock("@/app/(app)/s/checkout/_components/SwapFundingPanel", () => ({ SwapFundingPanel: () => null }));

import { CheckoutView } from "@/app/(app)/s/checkout/_components/CheckoutView";

const LINE = "This frontend does not place an order whose buyer and seller are one wallet; the SDK and the Core do.";

async function renderAs(buyer: string | undefined) {
    m.buyer = buyer;
    const view = render(<CheckoutView sellerAddress={SELLER} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    return view;
}

afterEach(() => {
    m.buyer = undefined;
    m.agreements = [{ id: "agreement-0" }];
    m.bound = [];
});

describe("CheckoutView — one wallet on both sides of an order", () => {
    it("the buyer is the lead seller: the line shows, and the order can still be placed", async () => {
        await renderAs(SELLER);
        expect(screen.getByTestId("checkout-one-wallet-both-sides").textContent).toBe(LINE);
        const button = screen.getByTestId("btn-place-order");
        expect(button.textContent).toBe("Place order");
        expect(button).not.toBeDisabled();
    });

    it("the buyer is a bound co-seller of a sub-order: the line shows", async () => {
        m.agreements = [{ id: "agreement-0" }, { id: "agreement-1" }];
        m.bound = [{ nodeId: "agreement-1", seller: CO_SELLER }];
        await renderAs(CO_SELLER);
        expect(screen.getByTestId("checkout-one-wallet-both-sides").textContent).toBe(LINE);
    });

    it("the buyer sells no order of the checkout: no line", async () => {
        m.agreements = [{ id: "agreement-0" }, { id: "agreement-1" }];
        m.bound = [{ nodeId: "agreement-1", seller: CO_SELLER }];
        await renderAs(STRANGER);
        expect(screen.queryByTestId("checkout-one-wallet-both-sides")).toBeNull();
        expect(screen.getByTestId("btn-place-order").textContent).toBe("Place order");
    });

    it("no wallet connected: no line", async () => {
        await renderAs(undefined);
        expect(screen.queryByTestId("checkout-one-wallet-both-sides")).toBeNull();
    });
});
