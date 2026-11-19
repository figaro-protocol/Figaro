/**
 * The countersign gate of `useOrderCommitmentFlow`: a party signs after its
 * counterparty only once the counterparty's signature recovers to the
 * counterparty, over this exact commitment, on the FigaroCore domain of the
 * page's chain.
 *
 * Real crypto throughout: the counterparty signs with a viem local account,
 * over the SDK's `buildDomain` and `COMMITMENT_TYPES`, and the flow checks it
 * with the SDK's real `verifyCommitmentSignature`. Only the wallet prompt, the
 * confirm, the seller's profile read and the broadcast are faked, since jsdom
 * has no wallet and no chain.
 *
 * `acceptOrder` is the one act that signs after a counterparty; the role is
 * the entry still empty. Three paths run through it:
 * - the seller after the buyer, on a root order;
 * - the seller after the buyer, on a sub-order (runningTotal above
 *   the payment, a process id of its own);
 * - the buyer after the seller, when the seller signed first.
 * On each, a valid counterparty signature opens the wallet; a signature by
 * another key, a signature over another commitment, an empty signature and
 * no signature at all never open it, and the flow stands at "error" with the
 * refusal.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import {
    COMMITMENT_TYPES,
    ZERO_PROCESS_ID,
    buildDomain,
    buildOrderAgreement,
    computeCheckoutHash,
    type Commitment,
    type Hex,
} from "@figaro-protocol/sdk";
import type { CommitmentPayload } from "@figaro-protocol/sdk/agent";
import { keyOf, primeClauseSpecs } from "./primeClauseSpecs";
import { specSource } from "@/lib/shared/clauseSpecSource";

const CHAIN_ID = 31337;
const CORE = "0x00000000000000000000000000000000000000c0" as Hex;
const CURRENCY = `0x${"ab".repeat(20)}` as Hex;

// Deterministic anvil test keys (devnet-only, publicly known).
const buyerAccount = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const sellerAccount = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
const strangerAccount = privateKeyToAccount("0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6");

const REFUSAL = "The relayed order's counterparty signature is missing or invalid — refusing to counter-sign.";

const s = vi.hoisted(() => ({
    address: "" as string,
    walletPrompts: [] as Array<{ primaryType: string; message: { [field: string]: unknown } }>,
}));

vi.mock("wagmi", () => ({
    useAccount: () => ({ address: s.address }),
    useChainId: () => 31337,
    usePublicClient: () => ({ chain: { id: 31337 } }),
    useWalletClient: () => ({ data: null }),
    useSignTypedData: () => ({
        signTypedDataAsync: async (typedData: { primaryType: string; message: { [field: string]: unknown } }) => {
            s.walletPrompts.push(typedData);
            return `0x${"11".repeat(65)}`;
        },
    }),
}));
vi.mock("@/lib/core/contracts", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/core/contracts")>();
    return { ...actual, CONTRACTS: { ...actual.CONTRACTS, core: "0x00000000000000000000000000000000000000c0" } };
});
// The seller's binding is pinned by its own test (sellerBoundAssembly); here it
// passes. `verifyCommitmentSignature` is the SDK's own, unmocked.
vi.mock("@figaro-protocol/sdk", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@figaro-protocol/sdk")>()),
    checkSellerBindsProcess: async () => ({ ok: true }),
}));
const confirm = vi.fn(async (..._args: unknown[]) => true);
vi.mock("@/lib/checkout/orderPreview", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/checkout/orderPreview")>()),
    requestSignConfirmation: (...args: unknown[]) => confirm(...args),
}));
const commitSignedOrder = vi.fn(async (_args: { payload: CommitmentPayload }) => `0x${"cc".repeat(32)}` as Hex);
vi.mock("@/lib/core/orderCommitted", () => ({ commitSignedOrder: (args: Parameters<typeof commitSignedOrder>[0]) => commitSignedOrder(args) }));
vi.mock("@/lib/core/useFigaroActions", () => ({ useFigaroActions: () => ({ commit: vi.fn() }) }));
vi.mock("@/lib/composability/useSwapAndCommitActions", () => ({ useSwapAndCommitActions: () => ({ swapAndCommit: vi.fn() }) }));
vi.mock("@/lib/shared/runtimeServicesContext", () => ({ useRuntimeServices: () => ({}) }));

const { useOrderCommitmentFlow } = await import("@/lib/checkout/orderCommitmentFlow");

/** An order between the two keys, its agreement merkled into the signed
 *  checkoutHash so the sign gate passes it. */
