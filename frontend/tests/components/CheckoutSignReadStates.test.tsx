/**
 * The buyer's checkout and the counter-sign page over a network read that
 * fails, resolves empty, or is still in flight (docs/OPEN_WORLD.md § 1 "No
 * fallbacks — absence is the representation"). The states follow
 * `AppPagesReadStates.test.tsx`:
 *
 * - failed: the read's place is empty, with no error text.
 * - resolved empty: the page may say that the chain answered with nothing;
 *   it shows no loading line, no stand-in value and no error text.
 * - in flight: the loading line where the page has one, and nothing else
 *   for the read's place.
 *
 * /s/checkout reads the registered catalogs, the seller's bound assemblies,
 * and the denomination's decimals and symbol (`CheckoutView`). Its failed
 * catalog read is held by `CheckoutViewFailedRead.test.tsx`.
 *
 * /sign reads the counter-signing seller's profile (its registration, then
 * its document), whose accepted tokens are the funding candidates, and the
 * registered catalogs, whose listed prices stand beside the amounts signed.
 */
import React from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { buildOrderAgreement, computeCheckoutHash, type Commitment, type Hex } from "@figaro-protocol/sdk";
import { serializeCommitmentPayload, type CommitmentPayload } from "@figaro-protocol/sdk/agent";
import { keyOf, primeClauseSpecs } from "../lib/primeClauseSpecs";
import { specSource } from "@/lib/shared/clauseSpecSource";
import { ABSENT, PENDING, present } from "@/lib/shared/networkRead";

const BUYER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Hex;
const SELLER = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Hex;
const CURRENCY = `0x${"ab".repeat(20)}` as Hex;
const OTHER_TOKEN = `0x${"1a".repeat(20)}` as Hex;

const m = vi.hoisted(() => ({
    client: { chain: { id: 31337 } },
    address: undefined as string | undefined,
    buyer: undefined as string | undefined,
    capacity: null as unknown,
    search: "",
    catalogs: undefined as unknown,
    bound: undefined as unknown,
    cart: [] as unknown[],
    decimals: undefined as number | undefined,
    symbol: undefined as string | undefined,
    registration: undefined as unknown,
    profile: (async () => null) as () => Promise<unknown>,
}));

vi.mock("wagmi", () => ({
    useAccount: () => ({ address: m.address }),
    useChainId: () => 31337,
    // One client for every render, as wagmi's hook keeps it.
    usePublicClient: () => m.client,
}));
vi.mock("next/navigation", () => ({
    useSearchParams: () => new URLSearchParams(m.search),
    useRouter: () => ({ push: () => undefined, replace: () => undefined }),
}));
vi.mock("@/lib/registries/useClauseSpecs", () => ({ useClauseSpecs: () => ({ loaded: true, version: 0 }) }));
vi.mock("@/lib/registries/useRegisteredCatalogs", () => ({ useRegisteredCatalogs: () => ({ read: m.catalogs }) }));
vi.mock("@/hooks/useTokenSymbol", () => ({ useTokenSymbol: () => ({ data: m.symbol }) }));
vi.mock("@/hooks/useTokenDecimals", () => ({ default: () => ({ decimals: m.decimals, ready: m.decimals !== undefined, loading: false }) }));
vi.mock("@/hooks/useTokenBalance", () => ({ default: () => ({ read: present(10n ** 30n), refetch: () => undefined }) }));
vi.mock("@/hooks/useTokenApproval", () => ({
    default: () => ({
        needsApproval: () => false, allowanceKnown: true, isAllowanceRefetching: false,
        isApprovePending: false, isApproveConfirming: false, isApproveError: false, allowance: undefined, approve: () => undefined,
    }),
}));
// The swap composition is configured, so the funding candidates are the
// party's accepted tokens: what the page shows of them comes from the read.
vi.mock("@/lib/composability/swapFunding", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/composability/swapFunding")>()),
    resolveSwapFundingContracts: () => ({
        coordinator: `0x${"c0".repeat(20)}`, permit2: `0x${"22".repeat(20)}`, router: `0x${"77".repeat(20)}`,
    }),
}));
vi.mock("@/lib/composability/useFundingMargin", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/composability/useFundingMargin")>()),
    useFundingMargin: () => ({ marginFor: () => ({ bps: null, maxInput: null }) }),
}));
vi.mock("@/hooks/useProcessResolveCapacity", () => ({ default: () => m.capacity }));

