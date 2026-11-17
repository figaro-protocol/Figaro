/**
 * CheckoutView — the blinding store across a race reset and a failed attempt.
 *
 * "Race again" clears the race; the next race sends new drafts with new
 * salts. Those drafts must share no private leaf with the structs the last
 * race's candidates hold, so the reset empties the store: the root's
 * blinding value is drawn anew. A failed checkout attempt after a race keeps
 * the whole store instead, since the winner countersigned those structs: the
 * retry carries the same root value.
 */
import React from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";
import { pinSpec } from "../lib/primeClauseSpecs";

const SELLER = "0x00000000000000000000000000000000000000aa";
const PRIVATE_KEY = vi.hoisted(() => ({ key: "" }));

/** The race as the page sees it, and every walk's inputs the page built. */
const RACE = vi.hoisted(() => ({
    result: null as Record<string, unknown> | null,
    starts: [] as Array<{ clauseFills?: Record<string, Record<string, Record<string, unknown>>> }>,
    walks: [] as Array<{ clauseFills?: Record<string, Record<string, Record<string, unknown>>> }>,
}));

vi.mock("wagmi", () => ({ useChainId: () => 31337, usePublicClient: () => ({ chain: { id: 31337 } }) }));
const CATALOG_LIST = vi.hoisted(() => [
    {
        address: "0x00000000000000000000000000000000000000aa",
        name: "Kitchen",
        defaultTokenAddress: "0x00000000000000000000000000000000000000d2",
        acceptedTokens: [{ address: "0x00000000000000000000000000000000000000d2", symbol: "DNM" }],
        items: [],
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
    readUtilityTokenPin: () => "0x00000000000000000000000000000000000000d2",
    agreementClauses: () => ({ [PRIVATE_KEY.key]: {} }),
    assemblyHashOf: () => `0x${"ab".repeat(32)}`,
    // The sub-order is unbound: the buyer fills it by a pick or a race.
    planSubOrderSellers: () => [{ node: { nodeId: "agreement-1", clauses: {} }, seller: undefined, itemId: undefined }],
}));
vi.mock("@/lib/checkout", () => ({
    useCommerce: () => ({ address: "0x00000000000000000000000000000000000000b1" }),
    useCheckout: () => ({
        decimals: 18, decimalsReady: true, balance: 10n ** 30n, needsAuthorization: () => false, authorize: vi.fn(),
        authorization: { isPending: false, isConfirming: false, isSuccess: false, isError: false },
        signRoot: vi.fn(), signAndShare: vi.fn(),
        order: { step: "idle", error: null, payload: null },
    }),
}));
const CART = { items: [{ sellerId: SELLER, catalogItemId: "meal", name: "Meal", price: "5", quantity: 1 }] };
vi.mock("@/lib/checkout/assemblyCheckout", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/checkout/assemblyCheckout")>()),
    checkoutMeasureRefusals: () => [],
    // Every attempt fails after reading its inputs.
    executeAssemblyCheckout: async (params: { clauseFills?: Record<string, Record<string, Record<string, unknown>>> }) => {
        RACE.walks.push(params);
        throw new Error("the relay refused");
    },
}));
vi.mock("@/lib/checkout/cartStore", () => ({ useCartStore: () => CART }));
vi.mock("@/lib/checkout/dispatchRace", () => ({
    useDispatchRace: () => ({
        result: RACE.result,
        start: async (args: { checkout: { clauseFills?: Record<string, Record<string, Record<string, unknown>>> } }) => { RACE.starts.push(args.checkout); },
        reset: () => { RACE.result = null; },
    }),
    postToAgentEndpoint: vi.fn(),
}));
vi.mock("@/lib/composition/useCompositionActions", () => ({ useCompositionActions: () => ({ compose: vi.fn() }) }));
vi.mock("@/hooks/useTokenApproval", () => ({ default: () => ({ needsApproval: () => false, allowanceKnown: true }) }));
vi.mock("@/hooks/useApproveThenAct", () => ({ useApproveThenAct: () => ({ runWithApproval: (_amount: unknown, act: () => void) => act() }) }));
vi.mock("@/hooks/useTokenSymbol", () => ({ useTokenSymbol: () => ({ data: undefined }) }));
vi.mock("@/hooks/useTokenDecimals", () => ({ default: () => ({ decimals: 18 }) }));
vi.mock("@/hooks/useTokenBalance", () => ({ default: () => ({ read: { status: "present", value: 10n ** 30n }, refetch: () => {} }) }));
vi.mock("@/hooks/useConnectInjected", () => ({ useConnectInjected: () => vi.fn() }));
vi.mock("@/lib/protocol/useClauseSpecs", () => ({ useClauseSpecs: () => ({ loaded: true, version: 0 }) }));
// The panel's two acts, as buttons: start a race, and reset it.
vi.mock("@/components/runtime/DispatchRacePanel", () => ({
    DispatchRacePanel: ({ race, onStart }: { race: { reset: () => void }; onStart: (p: { windowMs: number }) => void }) => (
        <div>
            <button type="button" data-testid="race-start" onClick={() => onStart({ windowMs: 1000 })}>start</button>
            <button type="button" data-testid="race-reset" onClick={race.reset}>Race again</button>
        </div>
    ),
}));
vi.mock("@/components/runtime/SellerCatalogPicker", () => ({ SellerCatalogPicker: () => null }));
vi.mock("@/components/runtime/CommitmentSharePanel", () => ({ CommitmentSharePanel: () => null }));
vi.mock("@/app/(app)/s/checkout/_components/SwapFundingPanel", () => ({ SwapFundingPanel: () => null }));

