/**
 * OrdersList — a failed order read renders no rows and no empty state: a
 * seller is never told "You haven't placed or received any orders yet" when the
 * chain was not read.
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
// One client object across renders, as wagmi returns: the readers key their effects on it.
const mocks = vi.hoisted(() => ({
    coreEvents: vi.fn(),
    client: { chain: { id: 31337 } },
    uncommittedKnown: true,
    /** Whether a wallet is connected. */
    connected: true,
    /** The address `?wallet=` names, when the page is read with no wallet. */
    walletParam: undefined as string | undefined,
}));

vi.mock("wagmi", () => ({
    useAccount: () => (mocks.connected ? { address: ADDRESS, isConnected: true } : { address: undefined, isConnected: false }),
    useChainId: () => 31337,
    usePublicClient: () => mocks.client,
    useWalletClient: () => ({ data: undefined }),
    // The token's decimals, which a row reads: unanswered here.
    useReadContract: () => ({ data: undefined, isLoading: false }),
    useWatchContractEvent: () => undefined,
    useDisconnect: () => ({ disconnect: () => undefined }),
}));
vi.mock("@/hooks/useConnectInjected", () => ({ useConnectInjected: () => () => undefined }));
vi.mock("@/lib/core/indexer", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/core/indexer")>()),
    getCoreEvents: (...a: unknown[]) => mocks.coreEvents(...a),
}));
vi.mock("@/lib/core/useWatchOrderEvents", () => ({ useWatchOrderEvents: () => undefined }));
vi.mock("@/hooks/useMounted", () => ({ useMounted: () => true }));
vi.mock("@/lib/shared/viewedWallet", () => ({ useViewedWallet: (a: string | undefined) => a ?? mocks.walletParam }));
vi.mock("@/lib/registries/useMemberListings", () => ({ useMemberListings: () => ({ read: { status: "absent" }, listings: [] }) }));
vi.mock("@/lib/checkout/orderPendingSellerSignature", () => ({
    usePendingSellerSignature: () => ({ pending: [], dismiss: () => undefined }),
    awaitsMyCounterSign: () => false,
    awaitsCounterpartySignature: () => false,
    awaitsMyBroadcast: () => false,
    useIsUncommitted: () => ({ isUncommitted: () => true, known: mocks.uncommittedKnown }),
}));
vi.mock("@/lib/checkout/orderCommitmentFlow", () => ({
    useOrderCommitmentFlow: () => ({ acceptOrder: vi.fn(), commitOrder: vi.fn(), error: null, reset: vi.fn(), step: "idle" }),
}));
vi.mock("@/lib/checkout/signedUnsentOrders", () => ({ useSignedUnsentOrders: () => [], forgetSignedUnsent: () => undefined }));
vi.mock("@/lib/shared/runtimeServicesContext", () => ({ useRuntimeServices: () => ({}) }));
vi.mock("@/lib/shared/e2e", () => ({ isE2EMockSession: () => false }));

import { OrdersList } from "@/app/(app)/orders/_components/OrdersList";
import { CONNECT_PROMPT } from "../lib/__fixtures__/noWallet";

describe("OrdersList — a failed order read renders nothing for the orders", () => {
    it("the order scan fails: no 'You haven't placed or received any orders yet'", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        mocks.coreEvents.mockRejectedValue(new Error("fetch failed: RPC unreachable"));
        render(<OrdersList />);
        await waitFor(() => expect(mocks.coreEvents).toHaveBeenCalled());
        await new Promise((r) => setTimeout(r, 30));
        expect(screen.queryByTestId("orders-empty")).toBeNull();
        expect(document.body.textContent).not.toMatch(/haven.t placed or received any orders/);
        expect(screen.queryByTestId("orders-active-empty")).toBeNull();
    });

    it("the pending predicate's own read failed: the orders answered, the pending state did not, so no empty state either", async () => {
        mocks.uncommittedKnown = false;
        try {
            mocks.coreEvents.mockResolvedValue({ events: { orderCommitted: [], orderResolved: [], processResolved: [] }, committedLogs: [] });
            render(<OrdersList />);
            await waitFor(() => expect(mocks.coreEvents).toHaveBeenCalled());
            await new Promise((r) => setTimeout(r, 30));
            expect(screen.queryByTestId("orders-empty")).toBeNull();
            expect(document.body.textContent).not.toMatch(/haven.t placed or received any orders/);
        } finally {
            mocks.uncommittedKnown = true;
        }
    });

    it("a wallet with no orders the chain returned does get the plain empty state", async () => {
        mocks.coreEvents.mockResolvedValue({ events: { orderCommitted: [], orderResolved: [], processResolved: [] }, committedLogs: [] });
        render(<OrdersList />);
        await screen.findByTestId("orders-empty");
    });
});

describe("/orders?wallet= — no wallet, read present", () => {
    it("no wallet, read present: the named wallet's orders show, and no prompt to connect stands in for them", async () => {
        const PROCESS = `0x${"5e".repeat(32)}` as const;
        mocks.connected = false;
        mocks.walletParam = ADDRESS;
        try {
            mocks.coreEvents.mockResolvedValue({
                events: {
                    orderCommitted: [{
                        orderHash: `0x${"0d".repeat(32)}`, processId: PROCESS, buyer: ADDRESS,
                        seller: "0x00000000000000000000000000000000000000a1", token: "0x00000000000000000000000000000000000000c1",
                        payment: 7n, runningTotal: 7n, checkoutHash: `0x${"cd".repeat(32)}`, salt: 1n, commitDeadline: 2_000_000_000n,
                        blockNumber: 4, transactionHash: null,
                    }],
                    orderResolved: [],
                    processResolved: [],
                },
                committedLogs: [],
            });
            const { container } = render(<OrdersList />);
            await screen.findByTestId(`order-row-${PROCESS}`);
            expect(screen.queryByTestId("wallet-gate")).toBeNull();
            expect(container.textContent).not.toMatch(CONNECT_PROMPT);
        } finally {
            mocks.connected = true;
            mocks.walletParam = undefined;
        }
    });
});

describe("/orders — no wallet and no ?wallet=", () => {
    it("one line says the list is one address's orders and none is named, with the connect control beside it; no gate, no read", async () => {
        mocks.connected = false;
        mocks.walletParam = undefined;
        mocks.coreEvents.mockClear();
        try {
            const { container } = render(<OrdersList />);
            const line = screen.getByTestId("orders-no-address");
            expect(line.textContent).toMatch(/These are the orders of one address, and this page names none: connect a wallet, or add \?wallet=0x… to the address\./);
            expect(line.querySelector('[data-testid="connect-wallet"]')).not.toBeNull();
            expect(screen.queryByTestId("wallet-gate")).toBeNull();
            expect(container.textContent).not.toMatch(/There is no account to create/);
            await new Promise((r) => setTimeout(r, 30));
            expect(mocks.coreEvents).not.toHaveBeenCalled();
            expect(screen.queryByTestId("orders-empty")).toBeNull();
        } finally {
            mocks.connected = true;
        }
    });
});
