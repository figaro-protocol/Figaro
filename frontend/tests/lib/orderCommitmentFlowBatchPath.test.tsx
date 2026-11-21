/**
 * The accept of `useOrderCommitmentFlow` on the batch path: the path is the
 * one the buyer's signature was made for, read from the domain it recovers
 * under, and the seller signs for the same path and sends to a relay.
 *
 * Real crypto throughout: the buyer signs with a viem local account under the
 * verifier's domain or FigaroCore's, and the flow reads the path with the
 * SDK's real `verifyCommitmentSignature`. Stood in for: the wallet prompt, the
 * confirm, the seller's profile read, the order-event read, the relay's
 * answers and the direct broadcast.
 *
 * Proves: a buyer signature for the verifier has the seller sign for the
 * verifier's domain, checks the seller's binding for the batch path, and
 * sends the order to the relay, broadcasting nothing; with no checked relay
 * nothing is signed; a sub-order signed for the direct path that joins a
 * process the chain holds on the batch path is refused before any signature;
 * a buyer signature for FigaroCore keeps the direct broadcast.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { privateKeyToAccount } from "viem/accounts";
import {
    COMMITMENT_TYPES,
    ZERO_PROCESS_ID,
    buildDomain,
    buildOrderAgreement,
    computeCheckoutHash,
    type Commitment,
    type Hex,
} from "@figaro-protocol/sdk";
import { SequencerClient, type CommitmentPayload } from "@figaro-protocol/sdk/agent";
import { keyOf, primeClauseSpecs } from "./primeClauseSpecs";
import { specSource } from "@/lib/shared/clauseSpecSource";

const CHAIN_ID = 31337;
const CORE = "0x00000000000000000000000000000000000000c0" as Hex;
const VERIFIER = "0x00000000000000000000000000000000000000b7" as Hex;
const CURRENCY = `0x${"ab".repeat(20)}` as Hex;

const buyerAccount = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const sellerAccount = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");

const s = vi.hoisted(() => ({
    walletPrompts: [] as Array<{ domain: { verifyingContract: string }; primaryType: string }>,
    bindingPaths: [] as (string | undefined)[],
    heldPath: null as "direct" | "batch" | null,
}));

vi.mock("wagmi", () => ({
    useAccount: () => ({ address: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc" }),
    useChainId: () => 31337,
    usePublicClient: () => ({ chain: { id: 31337 } }),
    useWalletClient: () => ({ data: null }),
    useSignTypedData: () => ({
        signTypedDataAsync: async (typedData: { domain: { verifyingContract: string }; primaryType: string }) => {
            s.walletPrompts.push(typedData);
            return `0x${"11".repeat(65)}`;
        },
    }),
}));
vi.mock("@/lib/core/contracts", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/core/contracts")>();
    return {
        ...actual,
        CONTRACTS: { core: "0x00000000000000000000000000000000000000c0", batchVerifier: "0x00000000000000000000000000000000000000b7" },
        getBatchVerifier: () => "0x00000000000000000000000000000000000000b7",
    };
});
vi.mock("@/lib/core/indexer", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/core/indexer")>()),
    processPath: async () => s.heldPath,
}));
vi.mock("@figaro-protocol/sdk", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@figaro-protocol/sdk")>()),
    checkSellerBindsProcess: async (_a: unknown, _s: unknown, _r: unknown, path?: string) => {
        s.bindingPaths.push(path);
        return { ok: true };
    },
    followedOrderIssues: () => [],
}));
vi.mock("@/lib/checkout/orderPreview", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/checkout/orderPreview")>()),
    requestSignConfirmation: async () => true,
}));
const commitSignedOrder = vi.fn(async (_args: { payload: CommitmentPayload }) => `0x${"cc".repeat(32)}` as Hex);
vi.mock("@/lib/core/orderCommitted", () => ({ commitSignedOrder: (args: Parameters<typeof commitSignedOrder>[0]) => commitSignedOrder(args) }));
vi.mock("@/lib/core/useFigaroActions", () => ({ useFigaroActions: () => ({ commit: vi.fn() }) }));
vi.mock("@/lib/composability/useSwapAndCommitActions", () => ({ useSwapAndCommitActions: () => ({ swapAndCommit: vi.fn() }) }));
vi.mock("@/lib/shared/runtimeServicesContext", () => ({ useRuntimeServices: () => ({}) }));

const { useOrderCommitmentFlow } = await import("@/lib/checkout/orderCommitmentFlow");

function order(processId: Hex): { agreement: CommitmentPayload["agreement"]; commitment: Commitment } {
    const { agreement } = buildOrderAgreement(buyerAccount.address, sellerAccount.address, {
        [keyOf("figaro-commerce")]: { lineItems: [{ itemId: "item-1", name: "Item", quantity: 1, unitPrice: "100" }] },
    }, specSource());
    const commitment: Commitment = {
        processId, buyer: buyerAccount.address, seller: sellerAccount.address, token: CURRENCY,
        payment: 100n, runningTotal: processId === ZERO_PROCESS_ID ? 100n : 300n,
        checkoutHash: computeCheckoutHash(agreement), salt: 9n, commitDeadline: 9_999_999_999n,
    };
    return { agreement, commitment };
}

const buyerSignsFor = (contract: Hex, commitment: Commitment) => buyerAccount.signTypedData({
    domain: buildDomain(CHAIN_ID, contract), types: COMMITMENT_TYPES, primaryType: "Commitment", message: commitment,
});

/** A relay that admits every commitment, keeping each it was sent. */
function relay() {
    const sent: unknown[] = [];
    const client = new SequencerClient({
        url: "http://relay.test",
        fetch: (async (_input: RequestInfo | URL, init?: RequestInit) => {
            sent.push(JSON.parse(String(init?.body)));
            return new Response(JSON.stringify({ id: 7 }), { status: 200 });
        }) as typeof globalThis.fetch,
    });
    return { known: { url: "http://relay.test", client }, sent };
}

