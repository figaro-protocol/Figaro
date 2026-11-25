/**
 * CheckoutView without Web Crypto — an order carrying a private clause needs
 * a blinding value drawn from the browser's Web Crypto. Where the browser has
 * none, the page renders, says in words why the order cannot be placed, and
 * holds the place-order button; it never throws while it renders, and
 * nothing is signed without a value.
 */
import React from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";
import { pinSpec } from "../lib/primeClauseSpecs";
import { render, screen } from "@testing-library/react";

const SELLER = "0x00000000000000000000000000000000000000aa";
// The private clause's key, set once its spec is pinned (the sdk mock reads it lazily).
const PRIVATE_KEY = vi.hoisted(() => ({ key: "" }));
const DENOM = "0x00000000000000000000000000000000000000d2";

vi.mock("wagmi", async () => (await import("../support/wagmiMock")).wagmiMock());
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
    readUtilityTokenPin: () => DENOM,
    agreementClauses: () => ({ [PRIVATE_KEY.key]: {} }),
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
vi.mock("@/hooks/useTokenApproval", () => ({ default: () => ({ needsApproval: () => false, allowanceKnown: true }) }));
vi.mock("@/hooks/useApproveThenAct", () => ({ useApproveThenAct: () => ({ runWithApproval: vi.fn() }) }));
vi.mock("@/hooks/useTokenSymbol", () => ({ useTokenSymbol: () => ({ data: undefined }) }));
vi.mock("@/hooks/useTokenDecimals", async () => (await import("../support/tokenDecimalsMock")).tokenDecimalsMock(18));
vi.mock("@/hooks/useTokenBalance", () => ({ default: () => ({ read: { status: "pending" }, refetch: () => {} }) }));
vi.mock("@/hooks/useConnectInjected", () => ({ useConnectInjected: () => vi.fn() }));
vi.mock("@/lib/registries/useClauseSpecs", () => ({ useClauseSpecs: () => ({ loaded: true, version: 0 }) }));
vi.mock("@/components/runtime/DispatchRacePanel", () => ({ DispatchRacePanel: () => null }));
vi.mock("@/components/runtime/SellerCatalogPicker", () => ({ SellerCatalogPicker: () => null }));
vi.mock("@/components/runtime/CommitmentSharePanel", () => ({ CommitmentSharePanel: () => null }));
vi.mock("@/app/(app)/s/checkout/_components/SwapFundingPanel", () => ({ SwapFundingPanel: () => null }));

import { CheckoutView } from "@/app/(app)/s/checkout/_components/CheckoutView";

const PRIVATE = pinSpec({
    clauseId: "test-checkout-private",
    version: 1,
    title: "Private grade",
    description: "A private committed value with few possibilities.",
    fields: [
        { name: "grade", type: "enum", values: ["a", "b", "c"], required: true, disposition: "private" },
        { name: "blinding", type: "string", format: "bytes32-hex", required: true, disposition: "private", blinding: true },
    ],
});

beforeAll(async () => {
    PRIVATE_KEY.key = PRIVATE.clauseKey;
    setClauseSpecFetcher(async () => PRIVATE.bytes);
    await loadClauseSpec(PRIVATE.clauseKey, "mem://checkout-private");
});

beforeEach(() => {
    STATE.courierItems = [{ id: "ride-short", name: "Short ride", price: "2", available: true }];
    STATE.itemId = undefined;
    STATE.measureRefusals = [];
});

afterEach(() => { vi.unstubAllGlobals(); });

describe("CheckoutView — no Web Crypto to draw a private term's value", () => {
    it("renders, says why the order cannot be placed, and holds the button", async () => {
        vi.stubGlobal("crypto", {});
        render(<CheckoutView sellerAddress={SELLER} />);
        const line = await screen.findByTestId("checkout-refusals");
        expect(line.textContent).toContain("This order cannot be placed in this browser: a private term needs a random value drawn by the browser's Web Crypto");
        expect(screen.getByTestId("btn-place-order")).toBeDisabled();
    });
});
