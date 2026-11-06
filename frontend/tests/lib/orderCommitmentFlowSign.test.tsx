/**
 * The sign step of `useOrderCommitmentFlow` — what the wallet is asked to
 * sign, what rides into the confirm, what is relayed, and the step the flow
 * stands at after each act.
 *
 * - `signCommitment` asks the wallet for the EIP-712 Commitment over the
 *   FigaroCore domain on the connected chain, the commitment's nine fields as
 *   the message, after the confirm; with a funding token it first quotes the
 *   buyer's bond leg (`quoteBondFundingLeg`: 2 × payment, the FigaroCore's
 *   buyer pull — on a sub-order expectedCumulativeValue ≠ payment, so the
 *   argument order is load-bearing), shows that quote's swap summary in the
 *   SAME confirm (`swapDetails`: input token, denomination, maxInput), and
 *   then witness-signs exactly that quote.
 * - `signAndShare` relays the signed payload to the seller (with the race
 *   winner's countersignature when one is passed).
 * - `acceptOrder` quotes the seller's leg at 2 × expectedCumulativeValue and
 *   broadcasts the funded order through the coordinator's `swapAndCommit`.
 * - Each act moves the step (signing → awaiting-seller, sharing →
 *   awaiting-seller, committing → done) and a failure records its message
 *   and stands at "error".
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
    COMMITMENT_TYPES,
    buildDomain,
    buildOrderAgreement,
    computeCheckoutHash,
    type Commitment,
    type Hex,
} from "@figaro-protocol/sdk";
import type { CommitmentPayload } from "@figaro-protocol/sdk/agent";
import { keyOf, primeClauseSpecs } from "./primeClauseSpecs";
import { specSource } from "@/lib/shared/clauseSpecSource";
import type { FundingQuote } from "@/lib/composition/swapFunding";

const BUYER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Hex;
const SELLER = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Hex;
const CURRENCY = `0x${"ab".repeat(20)}` as Hex;
const INPUT_TOKEN = `0x${"1a".repeat(20)}` as Hex;
const CORE = "0x00000000000000000000000000000000000000c0" as Hex;
const SIG = `0x${"11".repeat(65)}` as Hex;
const BUYER_SIG = `0x${"22".repeat(65)}` as Hex;

const s = vi.hoisted(() => ({
    address: "" as string,
    client: {} as unknown,
    acts: [] as string[],
    typedData: [] as Array<{ primaryType: string; domain: unknown; message: Record<string, unknown> }>,
    signFails: null as unknown,
}));

vi.mock("wagmi", () => ({
    useAccount: () => ({ address: s.address }),
    useChainId: () => 31337,
    usePublicClient: () => s.client,
    useWalletClient: () => ({ data: null }),
    useSignTypedData: () => ({
        signTypedDataAsync: async (typedData: { primaryType: string; domain: unknown; message: Record<string, unknown> }) => {
            if (s.signFails !== null) throw s.signFails;
            s.typedData.push(typedData);
            s.acts.push(`sign:${typedData.primaryType}`);
            return `0x${"11".repeat(65)}`;
        },
    }),
}));
vi.mock("@/lib/kernel/contracts", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/kernel/contracts")>();
    return { ...actual, CONTRACTS: { ...actual.CONTRACTS, core: "0x00000000000000000000000000000000000000c0" } };
});
// The counterparty's signature and the seller's binding are each pinned by
// their own tests (sellerBoundAssembly, signGateDesignRead); here they pass.
vi.mock("@figaro-protocol/sdk", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@figaro-protocol/sdk")>()),
    verifyCommitmentSignature: async () => true,
    checkSellerBindsAssembly: async () => ({ ok: true }),
}));
const confirm = vi.fn(async (..._args: unknown[]) => { s.acts.push("confirm"); return true; });
vi.mock("@/lib/checkout/orderPreview", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/checkout/orderPreview")>()),
    requestSignConfirmation: (...args: unknown[]) => confirm(...args),
}));
const quoteFundingLeg = vi.fn(async (args: { inputToken: Hex; currency: Hex; bondAmount: bigint; deadline: bigint; chainId: number }): Promise<FundingQuote> => {
    s.acts.push("quote");
    return {
        inputToken: args.inputToken, currency: args.currency, router: `0x${"d0".repeat(20)}`,
        maxInput: args.bondAmount + 7n, nonce: 42n, deadline: args.deadline, chainId: args.chainId,
        permit2: `0x${"a2".repeat(20)}`, coordinator: `0x${"c0".repeat(20)}`, swapData: "0xdead",
    };
});
vi.mock("@/lib/composition/swapFunding", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/composition/swapFunding")>()),
    quoteFundingLeg: (args: Parameters<typeof quoteFundingLeg>[0]) => quoteFundingLeg(args),
}));
const shareSignedOrder = vi.fn(async (..._args: unknown[]) => { s.acts.push("share"); return "ipfs://shared"; });
vi.mock("@/lib/checkout/orderSignedAndShared", () => ({ shareSignedOrder: (...args: unknown[]) => shareSignedOrder(...args) }));
const commitSignedOrder = vi.fn(async (_args: { payload: CommitmentPayload; commit: (c: Commitment, b: Hex, sl: Hex) => Promise<Hex> }) => `0x${"cc".repeat(32)}` as Hex);
vi.mock("@/lib/kernel/orderCommitted", () => ({ commitSignedOrder: (args: Parameters<typeof commitSignedOrder>[0]) => commitSignedOrder(args) }));
const commit = vi.fn(async () => `0x${"c1".repeat(32)}` as Hex);
const swapAndCommit = vi.fn(async () => `0x${"c2".repeat(32)}` as Hex);
vi.mock("@/lib/kernel/useFigaroActions", () => ({ useFigaroActions: () => ({ commit }) }));
vi.mock("@/lib/composition/useSwapAndCommitActions", () => ({ useSwapAndCommitActions: () => ({ swapAndCommit }) }));
const services = { handoffMessaging: { tag: "handoff" }, evidenceTransport: { tag: "evidence" } };
vi.mock("@/lib/shared/runtimeServicesContext", () => ({ useRuntimeServices: () => services }));

const { useOrderCommitmentFlow } = await import("@/lib/checkout/orderCommitmentFlow");

/** A sub-order's preview: expectedCumulativeValue (300) ≠ payment (100), so a
 *  bond computed from the wrong one of the two is a different figure. */
