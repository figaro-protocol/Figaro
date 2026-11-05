import { describe, it, expect } from "vitest";
import { keccak256, type WalletClient, type PublicClient } from "viem";
import { executeAction, commit, resolveProcess, attestAsBuyer, prepareAttestationContent } from "../src/agent/autonomous.js";
import { CORE_ABI, ATTESTATION_COORDINATOR_ABI } from "../src/abis.js";
import { parseClauseSpec, encodeContentFromSpec } from "../src/clauses/index.js";
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
const COORDINATOR = "0x000000000000000000000000000000000000a77e" as Address;
const TX = `0x${"11".repeat(32)}` as Hex;

/** One `writeContract` request as the SDK sends it. */
interface WriteRequest {
    chain: unknown;
    account: unknown;
    address: Address;
    abi: unknown;
    functionName: string;
    args: readonly unknown[];
}

/** A wallet that records every write and answers with `TX`; `account` is
 *  what the SDK reads as `walletClient.account`. */
function recordingWallet(account: { address: Address } | undefined): { wallet: WalletClient; calls: WriteRequest[] } {
    const calls: WriteRequest[] = [];
    const wallet = {
        chain: null,
        account,
        writeContract: async (req: WriteRequest) => {
            calls.push(req);
            return TX;
        },
    } as unknown as WalletClient;
    return { wallet, calls };
}

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
        const { wallet: sellerWallet, calls } = recordingWallet({ address: SELLER });
        const withCoordinator: FigaroAddresses = { core: CORE, attestationCoordinator: COORDINATOR };
        await executeAction(sellerWallet, pub, withCoordinator, action, { attestation });
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

const BUYER_SIG = `0x${"b1".repeat(65)}` as Hex;
const SELLER_SIG = `0x${"5e".repeat(65)}` as Hex;
const PROCESS = "0x0000000000000000000000000000000000000000000000000000000000000009" as Hex;

/** The resolve-cap reads `assertOrderFitsResolveCap` makes for a sub-order:
 *  the chain's gas limit and FigaroCore's `processes(id)` tuple, whose last
 *  word is the live process's active order count. */
function capReader(activeOrderCount: bigint): PublicClient {
    return {
        getBlock: async () => ({ gasLimit: 30_000_000n }),
        readContract: async () => [BUYER, TOKEN, 0n, activeOrderCount],
    } as unknown as PublicClient;
}

describe("commit — the SDK's FigaroCore.commit write", () => {
    it("writes commit(commitment, buyerSig, sellerSig) to FigaroCore and returns the hash", async () => {
        const { wallet: buyerWallet, calls } = recordingWallet({ address: BUYER });
        const root = orderToCommitment(mkOrder({ processId: ZERO_PROCESS_ID }));
        // A root (processId 0) opens a new process: the cap check reads nothing.
        const result = await commit(buyerWallet, pub, CORE, root, BUYER_SIG, SELLER_SIG);
        expect(result).toEqual({ hash: TX });
        expect(calls).toHaveLength(1);
        expect(calls[0].address).toBe(CORE);
        expect(calls[0].abi).toBe(CORE_ABI);
        expect(calls[0].functionName).toBe("commit");
        expect(calls[0].args).toEqual([root, BUYER_SIG, SELLER_SIG]);
    });

    it("writes a sub-order into a process below the resolve ceiling", async () => {
        const { wallet: buyerWallet, calls } = recordingWallet({ address: BUYER });
        const sub = orderToCommitment(mkOrder());
        await commit(buyerWallet, capReader(10n), CORE, sub, BUYER_SIG, SELLER_SIG);
        expect(calls.map((c) => c.functionName)).toEqual(["commit"]);
        expect(calls[0].args).toEqual([sub, BUYER_SIG, SELLER_SIG]);
    });

    it("refuses, and writes nothing, a sub-order that would leave the process unresolvable", async () => {
        const { wallet: buyerWallet, calls } = recordingWallet({ address: BUYER });
        const sub = orderToCommitment(mkOrder());
        await expect(commit(buyerWallet, capReader(546n), CORE, sub, BUYER_SIG, SELLER_SIG))
            .rejects.toThrow(/permanently unresolvable/);
        expect(calls).toHaveLength(0);
    });
});