// /s/checkout
vi.mock("@/lib/registries/useMemberBoundAssemblies", () => ({
    useMemberBoundAssemblies: () => m.bound,
    withBoundCoSellers: (a: unknown) => a,
}));
vi.mock("@/lib/checkout", () => ({
    useCommerce: () => ({ address: m.buyer }),
    useCheckout: () => ({
        decimals: m.decimals, balance: undefined, needsAuthorization: () => false, authorize: vi.fn(),
        authorization: { isPending: false, isConfirming: false, isSuccess: false, isError: false },
        signRoot: vi.fn(), signAndShare: vi.fn(),
        order: { step: "idle", error: null, payload: null },
    }),
}));
vi.mock("@/lib/checkout/cartStore", () => ({ useCartStore: () => ({ items: m.cart }) }));
vi.mock("@/lib/checkout/dispatchRace", () => ({ useDispatchRace: () => ({ result: null }), postToAgentEndpoint: vi.fn() }));
vi.mock("@/hooks/useApproveThenAct", () => ({ useApproveThenAct: () => ({ runWithApproval: vi.fn() }) }));
vi.mock("@/hooks/useConnectInjected", () => ({ useConnectInjected: () => vi.fn() }));
vi.mock("@/components/runtime/DispatchRacePanel", () => ({ DispatchRacePanel: () => null }));
vi.mock("@/components/runtime/SellerCatalogPicker", () => ({ SellerCatalogPicker: () => null }));
vi.mock("@/components/runtime/CommitmentSharePanel", () => ({ CommitmentSharePanel: () => null }));

// /sign
vi.mock("@/lib/checkout/orderCommitmentFlow", () => ({
    useOrderCommitmentFlow: () => ({
        step: "idle", error: null, acceptOrder: vi.fn(), reset: vi.fn(),
        counterSignAndReturn: vi.fn(), quoteAndReturn: vi.fn(), commitOrder: vi.fn(),
    }),
    readSigningInputs: async () => null,
    readFollowedOrders: async () => [],
}));
vi.mock("@/lib/checkout/orderPendingSellerSignature", () => ({
    useCommitmentPayloadInbox: () => ({ entries: [], status: "idle", error: null }),
}));
vi.mock("@/lib/registries/useMembersRegistry", () => ({ useMemberProfile: () => ({ read: m.registration }) }));
vi.mock("@/lib/registries/profileFetcher", () => ({ fetchMemberProfile: () => m.profile() }));
vi.mock("@/components/runtime/AgreementReview", () => ({ AgreementReview: () => null, pricedLineItems: () => ({ lines: [], sum: null }) }));
vi.mock("@/components/runtime/TokenApprovalFlow", () => ({ TokenApprovalFlow: () => null }));

import { CheckoutView } from "@/app/(app)/s/checkout/_components/CheckoutView";
import SignPage from "@/app/(app)/sign/page";