function preview(payment = 100n, expectedCumulativeValue = 300n) {
    const { agreement } = buildOrderAgreement(BUYER, SELLER, {
        [keyOf("figaro-commerce")]: {
            currency: CURRENCY,
            payment: payment.toString(),
            lineItems: [{ itemId: "item-1", name: "Item", quantity: 1, unitPrice: payment.toString() }],
        },
    }, specSource());
    const checkoutHash = computeCheckoutHash(agreement);
    const commitment: Commitment = {
        processId: `0x${"0f".repeat(32)}` as Hex,
        buyer: BUYER, seller: SELLER, currency: CURRENCY,
        payment, expectedCumulativeValue, checkoutHash, salt: 9n, deadline: 9_999_999_999n,
    };
    return { agreement, checkoutHash, commitment };
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
    s.address = BUYER;
    s.client = { chain: { id: 31337 } };
    s.acts = [];
    s.typedData = [];
    s.signFails = null;
    confirm.mockClear();
    quoteFundingLeg.mockClear();
    shareSignedOrder.mockClear();
    commitSignedOrder.mockClear();
    commit.mockClear();
    swapAndCommit.mockClear();
});

describe("signCommitment — the buyer's signature", () => {
    it("asks the wallet for the Commitment over the FigaroCore domain, after the confirm, and stands awaiting the seller", async () => {
        const p = preview();
        const { result } = renderHook(() => useOrderCommitmentFlow());
        const { value } = await run(() => result.current.signCommitment(p));
        expect(confirm).toHaveBeenCalledWith(p.commitment, p.agreement, null);
        expect(s.typedData).toEqual([{
            domain: buildDomain(31337, CORE),
            types: COMMITMENT_TYPES,
            primaryType: "Commitment",
            message: {
                processId: p.commitment.processId, buyer: BUYER, seller: SELLER, currency: CURRENCY,
                payment: 100n, expectedCumulativeValue: 300n, checkoutHash: p.checkoutHash, salt: 9n, deadline: 9_999_999_999n,
            },
        }]);
        expect(s.acts).toEqual(["confirm", "sign:Commitment"]);
        expect(quoteFundingLeg).not.toHaveBeenCalled();
        expect(value).toEqual({ commitment: p.commitment, agreement: p.agreement, buyerSig: SIG });
        expect(result.current.step).toBe("awaiting-seller");
        expect(result.current.error).toBeNull();
    });

    it("with a funding token, quotes the buyer's bond (2 × payment), shows its swap summary in the same confirm, then witness-signs that quote", async () => {
        const p = preview();
        const { result } = renderHook(() => useOrderCommitmentFlow());
        const { value } = await run(() => result.current.signCommitment(p, { inputToken: INPUT_TOKEN }));
        expect(quoteFundingLeg).toHaveBeenCalledTimes(1);
        expect(quoteFundingLeg.mock.calls[0][0]).toEqual({
            publicClient: s.client, chainId: 31337, inputToken: INPUT_TOKEN, currency: CURRENCY,
            bondAmount: 200n, deadline: 9_999_999_999n,
        });
        // The confirm's swap summary is the quote's three figures, nothing else.
        expect(confirm).toHaveBeenCalledWith(p.commitment, p.agreement, { inputToken: INPUT_TOKEN, currency: CURRENCY, maxInput: 207n });
        expect(s.acts).toEqual(["quote", "confirm", "sign:Commitment", `sign:${s.typedData[1].primaryType}`]);
        // The witness the wallet signs carries the maxInput the confirm showed.
        expect((s.typedData[1].message as { permitted: { token: Hex; amount: bigint } }).permitted).toEqual({ token: INPUT_TOKEN, amount: 207n });
        expect(value?.buyerFunding).toMatchObject({ enabled: true, inputToken: INPUT_TOKEN, maxInput: 207n, permitNonce: 42n, swapData: "0xdead" });
        expect(result.current.step).toBe("awaiting-seller");
    });

    it("with a funding token and no chain connection, signs nothing, records the reason and stands at error", async () => {
        s.client = undefined;
        const p = preview();
        const { result } = renderHook(() => useOrderCommitmentFlow());
        const { caught } = await run(() => result.current.signCommitment(p, { inputToken: INPUT_TOKEN }));
        expect((caught as Error).message).toBe("No chain connection — cannot quote the funding swap.");
        expect(s.typedData).toEqual([]);
        expect(confirm).not.toHaveBeenCalled();
        expect(result.current.step).toBe("error");
        expect(result.current.error).toBe("No chain connection — cannot quote the funding swap.");
    });

    it("a refusal that carries no message records the act's own fallback", async () => {
        s.signFails = {};
        const { result } = renderHook(() => useOrderCommitmentFlow());
        await run(() => result.current.signCommitment(preview()));
        expect(result.current.step).toBe("error");
        expect(result.current.error).toBe("Order failed");
    });
});