describe("resolveProcess — the buyer-only FigaroCore.resolveProcess write", () => {
    const commitments = [orderToCommitment(mkOrder())];

    it("writes resolveProcess(processId, commitments) to FigaroCore from the rootBuyer", async () => {
        const { wallet: buyerWallet, calls } = recordingWallet({ address: BUYER });
        const result = await resolveProcess(buyerWallet, CORE, PROCESS, commitments);
        expect(result).toEqual({ hash: TX });
        expect(calls).toHaveLength(1);
        expect(calls[0].address).toBe(CORE);
        expect(calls[0].abi).toBe(CORE_ABI);
        expect(calls[0].functionName).toBe("resolveProcess");
        expect(calls[0].args).toEqual([PROCESS, commitments]);
    });

    it("matches the rootBuyer whatever the address's letter case", async () => {
        const checksummed = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" as Address;
        const { wallet: buyerWallet, calls } = recordingWallet({ address: checksummed });
        await resolveProcess(buyerWallet, CORE, PROCESS, commitments);
        expect(calls.map((c) => c.functionName)).toEqual(["resolveProcess"]);
    });

    it("refuses a wallet that is not the rootBuyer, and writes nothing", async () => {
        const { wallet: sellerWallet, calls } = recordingWallet({ address: SELLER });
        await expect(resolveProcess(sellerWallet, CORE, PROCESS, commitments))
            .rejects.toThrow(`wallet account ${SELLER} is not the rootBuyer ${BUYER}`);
        expect(calls).toHaveLength(0);
    });

    it("refuses a wallet with no account, and writes nothing", async () => {
        const { wallet: noAccount, calls } = recordingWallet(undefined);
        await expect(resolveProcess(noAccount, CORE, PROCESS, commitments))
            .rejects.toThrow(/wallet account \(none\) is not the rootBuyer/);
        expect(calls).toHaveLength(0);
    });
});

describe("attestAsBuyer — the buyer's AttestationCoordinator write", () => {
    it("writes attestAsBuyer(target, clauseId, stage, clauseDataHash, proof, contentRef) to the coordinator", async () => {
        const { wallet: buyerWallet, calls } = recordingWallet({ address: BUYER });
        const target = orderToCommitment(mkOrder());
        const clauseDataHash = `0x${"cd".repeat(32)}` as Hex;
        const contentRef = `0x${"ce".repeat(32)}` as Hex;
        const proof = [`0x${"01".repeat(32)}` as Hex];
        const result = await attestAsBuyer(buyerWallet, COORDINATOR, target, "0xdd", 2, clauseDataHash, proof, contentRef);
        expect(result).toEqual({ hash: TX });
        expect(calls).toHaveLength(1);
        expect(calls[0].address).toBe(COORDINATOR);
        expect(calls[0].abi).toBe(ATTESTATION_COORDINATOR_ABI);
        expect(calls[0].functionName).toBe("attestAsBuyer");
        expect(calls[0].args).toEqual([target, "0xdd", 2, clauseDataHash, proof, contentRef]);
    });
});

