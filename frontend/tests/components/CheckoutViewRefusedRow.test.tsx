/**
 * CheckoutView — a breakdown row the checkout walk would refuse (its pricing
 * carries an `issue`) refuses on the page, before the click: the place-order
 * button is disabled, a line beside it says why in the row's own words, and
 * no total and no locked-at-commit figure is shown (a sum would count the
 * refused row as zero). With every row priced, the button is enabled and the
 * total shows.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const SELLER = "0x00000000000000000000000000000000000000aa";
const DENOM = "0x00000000000000000000000000000000000000d2";

vi.mock("wagmi", () => ({ useChainId: () => 31337, usePublicClient: () => ({ chain: { id: 31337 } }) }));
// The courier's catalog: what the sub-order is priced from. Each test sets it.
const STATE = vi.hoisted(() => ({
    courierItems: [] as Array<Record<string, unknown>>,
    itemId: undefined as string | undefined,
    measureRefusals: [] as string[],
}));
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
        get items() { return STATE.courierItems; },
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
    planSubOrderSellers: () => [{
        node: { nodeId: "agreement-1", clauses: {} },
        seller: "0x00000000000000000000000000000000000000cc",
        itemId: STATE.itemId,
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
// The walk's own measure refusal, as the page reads it before the click; its
// computation is tested over a real spec in tests/lib/catalogueMeasuresWalk.test.ts.
vi.mock("@/lib/checkout/assemblyCheckout", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/checkout/assemblyCheckout")>()),
    checkoutMeasureRefusals: () => STATE.measureRefusals,
}));
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

beforeEach(() => {
    STATE.courierItems = [];
    STATE.itemId = undefined;
    STATE.measureRefusals = [];
});

describe("CheckoutView — a refused breakdown row refuses the order before the click", () => {
    it("a named item no longer offered: button disabled, the reason beside it, no total", async () => {
        STATE.courierItems = [{ id: "ride-short", name: "Short ride", price: "2", available: true }];
        STATE.itemId = "ride-long";
        render(<CheckoutView sellerAddress={SELLER} />);
        await screen.findByTestId("kit-row-refusal-agreement-1");
        expect(screen.getByTestId("btn-place-order")).toBeDisabled();
        expect(screen.getByTestId("checkout-refusals").textContent).toBe(
            "The seller named an item from Courier for this order, and Courier no longer offers it. This order cannot be placed.",
        );
        expect(screen.queryByTestId("cart-kit-total")).toBeNull();
        expect(screen.queryByTestId("checkout-locked-total")).toBeNull();
        expect(screen.queryByTestId("checkout-bond-arithmetic")).toBeNull();
    });

    it("a rate quantity that does not resolve: button disabled, the reason beside it, no total", async () => {
        // A rate item whose quantity source reads a clause value this order
        // does not carry.
        STATE.courierItems = [{
            id: "haul", name: "Haul", price: "1", available: true,
            pricingPolicy: "rate", rateUnit: "km", rateQuantitySource: "order-geodistance",
        }];
        render(<CheckoutView sellerAddress={SELLER} />);
        await screen.findByTestId("kit-row-refusal-agreement-1");
        expect(screen.getByTestId("btn-place-order")).toBeDisabled();
        expect(screen.getByTestId("checkout-refusals").textContent).toBe(
            "Priced by rate (km), but this order carries no value its quantity source can read.",
        );
        expect(screen.queryByTestId("cart-kit-total")).toBeNull();
        expect(screen.queryByTestId("checkout-locked-total")).toBeNull();
    });

    it("a co-seller with no available item: no figure, its own notice, button disabled, no total", async () => {
        render(<CheckoutView sellerAddress={SELLER} />);
        const notice = await screen.findByTestId("kit-row-refusal-agreement-1");
        const sentence = "Courier offers no available item for this order, or its catalog could not be read. This order cannot be placed.";
        expect(notice.textContent).toBe(sentence);
        expect(screen.queryByTestId("kit-row-payment-agreement-1")).toBeNull();
        expect(screen.getByTestId("btn-place-order")).toBeDisabled();
        expect(screen.getByTestId("checkout-refusals").textContent).toBe(sentence);
        expect(screen.queryByTestId("cart-kit-total")).toBeNull();
        expect(screen.queryByTestId("checkout-locked-total")).toBeNull();
    });

    it("a required catalog measure missing: button disabled, the walk's sentence beside it", async () => {
        STATE.courierItems = [{ id: "ride-short", name: "Short ride", price: "2", available: true }];
        const sentence = "This order's \"Cargo\" term needs \"Mass\", which it reads from each catalog item's \"massGrams\" — and the items on this order don't supply it. The seller's catalog must state it before this order can be placed.";
        STATE.measureRefusals = [sentence];
        render(<CheckoutView sellerAddress={SELLER} />);
        const line = await screen.findByTestId("checkout-refusals");
        expect(line.textContent).toBe(sentence);
        expect(screen.getByTestId("btn-place-order")).toBeDisabled();
    });

    it("every row priced: button enabled, no refusal line, the total shown", async () => {
        STATE.courierItems = [{ id: "ride-short", name: "Short ride", price: "2", available: true }];
        render(<CheckoutView sellerAddress={SELLER} />);
        const total = await screen.findByTestId("cart-kit-total");
        expect(total.textContent).toMatch(/^7(\.0*)?$/);
        expect(screen.getByTestId("checkout-locked-total")).toBeInTheDocument();
        expect(screen.queryByTestId("checkout-refusals")).toBeNull();
        expect(screen.getByTestId("btn-place-order")).not.toBeDisabled();
    });
});
