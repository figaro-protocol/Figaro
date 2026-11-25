/**
 * The order page (`/orders/view`) on the batch path: each party is offered
 * its acts once a relay that passes the check against the chain is known, and
 * each act is signed under the batch verifier's EIP-712 domain and sent to
 * that relay. Nothing is written to the chain. With no relay that passes, the
 * page states that it sends nothing, names each relay that failed and why,
 * and offers no act.
 *
 * The logs are the bytes a node returns, read through the real indexer, the
 * real order hooks, the real process model (`deriveProcessModelFromRuntime`),
 * the real executors (`createCapabilityExecutors`), the real attestation
 * submitter (`useAttestationCoordinatorActions`), the real relay transport
 * (`useCheckedRelay`, `checkRelay`, `useRelayActions`, `SequencerClient`) and
 * the real page. The path is derived from the emitter of the order events,
 * never stored. Stood in for: the event cache's network call, the relay's
 * HTTP answers (`fetch`), the wallet's signature and writes, the verifier's
 * `programVKey` read, the token's metadata, the agreement read, the profile
 * read, the witness pin and the direct path's resolve and usage writes.
 *
 * Proves, on the batch path: the buyer of an open process is offered its
 * resolve and its attestation, signs each under the verifier's domain, sends
 * each to the relay and writes nothing to the chain; the seller signs its
 * attestation the same way; a relay whose verifier or key differs from the
 * chain's is not offered, its reason is stated, and the stated line shows; a
 * visitor reads no act and no line. On the direct path, and on a deployment
 * with no batch verifier: each party sees its acts, and no relay is read.
 * While the order read is in flight, the page offers no act and no line.
 *
 * Does not prove: the interaction surfaces' send on the batch path
 * (`AddressDetailPanel`, `ContentDeliveryPanel`); the browser run against a
 * real relay is `relay-transport.devnet.spec.ts`.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { decodeEventLog } from "viem";
import { EV_ORDER_COMMITTED, type Agreement } from "@figaro-protocol/sdk";
import { orderCommittedLog, orderResolvedLog, processResolvedLog, word, type FixtureLog } from "../lib/__fixtures__/coreLogs";

const { cachedGetLogsMock, account, contracts, agreements, CORE, VERIFIER, VKEY, CLIENT, BUYER, signTypedDataMock, writeContractMock, resolveDirectMock } = vi.hoisted(() => ({
    cachedGetLogsMock: vi.fn(),
    account: { address: "0x00000000000000000000000000000000000000b1" as `0x${string}` | undefined },
    contracts: { core: "0x1111111111111111111111111111111111111111", batchVerifier: "0x2222222222222222222222222222222222222222" },
    agreements: new Map<string, unknown>(),
    CORE: "0x1111111111111111111111111111111111111111",
    VERIFIER: "0x2222222222222222222222222222222222222222",
    VKEY: `0x${"5a".repeat(32)}` as `0x${string}`,
    CLIENT: {
        chain: { id: 31337 },
        readContract: vi.fn(async () => `0x${"5a".repeat(32)}`),
    },
    BUYER: "0x00000000000000000000000000000000000000b1" as const,
    signTypedDataMock: vi.fn(async () => `0x${"ab".repeat(32)}${"cd".repeat(32)}1b`),
    writeContractMock: vi.fn(),
    resolveDirectMock: vi.fn(),
}));

vi.mock("wagmi", async () => (await import("../support/wagmiMock")).wagmiMock({ address: () => account.address, client: () => CLIENT }, {
    useWaitForTransactionReceipt: () => ({ isLoading: false, isSuccess: false }),
    useWatchContractEvent: () => undefined,
    useReadContract: () => ({ data: undefined, isLoading: false }),
    useWriteContract: () => ({ writeContractAsync: writeContractMock, data: undefined, isPending: false }),
    useSignTypedData: () => ({ signTypedDataAsync: signTypedDataMock }),
}));
vi.mock("@/lib/core/eventCache", () => ({
    cachedGetLogs: (...args: unknown[]) => cachedGetLogsMock(...args),
    cachedGetReceiptLogs: vi.fn(),
}));
vi.mock("@/lib/core/contracts", async (importOriginal) =>
    (await import("../support/contractsMock")).contractsMock(await importOriginal<typeof import("@/lib/core/contracts")>(), { contracts: contracts, batchVerifier: () => (contracts.batchVerifier || null), coordinator: () => "0x3333333333333333333333333333333333333333" }));
vi.mock("@/lib/shared/publicClient", () => ({ publicClient: CLIENT }));
vi.mock("@/lib/shared/e2e", () => ({ isE2EMockSession: () => false }));

// The order's agreement, as its party holds it: one committed clause no spec
// source has loaded, and the provenance leaf naming its assembly.
vi.mock("@/hooks/useProcessAgreements", () => ({ useProcessAgreements: () => agreements }));
vi.mock("@/lib/core/agreementFetch", () => ({
    fetchAgreement: async (hash: string) => (agreements.has(hash) ? { status: "present", value: agreements.get(hash) } : { status: "absent" }),
}));
vi.mock("@/lib/core/attestationIndexer", () => ({ getAttestationsByProcess: async () => [] }));
vi.mock("@/lib/core/witnessContent", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/core/witnessContent")>()),
    publishWitnessContent: async () => undefined,
}));
vi.mock("@/lib/registries/useClauseSpecs", () => ({ useClauseSpecs: () => ({ version: 0, loaded: true }) }));
vi.mock("@/lib/registries/useMemberListings", () => ({ useMemberListings: () => ({ read: { status: "present", value: [] } }) }));
// A party's profile names a relay only where a test lists one; else the
// wallet's own setting does.
const profileRelays = vi.hoisted(() => ({ urls: [] as string[] }));
vi.mock("@/lib/registries/profileFetcher", () => ({
    profileReaderForChain: () => async (party: string) => {
        const i = ["0x00000000000000000000000000000000000000b1", "0x00000000000000000000000000000000000000a1"].indexOf(party.toLowerCase());
        const url = profileRelays.urls[i];
        return url ? { name: "Party", services: { relay: url } } : null;
    },
}));
vi.mock("@/hooks/useProcessResolveCapacity", () => ({ default: () => null }));
vi.mock("@/hooks/useTokenDecimals", async () => (await import("../support/tokenDecimalsMock")).tokenDecimalsMock(18));
vi.mock("@/hooks/useTokenSymbol", () => ({ useTokenSymbol: () => ({ data: "TKN" }) }));

// The direct path's writes: never reached on the batch path.
vi.mock("@/hooks/useTokenApproval", () => ({ default: () => ({ needsApproval: () => false, approve: vi.fn(), refetchAllowance: vi.fn() }) }));
vi.mock("@/lib/core/useFigaroActions", () => ({ useFigaroActions: () => ({ resolveProcess: resolveDirectMock, hash: undefined, isPending: false }) }));
vi.mock("@/lib/rewards/useUsageRecorder", () => ({ useUsageRecorder: () => ({}) }));
vi.mock("@/lib/registries/useMembersRegistry", () => ({
    useRegisterMember: () => ({ register: vi.fn(), isPending: false, isConfirming: false, isSuccess: false }),
    useUpdateProfile: () => ({ updateProfile: vi.fn(), isPending: false, isConfirming: false, isSuccess: false }),
    useWithdrawDeposit: () => ({ withdraw: vi.fn(), isPending: false, isConfirming: false, isSuccess: false }),
    useWithdrawalCooldown: () => ({ data: 60n }),
}));
vi.mock("@/lib/composability/usePayoutRoutingActions", () => ({
    usePayoutRoutingActions: () => ({ routeTokenPayout: vi.fn(), isRouting: false, isAvailable: true }),
}));

import { OrderTimelineView } from "@/app/(app)/orders/_components/OrderTimelineView";

const PROCESS = word(0xba7c);
const ORDER = word(0x0bd1);
const SELLER = "0x00000000000000000000000000000000000000a1" as const;
const CHECKOUT = word(0xc4ec);
const RELAY = "http://relay.test";
const AGREEMENT: Agreement = {
    version: "a1",
    buyer: BUYER,
    seller: SELLER,
    clauses: [{ clause: `0x${"01".repeat(32)}`, data: { note: "committed" } }],
    provenance: { agreementHash: `0x${"0a".repeat(32)}`, processDesignHash: `0x${"0d".repeat(32)}` },
};

/** The relay's HTTP answers: its status names `identity`, each submission is
 *  admitted under the next operation id. Every request is kept. */
