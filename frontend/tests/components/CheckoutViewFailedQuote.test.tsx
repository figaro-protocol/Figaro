/**
 * CheckoutView — a venue quote that fails is no price. The cart line is listed
 * in the seller's token and the process runs in another, so the amount the
 * buyer signs is the venue's quote or the buyer's own figure. With the quote
 * failed and nothing typed, the amount is unknown: no "Payment to seller 0",
 * no "Locked at commit 0", and no error text about the venue.
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const SELLER = "0x00000000000000000000000000000000000000aa";
const LISTED = "0x00000000000000000000000000000000000000b1"; // the seller's list-price token
const DENOM = "0x00000000000000000000000000000000000000d2"; // the assembly's denomination
const quoteAsked = vi.hoisted(() => ({ count: 0 }));

// One stable client: the quote effect keys on its identity.
const CLIENT = vi.hoisted(() => ({ chain: { id: 31337 } }));
vi.mock("wagmi", () => ({ useChainId: () => 31337, usePublicClient: () => CLIENT }));
// Each read in both shapes — the one read primitive's `present`, and the
// older hook shape — so the test reads the same on either side of the fix.
const CATALOG_LIST = vi.hoisted(() => [{
    address: "0x00000000000000000000000000000000000000aa",
    name: "Seller",
    defaultTokenAddress: "0x00000000000000000000000000000000000000b1",
    acceptedTokens: [
        { address: "0x00000000000000000000000000000000000000b1", symbol: "LST" },
        { address: "0x00000000000000000000000000000000000000d2", symbol: "DNM" },
    ],
    items: [],
}]);
const CATALOGS = { read: { status: "present", value: CATALOG_LIST }, catalogs: CATALOG_LIST, isLoading: false };
vi.mock("@/lib/member/useRegisteredCatalogs", () => ({ useRegisteredCatalogs: () => CATALOGS }));
const BOUND_LIST = vi.hoisted(() => [{
    slug: "one",
    name: "One",
    hydratedAssembly: { assembly: { agreements: [{ id: "agreement-0" }], assemblyClauses: {} } },
}]);
const BOUND = { status: "present", value: BOUND_LIST, assemblies: BOUND_LIST };
vi.mock("@/lib/member/useMemberBoundAssemblies", () => ({
    useMemberBoundAssemblies: () => BOUND,
    withBoundCoSellers: (a: unknown) => a,
}));
vi.mock("@figaro-protocol/sdk", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@figaro-protocol/sdk")>()),
    // The designer pinned the denomination: every price listed in LISTED is translated.
    readUtilityTokenPin: () => DENOM,
    agreementClauses: () => ({}),
}));
vi.mock("@/lib/composition/swapFunding", () => ({
    resolveSwapFundingContracts: () => ({ router: "0x00000000000000000000000000000000000000c3", permit2: "0x00000000000000000000000000000000000000c4" }),
    translateListedPrice: async () => {
        quoteAsked.count++;
        throw new Error("venue reverted: no pool");
    },
}));
vi.mock("@/lib/checkout", () => ({
    useCommerce: () => ({ address: undefined }),
    useCheckout: () => ({
        decimals: 18, balance: undefined, needsAuthorization: () => false, authorize: vi.fn(),
        authorization: { isPending: false, isConfirming: false, isSuccess: false, isError: false },
        signRoot: vi.fn(), signAndShare: vi.fn(),
        order: { step: "idle", error: null, payload: null },
    }),
}));
const CART = { items: [{ sellerId: SELLER, catalogItemId: "i1", name: "Widget", price: "5", quantity: 1 }] };
vi.mock("@/lib/checkout/cartStore", () => ({ useCartStore: () => CART }));
vi.mock("@/lib/checkout/dispatchRace", () => ({ useDispatchRace: () => ({ result: null }), postToAgentEndpoint: vi.fn() }));
vi.mock("@/lib/composition/useCompositionActions", () => ({ useCompositionActions: () => ({ compose: vi.fn() }) }));
vi.mock("@/hooks/useTokenApproval", () => ({ default: () => ({ needsApproval: () => false, allowanceKnown: true }) }));
vi.mock("@/hooks/useApproveThenAct", () => ({ useApproveThenAct: () => ({ runWithApproval: vi.fn() }) }));
vi.mock("@/hooks/useTokenSymbol", () => ({ useTokenSymbol: () => ({ data: undefined }) }));
vi.mock("@/hooks/useTokenDecimals", () => ({ default: () => ({ decimals: 18 }) }));
vi.mock("@/hooks/useConnectInjected", () => ({ useConnectInjected: () => vi.fn() }));
vi.mock("@/lib/protocol/useClauseSpecs", () => ({ useClauseSpecs: () => ({ loaded: true, version: 0 }) }));
vi.mock("@/components/runtime/DispatchRacePanel", () => ({ DispatchRacePanel: () => null }));
vi.mock("@/components/runtime/SellerCatalogPicker", () => ({ SellerCatalogPicker: () => null }));
vi.mock("@/components/runtime/CommitmentSharePanel", () => ({ CommitmentSharePanel: () => null }));
vi.mock("@/lib/composition/useFundingMargin", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/composition/useFundingMargin")>()),
    useFundingMargin: () => ({
        marginFor: () => ({ text: "", bps: null, quotedInput: null, maxInput: null, refusal: null, venue: null, decimals: undefined, symbol: "", onChange: () => {} }),
    }),
}));
vi.mock("@/app/(app)/s/checkout/_components/SwapFundingPanel", () => ({
    SwapFundingPanel: () => null,
}));

import { CheckoutView } from "@/app/(app)/s/checkout/_components/CheckoutView";

describe("CheckoutView — a failed venue quote shows no price", () => {
    it("no zero payment, no zero lock, no venue error text", async () => {
        const { container } = render(<CheckoutView sellerAddress={SELLER} />);
        // The translation row is on screen and its quote has been asked and failed.
        expect(await screen.findByTestId("payment-translation-line:i1")).toBeInTheDocument();
        await waitFor(() => expect(quoteAsked.count).toBeGreaterThan(0));
        await new Promise((r) => setTimeout(r, 0));

        expect(screen.queryByTestId("checkout-locked-total")).toBeNull();
        expect(screen.queryByText("Payment to seller")).toBeNull();
        expect(container.textContent ?? "").not.toMatch(/could not quote|no pool/);
    });
});