function order(shape: { processId: Hex; payment: bigint; runningTotal: bigint }) {
    const { agreement } = buildOrderAgreement(buyerAccount.address, sellerAccount.address, {
        [keyOf("figaro-commerce")]: {
            lineItems: [{ itemId: "item-1", name: "Item", quantity: 1, unitPrice: shape.payment.toString() }],
        },
    }, specSource());
    const commitment: Commitment = {
        processId: shape.processId,
        buyer: buyerAccount.address, seller: sellerAccount.address, token: CURRENCY,
        payment: shape.payment, runningTotal: shape.runningTotal,
        checkoutHash: computeCheckoutHash(agreement), salt: 9n, commitDeadline: 9_999_999_999n,
    };
    return { agreement, commitment };
}

/** The EIP-712 Commitment signature `account` makes over `commitment`, on the
 *  FigaroCore domain of the page's chain. */
function signBy(account: PrivateKeyAccount, commitment: Commitment): Promise<Hex> {
    return account.signTypedData({
        domain: buildDomain(CHAIN_ID, CORE),
        types: COMMITMENT_TYPES,
        primaryType: "Commitment",
        message: commitment,
    });
}

async function run<T>(act_: () => Promise<T>): Promise<{ value?: T; caught?: unknown }> {
    let out: { value?: T; caught?: unknown } = {};
    await act(async () => {
        try { out = { value: await act_() }; } catch (e) { out = { caught: e }; }
    });
    return out;
}

const PATHS = [
    {
        name: "the seller after the buyer, on a root order",
        signer: sellerAccount, counterparty: buyerAccount, counterSigKey: "buyerSig" as const,
        shape: { processId: ZERO_PROCESS_ID as Hex, payment: 100n, runningTotal: 100n },
    },
    {
        name: "the seller after the buyer, on a sub-order",
        signer: sellerAccount, counterparty: buyerAccount, counterSigKey: "buyerSig" as const,
        shape: { processId: `0x${"0f".repeat(32)}` as Hex, payment: 100n, runningTotal: 300n },
    },
    {
        name: "the buyer after the seller",
        signer: buyerAccount, counterparty: sellerAccount, counterSigKey: "sellerSig" as const,
        shape: { processId: ZERO_PROCESS_ID as Hex, payment: 100n, runningTotal: 100n },
    },
];

beforeAll(async () => { await primeClauseSpecs(["figaro-commerce"]); });
beforeEach(() => {
    s.walletPrompts = [];
    confirm.mockClear();
    commitSignedOrder.mockClear();
});

describe.each(PATHS)("acceptOrder — $name", ({ signer, counterparty, counterSigKey, shape }) => {
    function incoming(counterSig: Hex | undefined): CommitmentPayload {
        const { agreement, commitment } = order(shape);
        return { commitment, agreement, ...(counterSig === undefined ? {} : { [counterSigKey]: counterSig }) };
    }

    it("with the counterparty's valid signature, asks the wallet to sign and broadcasts both signatures", async () => {
        s.address = signer.address;
        const { commitment } = order(shape);
        const counterSig = await signBy(counterparty, commitment);
        const { result } = renderHook(() => useOrderCommitmentFlow());
        const { caught } = await run(() => result.current.acceptOrder(incoming(counterSig)));
        expect(caught).toBeUndefined();
        expect(s.walletPrompts).toHaveLength(1);
        expect(s.walletPrompts[0].primaryType).toBe("Commitment");
        expect(s.walletPrompts[0].message).toMatchObject({ processId: shape.processId, buyer: buyerAccount.address, seller: sellerAccount.address });
        expect(commitSignedOrder.mock.calls[0][0].payload[counterSigKey]).toBe(counterSig);
        expect(result.current.step).toBe("done");
    });

    const refused: Array<[string, () => Promise<Hex | undefined>]> = [
        ["a signature by another key", () => signBy(strangerAccount, order(shape).commitment)],
        ["the counterparty's signature over another commitment", () => signBy(counterparty, { ...order(shape).commitment, salt: 10n })],
        ["an empty signature", async () => "0x" as Hex],
        ["no signature", async () => undefined],
    ];
    it.each(refused)("with %s, never asks the wallet and reports the refusal", async (_label, makeSig) => {
        s.address = signer.address;
        const counterSig = await makeSig();
        const { result } = renderHook(() => useOrderCommitmentFlow());
        const { caught } = await run(() => result.current.acceptOrder(incoming(counterSig)));
        expect((caught as Error).message).toBe(REFUSAL);
        expect(s.walletPrompts).toEqual([]);
        expect(confirm).not.toHaveBeenCalled();
        expect(commitSignedOrder).not.toHaveBeenCalled();
        expect(result.current.step).toBe("error");
        expect(result.current.error).toBe(REFUSAL);
    });
});
