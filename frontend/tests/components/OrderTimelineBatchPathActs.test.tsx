/**
 * The order page (`/orders/view`) offers no act on an order or a process the
 * batch verifier emitted. FigaroCore and the attestation coordinator do not
 * know a batched process (docs/SCALING_STRATEGY.md § "The two paths share no
 * state"), so a resolve or an attestation sent to them can only revert, and
 * this frontend sends nothing to a relay (docs/FRONTEND.md). In place of the
 * actions, a party to the open process reads one line that names what does
 * act on it.
 *
 * The logs are the bytes a node returns, read through the real indexer
 * (`getCoreEvents`), the real order hooks, the real process model
 * (`deriveProcessModelFromRuntime`) and the real page (`OrderTimelineView`).
 * The path is derived from the emitter of the order events, never stored.
 * Only the event cache's network call, the wallet, the token's metadata, the
 * agreement read and the action hooks are stood in for.
 *
 * Proves, on the batch path: the buyer of an open process sees no resolve and
 * no attestation card and sees the line; the seller sees no attestation card
 * and sees the line; the seller of a resolved order is still offered the
 * payout split, and no line. On the direct path, and on a deployment with no
 * batch verifier: the buyer sees its resolve and attestation cards, the
 * seller its attestation card, and neither sees the line. While the order
 * read is in flight, the page offers no act and no line.
 *
 * Does not prove: the interaction surfaces' send gate on the batch path
 * (`AddressDetailPanel`, `ContentDeliveryPanel`), which needs a clause that
 * declares an interaction; the browser step in `batch-events.devnet.spec.ts`
 * reads the line on a relay-landed order.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { Agreement } from "@figaro-protocol/sdk";
import { orderCommittedLog, orderResolvedLog, processResolvedLog, word, type FixtureLog } from "../lib/__fixtures__/coreLogs";

const { cachedGetLogsMock, account, contracts, agreements, CORE, VERIFIER, CLIENT, BUYER } = vi.hoisted(() => ({
    cachedGetLogsMock: vi.fn(),
    account: { address: "0x00000000000000000000000000000000000000b1" as `0x${string}` | undefined },
    contracts: { core: "0x1111111111111111111111111111111111111111", batchVerifier: "0x2222222222222222222222222222222222222222" },
    agreements: new Map<string, unknown>(),
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
    CONTRACTS: contracts,
}));
vi.mock("@/lib/shared/publicClient", () => ({ publicClient: CLIENT }));
vi.mock("@/lib/shared/e2e", () => ({ isE2EMockSession: () => false }));

// The order's agreement, as its party holds it: one committed clause no spec
// source has loaded, so the model offers each party a re-assert card for it.
vi.mock("@/hooks/useProcessAgreements", () => ({ useProcessAgreements: () => agreements }));
vi.mock("@/lib/core/attestationIndexer", () => ({ getAttestationsByProcess: async () => [] }));
vi.mock("@/lib/registries/useClauseSpecs", () => ({ useClauseSpecs: () => ({ version: 0, loaded: true }) }));
vi.mock("@/lib/registries/useMemberListings", () => ({ useMemberListings: () => ({ read: { status: "present", value: [] } }) }));
vi.mock("@/hooks/useProcessResolveCapacity", () => ({ default: () => null }));
vi.mock("@/hooks/useTokenDecimals", () => ({ default: () => ({ decimals: 18, ready: true, loading: false }) }));
vi.mock("@/hooks/useTokenSymbol", () => ({ useTokenSymbol: () => ({ data: "TKN" }) }));

// The action hooks: nothing is sent in this test.
vi.mock("@/hooks/useTokenApproval", () => ({ default: () => ({ needsApproval: () => false, approve: vi.fn(), refetchAllowance: vi.fn() }) }));
vi.mock("@/lib/core/useFigaroActions", () => ({ useFigaroActions: () => ({ resolveProcess: vi.fn(), hash: undefined, isPending: false }) }));
vi.mock("@/lib/rewards/useUsageRecorder", () => ({ useUsageRecorder: () => ({}) }));
vi.mock("@/lib/core/useAttestationCoordinatorActions", () => ({
    useAttestationCoordinatorActions: () => ({ isPending: false, isConfirming: false, isSuccess: false, submitAttestation: vi.fn() }),
}));
vi.mock("@/lib/registries/useMembersRegistry", () => ({
    useRegisterMember: () => ({ register: vi.fn(), isPending: false, isConfirming: false, isSuccess: false }),
    useUpdateProfile: () => ({ updateProfile: vi.fn(), isPending: false, isConfirming: false, isSuccess: false }),
    useWithdrawDeposit: () => ({ withdraw: vi.fn(), isPending: false, isConfirming: false, isSuccess: false }),
    useWithdrawalCooldown: () => ({ data: 60n }),
}));
vi.mock("@/lib/composability/usePayoutRoutingActions", () => ({
    usePayoutRoutingActions: () => ({ routeTokenPayout: vi.fn(), isRouting: false, isAvailable: true }),
}));
vi.mock("@/lib/semantic/createCapabilityExecutors", () => ({ createCapabilityExecutors: () => ({ executorCallbacks: {} }) }));

import { OrderTimelineView } from "@/app/(app)/orders/_components/OrderTimelineView";

const PROCESS = word(0xba7c);
const ORDER = word(0x0bd1);
const SELLER = "0x00000000000000000000000000000000000000a1" as const;
const CHECKOUT = word(0xc4ec);
const AGREEMENT: Agreement = {
    version: "a1",
    buyer: BUYER,
    seller: SELLER,
    clauses: [{ clause: `0x${"01".repeat(32)}`, data: { note: "committed" } }],
};
const LINE = /This order is on the batch path; this page reads it and sends no operation to a relay\. To act on it, use the SDK's relay client, SequencerClient, or a relay of your own started with proveAndSettle\./;

/** `emitter` emits `logs`, each under its own event name; the other order emitter emits nothing. */
function emits(emitter: string, logs: Record<string, FixtureLog[]>) {
    cachedGetLogsMock.mockImplementation(async (_c: unknown, _id: number, opts: { address: string; eventName: string }) =>
        opts.address.toLowerCase() === emitter.toLowerCase() ? (logs[opts.eventName] ?? []) : [],
    );
}

