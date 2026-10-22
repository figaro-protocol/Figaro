import { describe, it, expect } from "vitest";
import type { WalletClient, PublicClient } from "viem";
import { executeAction } from "../src/agent/autonomous.js";
import { orderToCommitment, restoreSignedProcessId, computeCommitmentProcessId, ZERO_PROCESS_ID } from "../src/commitments.js";
import { OrderState } from "../src/types.js";
import type { Order, Commitment, FigaroAddresses, Address, Hex } from "../src/types.js";
import type { InitiateProcessAction, ResolveProcessAction, AttestAction } from "../src/agent/proposer.js";

const CORE = "0x000000000000000000000000000000000000c0de" as Address;
const BUYER = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
const SELLER = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;
const TOKEN = "0xcccccccccccccccccccccccccccccccccccccccc" as Address;
const AGREEMENT = "0x00000000000000000000000000000000000000000000000000000000000a9ee1" as Hex;
const CHAIN = 31337;

const addresses: FigaroAddresses = { core: CORE };
// executeAction throws BEFORE touching either client on every input-missing path.
const wallet = {} as unknown as WalletClient;
const pub = {} as unknown as PublicClient;

function mkOrder(overrides: Partial<Order> = {}): Order {
    return {
        orderHash: "0x0000000000000000000000000000000000000000000000000000000000000001" as Hex,
        processId: "0x0000000000000000000000000000000000000000000000000000000000000009" as Hex,
        buyer: BUYER,
        seller: SELLER,
        currency: TOKEN,
        payment: 100n,
        cumulativeValue: 250n,
        checkoutHash: AGREEMENT,
        salt: 7n,
        deadline: 999n,
        state: OrderState.Active,
        blockNumber: 1,
        ...overrides,
    };
}

describe("orderToCommitment", () => {
    it("maps every Commitment field, with expectedCumulativeValue = cumulativeValue", () => {
        const c = orderToCommitment(mkOrder());
        expect(c.buyer).toBe(BUYER);
        expect(c.seller).toBe(SELLER);
        expect(c.payment).toBe(100n);
        expect(c.expectedCumulativeValue).toBe(250n);
        expect(c.salt).toBe(7n);
        expect(c.deadline).toBe(999n);
    });
});

describe("restoreSignedProcessId", () => {
    it("recovers a root's signed processId=0 from its derived id", () => {
        const root: Commitment = orderToCommitment(mkOrder({ processId: ZERO_PROCESS_ID }));
        const derived = computeCommitmentProcessId(root, CHAIN, CORE);
        expect(derived).not.toBe(ZERO_PROCESS_ID);
        // The event/order would carry the derived id — restore should undo it.
        const asEvent: Commitment = { ...root, processId: derived };
        expect(restoreSignedProcessId(asEvent, CHAIN, CORE).processId).toBe(ZERO_PROCESS_ID);
    });

    it("leaves a genuine sub-order (processId != its as-root digest) unchanged", () => {
        const sub: Commitment = orderToCommitment(mkOrder({
            processId: "0x1111111111111111111111111111111111111111111111111111111111111111" as Hex,
        }));
        expect(restoreSignedProcessId(sub, CHAIN, CORE).processId).toBe(sub.processId);
    });
});

describe("executeAction — honest input gates (never fabricate)", () => {
    it("throws on resolve-process with no commitments", async () => {
        const action = { type: "resolve-process", processId: "0x09" as Hex, caller: BUYER, commitments: [], settlements: [], totalBuyerPayout: 0n, totalSellerPayout: 0n } as ResolveProcessAction;
        await expect(executeAction(wallet, pub, addresses, action)).rejects.toThrow(/no commitments/i);
    });

    it("throws on initiate-process without a counterparty signature", async () => {
        const action = { type: "initiate-process", processId: ZERO_PROCESS_ID, buyer: BUYER, assemblyHash: "0xab" as Hex, contentURI: "ipfs://x", registeredBy: SELLER } as InitiateProcessAction;
        await expect(executeAction(wallet, pub, addresses, action)).rejects.toThrow(/two-party handshake|counterparty/i);
    });

    it("throws on attest-as-seller without the merkle payload", async () => {
        const action = { type: "attest-as-seller", processId: "0x09" as Hex, attester: SELLER, orderHashes: [] } as AttestAction;
        await expect(executeAction(wallet, pub, addresses, action)).rejects.toThrow(/inputs\.attestation/i);
    });

    it("files attest-as-seller against the target order alone, the seller's own order", async () => {
        const action = { type: "attest-as-seller", processId: "0x09" as Hex, attester: SELLER, orderHashes: [] } as AttestAction;
        const target = orderToCommitment(mkOrder());
        const attestation = { target, clauseId: "0xdd" as Hex, stage: 1, clauseDataHash: `0x${"00".repeat(32)}` as Hex, proof: [], contentRef: `0x${"00".repeat(32)}` as Hex };
        const calls: { functionName: string; args: readonly unknown[] }[] = [];
        const recordingWallet = {
            chain: null,
            account: SELLER,
            writeContract: async (req: { functionName: string; args: readonly unknown[] }) => {
                calls.push(req);
                return `0x${"11".repeat(32)}` as Hex;
            },
        } as unknown as WalletClient;
        const withCoordinator: FigaroAddresses = { core: CORE, attestationCoordinator: "0x000000000000000000000000000000000000a77e" as Address };
        await executeAction(recordingWallet, pub, withCoordinator, action, { attestation });
        expect(calls).toHaveLength(1);
        expect(calls[0].functionName).toBe("attestAsSeller");
        expect(calls[0].args).toEqual([target, "0xdd", 1, attestation.clauseDataHash, [], attestation.contentRef]);
    });

    it("throws on attest when the coordinator address is unconfigured", async () => {
        const action = { type: "attest-as-buyer", processId: "0x09" as Hex, attester: BUYER, orderHashes: [] } as AttestAction;
        const attestation = { target: orderToCommitment(mkOrder()), clauseId: "0xdd" as Hex, stage: 1, clauseDataHash: `0x${"00".repeat(32)}` as Hex, proof: [], contentRef: `0x${"00".repeat(32)}` as Hex };
        await expect(executeAction(wallet, pub, addresses, action, { attestation })).rejects.toThrow(/attestationCoordinator/i);
    });
});
