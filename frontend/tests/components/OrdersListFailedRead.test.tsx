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
const mocks = vi.hoisted(() => ({ committed: vi.fn(), resolved: vi.fn(), client: { chain: { id: 31337 } } }));

vi.mock("wagmi", () => ({
    useAccount: () => ({ address: ADDRESS, isConnected: true }),
    useChainId: () => 31337,
    usePublicClient: () => mocks.client,
    useWalletClient: () => ({ data: undefined }),
    useWatchContractEvent: () => undefined,
}));
vi.mock("@/lib/kernel/indexer", () => ({
    getAllOrderCommitted: (...a: unknown[]) => mocks.committed(...a),
    getAllOrderResolved: (...a: unknown[]) => mocks.resolved(...a),
}));
vi.mock("@/hooks/useMounted", () => ({ useMounted: () => true }));
vi.mock("@/lib/shared/viewedWallet", () => ({ useViewedWallet: (a: string) => a }));
vi.mock("@/lib/member/useMemberListings", () => ({ useMemberListings: () => ({ read: { status: "absent" }, listings: [] }) }));
vi.mock("@/lib/checkout/orderPendingSellerSignature", () => ({
    usePendingSellerSignature: () => ({ pending: [], dismiss: () => undefined }),
    awaitsMyCounterSign: () => false,
    awaitsCounterpartySignature: () => false,
    awaitsMyBroadcast: () => false,
}));
vi.mock("@/lib/checkout/orderCommitmentFlow", () => ({
    useOrderCommitmentFlow: () => ({ acceptOrder: vi.fn(), commitOrder: vi.fn(), error: null, reset: vi.fn(), step: "idle" }),
}));
vi.mock("@/lib/checkout/signedUnsentOrders", () => ({ useSignedUnsentOrders: () => [], forgetSignedUnsent: () => undefined }));
vi.mock("@/lib/shared/runtimeServicesContext", () => ({ useRuntimeServices: () => ({}) }));
vi.mock("@/lib/shared/e2e", () => ({ isE2EMockSession: () => false }));

import { OrdersList } from "@/app/(app)/orders/_components/OrdersList";

describe("OrdersList — a failed order read renders nothing for the orders", () => {
    it("the order scan fails: no 'You haven't placed or received any orders yet'", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        mocks.committed.mockRejectedValue(new Error("fetch failed: RPC unreachable"));
        mocks.resolved.mockRejectedValue(new Error("fetch failed: RPC unreachable"));
        render(<OrdersList />);
        await waitFor(() => expect(mocks.committed).toHaveBeenCalled());
        await new Promise((r) => setTimeout(r, 30));
        expect(screen.queryByTestId("orders-empty")).toBeNull();
        expect(document.body.textContent).not.toMatch(/haven.t placed or received any orders/);
        expect(screen.queryByTestId("orders-active-empty")).toBeNull();
    });

    it("a wallet with no orders the chain returned does get the plain empty state", async () => {
        mocks.committed.mockResolvedValue([]);
        mocks.resolved.mockResolvedValue([]);
        render(<OrdersList />);
        await screen.findByTestId("orders-empty");
    });
});