import { CheckoutView } from "@/app/(app)/s/checkout/_components/CheckoutView";

const PRIVATE = pinSpec({
    clauseId: "test-race-reset-private",
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
    await loadClauseSpec(PRIVATE.clauseKey, "mem://race-reset-private");
});

/** The root order's blinding value in one walk's inputs. */
const rootBlinding = (params: { clauseFills?: Record<string, Record<string, Record<string, unknown>>> }) =>
    params.clauseFills?.["agreement-0"]?.[PRIVATE.clauseKey]?.blinding;

/** A race outcome for the raced sub-order, as the race hands it back. */
const OUTCOME = {
    nodeId: "agreement-1",
    blinding: {},
    selection: { seller: "0x00000000000000000000000000000000000000cc", price: "2", item: { id: "ride", name: "Ride" } },
    salt: () => 1n,
    deadline: 9_999_999_999n,
    race: {},
};

describe("CheckoutView — the blinding store across a race reset", () => {
    it("after Race again the root's blinding value is drawn anew", async () => {
        RACE.result = null;
        RACE.starts = [];
        const view = render(<CheckoutView sellerAddress={SELLER} />);
        fireEvent.click(await screen.findByTestId("race-start"));
        await waitFor(() => expect(RACE.starts).toHaveLength(1));
        const first = rootBlinding(RACE.starts[0]);
        expect(first).toMatch(/^0x[0-9a-f]{64}$/);
        // The race won, then the buyer races again.
        RACE.result = OUTCOME;
        view.rerender(<CheckoutView sellerAddress={SELLER} />);
        fireEvent.click(screen.getByTestId("race-reset"));
        view.rerender(<CheckoutView sellerAddress={SELLER} />);
        fireEvent.click(screen.getByTestId("race-start"));
        await waitFor(() => expect(RACE.starts).toHaveLength(2));
        const second = rootBlinding(RACE.starts[1]);
        expect(second).toMatch(/^0x[0-9a-f]{64}$/);
        expect(second).not.toBe(first);
        view.unmount();
    });

    it("after a failed attempt with a race outcome the root's blinding value is the same", async () => {
        RACE.result = OUTCOME;
        RACE.walks = [];
        const view = render(<CheckoutView sellerAddress={SELLER} />);
        const place = await screen.findByTestId("btn-place-order");
        // The buyer fills the private term of each order.
        for (const node of ["agreement-0", "agreement-1"]) fireEvent.click(screen.getByTestId(`checkout-field-${node}-${PRIVATE.clauseKey}-grade-a`));
        fireEvent.click(place);
        await waitFor(() => expect(RACE.walks).toHaveLength(1));
        view.rerender(<CheckoutView sellerAddress={SELLER} />);
        fireEvent.click(screen.getByTestId("btn-place-order"));
        await waitFor(() => expect(RACE.walks).toHaveLength(2));
        expect(rootBlinding(RACE.walks[0])).toMatch(/^0x[0-9a-f]{64}$/);
        expect(rootBlinding(RACE.walks[1])).toBe(rootBlinding(RACE.walks[0]));
        view.unmount();
    });
});