let relaySent: Array<{ url: string; body: unknown }> = [];
function relayAnswers(identity: { batch_verifier: string; program_vkey: string; browser_submit_origins?: string[] }) {
    let next = 41;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        relaySent.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
        if (url.endsWith("/status")) {
            return new Response(JSON.stringify({
                wire_format_version: 1, chain_id: 31337, browser_submit_origins: [window.location.origin], ...identity,
                state_root: word(1), pending_ops: 0, pending_usage_claims: 0, batches_settled: 0,
            }), { status: 200 });
        }
        return new Response(JSON.stringify({ id: next++ }), { status: 200 });
    }));
}

/** A log as a node's decoded answer carries it: its raw bytes and its args. */
function decoded(log: FixtureLog): FixtureLog & { args: Record<string, unknown> } {
    const { args } = decodeEventLog({ abi: [EV_ORDER_COMMITTED], topics: log.topics as [`0x${string}`], data: log.data as `0x${string}` });
    return { ...log, args: args as Record<string, unknown> };
}

/** `emitter` emits `logs`, each under its own event name; the other order emitter emits nothing. */
function emits(emitter: string, logs: Record<string, FixtureLog[]>) {
    cachedGetLogsMock.mockImplementation(async (_c: unknown, _id: number, opts: { address: string; eventName: string }) =>
        opts.address.toLowerCase() === emitter.toLowerCase() ? (logs[opts.eventName] ?? []) : [],
    );
}