describe("signAndShare — the signed order relayed to the seller", () => {
    it("relays the signed payload to the seller, after the signature, and stands awaiting the seller", async () => {
        const p = preview();
        const { result } = renderHook(() => useOrderCommitmentFlow());
        const { value } = await run(() => result.current.signAndShare(p));
        expect(shareSignedOrder).toHaveBeenCalledTimes(1);
        expect(shareSignedOrder).toHaveBeenCalledWith({
            payload: { commitment: p.commitment, agreement: p.agreement, buyerSig: SIG },
            recipientAddress: SELLER,
            senderAddress: BUYER,
            walletClient: null,
            chainId: 31337,
            handoffMessaging: services.handoffMessaging,
            evidenceTransport: services.evidenceTransport,
        });
        expect(s.acts).toEqual(["confirm", "sign:Commitment", "share"]);
        expect(value).toEqual({ commitment: p.commitment, agreement: p.agreement, buyerSig: SIG });
        expect(result.current.step).toBe("awaiting-seller");
    });

    it("a race winner's countersignature rides in the relayed payload beside the buyer's", async () => {
        const p = preview();
        const winner = `0x${"33".repeat(65)}` as Hex;
        const { result } = renderHook(() => useOrderCommitmentFlow());
        await run(() => result.current.signAndShare(p, undefined, { sellerSig: winner }));
        expect((shareSignedOrder.mock.calls[0][0] as { payload: CommitmentPayload }).payload).toEqual({
            commitment: p.commitment, agreement: p.agreement, buyerSig: SIG, sellerSig: winner,
        });
    });

    it("a relay that fails records its message and stands at error", async () => {
        shareSignedOrder.mockRejectedValueOnce(new Error("relay unreachable"));
        const { result } = renderHook(() => useOrderCommitmentFlow());
        const { caught } = await run(() => result.current.signAndShare(preview()));
        expect((caught as Error).message).toBe("relay unreachable");
        expect(result.current.step).toBe("error");
        expect(result.current.error).toBe("relay unreachable");
    });
});

