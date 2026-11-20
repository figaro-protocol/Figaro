/**
 * The analyst's sync reads both paths: a trade resolved on `FigaroCore` and a
 * trade resolved in a batch on `FigaroBatchVerifier` land in one corpus.
 *
 * The verifier emits the Core's own `OrderCommitted`, `OrderResolved` and
 * `ProcessResolved` for every batched order under its own address, and
 * re-emits a batched attestation as the coordinator's `Attestation`. The two
 * paths share no state, so a sync that reads the Core and the coordinator
 * alone loses every batched trade.
 *
 * Here a local JSON-RPC node answers `eth_blockNumber` and `eth_getLogs` from
 * raw logs (topics and ABI-encoded data), each filtered by the address the
 * request names, so `syncCorpus` runs as shipped: its own client, the SDK's
 * readers, the projections and the answers. Nothing is fetched from a
 * gateway (`recoverSubstance: false`), and the record names no swap
 * coordinator, so no receipt is read.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as http from "node:http";
import { encodeAbiParameters, encodeEventTopics, toHex } from "viem";
import { ATTESTATION_COORDINATOR_ABI, CORE_ABI } from "@figaro-protocol/sdk";
import { corpusStatus, corroborateEndpoints, syncCorpus, tradeStory, walletRecordAnswer } from "../analyst.mjs";

const CORE = "0x000000000000000000000000000000000000c0de";
const COORDINATOR = "0x000000000000000000000000000000000000a77e";
const VERIFIER = "0x000000000000000000000000000000000000ba7c";
const BUYER = "0x1111111111111111111111111111111111111111";
const SELLER = "0x2222222222222222222222222222222222222222";
const TOKEN = "0x4444444444444444444444444444444444444444";
const CLAUSE_KEY = `0x${"cc".repeat(32)}`;
const word = (n) => `0x${n.toString(16).padStart(64, "0")}`;

const DIRECT_PROCESS = word(0xd1);
const DIRECT_ORDER = word(0xd2);
const BATCH_PROCESS = word(0xb1);
const BATCH_ORDER = word(0xb2);
const LATEST = 40n;

/** One raw log of `eventName`, as a node returns it. */
function raw(address, abi, eventName, args, blockNumber, logIndex, txIndex) {
    const item = abi.find((x) => x.type === "event" && x.name === eventName);
    const unindexed = item.inputs.filter((i) => !i.indexed);
    return {
        address,
        topics: encodeEventTopics({ abi: [item], eventName, args }),
        data: encodeAbiParameters(unindexed, unindexed.map((i) => args[i.name])),
        blockNumber: toHex(blockNumber),
        logIndex: toHex(logIndex),
        transactionHash: word(0xf000 + txIndex),
        transactionIndex: "0x0",
        blockHash: word(blockNumber),
        removed: false,
    };
}

/** One trade on a path: its commit, an attestation by the seller, and the
 *  buyer's resolution, each from that path's emitters. */
function trade({ orderEmitter, attestationEmitter, processId, orderHash, payment, at }) {
    return [
        raw(orderEmitter, CORE_ABI, "OrderCommitted", {
            orderHash, processId, buyer: BUYER, seller: SELLER, token: TOKEN, payment,
            runningTotal: payment, checkoutHash: word(0xee), salt: 1n, commitDeadline: 9_999_999_999n,
        }, at, 0, at),
        raw(attestationEmitter, ATTESTATION_COORDINATOR_ABI, "Attestation", {
            orderHash, processId, attester: SELLER, clauseId: CLAUSE_KEY, stage: 1, contentRef: word(0xabc0 + at),
        }, at + 1, 0, at + 1),
        raw(orderEmitter, CORE_ABI, "OrderResolved", {
            orderHash, processId, sellerPayout: 3n * payment, buyerPayout: payment,
        }, at + 2, 0, at + 2),
        raw(orderEmitter, CORE_ABI, "ProcessResolved", { processId, buyer: BUYER, orderCount: 1n }, at + 2, 1, at + 2),
    ];
}

const LOGS = [
    ...trade({ orderEmitter: CORE, attestationEmitter: COORDINATOR, processId: DIRECT_PROCESS, orderHash: DIRECT_ORDER, payment: 100n, at: 10 }),
    // On the batch path the verifier emits the order events and the attestation.
    ...trade({ orderEmitter: VERIFIER, attestationEmitter: VERIFIER, processId: BATCH_PROCESS, orderHash: BATCH_ORDER, payment: 70n, at: 20 }),
];

let server;
let rpcUrl;
const asked = [];