function committedAt(emitter: string) {
    return decoded(orderCommittedLog({ address: emitter, blockNumber: 4n, orderHash: ORDER, processId: PROCESS, buyer: BUYER, seller: SELLER, checkoutHash: CHECKOUT }));
}

/** Renders the page for `wallet` over an open order `emitter` emitted, and waits for the read. */
async function openOrderAs(wallet: `0x${string}`, emitter: string) {
    account.address = wallet;
    emits(emitter, { OrderCommitted: [committedAt(emitter)] });
    render(<OrderTimelineView processId={PROCESS} />);
    const pill = await screen.findByTestId("order-status-pill", {}, { timeout: 5000 });
    expect(pill.textContent).toBe("Active");
}

/** The kinds of operation the relay was sent, in order. */
const submittedKinds = () => relaySent
    .filter((r) => r.url === `${RELAY}/submit`)
    .map((r) => Object.keys((r.body as { operation: Record<string, unknown> }).operation)[0]);

/** Every typed-data signature's verifying contract and primary type. */
const signedFor = () => signTypedDataMock.mock.calls.map((call) => {
    const arg = (call as unknown[])[0] as { domain: { verifyingContract: string }; primaryType: string };
    return { verifyingContract: arg.domain.verifyingContract.toLowerCase(), primaryType: arg.primaryType };
});

beforeEach(() => {
    cachedGetLogsMock.mockReset();
    signTypedDataMock.mockClear();
    writeContractMock.mockClear();
    resolveDirectMock.mockClear();
    relaySent = [];
    profileRelays.urls = [];
    contracts.core = CORE;
    contracts.batchVerifier = VERIFIER;
    agreements.clear();
    agreements.set(CHECKOUT, AGREEMENT);
    window.localStorage.setItem("figaro-relay-url", RELAY);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    relayAnswers({ batch_verifier: VERIFIER, program_vkey: VKEY });
});

afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("/orders/view on the batch path (useRelayActions), with a relay that passes the check", () => {
    it("the buyer resolves: signed for the verifier, sent to the relay, nothing written to the chain", async () => {
        await openOrderAs(BUYER, VERIFIER);
        await screen.findByTestId("order-relay-in-use");
        fireEvent.click(await screen.findByTestId("capability-execute-resolve-process"));
        await waitFor(() => expect(submittedKinds()).toEqual(["Resolve"]));
        expect(signedFor()).toEqual([{ verifyingContract: VERIFIER, primaryType: "ResolveProcess" }]);
        expect(resolveDirectMock).not.toHaveBeenCalled();
        expect(writeContractMock).not.toHaveBeenCalled();
        const receipt = await screen.findByTestId("order-relay-receipt");
        expect(receipt.textContent).toContain(`The relay ${RELAY} answered this resolve with operation 41`);
        expect(receipt.textContent).toContain("It is not on the chain yet");
        expect(receipt.textContent).toContain("sign the act again here and send it through another relay");
        expect(screen.queryByTestId("order-relay-none")).toBeNull();
    });

    it("the buyer attests the provenance leaf: signed for the verifier, sent to the relay, nothing written to the chain", async () => {
        await openOrderAs(BUYER, VERIFIER);
        fireEvent.click(await screen.findByTestId("capability-execute-reassert-committed-clauses"));
        fireEvent.click(await screen.findByTestId("capability-execute-reassert-provenance-leaf"));
        await waitFor(() => expect(submittedKinds()).toEqual(["AttestAsBuyer"]));
        expect(signedFor()).toEqual([{ verifyingContract: VERIFIER, primaryType: "AttestBuyer" }]);
        expect(writeContractMock).not.toHaveBeenCalled();
        await screen.findByTestId("order-relay-receipt");
    });

    it("the seller is offered its attestation and no resolve, through the same relay", async () => {
        await openOrderAs(SELLER, VERIFIER);
        await screen.findByTestId("order-relay-in-use");
        await screen.findByTestId("capability-reassert-committed-clauses");
        expect(screen.queryByTestId("capability-resolve-process")).toBeNull();
        expect(screen.queryByTestId("order-relay-none")).toBeNull();
    });

    it("the seller of a resolved batched order is still offered the payout split, and no relay is shown", async () => {
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
        expect(screen.queryByTestId("order-relay-panel")).toBeNull();
    });

    it("a visitor with no wallet reads the batched order, no act and no relay", async () => {
        account.address = undefined;
        emits(VERIFIER, { OrderCommitted: [committedAt(VERIFIER)] });
        render(<OrderTimelineView processId={PROCESS} />);
        await screen.findByTestId("order-status-pill", {}, { timeout: 5000 });
        expect(screen.queryByTestId("order-relay-panel")).toBeNull();
        expect(screen.queryByTestId("capability-rail")).toBeNull();
    });
});