describe("executeAction — the success paths reach the writes", () => {
    it("resolve-process restores a root's signed processId 0 before writing resolveProcess", async () => {
        const root = orderToCommitment(mkOrder({ processId: ZERO_PROCESS_ID }));
        const derived = computeCommitmentProcessId(root, CHAIN, CORE);
        // The proposer reconstructs commitments from events, which carry the DERIVED id.
        const asEvent: Commitment = { ...root, processId: derived };
        const action = { type: "resolve-process", description: "", processId: derived, caller: BUYER, commitments: [asEvent], settlements: [], totalBuyerPayout: 0n, totalSellerPayout: 0n } as ResolveProcessAction;
        const { wallet: buyerWallet, calls } = recordingWallet({ address: BUYER });
        const chainPub = { getChainId: async () => CHAIN } as unknown as PublicClient;
        await executeAction(buyerWallet, chainPub, addresses, action);
        expect(calls).toHaveLength(1);
        expect(calls[0].functionName).toBe("resolveProcess");
        expect(calls[0].args).toEqual([derived, [root]]);
    });

    it("initiate-process writes commit with the given commitment and both signatures", async () => {
        const action = { type: "initiate-process", processId: ZERO_PROCESS_ID, buyer: BUYER, assemblyHash: "0xab" as Hex, contentURI: "ipfs://x", registeredBy: SELLER } as InitiateProcessAction;
        const root = orderToCommitment(mkOrder({ processId: ZERO_PROCESS_ID }));
        const { wallet: buyerWallet, calls } = recordingWallet({ address: BUYER });
        await executeAction(buyerWallet, pub, addresses, action, { commitment: root, buyerSig: BUYER_SIG, sellerSig: SELLER_SIG });
        expect(calls).toHaveLength(1);
        expect(calls[0].functionName).toBe("commit");
        expect(calls[0].args).toEqual([root, BUYER_SIG, SELLER_SIG]);
    });

    it("attest-as-buyer writes attestAsBuyer to the configured coordinator", async () => {
        const action = { type: "attest-as-buyer", description: "", processId: "0x09" as Hex, attester: BUYER, orderHashes: [] } as AttestAction;
        const target = orderToCommitment(mkOrder());
        const attestation = { target, clauseId: "0xdd" as Hex, stage: 1, clauseDataHash: `0x${"cd".repeat(32)}` as Hex, proof: [], contentRef: `0x${"ce".repeat(32)}` as Hex };
        const { wallet: buyerWallet, calls } = recordingWallet({ address: BUYER });
        await executeAction(buyerWallet, pub, { core: CORE, attestationCoordinator: COORDINATOR }, action, { attestation });
        expect(calls).toHaveLength(1);
        expect(calls[0].address).toBe(COORDINATOR);
        expect(calls[0].functionName).toBe("attestAsBuyer");
        expect(calls[0].args).toEqual([target, "0xdd", 1, attestation.clauseDataHash, [], attestation.contentRef]);
    });
});

describe("prepareAttestationContent — the headless attestation preflight", () => {
    // A clause family no Figaro surface names: the preflight reads the spec it is given.
    const parsed = parseClauseSpec({
        clauseId: "acme-dock-log",
        version: 1,
        title: "Dock log",
        description: "Third-party clause family invented for this test.",
        fields: [{ name: "bay", type: "integer", required: true, min: 1, max: 40 }],
        stages: { 2: [{ name: "checkpoint", type: "string", required: true, minLength: 1, maxLength: 64 }] },
    });
    if (!parsed.ok) throw new Error("test spec failed to parse");
    const spec = parsed.spec;

    it("encodes valid content canonically and fingerprints it with keccak256", () => {
        const { content, contentRef } = prepareAttestationContent(spec, { bay: 7 });
        expect(content).toBe(encodeContentFromSpec(spec, { bay: 7 }));
        expect(contentRef).toBe(keccak256(content));
    });

    it("validates and encodes against the stage's field set when a stage is given", () => {
        const { content, contentRef } = prepareAttestationContent(spec, { checkpoint: "gate-3" }, { stage: 2 });
        expect(content).toBe(encodeContentFromSpec(spec, { checkpoint: "gate-3" }, { stage: 2 }));
        expect(contentRef).toBe(keccak256(content));
        // The stage's shape is not the base shape: the base fields are not asked for.
        expect(() => prepareAttestationContent(spec, { checkpoint: "gate-3" })).toThrow(/bay/);
    });

    it("throws naming the failing path rather than encode invalid content", () => {
        expect(() => prepareAttestationContent(spec, { bay: 99 })).toThrow(/bay/);
        expect(() => prepareAttestationContent(spec, {}, { stage: 2 })).toThrow(/checkpoint/);
    });
});
