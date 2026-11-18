/**
 * The order page (`/orders/view`) shows a resolved order the same way
 * whichever contract emitted the resolution: FigaroCore on the direct path,
 * FigaroBatchVerifier on the batch path. The verifier emits the Core's own
 * `OrderResolved` and `ProcessResolved` for every batched order
 * (src/core/verifier/FigaroBatchVerifier.sol), and the page reads both
 * emitters.
 *
 * The logs are the bytes a node returns, read through the real indexer
 * (`getCoreEvents`), the real order hooks (`useProcessOrders`,
 * `useWalletProcessIds`), the real process model
 * (`deriveProcessModelFromRuntime`) and the real page
 * (`OrderTimelineView`). Only the event cache's network call, the wallet,
 * the token's metadata and the action hooks are stood in for.
 *
 * Proves, for the buyer, on each path: once `OrderResolved` and
 * `ProcessResolved` are read, the page says "Order completed" with the
 * "Completed" status, shows the resolution panel with the payment sent and
 * the bond returned (the buyer's bond, twice the payment, less the payment),
 * ends the timeline with "order completed", and offers the "Your data"
 * link; with `OrderCommitted` alone it shows none of these.
 *
 * Proves, for the seller, on each path: once the order is resolved, the page
 * offers the payout split, and a split typed there is handed to the payout
 * hook in the order's token; while the order is only committed, no split is
 * offered. The hook's own writes, one approve and one `disperseToken` to the
 * payout contract, are held by `contractWriteSites.test.tsx`.
 *
 * Does not prove: that a relay lands the batch (the devnet spec
 * `batch-events.devnet.spec.ts` does), or a split's transfers on a chain.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { orderCommittedLog, orderResolvedLog, processResolvedLog, word, type FixtureLog } from "../lib/__fixtures__/coreLogs";

const { cachedGetLogsMock, routeTokenPayoutMock, account, CORE, VERIFIER, CLIENT, BUYER } = vi.hoisted(() => ({
    cachedGetLogsMock: vi.fn(),
    routeTokenPayoutMock: vi.fn(async () => `0x${"ab".repeat(32)}` as `0x${string}`),
    account: { address: "0x00000000000000000000000000000000000000b1" as `0x${string}` | undefined },
    CORE: "0x1111111111111111111111111111111111111111",
    VERIFIER: "0x2222222222222222222222222222222222222222",
    CLIENT: { chain: { id: 31337 } },
    BUYER: "0x00000000000000000000000000000000000000b1" as const,
}));

vi.mock("wagmi", () => ({
    useAccount: () => ({ address: account.address, isConnected: account.address !== undefined }),
    usePublicClient: () => CLIENT,
    useChainId: () => 31337,
    useWaitForTransactionReceipt: () => ({ isLoading: false, isSuccess: false }),
    useWatchContractEvent: () => undefined,
    useReadContract: () => ({ data: undefined, isLoading: false }),
}));
vi.mock("@/lib/core/eventCache", () => ({
    cachedGetLogs: (...args: unknown[]) => cachedGetLogsMock(...args),
    cachedGetReceiptLogs: vi.fn(),
}));
vi.mock("@/lib/core/contracts", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/core/contracts")>()),
    CONTRACTS: { core: CORE, batchVerifier: VERIFIER },
}));
vi.mock("@/lib/shared/publicClient", () => ({ publicClient: CLIENT }));
vi.mock("@/lib/shared/e2e", () => ({ isE2EMockSession: () => false }));

// The agreement body is party-private and not witnessed here; the attestation log is empty.
vi.mock("@/hooks/useProcessAgreements", () => ({ useProcessAgreements: () => new Map() }));
vi.mock("@/lib/composition/indexer", () => ({ getAttestationsByProcess: async () => [] }));
vi.mock("@/lib/protocol/useClauseSpecs", () => ({ useClauseSpecs: () => ({ version: 0, loaded: true }) }));
vi.mock("@/lib/member/useMemberListings", () => ({ useMemberListings: () => ({ read: { status: "present", value: [] } }) }));
vi.mock("@/hooks/useProcessResolveCapacity", () => ({ default: () => null }));

// The token's metadata, as its contract answers.
vi.mock("@/hooks/useTokenDecimals", () => ({ default: () => ({ decimals: 18, ready: true, loading: false }) }));
vi.mock("@/hooks/useTokenSymbol", () => ({ useTokenSymbol: () => ({ data: "TKN" }) }));

// The action hooks: nothing is sent in this test.
vi.mock("@/hooks/useTokenApproval", () => ({ default: () => ({ needsApproval: () => false, approve: vi.fn(), refetchAllowance: vi.fn() }) }));
vi.mock("@/lib/core/useFigaroActions", () => ({ useFigaroActions: () => ({ resolveProcess: vi.fn(), hash: undefined, isPending: false }) }));
vi.mock("@/lib/protocol/useUsageRecorder", () => ({ useUsageRecorder: () => ({}) }));
vi.mock("@/lib/composition/useAttestationCoordinatorActions", () => ({
    useAttestationCoordinatorActions: () => ({ isPending: false, isConfirming: false, isSuccess: false, submitAttestation: vi.fn() }),
}));
vi.mock("@/lib/member/useMembersRegistry", () => ({
    useRegisterMember: () => ({ register: vi.fn(), isPending: false, isConfirming: false, isSuccess: false }),
    useUpdateProfile: () => ({ updateProfile: vi.fn(), isPending: false, isConfirming: false, isSuccess: false }),
    useWithdrawDeposit: () => ({ withdraw: vi.fn(), isPending: false, isConfirming: false, isSuccess: false }),
    useWithdrawalCooldown: () => ({ data: 60n }),
}));
// The payout contract is configured; the hook's writes are held elsewhere.
vi.mock("@/lib/composition/usePayoutRoutingActions", () => ({
    usePayoutRoutingActions: () => ({ routeTokenPayout: routeTokenPayoutMock, isRouting: false, isAvailable: true }),
}));
vi.mock("@/lib/semantic/createCapabilityExecutors", () => ({ createCapabilityExecutors: () => ({ executorCallbacks: {} }) }));

import { OrderTimelineView } from "@/app/(app)/orders/_components/OrderTimelineView";
import { calculateBonds } from "@figaro-protocol/sdk";
import { tokenFigure } from "@/lib/shared/utils";
import { CONNECT_PROMPT } from "../lib/__fixtures__/noWallet";

const PROCESS = word(0xba7c);
const ORDER = word(0x0bd1);
const SELLER = "0x00000000000000000000000000000000000000a1" as const;
const PAYMENT = 7n * 10n ** 18n;
/** The token `orderCommittedLog` names in every commitment. */
const CURRENCY = "0x00000000000000000000000000000000000000c1";
const RECIPIENT = "0x0000000000000000000000000000000000005e11";

