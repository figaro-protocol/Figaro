/**
 * CheckoutView — the venue quote, the swap-funding composition and the
 * buyer's balance, each read failed or resolved empty (docs/OPEN_WORLD.md § 1
 * "No fallbacks — absence is the representation").
 *
 * The cart line is listed in the seller's token and the process runs in
 * another, so the amount the buyer signs is the venue's quote or the buyer's
 * own figure.
 *
 * - A quote that fails, or that the venue answers with zero for a price above
 *   zero, is no price: with nothing typed the amount is unknown, so no
 *   "Payment to seller 0", no "Locked at commit 0", no loading line for a
 *   read that has answered, and no error text about the venue.
 * - No swap composition in the deployment, or a seller that accepts no token
 *   but the denomination: no funding panel and no error text.
 * - A balance of zero: the funding panel is offered (the seller accepts
 *   another token) and the page shows no error text before the buyer acts.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";

const SELLER = "0x00000000000000000000000000000000000000aa";
const LISTED = "0x00000000000000000000000000000000000000b1"; // the seller's list-price token
const DENOM = "0x00000000000000000000000000000000000000d2"; // the assembly's denomination
const BUYER = "0x00000000000000000000000000000000000000e5";
const ROUTER = "0x00000000000000000000000000000000000000c3";

const m = vi.hoisted(() => ({
    quoteAsked: 0,
    quote: (async () => { throw new Error("venue reverted: no pool"); }) as () => Promise<unknown>,
    contracts: null as unknown,
    buyer: undefined as string | undefined,
    balance: undefined as bigint | undefined,
    accepted: [] as { address: string; symbol: string }[],
}));

// One stable client: the quote effect keys on its identity.
const CLIENT = vi.hoisted(() => ({ chain: { id: 31337 } }));
vi.mock("wagmi", () => ({ useChainId: () => 31337, usePublicClient: () => CLIENT }));
vi.mock("@/lib/registries/useRegisteredCatalogs", () => ({
    useRegisteredCatalogs: () => ({
        read: {
            status: "present",
            value: [{
                address: "0x00000000000000000000000000000000000000aa",
                name: "Seller",
                defaultTokenAddress: "0x00000000000000000000000000000000000000b1",
                acceptedTokens: m.accepted,
                items: [],
            }],
        },
    }),
}));
const BOUND_LIST = vi.hoisted(() => [{
    slug: "one",
    name: "One",
    hydratedAssembly: { assembly: { agreements: [{ id: "agreement-0" }], assemblyClauses: {} } },
}]);
const BOUND = { status: "present", value: BOUND_LIST };
vi.mock("@/lib/registries/useMemberBoundAssemblies", () => ({
    useMemberBoundAssemblies: () => BOUND,
    withBoundCoSellers: (a: unknown) => a,
}));
vi.mock("@figaro-protocol/sdk", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@figaro-protocol/sdk")>()),
    // The designer pinned the denomination: every price listed in LISTED is translated.
    readUtilityTokenPin: () => DENOM,
    agreementClauses: () => ({}),
}));
vi.mock("@/lib/composability/swapFunding", () => ({
    resolveSwapFundingContracts: () => m.contracts,
    translateListedPrice: async () => {
        m.quoteAsked++;
        return m.quote();
    },
}));
vi.mock("@/lib/checkout", () => ({
    useCommerce: () => ({ address: m.buyer }),
    useCheckout: () => ({
        decimals: 18, balance: m.balance, needsAuthorization: () => false, authorize: vi.fn(),
        authorization: { isPending: false, isConfirming: false, isSuccess: false, isError: false },
        signRoot: vi.fn(), signAndShare: vi.fn(),
        order: { step: "idle", error: null, payload: null },
    }),
}));
const CART = { items: [{ sellerId: SELLER, catalogItemId: "i1", name: "Widget", price: "5", quantity: 1 }] };
vi.mock("@/lib/checkout/cartStore", () => ({ useCartStore: () => CART }));
vi.mock("@/lib/checkout/dispatchRace", () => ({ useDispatchRace: () => ({ result: null }), postToAgentEndpoint: vi.fn() }));
vi.mock("@/hooks/useTokenApproval", () => ({ default: () => ({ needsApproval: () => false, allowanceKnown: true }) }));
vi.mock("@/hooks/useApproveThenAct", () => ({ useApproveThenAct: () => ({ runWithApproval: vi.fn() }) }));
vi.mock("@/hooks/useTokenSymbol", () => ({ useTokenSymbol: () => ({ data: undefined }) }));
vi.mock("@/hooks/useTokenDecimals", () => ({ default: () => ({ decimals: 18 }) }));
vi.mock("@/hooks/useConnectInjected", () => ({ useConnectInjected: () => vi.fn() }));
vi.mock("@/lib/registries/useClauseSpecs", () => ({ useClauseSpecs: () => ({ loaded: true, version: 0 }) }));
vi.mock("@/components/runtime/DispatchRacePanel", () => ({ DispatchRacePanel: () => null }));
vi.mock("@/components/runtime/SellerCatalogPicker", () => ({ SellerCatalogPicker: () => null }));
vi.mock("@/components/runtime/CommitmentSharePanel", () => ({ CommitmentSharePanel: () => null }));
vi.mock("@/lib/composability/useFundingMargin", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/composability/useFundingMargin")>()),
    useFundingMargin: () => ({
        marginFor: () => ({ text: "", bps: null, quotedInput: null, maxInput: null, refusal: null, venue: null, decimals: undefined, symbol: "", onChange: () => {} }),
    }),
}));
// The panel's own reads are its tests'; here only whether the page mounts it.
vi.mock("@/app/(app)/s/checkout/_components/SwapFundingPanel", () => ({
    SwapFundingPanel: () => <div data-testid="swap-funding-panel" />,
}));

import { CheckoutView } from "@/app/(app)/s/checkout/_components/CheckoutView";

/** Words a page may not show in a read's place when the read failed or came back empty. */
const ERROR_TEXT = /\bfail(s|ed|ure)?\b|\berror\b|could ?n[o']t|unavailable|unable|unreachable|insufficient|no pool/i;
const LINE = "line:i1";
const WEI = 10n ** 18n;

async function settle() {
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
}

beforeEach(() => {
    m.quoteAsked = 0;
    m.quote = async () => { throw new Error("venue reverted: no pool"); };
    m.contracts = { router: ROUTER, permit2: "0x00000000000000000000000000000000000000c4" };
    m.buyer = undefined;
    m.balance = undefined;
    m.accepted = [
        { address: LISTED, symbol: "LST" },
        { address: DENOM, symbol: "DNM" },
    ];
});

describe("CheckoutView — the venue quote", () => {
    it("fails: no zero payment, no zero lock, no venue error text", async () => {
        const { container } = render(<CheckoutView sellerAddress={SELLER} />);
        // The translation row is on screen and its quote has been asked and failed.
        expect(await screen.findByTestId(`payment-translation-${LINE}`)).toBeInTheDocument();
        await waitFor(() => expect(m.quoteAsked).toBeGreaterThan(0));
        await settle();

        expect(screen.queryByTestId("checkout-locked-total")).toBeNull();
        expect(screen.queryByText("Payment to seller")).toBeNull();
        expect(container.textContent ?? "").not.toMatch(/could not quote|no pool/);
    });

    it("resolves empty — the venue quotes zero for a price above zero: no quote, no amount, no loading line, no error text", async () => {
        m.quote = async () => ({ listedAmount: 5n * WEI, amount: 0n, source: { venue: "devnet-mock", router: ROUTER } });
        const { container } = render(<CheckoutView sellerAddress={SELLER} />);
        expect(await screen.findByTestId(`payment-translation-${LINE}`)).toBeInTheDocument();
        await waitFor(() => expect(m.quoteAsked).toBeGreaterThan(0));
        await settle();

        expect(screen.queryByTestId(`payment-translation-quote-${LINE}`)).toBeNull();
        expect((screen.getByTestId(`payment-translation-amount-${LINE}`) as HTMLInputElement).value).toBe("");
        expect(screen.queryByTestId("checkout-locked-total")).toBeNull();
        expect(screen.queryByText("Payment to seller")).toBeNull();
        const text = container.textContent ?? "";
        expect(text).not.toMatch(/Reading a quote/);
        expect(text).not.toMatch(ERROR_TEXT);
    });

    it("answers a price: the quote and the amount stand (the read reaches the page)", async () => {
        m.quote = async () => ({ listedAmount: 5n * WEI, amount: 7n * WEI, source: { venue: "devnet-mock", router: ROUTER } });
        render(<CheckoutView sellerAddress={SELLER} />);
        expect(await screen.findByTestId(`payment-translation-quote-${LINE}`)).toHaveTextContent("7");
        expect((screen.getByTestId(`payment-translation-amount-${LINE}`) as HTMLInputElement).value).toBe("7");
    });
});

describe("CheckoutView — the swap-funding composition and the balance", () => {
    beforeEach(() => {
        m.buyer = BUYER;
        m.quote = async () => ({ listedAmount: 5n * WEI, amount: 7n * WEI, source: { venue: "devnet-mock", router: ROUTER } });
    });

    it("the balance resolves to zero: the funding panel is offered, and no error text before the buyer acts", async () => {
        m.balance = 0n;
        const { container } = render(<CheckoutView sellerAddress={SELLER} />);
        expect(await screen.findByTestId("swap-funding-panel")).toBeInTheDocument();
        expect(container.textContent ?? "").not.toMatch(ERROR_TEXT);
    });

    it("no swap composition in the deployment: no funding panel, no quote read, no error text", async () => {
        m.balance = 0n;
        m.contracts = null;
        const { container } = render(<CheckoutView sellerAddress={SELLER} />);
        expect(await screen.findByTestId(`payment-translation-${LINE}`)).toBeInTheDocument();
        await settle();
        expect(m.quoteAsked).toBe(0);
        expect(screen.queryByTestId("swap-funding-panel")).toBeNull();
        expect(container.textContent ?? "").not.toMatch(ERROR_TEXT);
    });

    it("the seller accepts no token but the denomination: no funding candidate, no funding panel, no error text", async () => {
        m.balance = 0n;
        m.accepted = [{ address: DENOM, symbol: "DNM" }];
        const { container } = render(<CheckoutView sellerAddress={SELLER} />);
        expect(await screen.findByTestId(`payment-translation-quote-${LINE}`)).toBeInTheDocument();
        await settle();
        expect(screen.queryByTestId("swap-funding-panel")).toBeNull();
        expect(container.textContent ?? "").not.toMatch(ERROR_TEXT);
    });
});