describe.each([
    ["another verifier", { batch_verifier: "0x4444444444444444444444444444444444444444", program_vkey: VKEY }, /lands its batches at the verifier 0x4444/],
    ["another key", { batch_verifier: VERIFIER, program_vkey: `0x${"77".repeat(32)}` }, /proves under the key 0x7777/],
])("/orders/view on the batch path, with a relay for %s", (_name, identity, reason) => {
    beforeEach(() => relayAnswers(identity));

    it("offers no act, states the line and names the relay's failed check", async () => {
        await openOrderAs(BUYER, VERIFIER);
        const line = await screen.findByTestId("order-relay-none");
        expect(line.textContent).toMatch(/No relay whose report matches this deployment's batch verifier is known, so this page sends nothing on the batch path/);
        expect(screen.getByTestId("order-relay-failed-checks").textContent).toMatch(reason);
        expect(screen.queryByTestId("capability-resolve-process")).toBeNull();
        expect(screen.queryByTestId("capability-reassert-committed-clauses")).toBeNull();
        expect(submittedKinds()).toEqual([]);
    });
});

describe("/orders/view on the batch path, with a relay that does not let this page submit from a browser", () => {
    beforeEach(() => relayAnswers({ batch_verifier: VERIFIER, program_vkey: VKEY, browser_submit_origins: ["http://elsewhere.test"] }));

    it("offers no act and names the origin it refuses", async () => {
        await openOrderAs(BUYER, VERIFIER);
        await screen.findByTestId("order-relay-none");
        expect(screen.getByTestId("order-relay-failed-checks").textContent).toMatch(/does not let a page at .* submit from a browser/);
        expect(screen.queryByTestId("capability-resolve-process")).toBeNull();
    });
});

describe("/orders/view on the batch path, with two relays that pass and none set", () => {
    it("offers no act until the holder chooses a relay, then sends through the one chosen", async () => {
        window.localStorage.clear();
        profileRelays.urls = ["http://relay-one.test", "http://relay-two.test"];
        await openOrderAs(BUYER, VERIFIER);
        const choices = await screen.findAllByTestId("order-relay-choose");
        expect(choices.map((c) => c.textContent).sort()).toEqual(["http://relay-one.test", "http://relay-two.test"]);
        expect(screen.queryByTestId("capability-resolve-process")).toBeNull();
        fireEvent.click(choices.find((c) => c.textContent === "http://relay-two.test")!);
        fireEvent.click(await screen.findByTestId("capability-execute-resolve-process"));
        await waitFor(() => expect(relaySent.some((r) => r.url === "http://relay-two.test/submit")).toBe(true));
        expect(relaySent.some((r) => r.url === "http://relay-one.test/submit")).toBe(false);
    });
});

describe("/orders/view on the batch path, with no relay named anywhere", () => {
    it("offers no act and states the line", async () => {
        window.localStorage.clear();
        await openOrderAs(BUYER, VERIFIER);
        await screen.findByTestId("order-relay-none");
        expect(screen.queryByTestId("order-relay-failed-checks")).toBeNull();
        expect(screen.queryByTestId("capability-resolve-process")).toBeNull();
    });
});

describe.each([
    ["the direct path", () => undefined],
    ["a deployment with no batch verifier", () => { contracts.batchVerifier = ""; }],
])("/orders/view on %s offers each party its acts, as before", (_name, configure) => {
    beforeEach(() => configure());

    it("the buyer sees its resolve and its attestation card, and no relay is read", async () => {
        await openOrderAs(BUYER, CORE);
        await screen.findByTestId("capability-resolve-process");
        expect(screen.getByTestId("capability-reassert-committed-clauses")).toBeTruthy();
        expect(screen.queryByTestId("order-relay-panel")).toBeNull();
        expect(relaySent).toEqual([]);
    });

    it("the seller sees its attestation card, and no relay is read", async () => {
        await openOrderAs(SELLER, CORE);
        await screen.findByTestId("capability-reassert-committed-clauses");
        expect(screen.queryByTestId("capability-resolve-process")).toBeNull();
        expect(screen.queryByTestId("order-relay-panel")).toBeNull();
        expect(relaySent).toEqual([]);
    });
});

describe("/orders/view while the order read is in flight", () => {
    it("offers no act and no line", async () => {
        account.address = BUYER;
        cachedGetLogsMock.mockImplementation(() => new Promise(() => undefined));
        render(<OrderTimelineView processId={PROCESS} />);
        await screen.findByText("Loading…");
        expect(screen.queryByTestId("order-relay-panel")).toBeNull();
        expect(screen.queryByTestId("capability-resolve-process")).toBeNull();
        expect(screen.queryByTestId("capability-reassert-committed-clauses")).toBeNull();
    });
});