async function run<T>(act_: () => Promise<T>): Promise<{ value?: T; caught?: unknown }> {
    let out: { value?: T; caught?: unknown } = {};
    await act(async () => {
        try { out = { value: await act_() }; } catch (e) { out = { caught: e }; }
    });
    return out;
}

beforeAll(async () => { await primeClauseSpecs(["figaro-commerce"]); });
beforeEach(() => {
    s.walletPrompts = [];
    s.bindingPaths = [];
    s.heldPath = null;
    commitSignedOrder.mockClear();
});

describe("acceptOrder follows the path the buyer signed for", () => {
    it("a buyer signature for the verifier: the seller signs for the verifier, the binding is checked for the batch path, and the order goes to the relay", async () => {
        const { agreement, commitment } = order(ZERO_PROCESS_ID as Hex);
        const payload: CommitmentPayload = { agreement, commitment, buyerSig: await buyerSignsFor(VERIFIER, commitment) };
        const r = relay();
        const { result } = renderHook(() => useOrderCommitmentFlow());
        const out = await run(() => result.current.acceptOrder(payload, undefined, { relay: r.known }));
        expect(out.caught).toBeUndefined();
        expect(out.value).toEqual({ act: "commit", operationId: 7, relayUrl: "http://relay.test", commitDeadline: commitment.commitDeadline });
        expect(s.walletPrompts.map((p) => [p.primaryType, p.domain.verifyingContract])).toEqual([["Commitment", VERIFIER]]);
        expect(s.bindingPaths).toEqual(["batch"]);
        expect(r.sent).toHaveLength(1);
        expect(Object.keys((r.sent[0] as { operation: object }).operation)).toEqual(["Commit"]);
        expect(commitSignedOrder).not.toHaveBeenCalled();
        expect(result.current.relayReceipt?.operationId).toBe(7);
    });

    it("a buyer signature for the verifier with no checked relay: nothing is signed or sent", async () => {
        const { agreement, commitment } = order(ZERO_PROCESS_ID as Hex);
        const payload: CommitmentPayload = { agreement, commitment, buyerSig: await buyerSignsFor(VERIFIER, commitment) };
        const { result } = renderHook(() => useOrderCommitmentFlow());
        const out = await run(() => result.current.acceptOrder(payload, undefined, { relay: null }));
        expect(String((out.caught as Error).message)).toMatch(/no relay that passes the check/);
        expect(s.walletPrompts).toHaveLength(0);
        expect(commitSignedOrder).not.toHaveBeenCalled();
    });

    it("a sub-order signed for FigaroCore that joins a process the chain holds on the batch path is refused before any signature", async () => {
        s.heldPath = "batch";
        const { agreement, commitment } = order(`0x${"0f".repeat(32)}` as Hex);
        const payload: CommitmentPayload = { agreement, commitment, buyerSig: await buyerSignsFor(CORE, commitment) };
        const { result } = renderHook(() => useOrderCommitmentFlow());
        const out = await run(() => result.current.acceptOrder(payload));
        expect(String((out.caught as Error).message)).toMatch(/holds on the batch path, and it was signed for the direct path/);
        expect(s.walletPrompts).toHaveLength(0);
        expect(commitSignedOrder).not.toHaveBeenCalled();
    });

    it("a buyer signature for FigaroCore: the seller signs for FigaroCore and the order is broadcast directly", async () => {
        const { agreement, commitment } = order(ZERO_PROCESS_ID as Hex);
        const payload: CommitmentPayload = { agreement, commitment, buyerSig: await buyerSignsFor(CORE, commitment) };
        const { result } = renderHook(() => useOrderCommitmentFlow());
        const out = await run(() => result.current.acceptOrder(payload));
        expect(out.caught).toBeUndefined();
        expect(s.walletPrompts.map((p) => p.domain.verifyingContract)).toEqual([CORE]);
        expect(s.bindingPaths).toEqual(["direct"]);
        expect(commitSignedOrder).toHaveBeenCalledTimes(1);
    });
});
