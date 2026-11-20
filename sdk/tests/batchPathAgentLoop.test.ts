/**
 * The agent loop on the batch path. The context reads both order emitters
 * and marks each order and process with the path whose contract emitted it;
 * the proposer carries that path on every action; and the executor sends an
 * action of a batched process to a relay, or, with none configured, sends
 * nothing and says so. `FigaroCore` and the attestation coordinator do not
 * know a batched process (docs/SCALING_STRATEGY.md § "The two paths share no
 * state"), so nothing of one ever goes to them.
 *
 * The logs are encoded with the Core's ABI under each emitter's address and
 * read through the real `FigaroContext`. The wallet and the relay's HTTP
 * answers are stood in for; the relay client is the real `SequencerClient`.
 */
import { describe, it, expect, vi } from "vitest";
import {
    encodeAbiParameters, encodeEventTopics, parseAbiParameters,
    type Log, type PublicClient, type WalletClient,
} from "viem";
import { CORE_ABI } from "../src/abis.js";
import { FigaroContext } from "../src/agent/context.js";
import { proposeActions } from "../src/agent/proposer.js";
import type { ResolveProcessAction, AttestAction } from "../src/agent/proposer.js";
import { executeAction } from "../src/agent/autonomous.js";
import { SequencerClient } from "../src/agent/sequencer.js";
import {
    buildDomain, computeCommitmentProcessId, computeOrderHash, orderToCommitment, ZERO_PROCESS_ID,
} from "../src/commitments.js";
import type { Address, Commitment, FigaroAddresses, Hex } from "../src/types.js";

const CORE = "0x00000000000000000000000000000000000c0e00" as Address;
const VERIFIER = "0x0000000000000000000000000000000000ba7c00" as Address;
const COORDINATOR = "0x000000000000000000000000000000000000a77e" as Address;
const BUYER = "0x00000000000000000000000000000000000b0b00" as Address;
const SELLER = "0x0000000000000000000000000000000000005e11" as Address;
const TOKEN = "0x0000000000000000000000000000000000007070" as Address;
const CHAIN = 31337;
const id = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as Hex;
const SIG = `0x${"ab".repeat(64)}1b` as Hex;
const TX = `0x${"11".repeat(32)}` as Hex;

/** A real `OrderCommitted` log under `address`: the root of process `processId`. */
function committed(address: Address, orderHash: Hex, processId: Hex, blockNumber: bigint): Log {
    return {
        address,
        blockNumber,
        logIndex: 0,
        transactionHash: id(0xf0),
        data: encodeAbiParameters(
            parseAbiParameters("address, address, uint256, uint256, bytes32, uint256, uint256"),
            [SELLER, TOKEN, 10n, 10n, id(0xc0), 1n, 2n],
        ),
        topics: encodeEventTopics({ abi: CORE_ABI, eventName: "OrderCommitted", args: { orderHash, processId, buyer: BUYER } }),
    } as unknown as Log;
}

/** Answers each `getLogs` with the logs under the queried address only. */
function twoEmitterClient(allLogs: Log[]): PublicClient {
    const getLogs = vi.fn(async ({ address }: { address: Address }) =>
        allLogs.filter((l) => l.address.toLowerCase() === address.toLowerCase()));
    return { getLogs, getBlockNumber: vi.fn(async () => 50n), getChainId: async () => CHAIN } as unknown as PublicClient;
}

/** A wallet that records every typed-data signature and every write. */
function recordingWallet(address: Address) {
    const signed: Array<{ domain: unknown; primaryType: string; message: Record<string, unknown> }> = [];
    const writes: Array<{ address: Address; functionName: string }> = [];
    const wallet = {
        chain: null,
        account: { address },
        signTypedData: async (req: { domain: unknown; primaryType: string; message: Record<string, unknown> }) => {
            signed.push(req);
            return SIG;
        },
        writeContract: async (req: { address: Address; functionName: string }) => {
            writes.push(req);
            return TX;
        },
    } as unknown as WalletClient;
    return { wallet, signed, writes };
}

/** The real relay client over a recorded HTTP exchange that admits every operation. */
function recordingRelay() {
    const bodies: Array<Record<string, Record<string, unknown>>> = [];
    const urls: string[] = [];
    const relay = new SequencerClient({
        url: "http://relay.test",
        fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
            urls.push(String(input));
            bodies.push(JSON.parse(String(init?.body)).operation);
            return new Response(JSON.stringify({ id: 7 }), { status: 200 });
        }) as typeof globalThis.fetch,
    });
    return { relay, bodies, urls };
}

