/**
 * The header badge and the `/orders` "Your turn" section count the same
 * orders. A relayed payload still reads single-signed after its order is
 * submitted on-chain; the one source both surfaces read drops it, so neither
 * counts an order the wallet has already acted on.
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { computeOrderHash } from "@figaro-protocol/sdk";
import { serializeCommitmentPayload, type CommitmentPayload } from "@figaro-protocol/sdk/agent";
import { orderCommittedLog, selectorOf, word, type FixtureLog } from "../lib/__fixtures__/coreLogs";

const { CORE, VERIFIER, ME, BUYER, chain, callbacks } = vi.hoisted(() => ({
    CORE: "0x00000000000000000000000000000000000000c0" as const,
    VERIFIER: "0x00000000000000000000000000000000000000c9" as const,
    ME: "0x00000000000000000000000000000000000000a1" as const,
    BUYER: "0x00000000000000000000000000000000000000b1" as const,
    chain: { logs: [] as FixtureLog[] },
    callbacks: [] as Array<(payload: string, orderId: string) => Promise<void> | void>,
}));

vi.mock("wagmi", () => ({
    useAccount: () => ({ address: ME, isConnected: true }),
    useChainId: () => 31337,
    useWalletClient: () => ({ data: undefined }),
    usePublicClient: () => CLIENT,
    useWatchContractEvent: () => undefined,
}));
const CLIENT = { chain: { id: 31337 } };
const SERVICES = {
    evidenceTransport: { resolveFetchUrl: (uri: string) => uri },
    handoffMessaging: {
        subscribeAnyCommitmentPayload: ({ callback }: { callback: (p: string, id: string) => Promise<void> | void }) => {
            callbacks.push(callback);
            return Promise.resolve(() => undefined);
        },
    },
};
vi.mock("@/lib/core/contracts", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/core/contracts")>()),
    CONTRACTS: { core: CORE, batchVerifier: VERIFIER },
}));
vi.mock("@/lib/core/eventCache", () => ({
    cachedGetLogs: async (_client: unknown, _chainId: number, opts: { address: string; event: unknown }) =>
        chain.logs.filter((l) => l.address.toLowerCase() === opts.address.toLowerCase() && l.topics[0] === selectorOf(opts.event)),
    cachedGetReceiptLogs: async () => [],
}));
vi.mock("@figaro-protocol/sdk", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@figaro-protocol/sdk")>()),
    verifyCommitmentSignature: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/core/agreementFetch", () => ({ publishAgreement: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/shared/e2e", () => ({ isE2EMockSession: () => false }));
vi.mock("@/hooks/useMounted", () => ({ useMounted: () => true }));
vi.mock("@/lib/member/useMemberListings", () => ({ useMemberListings: () => ({ read: { status: "present", value: [] } }) }));
vi.mock("@/lib/checkout/orderCommitmentFlow", () => ({
    useOrderCommitmentFlow: () => ({ acceptOrder: vi.fn(), commitOrder: vi.fn(), error: null, reset: vi.fn(), step: "idle" }),
}));
vi.mock("@/lib/checkout/signedUnsentOrders", () => ({
    useSignedUnsentOrders: () => [],
    forgetSignedUnsent: vi.fn(),
}));
vi.mock("@/hooks/useTokenDecimals", () => ({ default: () => ({ decimals: 6, ready: true, loading: false }) }));
vi.mock("@/hooks/useTokenApproval", () => ({
    default: () => ({ needsApproval: () => false, approve: vi.fn(), isApprovePending: false, isApproveConfirming: false, isApproveSuccess: false, isApproveError: false }),
}));
vi.mock("@/lib/shared/runtimeServicesContext", () => ({
    useRuntimeServices: () => SERVICES,
}));

import { YourTurnBadge } from "@/components/shared/YourTurnBadge";
import { OrdersList } from "@/app/(app)/orders/_components/OrdersList";

function payload(salt: bigint): CommitmentPayload {
    return {
        commitment: {
            processId: `0x${"00".repeat(32)}`,
            buyer: BUYER,
            seller: ME,
            currency: "0x00000000000000000000000000000000000000d1",
            payment: 10n,
            expectedCumulativeValue: 10n,
            checkoutHash: word(0xc4ec),
            salt,
            deadline: 2_000_000_000n,
        },
        agreement: { clauses: [] },
        buyerSig: "0xdeadbeef",
    } as unknown as CommitmentPayload;
}

describe("the badge and the orders list agree", () => {
    it("on an order already submitted on-chain, and on one still awaiting this wallet", async () => {
        const submitted = payload(1n);
        const awaiting = payload(2n);
        // The first order is already on-chain: the buyer relayed it, the
        // wallet countersigned and submitted it.
        chain.logs.push(orderCommittedLog({
            address: CORE,
            blockNumber: 3n,
            orderHash: computeOrderHash(submitted.commitment, 31337, CORE),
            processId: word(0x70),
            buyer: BUYER,
            seller: ME,
        }));

        render(<><YourTurnBadge /><OrdersList /></>);
        // One shared subscription serves the badge and both of the list's
        // pending views; the channel is opened once for the wallet.
        await waitFor(() => expect(callbacks.length).toBe(1));
        await act(async () => {
            for (const cb of callbacks) {
                await cb(serializeCommitmentPayload(submitted), "order-submitted");
                await cb(serializeCommitmentPayload(awaiting), "order-awaiting");
            }
        });

        // The list shows the one order still awaiting this wallet, and the
        // badge counts exactly what the list shows.
        await waitFor(() => {
            expect(screen.queryAllByTestId("order-your-turn-card")).toHaveLength(1);
            expect(screen.getByTestId("your-turn-count").textContent).toBe("1");
        });
    });
});