/** Words a page may not show in a read's place when the read failed or came back empty. */
const ERROR_TEXT = /\bfail(s|ed|ure)?\b|\berror\b|could ?n[o']t|unavailable|unable|unreachable/i;

async function flush() {
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
}

// ── /s/checkout ─────────────────────────────────────────────────────────────

/** The seller's registered catalog: one item, listed in the denomination. */
const CATALOG = {
    address: SELLER.toLowerCase(),
    name: "Kitchen",
    defaultTokenAddress: CURRENCY,
    acceptedTokens: [{ address: CURRENCY }],
    items: [{ id: "meal", name: "Meal", price: "5", available: true }],
};
const CART_LINE = { sellerId: SELLER.toLowerCase(), catalogItemId: "meal", name: "Meal", price: "5", quantity: 1 };
/** Whatever row a bound assembly would put on the page: the method, its terms. */
const FROM_BOUND = ["method-static", "select-method", "checkout-agreement-terms"];
/** Figures priced from the denomination's decimals. */
const FIGURES = ["checkout-locked-total", "checkout-bond-arithmetic", "cart-kit-total"];

describe("/s/checkout — each network read resolved empty", () => {
    beforeEach(() => {
        m.catalogs = present([CATALOG]);
        m.bound = present([]);
        m.cart = [CART_LINE];
        m.decimals = 18;
        m.symbol = "DNM";
    });

    it("the registered catalogs name no catalog for the seller: the absence is stated, no loading line, no error text, no checkout", async () => {
        m.catalogs = present([]);
        const { container } = render(<CheckoutView sellerAddress={SELLER} />);
        await flush();
        const text = container.textContent ?? "";
        expect(text).toMatch(/No member page for/);
        expect(text).not.toMatch(/Loading/);
        expect(text).not.toMatch(ERROR_TEXT);
        expect(screen.queryByTestId("checkout-view")).toBeNull();
    });

    it("the seller's bound assemblies resolve empty: no method, no terms, no error text", async () => {
        const { container } = render(<CheckoutView sellerAddress={SELLER} />);
        await flush();
        expect(screen.getByTestId("checkout-view")).toBeTruthy();
        for (const id of FROM_BOUND) expect(screen.queryByTestId(id)).toBeNull();
        expect(container.textContent ?? "").not.toMatch(ERROR_TEXT);
    });

    it("the seller's bound assemblies resolve empty, a wallet connected: no option, so no order button and no instruction to select one", async () => {
        m.buyer = BUYER;
        try {
            const { container } = render(<CheckoutView sellerAddress={SELLER} />);
            await flush();
            expect(screen.getByTestId("checkout-view")).toBeTruthy();
            expect(screen.queryByTestId("btn-place-order")).toBeNull();
            expect(container.textContent ?? "").not.toMatch(/Select an option/);
        } finally {
            m.buyer = undefined;
        }
    });

    it("the denomination answers no decimals: no figure, no error text", async () => {
        m.decimals = undefined;
        const { container } = render(<CheckoutView sellerAddress={SELLER} />);
        await flush();
        expect(screen.getByTestId("checkout-view")).toBeTruthy();
        for (const id of FIGURES) expect(screen.queryByTestId(id)).toBeNull();
        expect(container.textContent ?? "").not.toMatch(ERROR_TEXT);
    });

    it("the denomination answers no symbol and the seller declared none: the figure stands with no symbol beside it", async () => {
        m.symbol = undefined;
        const { container } = render(<CheckoutView sellerAddress={SELLER} />);
        await flush();
        // 5 paid and 5 bonded: the locked figure, then straight to its arithmetic.
        expect(screen.getByTestId("checkout-bond-arithmetic").textContent).toMatch(/^10 = twice the payment/);
        expect(container.textContent ?? "").not.toMatch(ERROR_TEXT);
    });
});

describe("/s/checkout — a failed or in-flight read", () => {
    beforeEach(() => {
        m.catalogs = present([CATALOG]);
        m.bound = present([]);
        m.cart = [CART_LINE];
        m.decimals = 18;
        m.symbol = "DNM";
    });

    it("the seller's bound assemblies fail alone, the catalogs present: no text at all", async () => {
        m.bound = ABSENT;
        const { container } = render(<CheckoutView sellerAddress={SELLER} />);
        await flush();
        expect(container.textContent).toBe("");
    });

    it("the catalog read is in flight: the loading line, no absence stated, no error text", async () => {
        m.catalogs = PENDING;
        const { container } = render(<CheckoutView sellerAddress={SELLER} />);
        await flush();
        const text = container.textContent ?? "";
        expect(text).toMatch(/Loading…/);
        expect(text).not.toMatch(/Member not found|No member page/);
        expect(text).not.toMatch(ERROR_TEXT);
        expect(screen.queryByTestId("checkout-view")).toBeNull();
    });

    it("the seller's bound assemblies are in flight: no method, no terms, no error text", async () => {
        m.bound = PENDING;
        const { container } = render(<CheckoutView sellerAddress={SELLER} />);
        await flush();
        for (const id of FROM_BOUND) expect(screen.queryByTestId(id)).toBeNull();
        expect(container.textContent ?? "").not.toMatch(ERROR_TEXT);
    });
});

// ── /sign ───────────────────────────────────────────────────────────────────

/** A buyer-signed order awaiting the seller, linked into the page. */
function linkedPayload(processId: Hex = `0x${"00".repeat(32)}` as Hex): string {
    const { agreement } = buildOrderAgreement(BUYER, SELLER, {
        [keyOf("figaro-commerce")]: {
            lineItems: [{ itemId: "item-1", name: "Item", quantity: 1, unitPrice: "1000" }],
        },
    }, specSource());
    const commitment: Commitment = {
        processId, buyer: BUYER, seller: SELLER, token: CURRENCY,
        payment: 1000n, runningTotal: 1000n,
        checkoutHash: computeCheckoutHash(agreement),
        salt: 1n, commitDeadline: 9_999_999_999n,
    };
    const payload: CommitmentPayload = { commitment, agreement, buyerSig: `0x${"22".repeat(65)}` as Hex };
    return `payload=${encodeURIComponent(serializeCommitmentPayload(payload))}`;
}

const REGISTERED = present({ registered: true, metadataURI: "ipfs://QmProfile", registeredBlock: 1n });
const PROFILE = { name: "Kitchen", acceptedTokens: [{ address: CURRENCY, symbol: "TKN" }, { address: OTHER_TOKEN, symbol: "AAA" }] };
/** The seller's catalog, listed in a token other than the order's denomination. */
const LISTED_ELSEWHERE = { ...CATALOG, defaultTokenAddress: OTHER_TOKEN, acceptedTokens: [{ address: OTHER_TOKEN }] };

async function renderSign() {
    const { container } = render(<SignPage />);
    await flush();
    // The review renders whatever the reads: proof the page read the payload.
    expect(screen.getByTestId("sign-payment")).toBeTruthy();
    return container.textContent ?? "";
}

describe("/sign — the seller's profile read and the catalog read", () => {
    beforeAll(async () => { await primeClauseSpecs(["figaro-commerce"]); });
    beforeEach(() => {
        m.address = SELLER;
        m.search = linkedPayload();
        m.decimals = 6;
        m.symbol = "TKN";
        m.registration = REGISTERED;
        m.profile = async () => PROFILE;
        m.catalogs = present([LISTED_ELSEWHERE]);
    });

    it("both reads present: the funding choice and the listed prices show (the reads reach the page)", async () => {
        await renderSign();
        expect(screen.getByTestId("seller-funding-toggle")).toBeTruthy();
        expect(screen.getByTestId("sign-listed-prices")).toBeTruthy();
    });

    it.each([
        ["the registration read fails", () => { m.registration = ABSENT; }],
        ["the profile document fails to read", () => { m.profile = async () => { throw new Error("fetch failed: gateway unreachable"); }; }],
        ["the profile document resolves empty", () => { m.profile = async () => null; }],
        ["the registration read is in flight", () => { m.registration = PENDING; }],
    ] as const)("%s: no funding choice, no error text", async (_state, set) => {
        set();
        const text = await renderSign();
        expect(screen.queryByTestId("seller-funding-toggle")).toBeNull();
        expect(text).not.toMatch(ERROR_TEXT);
    });

    it.each([
        ["the catalog read fails", () => { m.catalogs = ABSENT; }],
        ["the catalog read resolves empty", () => { m.catalogs = present([]); }],
        ["the catalog read is in flight", () => { m.catalogs = PENDING; }],
    ] as const)("%s: no listed prices, no error text", async (_state, set) => {
        set();
        const text = await renderSign();
        expect(screen.queryByTestId("sign-listed-prices")).toBeNull();
        expect(text).not.toMatch(/listed/);
        expect(text).not.toMatch(ERROR_TEXT);
    });
});

/** A sub-order's process: the page reads its capacity against the resolve ceiling. */
const SUB_PROCESS = `0x${"5b".repeat(32)}` as Hex;

describe("/sign — the denomination's decimals and symbol, and the process's capacity", () => {
    beforeAll(async () => { await primeClauseSpecs(["figaro-commerce"]); });
    beforeEach(() => {
        m.address = SELLER;
        m.search = linkedPayload();
        m.decimals = 6;
        m.symbol = "TKN";
        m.registration = REGISTERED;
        m.profile = async () => PROFILE;
        m.catalogs = present([]);
        m.capacity = null;
    });

    it("all three present: the figure, its symbol and the capacity row show (the reads reach the page)", async () => {
        m.search = linkedPayload(SUB_PROCESS);
        m.capacity = { activeOrderCount: 3, cap: 100, remaining: 97 };
        await renderSign();
        expect(screen.getByTestId("sign-payment").textContent?.trim()).toBe("0.001 TKN");
        expect(screen.getByTestId("sign-process-capacity").textContent).toMatch(/3 \/ 100 resolvable/);
    });

    it("the decimals read resolves empty: no figure, only the symbol, and no error text", async () => {
        m.decimals = undefined;
        const text = await renderSign();
        expect(screen.getByTestId("sign-payment").textContent?.trim()).toBe("TKN");
        expect(screen.getByTestId("sign-my-bond").textContent?.trim()).toBe("TKN");
        expect(text).not.toMatch(ERROR_TEXT);
    });

    it("the symbol read resolves empty: the figure stands with no symbol beside it, and no error text", async () => {
        m.symbol = undefined;
        const text = await renderSign();
        expect(screen.getByTestId("sign-payment").textContent?.trim()).toBe("0.001");
        expect(text).not.toMatch(ERROR_TEXT);
    });

    it("the capacity read of a sub-order's process resolves empty: no capacity row, and no error text", async () => {
        m.search = linkedPayload(SUB_PROCESS);
        const text = await renderSign();
        expect(screen.queryByTestId("sign-process-capacity")).toBeNull();
        expect(text).not.toMatch(/resolvable/);
        expect(text).not.toMatch(ERROR_TEXT);
    });
});