const BOTH: FigaroAddresses = { core: CORE, batchVerifier: VERIFIER, attestationCoordinator: COORDINATOR };

/** A context synced over one direct root (process 1) and one batched root (process 2). */
async function syncedContext(addresses: FigaroAddresses = BOTH): Promise<FigaroContext> {
    const ctx = new FigaroContext(twoEmitterClient([
        committed(CORE, id(0x11), id(1), 3n),
        committed(VERIFIER, id(0x22), id(2), 4n),
    ]), addresses);
    await ctx.sync();
    return ctx;
}

describe("FigaroContext marks each order and process with the path that emitted it", () => {
    it("the Core's commit is on the direct path, the verifier's on the batch path", async () => {
        const ctx = await syncedContext();
        expect(ctx.getProcess(id(1))!.path).toBe("direct");
        expect(ctx.getOrder(id(0x11))!.path).toBe("direct");
        expect(ctx.getProcess(id(2))!.path).toBe("batch");
        expect(ctx.getOrder(id(0x22))!.path).toBe("batch");
        expect(ctx.getProcessBriefing(id(2))!.path).toBe("batch");
    });

    it("with no batch verifier configured, only the Core is read and every process is on the direct path", async () => {
        const ctx = await syncedContext({ core: CORE });
        expect(ctx.getProcess(id(1))!.path).toBe("direct");
        expect(ctx.getProcess(id(2))).toBeUndefined();
    });
});

describe("proposeActions carries the process's path on every action", () => {
    it("a batched process: resolve and attest, each marked batch", async () => {
        const ctx = await syncedContext();
        const buyerActions = proposeActions(ctx.getProcess(id(2))!, BUYER);
        expect(buyerActions.map((a) => [a.type, a.path])).toEqual([["resolve-process", "batch"], ["attest-as-buyer", "batch"]]);
        const sellerActions = proposeActions(ctx.getProcess(id(2))!, SELLER);
        expect(sellerActions.map((a) => [a.type, a.path])).toEqual([["attest-as-seller", "batch"]]);
    });

    it("a direct process: the same actions, each marked direct", async () => {
        const ctx = await syncedContext();
        expect(proposeActions(ctx.getProcess(id(1))!, BUYER).map((a) => a.path)).toEqual(["direct", "direct"]);
    });
});

/** A batched root order, as the verifier emits it: its process id is the
 *  commitment's digest under the verifier's domain. */
function batchedRoot(): { signed: Commitment; asEvent: Commitment; processId: Hex } {
    const ctx = { processId: ZERO_PROCESS_ID, buyer: BUYER, seller: SELLER, token: TOKEN, payment: 10n, runningTotal: 10n, checkoutHash: id(0xc0), salt: 1n, commitDeadline: 2n };
    const processId = computeCommitmentProcessId(ctx, CHAIN, VERIFIER);
    return { signed: ctx, asEvent: { ...ctx, processId }, processId };
}

const chainPub = { getChainId: async () => CHAIN } as unknown as PublicClient;