before(async () => {
    server = http.createServer((req, res) => {
        let body = "";
        req.on("data", (c) => { body += c; });
        req.on("end", () => {
            const calls = JSON.parse(body);
            const answer = (call) => {
                if (call.method === "eth_blockNumber") return toHex(LATEST);
                if (call.method === "eth_chainId") return toHex(31337);
                if (call.method === "eth_getLogs") {
                    const { address, fromBlock, toBlock } = call.params[0];
                    asked.push(String(address).toLowerCase());
                    return LOGS.filter((l) => l.address.toLowerCase() === String(address).toLowerCase()
                        && BigInt(l.blockNumber) >= BigInt(fromBlock) && BigInt(l.blockNumber) <= BigInt(toBlock));
                }
                throw new Error(`unexpected ${call.method}`);
            };
            const reply = (call) => {
                try { return { jsonrpc: "2.0", id: call.id, result: answer(call) }; }
                catch (e) { return { jsonrpc: "2.0", id: call.id, error: { code: -32601, message: e.message } }; }
            };
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify(Array.isArray(calls) ? calls.map(reply) : reply(calls)));
        });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    rpcUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

const RECORD = {
    chainId: 31337,
    deploymentBlock: 0,
    figaroCore: CORE,
    attestationCoordinator: COORDINATOR,
    batchVerifier: VERIFIER,
};

test("the sync reads the verifier's order events and attestations beside the Core's and the coordinator's", async () => {
    asked.length = 0;
    const corpus = await syncCorpus({ rpcUrl, deploymentRecord: RECORD, recoverSubstance: false, gateways: [] });
    for (const address of [CORE, COORDINATOR, VERIFIER]) {
        assert.ok(asked.includes(address), `the sync asked the node for ${address}'s logs`);
    }
    const status = corpusStatus(corpus);
    assert.equal(status.orderCommitted, 2, "one commit on each path");
    assert.equal(status.orderResolved, 2, "one order resolution on each path");
    assert.equal(status.processResolved, 2, "one process resolution on each path");
    assert.deepEqual(status.attestationsByUniverse, { direct: 1, batch: 1 });
    // Matched as a set: the order of two events within one order is the
    // emitter's, and nothing here reads it.
    assert.deepEqual(
        new Set(corpus.core.orderCommitted.map((o) => o.orderHash)),
        new Set([DIRECT_ORDER, BATCH_ORDER]),
    );
});

test("the batched process answers trade-story as the direct one does: resolved, with the chain's payouts and its attestation tagged batch", async () => {
    const corpus = await syncCorpus({ rpcUrl, deploymentRecord: RECORD, recoverSubstance: false, gateways: [] });
    const direct = tradeStory(corpus, DIRECT_PROCESS);
    const batched = tradeStory(corpus, BATCH_PROCESS);
    for (const [story, payment, universe] of [[direct, 100n, "direct"], [batched, 70n, "batch"]]) {
        assert.equal(story.found, true, `the ${universe} process is in the corpus`);
        assert.equal(story.resolution.resolved, true, `the ${universe} process reads as resolved`);
        assert.equal(story.resolution.orders.length, 1);
        assert.equal(story.resolution.orders[0].sellerPayout, String(3n * payment));
        assert.equal(story.resolution.orders[0].lockedBuyerBond, String(2n * payment));
    }
    const attested = corpus.attestations.find((a) => a.processId === BATCH_PROCESS);
    assert.equal(attested.universe, "batch", "the batched attestation is tagged by its emitter");
});

test("wallet-record lists the seller's orders on both paths", async () => {
    const corpus = await syncCorpus({ rpcUrl, deploymentRecord: RECORD, recoverSubstance: false, gateways: [] });
    const seller = walletRecordAnswer(corpus, SELLER);
    assert.deepEqual(new Set(seller.ordersAsSeller.map((o) => o.orderHash)), new Set([DIRECT_ORDER, BATCH_ORDER]));
    const buyer = walletRecordAnswer(corpus, BUYER);
    assert.equal(buyer.processesAsRootBuyer.length, 2, "the buyer's two processes, one on each path");
});

test("a record with no batch verifier reads the direct path alone: the batched trade is absent, never misread", async () => {
    const { batchVerifier: _omitted, ...directOnly } = RECORD;
    const corpus = await syncCorpus({ rpcUrl, deploymentRecord: directOnly, recoverSubstance: false, gateways: [] });
    assert.equal(corpusStatus(corpus).orderCommitted, 1);
    assert.equal(tradeStory(corpus, BATCH_PROCESS).found, false);
});

test("the corroboration of endpoints covers the batch verifier when the record names it", async () => {
    const report = await corroborateEndpoints({
        endpoints: [rpcUrl, rpcUrl],
        addresses: { core: CORE, attestationCoordinator: COORDINATOR, batchVerifier: VERIFIER },
        fromBlock: 0n,
        toBlock: LATEST,
    });
    assert.deepEqual(Object.keys(report.perContract), ["core", "attestationCoordinator", "batchVerifier"]);
    assert.equal(report.perContract.batchVerifier.verdict, "agree");
    assert.equal(report.perContract.batchVerifier.unionCount, 4, "the verifier's commit, attestation and two resolution logs");
});
