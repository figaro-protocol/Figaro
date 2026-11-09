/**
 * CheckoutView — the seller's binding names an item in a co-seller's own
 * catalog, and that catalog no longer offers it. The buyer's breakdown row
 * says so, and shows no payment for the order: the checkout walk refuses it
 * rather than commit a payment of zero.
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const SELLER = "0x00000000000000000000000000000000000000aa";
const DENOM = "0x00000000000000000000000000000000000000d2";

vi.mock("wagmi", () => ({ useChainId: () => 31337, usePublicClient: () => ({ chain: { id: 31337 } }) }));
const CATALOG_LIST = vi.hoisted(() => [
    {
        address: "0x00000000000000000000000000000000000000aa",
        name: "Kitchen",
        defaultTokenAddress: "0x00000000000000000000000000000000000000d2",
        acceptedTokens: [{ address: "0x00000000000000000000000000000000000000d2", symbol: "DNM" }],
        items: [],
    },
    {
        address: "0x00000000000000000000000000000000000000cc",
        name: "Courier",
        defaultTokenAddress: "0x00000000000000000000000000000000000000d2",
        acceptedTokens: [{ address: "0x00000000000000000000000000000000000000d2", symbol: "DNM" }],
        // The named item, "ride-long", is gone; another item is offered.
        items: [{ id: "ride-short", name: "Short ride", price: "2", available: true }],
    },
]);
const CATALOGS = { read: { status: "present", value: CATALOG_LIST } };
vi.mock("@/lib/member/useRegisteredCatalogs", () => ({ useRegisteredCatalogs: () => CATALOGS }));
const BOUND_LIST = vi.hoisted(() => [{
    slug: "two",
    name: "Two",
    hydratedAssembly: { assembly: { agreements: [{ id: "agreement-0" }, { id: "agreement-1" }], assemblyClauses: {} } },
    coSellerBindings: [],
}]);
const BOUND = { status: "present", value: BOUND_LIST };
vi.mock("@/lib/member/useMemberBoundAssemblies", () => ({
    useMemberBoundAssemblies: () => BOUND,
    withBoundCoSellers: (a: unknown) => a,
}));
vi.mock("@figaro-protocol/sdk", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@figaro-protocol/sdk")>()),
    readUtilityTokenPin: () => DENOM,
    agreementClauses: () => ({}),
    // The plan the seller's binding yields: the courier's sub-order, with the
    // item the seller named for the courier.
    planSubOrderSellers: () => [{
        node: { nodeId: "agreement-1", clauses: {} },
        seller: "0x00000000000000000000000000000000000000cc",
        itemId: "ride-long",
    }],
}));
vi.mock("@/lib/checkout", () => ({
    useCommerce: () => ({ address: undefined }),
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
vi.mock("@/lib/composition/useCompositionActions", () => ({ useCompositionActions: () => ({ compose: vi.fn() }) }));
vi.mock("@/hooks/useTokenApproval", () => ({ default: () => ({ needsApproval: () => false, allowanceKnown: true }) }));
vi.mock("@/hooks/useApproveThenAct", () => ({ useApproveThenAct: () => ({ runWithApproval: vi.fn() }) }));
vi.mock("@/hooks/useTokenSymbol", () => ({ useTokenSymbol: () => ({ data: undefined }) }));
vi.mock("@/hooks/useTokenDecimals", () => ({ default: () => ({ decimals: 18 }) }));
vi.mock("@/hooks/useTokenBalance", () => ({ default: () => ({ read: { status: "pending" }, refetch: () => {} }) }));
vi.mock("@/hooks/useConnectInjected", () => ({ useConnectInjected: () => vi.fn() }));
vi.mock("@/lib/protocol/useClauseSpecs", () => ({ useClauseSpecs: () => ({ loaded: true, version: 0 }) }));
vi.mock("@/components/runtime/DispatchRacePanel", () => ({ DispatchRacePanel: () => null }));
vi.mock("@/components/runtime/SellerCatalogPicker", () => ({ SellerCatalogPicker: () => null }));
vi.mock("@/components/runtime/CommitmentSharePanel", () => ({ CommitmentSharePanel: () => null }));
vi.mock("@/app/(app)/s/checkout/_components/SwapFundingPanel", () => ({ SwapFundingPanel: () => null }));

import { CheckoutView } from "@/app/(app)/s/checkout/_components/CheckoutView";

describe("CheckoutView — the item a seller named for a co-seller is no longer offered", () => {
    it("the courier's row says the named item is no longer offered and shows no payment", async () => {
        render(<CheckoutView sellerAddress={SELLER} />);
        const notice = await screen.findByTestId("named-item-not-offered-agreement-1");
        expect(notice.textContent).toBe(
            "The seller named an item from Courier for this order, and Courier no longer offers it. This order cannot be placed.",
        );
        // The row shows no figure: no payment of zero stands for the order.
        expect(screen.queryByTestId("kit-row-payment-agreement-1")).toBeNull();
        expect(screen.getByTestId("kit-row-payment-lead")).toBeInTheDocument();
    });
});
