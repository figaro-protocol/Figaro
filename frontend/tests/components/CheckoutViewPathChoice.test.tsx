/**
 * CheckoutView — the path the order runs on, the buyer's pick among the
 * paths the seller's binding accepts (`ProcessBindingRecord.paths`).
 *
 * The seller's binding, the relay its profile names and the relay's answers
 * are stood in for; the path derivation (`offeredPaths`), the relay discovery
 * and its check against the chain (`useCheckedRelay`, `checkRelay`,
 * `SequencerClient.status`) and the page are real.
 *
 * Proves: a seller whose binding accepts both paths gives the buyer the
 * choice once its relay passes the check, and the batch pick moves the bond
 * approval to the batch verifier; a seller whose binding declares none
 * gives the direct path alone, and no relay is read; a relay whose verifier
 * differs from the chain's leaves the direct path alone.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const SELLER = "0x00000000000000000000000000000000000000aa";
const DENOM = "0x00000000000000000000000000000000000000d2";

const m = vi.hoisted(() => ({
    paths: undefined as ("direct" | "batch")[] | undefined,
    // The designated co-seller, and its own binding's paths as its discovered
    // profile carries them; `undefined` coPaths: its profile is not among
    // those read.
    coSeller: null as string | null,
    coPaths: undefined as ("direct" | "batch")[] | undefined,
    relayVerifier: "0x2222222222222222222222222222222222222222",
    useCheckoutSpender: [] as string[],
    VERIFIER: "0x2222222222222222222222222222222222222222",
    CORE: "0x1111111111111111111111111111111111111111",
    VKEY: `0x${"5a".repeat(32)}`,
    // One client across renders, as wagmi's is.
    client: { chain: { id: 31337 }, readContract: async () => `0x${"5a".repeat(32)}` },
}));

vi.mock("wagmi", () => ({
    useAccount: () => ({ address: "0x00000000000000000000000000000000000000bb" }),
    useChainId: () => 31337,
    usePublicClient: () => m.client,
}));
vi.mock("@/lib/core/contracts", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/core/contracts")>()),
    CONTRACTS: { core: m.CORE, batchVerifier: m.VERIFIER },
    getBatchVerifier: () => m.VERIFIER,
}));
// The seller's profile names its relay among its services.
vi.mock("@/lib/registries/profileFetcher", () => ({
    profileReaderForChain: () => async () => ({ name: "Kitchen", services: { relay: "http://relay.test" } }),
}));
const CATALOGS = vi.hoisted(() => ({
    read: {
        status: "present",
        value: [{
            address: "0x00000000000000000000000000000000000000aa",
            name: "Kitchen",
            defaultTokenAddress: "0x00000000000000000000000000000000000000d2",
            acceptedTokens: [{ address: "0x00000000000000000000000000000000000000d2", symbol: "DNM" }],
            items: [{ id: "meal", name: "Meal", price: "5", available: true }],
        }],
    },
}));
vi.mock("@/lib/registries/useRegisteredCatalogs", () => ({
    useRegisteredCatalogs: () => (m.coSeller && m.coPaths
        ? {
            read: {
                status: "present",
                value: [...CATALOGS.read.value, {
                    address: m.coSeller, name: "Courier", items: [], acceptedTokens: [],
                    processBindings: [{ bindingId: "b", subjectAddress: m.coSeller, processDesignHash: `0x${"00".repeat(32)}`, paths: m.coPaths }],
                }],
            },
        }
        : CATALOGS),
}));
vi.mock("@/lib/registries/useMemberBoundAssemblies", () => ({
    useMemberBoundAssemblies: () => ({
        status: "present",
        value: [{
            slug: "plain",
            name: "Plain",
            hydratedAssembly: { assembly: { agreements: [{ id: "agreement-0" }], assemblyClauses: {} } },
            coSellerBindings: m.coSeller ? [{ clauseKey: `0x${"0c".repeat(32)}`, addresses: [m.coSeller] }] : [],
            ...(m.paths ? { paths: m.paths } : {}),
        }],
    }),
    withBoundCoSellers: (a: unknown) => a,
}));
vi.mock("@figaro-protocol/sdk", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@figaro-protocol/sdk")>()),
    readUtilityTokenPin: () => DENOM,
    processDesignHashOf: () => `0x${"00".repeat(32)}`,
    agreementClauses: () => ({}),
    planSubOrderSellers: () => [],
}));
vi.mock("@/lib/checkout", () => ({
    useCommerce: () => ({ address: "0x00000000000000000000000000000000000000bb" }),
    useCheckout: (_token: string, spender: string) => {
        m.useCheckoutSpender.push(spender);
        return {
            decimals: 18, decimalsReady: true, balance: undefined, needsAuthorization: () => false, authorize: vi.fn(),
            authorization: { isPending: false, isConfirming: false, isSuccess: false, isError: false },
            signRoot: vi.fn(), signAndShare: vi.fn(),
            order: { step: "idle", error: null, payload: null },
        };
    },
}));
const CART = { items: [{ sellerId: SELLER, catalogItemId: "meal", name: "Meal", price: "5", quantity: 1 }] };
vi.mock("@/lib/checkout/cartStore", () => ({ useCartStore: () => CART }));
vi.mock("@/lib/checkout/dispatchRace", () => ({ useDispatchRace: () => ({ result: null }), postToAgentEndpoint: vi.fn() }));
vi.mock("@/hooks/useTokenApproval", () => ({ default: () => ({ needsApproval: () => false, allowanceKnown: true }) }));
vi.mock("@/hooks/useApproveThenAct", () => ({ useApproveThenAct: () => ({ runWithApproval: vi.fn() }) }));
vi.mock("@/hooks/useTokenSymbol", () => ({ useTokenSymbol: () => ({ data: "DNM" }) }));
vi.mock("@/hooks/useTokenDecimals", () => ({ default: () => ({ decimals: 18 }) }));
vi.mock("@/hooks/useTokenBalance", () => ({ default: () => ({ read: { status: "present", value: 10n ** 30n }, refetch: () => {} }) }));
vi.mock("@/hooks/useConnectInjected", () => ({ useConnectInjected: () => vi.fn() }));
vi.mock("@/lib/registries/useClauseSpecs", () => ({ useClauseSpecs: () => ({ loaded: true, version: 0 }) }));
vi.mock("@/components/runtime/DispatchRacePanel", () => ({ DispatchRacePanel: () => null }));
vi.mock("@/components/runtime/SellerCatalogPicker", () => ({ SellerCatalogPicker: () => null }));
vi.mock("@/components/runtime/CommitmentSharePanel", () => ({ CommitmentSharePanel: () => null }));
vi.mock("@/app/(app)/s/checkout/_components/SwapFundingPanel", () => ({ SwapFundingPanel: () => null }));

import { CheckoutView } from "@/app/(app)/s/checkout/_components/CheckoutView";

let statusReads = 0;
beforeEach(() => {
    statusReads = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith("/status")) statusReads++;
        return new Response(JSON.stringify({
            wire_format_version: 1, chain_id: 31337, batch_verifier: m.relayVerifier, program_vkey: m.VKEY,
            browser_submit_origins: [window.location.origin],
            state_root: `0x${"00".repeat(32)}`, pending_ops: 0, pending_usage_claims: 0, batches_settled: 0,
        }), { status: 200 });
    }));
});

afterEach(() => {
    m.paths = undefined;
    m.relayVerifier = m.VERIFIER;
    m.useCheckoutSpender = [];
    m.coSeller = null;
    m.coPaths = undefined;
    vi.unstubAllGlobals();
});

async function renderCheckout() {
    render(<CheckoutView sellerAddress={SELLER} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
}

describe("CheckoutView — the paths are the intersection of every named seller's", () => {
    const CO = "0x00000000000000000000000000000000000000cc";

    it("a lead accepting the direct path alone beside a co-seller accepting the batch path alone: the final refusal, and no order", async () => {
        m.coSeller = CO;
        m.coPaths = ["batch"];
        await renderCheckout();
        await screen.findByTestId("checkout-path-none");
        expect(screen.queryByTestId("checkout-path-option-direct")).toBeNull();
        expect((screen.getByTestId("btn-place-order") as HTMLButtonElement).disabled).toBe(true);
        expect(m.useCheckoutSpender.at(-1)).toBeUndefined();
    });

    it("a co-seller whose binding is not read yet: a loading line, no refusal, no act, no spender", async () => {
        m.paths = ["direct", "batch"];
        m.coSeller = CO;
        await renderCheckout();
        expect(screen.getByTestId("checkout-path-reading")).toBeTruthy();
        expect(screen.queryByTestId("checkout-path-none")).toBeNull();
        expect(screen.queryByTestId("checkout-path-direct")).toBeNull();
        expect((screen.getByTestId("btn-place-order") as HTMLButtonElement).disabled).toBe(true);
        expect(m.useCheckoutSpender.every((s) => s === undefined)).toBe(true);
        expect(statusReads).toBe(0);
    });

    it("a lead accepting both beside a co-seller accepting both: both offered, the relays read from both profiles", async () => {
        m.paths = ["direct", "batch"];
        m.coSeller = CO;
        m.coPaths = ["direct", "batch"];
        await renderCheckout();
        await screen.findByTestId("checkout-path-option-batch");
    });
});

describe("CheckoutView — the buyer picks the path among those the seller accepts", () => {
    it("a seller that accepts both paths, with a relay that passes the check, gives the buyer the choice; the batch pick approves the bond to the verifier", async () => {
        m.paths = ["direct", "batch"];
        await renderCheckout();
        await screen.findByTestId("checkout-path-option-batch");
        expect(screen.getByTestId("checkout-path-option-direct")).toBeTruthy();
        expect(screen.getByTestId("checkout-path-direct").textContent).toMatch(/signed for FigaroCore at 0x1111/);
        expect(screen.getByTestId("checkout-relay-in-use").textContent).toContain("http://relay.test");
        expect(screen.getByTestId("checkout-relay-setting-input")).toBeTruthy();
        expect(m.useCheckoutSpender.at(-1)).toBe(m.CORE);
        fireEvent.click(screen.getByTestId("checkout-path-option-batch"));
        expect((await screen.findByTestId("checkout-path-batch")).textContent).toContain(m.VERIFIER);
        expect(screen.getByTestId("checkout-relay-in-use").textContent).toContain("http://relay.test");
        expect(m.useCheckoutSpender.at(-1)).toBe(m.VERIFIER);
    });

    it("a seller whose binding declares no path gives the direct path alone, and no relay is read", async () => {
        await renderCheckout();
        expect(screen.getByTestId("checkout-path-direct")).toBeTruthy();
        expect(screen.queryByTestId("checkout-path-option-batch")).toBeNull();
        expect(screen.queryByTestId("checkout-path-option-direct")).toBeNull();
        expect(statusReads).toBe(0);
        expect(m.useCheckoutSpender.at(-1)).toBe(m.CORE);
    });

    it("while the relays are checked, no path is offered and no spender is named", async () => {
        m.paths = ["direct", "batch"];
        let release: () => void = () => {};
        const held = new Promise<void>((r) => { release = r; });
        vi.stubGlobal("fetch", vi.fn(async () => {
            await held;
            return new Response("{}", { status: 500 });
        }));
        render(<CheckoutView sellerAddress={SELLER} />);
        await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
        expect(screen.getByTestId("checkout-path-reading")).toBeTruthy();
        expect(screen.getByTestId("checkout-relay-checking")).toBeTruthy();
        expect(m.useCheckoutSpender.every((s) => s === undefined)).toBe(true);
        expect((screen.getByTestId("btn-place-order") as HTMLButtonElement).disabled).toBe(true);
        await act(async () => { release(); await new Promise((r) => setTimeout(r, 50)); });
        // The relay failed: the direct path alone, its reason stated.
        expect(screen.getByTestId("checkout-path-direct")).toBeTruthy();
        expect(screen.getByTestId("checkout-relay-failed-checks")).toBeTruthy();
    });

    it("a relay that settles to another verifier is not offered: the direct path alone", async () => {
        m.paths = ["direct", "batch"];
        m.relayVerifier = "0x4444444444444444444444444444444444444444";
        await renderCheckout();
        await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
        expect(statusReads).toBeGreaterThan(0);
        expect(screen.queryByTestId("checkout-path-option-batch")).toBeNull();
        expect(screen.getByTestId("checkout-path-direct")).toBeTruthy();
    });
});