describe("executeAction on a batched process", () => {
    it("with a relay: the buyer's resolve is signed under the verifier's domain and sent to the relay, never to FigaroCore", async () => {
        const { signed, asEvent, processId } = batchedRoot();
        const action = { type: "resolve-process", description: "", path: "batch", processId, caller: BUYER, commitments: [asEvent], settlements: [], totalBuyerPayout: 0n, totalSellerPayout: 0n } as ResolveProcessAction;
        const { wallet, signed: sigs, writes } = recordingWallet(BUYER);
        const { relay, bodies, urls } = recordingRelay();

        const result = await executeAction(wallet, chainPub, BOTH, action, {}, { relay });

        expect(result).toEqual({ sent: "relay", operationId: 7 });
        expect(writes).toEqual([]);
        expect(sigs).toHaveLength(1);
        expect(sigs[0].primaryType).toBe("ResolveProcess");
        expect(sigs[0].domain).toEqual(buildDomain(CHAIN, VERIFIER));
        expect(sigs[0].message).toEqual({ processId, runningTotal: 10n });
        expect(urls).toEqual(["http://relay.test/submit"]);
        const op = bodies[0].Resolve;
        expect(op.process_id).toBe(processId);
        expect(op.running_total).toBe("10");
        // The root is restored to the processId 0 its parties signed.
        expect((op.commitments as Array<{ process_id: Hex }>)[0].process_id).toBe(signed.processId);
    });

    it("with a relay: the seller's attestation is signed for the verifier's order id and sent to the relay, never to the coordinator", async () => {
        const { signed, processId } = batchedRoot();
        const action = { type: "attest-as-seller", description: "", path: "batch", processId, attester: SELLER, orderHashes: [] } as AttestAction;
        const attestation = { target: signed, clauseId: id(0xdd), stage: 1, clauseDataHash: id(0xcd), proof: [id(0x99)], contentRef: id(0xce) };
        const { wallet, signed: sigs, writes } = recordingWallet(SELLER);
        const { relay, bodies } = recordingRelay();

        const result = await executeAction(wallet, chainPub, BOTH, action, { attestation }, { relay });

        expect(result).toEqual({ sent: "relay", operationId: 7 });
        expect(writes).toEqual([]);
        expect(sigs[0].primaryType).toBe("AttestSeller");
        expect(sigs[0].domain).toEqual(buildDomain(CHAIN, VERIFIER));
        expect(sigs[0].message).toEqual({ orderHash: computeOrderHash(signed, CHAIN, VERIFIER), clauseId: id(0xdd), stage: 1, contentRef: id(0xce) });
        const op = bodies[0].AttestAsSeller;
        expect(op.clause_id).toBe(id(0xdd));
        expect(op.content_ref).toBe(id(0xce));
        expect(op.proof).toEqual({ HashOnly: { clause_data_hash: id(0xcd), inclusion_proof: [id(0x99)] } });
    });

    it("with a relay: the buyer's attestation names the verifier's process id and goes to the relay", async () => {
        const { signed, processId } = batchedRoot();
        const action = { type: "attest-as-buyer", description: "", path: "batch", processId, attester: BUYER, orderHashes: [] } as AttestAction;
        const attestation = { target: signed, clauseId: id(0xdd), stage: 2, clauseDataHash: id(0xcd), proof: [], contentRef: id(0xce) };
        const { wallet, signed: sigs, writes } = recordingWallet(BUYER);
        const { relay, bodies } = recordingRelay();

        await executeAction(wallet, chainPub, BOTH, action, { attestation }, { relay });

        expect(writes).toEqual([]);
        expect(sigs[0].primaryType).toBe("AttestBuyer");
        expect(sigs[0].message.processId).toBe(processId);
        expect(Object.keys(bodies[0])).toEqual(["AttestAsBuyer"]);
    });

    it("without a relay: nothing is signed or sent, and the result says the process is on the batch path", async () => {
        const { asEvent, processId } = batchedRoot();
        const resolve = { type: "resolve-process", description: "", path: "batch", processId, caller: BUYER, commitments: [asEvent], settlements: [], totalBuyerPayout: 0n, totalSellerPayout: 0n } as ResolveProcessAction;
        const attest = { type: "attest-as-seller", description: "", path: "batch", processId, attester: SELLER, orderHashes: [] } as AttestAction;
        const { wallet, signed: sigs, writes } = recordingWallet(BUYER);

        for (const action of [resolve, attest]) {
            const result = await executeAction(wallet, chainPub, BOTH, action);
            expect(result.sent).toBe("nothing");
            if (result.sent === "nothing") {
                expect(result.reason).toBe("batch-path-without-relay");
                expect(result.detail).toMatch(/batch path/);
            }
        }
        expect(writes).toEqual([]);
        expect(sigs).toEqual([]);
    });

    it("a direct process: the resolve is written to FigaroCore as before, and the relay is not asked", async () => {
        const root = orderToCommitment({ orderHash: id(0x11), processId: ZERO_PROCESS_ID, buyer: BUYER, seller: SELLER, token: TOKEN, payment: 10n, runningTotal: 10n, checkoutHash: id(0xc0), salt: 1n, commitDeadline: 2n, state: 0, blockNumber: 1 });
        const derived = computeCommitmentProcessId(root, CHAIN, CORE);
        const action = { type: "resolve-process", description: "", path: "direct", processId: derived, caller: BUYER, commitments: [{ ...root, processId: derived }], settlements: [], totalBuyerPayout: 0n, totalSellerPayout: 0n } as ResolveProcessAction;
        const { wallet, signed: sigs, writes } = recordingWallet(BUYER);
        const { relay, urls } = recordingRelay();

        const result = await executeAction(wallet, chainPub, BOTH, action, {}, { relay });

        expect(result).toEqual({ sent: "transaction", hash: TX });
        expect(writes.map((w) => [w.address, w.functionName])).toEqual([[CORE, "resolveProcess"]]);
        expect(sigs).toEqual([]);
        expect(urls).toEqual([]);
    });
});