function committedAt(emitter: string) {
    return orderCommittedLog({ address: emitter, blockNumber: 4n, orderHash: ORDER, processId: PROCESS, buyer: BUYER, seller: SELLER, checkoutHash: CHECKOUT });
}

/** Renders the page for `wallet` over an open order `emitter` emitted, and waits for the read. */
async function openOrderAs(wallet: `0x${string}`, emitter: string) {
    account.address = wallet;
    emits(emitter, { OrderCommitted: [committedAt(emitter)] });
    render(<OrderTimelineView processId={PROCESS} />);
    const pill = await screen.findByTestId("order-status-pill", {}, { timeout: 5000 });
    expect(pill.textContent).toBe("Active");
}

beforeEach(() => {
    cachedGetLogsMock.mockReset();
    contracts.core = CORE;
    contracts.batchVerifier = VERIFIER;
    agreements.clear();
    agreements.set(CHECKOUT, AGREEMENT);
});

describe("/orders/view on the batch path offers no act that goes to FigaroCore or the coordinator", () => {
    it("the buyer of an open batched process sees no resolve and no attestation card, and sees the line", async () => {
        await openOrderAs(BUYER, VERIFIER);
        expect(screen.getByTestId("order-batch-path-note").textContent).toMatch(LINE);
        expect(screen.queryByTestId("capability-resolve-process")).toBeNull();
        expect(screen.queryByTestId("capability-reassert-committed-clauses")).toBeNull();
    });

    it("the seller of an open batched order sees no attestation card, and sees the line", async () => {
        await openOrderAs(SELLER, VERIFIER);
        expect(screen.getByTestId("order-batch-path-note").textContent).toMatch(LINE);
        expect(screen.queryByTestId("capability-reassert-committed-clauses")).toBeNull();
    });

    it("the seller of a resolved batched order is still offered the payout split, and reads no line", async () => {
        account.address = SELLER;
        emits(VERIFIER, {
            OrderCommitted: [committedAt(VERIFIER)],
            OrderResolved: [orderResolvedLog({ address: VERIFIER, blockNumber: 9n, orderHash: ORDER, processId: PROCESS, sellerPayout: 30n, buyerPayout: 10n })],
            ProcessResolved: [processResolvedLog({ address: VERIFIER, blockNumber: 9n, processId: PROCESS, buyer: BUYER })],
        });
        render(<OrderTimelineView processId={PROCESS} />);
        const pill = await screen.findByTestId("order-status-pill", {}, { timeout: 5000 });
        await waitFor(() => expect(pill.textContent).toBe("Completed"));
        await screen.findByTestId("payout-routing");
        expect(screen.queryByTestId("order-batch-path-note")).toBeNull();
    });

    it("a visitor with no wallet reads the batched order and no line", async () => {
        account.address = undefined;
        emits(VERIFIER, { OrderCommitted: [committedAt(VERIFIER)] });
        render(<OrderTimelineView processId={PROCESS} />);
        await screen.findByTestId("order-status-pill", {}, { timeout: 5000 });
        expect(screen.queryByTestId("order-batch-path-note")).toBeNull();
    });
});

describe.each([
    ["the direct path", () => undefined],
    ["a deployment with no batch verifier", () => { contracts.batchVerifier = ""; }],
])("/orders/view on %s offers each party its acts, as before", (_name, configure) => {
    beforeEach(() => configure());

    it("the buyer sees its resolve and its attestation card, and no line", async () => {
        await openOrderAs(BUYER, CORE);
        await screen.findByTestId("capability-resolve-process");
        expect(screen.getByTestId("capability-reassert-committed-clauses")).toBeTruthy();
        expect(screen.queryByTestId("order-batch-path-note")).toBeNull();
    });

    it("the seller sees its attestation card, and no line", async () => {
        await openOrderAs(SELLER, CORE);
        await screen.findByTestId("capability-reassert-committed-clauses");
        expect(screen.queryByTestId("capability-resolve-process")).toBeNull();
        expect(screen.queryByTestId("order-batch-path-note")).toBeNull();
    });
});

describe("/orders/view while the order read is in flight", () => {
    it("offers no act and no line", async () => {
        account.address = BUYER;
        cachedGetLogsMock.mockImplementation(() => new Promise(() => undefined));
        render(<OrderTimelineView processId={PROCESS} />);
        await screen.findByText("Loading…");
        expect(screen.queryByTestId("order-batch-path-note")).toBeNull();
        expect(screen.queryByTestId("capability-resolve-process")).toBeNull();
        expect(screen.queryByTestId("capability-reassert-committed-clauses")).toBeNull();
    });
});