/** `emitter` emits `logs`, each under its own event name; the other order emitter emits nothing. */
function emits(emitter: string, logs: Record<string, FixtureLog[]>) {
    cachedGetLogsMock.mockImplementation(async (_c: unknown, _id: number, opts: { address: string; eventName: string }) =>
        opts.address.toLowerCase() === emitter.toLowerCase() ? (logs[opts.eventName] ?? []) : [],
    );
}

function logsAt(emitter: string) {
    return {
        committed: orderCommittedLog({ address: emitter, blockNumber: 4n, orderHash: ORDER, processId: PROCESS, buyer: BUYER, seller: SELLER, payment: PAYMENT }),
        resolved: orderResolvedLog({ address: emitter, blockNumber: 9n, orderHash: ORDER, processId: PROCESS, sellerPayout: 3n * PAYMENT, buyerPayout: PAYMENT }),
        closed: processResolvedLog({ address: emitter, blockNumber: 9n, processId: PROCESS, buyer: BUYER }),
    };
}

describe.each([
    ["the direct path", CORE],
    ["the batch path", VERIFIER],
])("/orders/view over %s", (_path, emitter) => {
    beforeEach(() => {
        cachedGetLogsMock.mockReset();
        routeTokenPayoutMock.mockClear();
        account.address = BUYER;
    });

    it("an order resolved there reads as completed, with what the resolution moved for the buyer", async () => {
        const { committed, resolved, closed } = logsAt(emitter);
        emits(emitter, { OrderCommitted: [committed], OrderResolved: [resolved], ProcessResolved: [closed] });
        render(<OrderTimelineView processId={PROCESS} />);

        const pill = await screen.findByTestId("order-status-pill", {}, { timeout: 5000 });
        await waitFor(() => expect(pill.textContent).toBe("Completed"));
        expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Order completed");
        expect(screen.getByTestId("resolution-proceeds").textContent).toMatch(/Payment sent/);
        // The buyer sent the payment, 7 tokens; its bond, twice the payment, came back less the payment.
        expect(screen.getByTestId("resolution-payment").textContent).toBe("7 TKN");
        expect(screen.getByTestId("resolution-bond-returned").textContent).toBe("7 TKN");
        expect(screen.getByTestId("order-timeline").textContent).toMatch(/order completed/);
        expect(screen.getByTestId("link-your-data")).toBeTruthy();
        // Both emitters were read: the page does not depend on which one answered.
        const read = new Set(cachedGetLogsMock.mock.calls.map((c) => (c[2] as { address: string }).address.toLowerCase()));
        expect(read).toEqual(new Set([CORE, VERIFIER]));
    });

    it("no wallet, read present: a visitor with no wallet reads the order, its status and its timeline, and no prompt to connect stands in for them", async () => {
        account.address = undefined;
        const { committed, resolved, closed } = logsAt(emitter);
        emits(emitter, { OrderCommitted: [committed], OrderResolved: [resolved], ProcessResolved: [closed] });
        const { container } = render(<OrderTimelineView processId={PROCESS} />);

        const pill = await screen.findByTestId("order-status-pill", {}, { timeout: 5000 });
        await waitFor(() => expect(pill.textContent).toBe("Completed"));
        expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Order completed");
        expect(screen.getByTestId("order-timeline").textContent).toMatch(/order completed/);
        expect(container.textContent).toMatch(/Read-only — your wallet is neither buyer nor seller on this order/);
        expect(container.textContent).not.toMatch(CONNECT_PROMPT);
    });

    it("an order only committed there reads as active, with no resolution shown", async () => {
        const { committed } = logsAt(emitter);
        emits(emitter, { OrderCommitted: [committed] });
        render(<OrderTimelineView processId={PROCESS} />);

        const pill = await screen.findByTestId("order-status-pill", {}, { timeout: 5000 });
        expect(pill.textContent).toBe("Active");
        expect(screen.queryByTestId("resolution-proceeds")).toBeNull();
        expect(screen.getByTestId("order-timeline").textContent).not.toMatch(/order completed/);
        expect(screen.queryByTestId("link-your-data")).toBeNull();
    });

    it("the seller of an order resolved there is offered the payout split, in the order's token", async () => {
        account.address = SELLER;
        const { committed, resolved, closed } = logsAt(emitter);
        emits(emitter, { OrderCommitted: [committed], OrderResolved: [resolved], ProcessResolved: [closed] });
        render(<OrderTimelineView processId={PROCESS} />);

        const pill = await screen.findByTestId("order-status-pill", {}, { timeout: 5000 });
        await waitFor(() => expect(pill.textContent).toBe("Completed"));
        await screen.findByTestId("payout-routing");
        fireEvent.change(screen.getByTestId("payout-routing-recipient-0"), { target: { value: RECIPIENT } });
        fireEvent.change(screen.getByTestId("payout-routing-amount-0"), { target: { value: "1.5" } });
        fireEvent.click(screen.getByTestId("payout-routing-execute"));
        await waitFor(() => expect(routeTokenPayoutMock).toHaveBeenCalledTimes(1));
        const [token, legs] = routeTokenPayoutMock.mock.calls[0] as unknown as [string, unknown];
        expect(token.toLowerCase()).toBe(CURRENCY);
        expect(legs).toEqual([{ recipient: RECIPIENT, amount: 15n * 10n ** 17n }]);
    });

    it("the seller of an order only committed there is offered no split", async () => {
        account.address = SELLER;
        const { committed } = logsAt(emitter);
        emits(emitter, { OrderCommitted: [committed] });
        render(<OrderTimelineView processId={PROCESS} />);

        const pill = await screen.findByTestId("order-status-pill", {}, { timeout: 5000 });
        expect(pill.textContent).toBe("Active");
        expect(screen.queryByTestId("payout-routing")).toBeNull();
    });

    it("the seller of a resolved sub-order is shown the SDK's bond, twice the running total, returned", async () => {
        account.address = SELLER;
        // A root order of 3 tokens to another seller, then this seller's sub-order of 7: its running total is 10.
        const rootPayment = 3n * 10n ** 18n;
        const running = rootPayment + PAYMENT;
        const ROOT_ORDER = word(0x0bd0);
        emits(emitter, {
            OrderCommitted: [
                orderCommittedLog({ address: emitter, blockNumber: 3n, orderHash: ROOT_ORDER, processId: PROCESS, buyer: BUYER, seller: "0x00000000000000000000000000000000000000a0", payment: rootPayment }),
                orderCommittedLog({ address: emitter, blockNumber: 4n, orderHash: ORDER, processId: PROCESS, buyer: BUYER, seller: SELLER, payment: PAYMENT, runningTotal: running }),
            ],
            OrderResolved: [
                orderResolvedLog({ address: emitter, blockNumber: 9n, orderHash: ROOT_ORDER, processId: PROCESS, sellerPayout: 3n * rootPayment, buyerPayout: rootPayment }),
                orderResolvedLog({ address: emitter, blockNumber: 9n, orderHash: ORDER, processId: PROCESS, sellerPayout: PAYMENT + 2n * running, buyerPayout: PAYMENT }),
            ],
            ProcessResolved: [processResolvedLog({ address: emitter, blockNumber: 9n, processId: PROCESS, buyer: BUYER, orderCount: 2n })],
        });
        render(<OrderTimelineView processId={PROCESS} />);

        const pill = await screen.findByTestId("order-status-pill", {}, { timeout: 5000 });
        await waitFor(() => expect(pill.textContent).toBe("Completed"));
        const bonds = calculateBonds(running, PAYMENT);
        expect(bonds.sellerBond).not.toBe(bonds.buyerBond);
        expect(screen.getByTestId("resolution-payment").textContent).toBe(`${tokenFigure(PAYMENT, 18)} TKN`);
        expect(screen.getByTestId("resolution-bond-returned").textContent).toBe(`${tokenFigure(bonds.sellerBond, 18)} TKN`);
    });
});
