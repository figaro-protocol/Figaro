/**
 * CheckoutView — a clause that declares a composition with composition
 * fields. The fields are presentation (`block.checkout`): nothing commits
 * them and no step of this frontend performs the interface they feed. So the
 * page asks for none of them, holds the order on none of them, and says in
 * one line that this frontend does not perform the interface. The clause is a
 * stranger's, built here: an id, an interface and field names the repository
 * has never seen. It holds alike in the root order, a bound sub-order and an
 * unbound sub-order. A clause that declares a composition with no
 * composition field gets no line, in each of the three.
 */
import React from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import type { Hex } from "@figaro-protocol/sdk";
import { loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";
import { pinSpec } from "../lib/primeClauseSpecs";

const SELLER = "0x00000000000000000000000000000000000000aa";
const CO_SELLER = "0x00000000000000000000000000000000000000cc";
const BUYER = "0x00000000000000000000000000000000000000bb";
const DENOM = "0x00000000000000000000000000000000000000d2";

const m = vi.hoisted(() => ({
    // nodeId → the clause map the node's agreement composes.
    clausesByNode: {} as Record<string, Record<string, unknown>>,
    agreements: [] as { id: string }[],
}));

vi.mock("wagmi", () => ({ useAccount: () => ({ address: undefined }), useChainId: () => 31337, usePublicClient: () => ({ chain: { id: 31337 } }) }));
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
            slug: "stranger",
            name: "Stranger",
            hydratedAssembly: { assembly: { agreements: m.agreements, assemblyClauses: {} } },
            coSellerBindings: [],
        }],
    }),
    withBoundCoSellers: (a: unknown) => a,
}));
vi.mock("@figaro-protocol/sdk", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@figaro-protocol/sdk")>()),
    readUtilityTokenPin: () => DENOM,
    // The design here carries no agreement hashes; the picker it feeds is a stub.
    processDesignHashOf: () => `0x${"00".repeat(32)}`,
    agreementClauses: (_h: unknown, order: { id: string }) => m.clausesByNode[order.id] ?? {},
    // agreement-1 is bound to the courier's ride; agreement-2 is left to the buyer.
    planSubOrderSellers: () => m.agreements.length <= 1 ? [] : [
        { node: { nodeId: "agreement-1", clauses: {} }, seller: CO_SELLER, itemId: "ride" },
        { node: { nodeId: "agreement-2", clauses: {} }, seller: null, itemId: null },
    ],
}));
vi.mock("@/lib/checkout", () => ({
    useCommerce: () => ({ address: BUYER }),
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
vi.mock("@/hooks/useTokenDecimals", () => ({ default: () => ({ decimals: 18 }) }));
vi.mock("@/hooks/useTokenBalance", () => ({ default: () => ({ read: { status: "present", value: 10n ** 30n }, refetch: () => {} }) }));
vi.mock("@/hooks/useConnectInjected", () => ({ useConnectInjected: () => vi.fn() }));
vi.mock("@/lib/registries/useClauseSpecs", () => ({ useClauseSpecs: () => ({ loaded: true, version: 0 }) }));
vi.mock("@/components/runtime/DispatchRacePanel", () => ({ DispatchRacePanel: () => null }));
vi.mock("@/components/runtime/SellerCatalogPicker", () => ({ SellerCatalogPicker: () => null }));
vi.mock("@/components/runtime/CommitmentSharePanel", () => ({ CommitmentSharePanel: () => null }));
vi.mock("@/app/(app)/s/checkout/_components/SwapFundingPanel", () => ({ SwapFundingPanel: () => null }));

import { CheckoutView } from "@/app/(app)/s/checkout/_components/CheckoutView";

// A stranger's clause: it declares a composition under an interface no one
// in the repository has named, and two composition fields, one required.
const STRANGER = pinSpec({
    clauseId: "zq-escrow-bridge-7",
    version: 1,
    title: "Bridge escrow",
    description: "A clause from outside the repository that composes a contract it names by interface.",
    fields: [],
    block: {
        design: { article: "zq-article", scope: "agreement", nestsUnder: null, fills: [], composes: { interface: "zq-bridge-escrow" } },
        checkout: {
            catalogueFills: [], profileFills: [],
            compositionFields: [
                { name: "zqBridgeTarget", type: "string", required: true, label: "Bridge target" },
                { name: "zqMemo", type: "string", required: false },
            ],
        },
        runtime: { interaction: null },
    },
});

// A stranger's clause that declares a composition and no composition field:
// a forum linked after the commit, performed elsewhere.
const NO_FIELDS = pinSpec({
    clauseId: "zq-forum-link-3",
    version: 1,
    title: "Forum link",
    description: "A clause from outside the repository that names a forum and asks for nothing at checkout.",
    fields: [],
    block: {
        design: { article: "zq-article", scope: "agreement", nestsUnder: null, fills: [], composes: { interface: "zq-forum", forumUrl: "https://forum.zq.example" } },
        checkout: { catalogueFills: [], profileFills: [], compositionFields: [] },
        runtime: { interaction: null },
    },
});

const LINE = 'Bridge escrow declares the zq-bridge-escrow interface, which this frontend does not perform; the order is placed without it.';

beforeAll(async () => {
    setClauseSpecFetcher(async (uri) => (uri === "mem://no-fields" ? NO_FIELDS.bytes : STRANGER.bytes));
    await loadClauseSpec(STRANGER.clauseKey as Hex, "mem://stranger");
    await loadClauseSpec(NO_FIELDS.clauseKey as Hex, "mem://no-fields");
});

async function renderWith(node: "agreement-0" | "agreement-1" | "agreement-2", clauseKey: string = STRANGER.clauseKey) {
    m.agreements = node === "agreement-0"
        ? [{ id: "agreement-0" }]
        : [{ id: "agreement-0" }, { id: "agreement-1" }, { id: "agreement-2" }];
    m.clausesByNode = { [node]: { [clauseKey]: {} } };
    const view = render(<CheckoutView sellerAddress={SELLER} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    return view;
}

describe("CheckoutView — a clause that declares a composition with composition fields", () => {
    it.each([
        ["the root order", "agreement-0"],
        ["a bound sub-order", "agreement-1"],
        ["an unbound sub-order", "agreement-2"],
    ] as const)("in %s: the line renders and no composition field is asked for", async (_where, node) => {
        const { container } = await renderWith(node);
        const lines = screen.getAllByTestId("checkout-composition-not-performed");
        expect(lines).toHaveLength(1);
        expect(lines[0]!.textContent).toBe(LINE);
        expect(container.querySelector('[data-testid^="composition-"]')).toBeNull();
        expect(container.textContent).not.toMatch(/Bridge target/);
    });

    it.each([
        ["the root order", "agreement-0"],
        ["a bound sub-order", "agreement-1"],
        ["an unbound sub-order", "agreement-2"],
    ] as const)("in %s: a composition with no fields shows no line", async (_where, node) => {
        const { container } = await renderWith(node, NO_FIELDS.clauseKey);
        expect(screen.queryByTestId("checkout-composition-not-performed")).toBeNull();
        expect(container.textContent).not.toMatch(/Forum link declares/);
        expect(screen.getByTestId("btn-place-order")).toBeInTheDocument();
    });

    it("in the root order: the order can be placed with the required composition field never filled", async () => {
        await renderWith("agreement-0");
        const button = screen.getByTestId("btn-place-order");
        expect(button.textContent).toBe("Place order");
        expect(button).not.toBeDisabled();
    });
});