describe("acceptOrder — the seller's funded counter-signature", () => {
    it("quotes the seller's bond (2 × expectedCumulativeValue), confirms its swap summary, and broadcasts through swapAndCommit with the seller's leg", async () => {
        s.address = SELLER;
        const p = preview();
        const incoming: CommitmentPayload = { commitment: p.commitment, agreement: p.agreement, buyerSig: BUYER_SIG };
        const { result } = renderHook(() => useOrderCommitmentFlow());
        const { value } = await run(() => result.current.acceptOrder(incoming, { inputToken: INPUT_TOKEN }));
        expect(value).toBe(`0x${"cc".repeat(32)}`);
        expect(quoteFundingLeg.mock.calls[0][0]).toMatchObject({ inputToken: INPUT_TOKEN, currency: CURRENCY, bondAmount: 600n });
        expect(confirm).toHaveBeenCalledWith(p.commitment, p.agreement, { inputToken: INPUT_TOKEN, currency: CURRENCY, maxInput: 607n });
        // The broadcast the flow hands to commitSignedOrder routes the funded
        // order through the coordinator, with the seller's witness-signed leg.
        const { payload, commit: broadcast } = commitSignedOrder.mock.calls[0][0];
        expect(payload).toEqual({ ...incoming, sellerSig: SIG });
        await broadcast(p.commitment, BUYER_SIG, SIG);
        expect(commit).not.toHaveBeenCalled();
        expect(swapAndCommit).toHaveBeenCalledWith(p.commitment, BUYER_SIG, SIG, undefined, expect.objectContaining({ enabled: true, inputToken: INPUT_TOKEN, maxInput: 607n }));
        expect(result.current.step).toBe("done");
    });

    it("with no funding token, quotes nothing and broadcasts through FigaroCore's commit", async () => {
        s.address = SELLER;
        const p = preview();
        const { result } = renderHook(() => useOrderCommitmentFlow());
        await run(() => result.current.acceptOrder({ commitment: p.commitment, agreement: p.agreement, buyerSig: BUYER_SIG }));
        expect(quoteFundingLeg).not.toHaveBeenCalled();
        expect(confirm).toHaveBeenCalledWith(p.commitment, p.agreement, null);
        expect(commitSignedOrder.mock.calls[0][0].commit).toBe(commit);
    });

    it("waits for no second receipt: the broadcaster verifies its own, and a second wait on the same hash never resolves in the browser", async () => {
        s.address = SELLER;
        const p = preview();
        const { result } = renderHook(() => useOrderCommitmentFlow());
        const { value } = await run(() => result.current.acceptOrder({ commitment: p.commitment, agreement: p.agreement, buyerSig: BUYER_SIG }));
        expect(commitSignedOrder.mock.calls[0][0]).toMatchObject({ waitForReceipt: false });
        expect(value).toBe(`0x${"cc".repeat(32)}`);
        expect(result.current.step).toBe("done");
    });
});
