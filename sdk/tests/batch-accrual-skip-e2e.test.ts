/**
 * E2E: a batch whose call to the counter is refused whole, then a later batch
 * that counts the same use.
 *
 * The relay reads the open period from `UsageCounter.currentPeriod()` when it
 * assembles a batch. A batch assembled in period 0 that lands after period 0
 * ends is refused by the counter (`PeriodMismatch`); the verifier catches the
 * refusal, lands the batch's tokens and emits `BatchAccrualSkipped`. The use
 * stays uncounted, `fetchSkippedBatchUses` reads its claim back from the
 * verifier's logs, and the claim sent again rides a later batch that the
 * counter counts in period 1. Every fact is read from the chain.
 *
 * The test moves the chain's clock and holds a transaction in the mempool, so
 * it runs on an Anvil of its own, started here, never on a shared chain.
 *
 * Requires:
 *   - the `anvil` binary on the PATH
 *   - the sequencer binary at prover/target/release/sequencer
 *   - the contracts built into out/ (`forge build`)
 *
 * A missing prerequisite fails the file at collection, with the prerequisite
 * named. `npm test` does not select this file; `npm run test:chain` does.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
    createPublicClient,
    createTestClient,
    createWalletClient,
    encodePacked,
    hashTypedData,
    http,
    keccak256,
    parseAbi,
    stringToHex,
    type Address,
    type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
    BATCH_VERIFIER_ABI,
    USAGE_COUNTER_ABI,
    USAGE_KIND_CLAUSE,
    buildCommitment,
    buildDomain,
    buildUsageClaims,
    calculateBonds,
    computeCheckoutHash,
    computeDeadline,
    fetchSkippedBatchUses,
    fetchUsageClaimContext,
    readChainTimestamp,
    type Agreement,
} from "../src/index.js";
import { SequencerClient } from "../src/agent/sequencer.js";

import {
    MOCK_ERC20_ABI,
    attachLogs,
    deployBatchStack,
    loadSpecJson,
    requireAnvilBinary,
    requireSequencerBinary,
    startSequencer,
    stopSequencer,
    waitForBatchCount,
    waitForSequencer,
} from "./batchHarness.js";

requireAnvilBinary();
requireSequencerBinary();

/** This file's own chain and relay. */
const ANVIL_PORT = 18555;
const RPC_URL = `http://127.0.0.1:${ANVIL_PORT}`;
const SEQUENCER_PORT = 13021;
const SEQUENCER_URL = `http://127.0.0.1:${SEQUENCER_PORT}`;
const STATE_PATH = path.join(os.tmpdir(), `sequencer-state-accrual-skip-${process.pid}.json`);

// anvil[5], anvil[6], anvil[7]: the deployer (then the relay's key), the
// buyer and the seller.
const DEPLOYER_KEY = "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba" as Hex;
const BUYER_KEY = "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e" as Hex;
const SELLER_KEY = "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356" as Hex;
const deployerAccount = privateKeyToAccount(DEPLOYER_KEY);
const buyerAccount = privateKeyToAccount(BUYER_KEY);
const sellerAccount = privateKeyToAccount(SELLER_KEY);

const CLAUSE_DATA = `{"modality":"delivery"}`;
const PAYMENT = 100n * 10n ** 18n;

/** Period 0 ends this long after the counter's deployment, period 1 a day later. */
const PERIOD_0_AFTER = 2n * 3600n;
const PERIOD_1_AFTER = PERIOD_0_AFTER + 24n * 3600n;

const RESOLVE_TYPES = {
    ResolveProcess: [
        { name: "processId", type: "bytes32" },
        { name: "runningTotal", type: "uint256" },
    ],
} as const;

async function waitForRpc(url: string, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 }),
                signal: AbortSignal.timeout(1000),
            });
            if (res.ok) return true;
        } catch {
            // not up yet
        }
        await new Promise((r) => setTimeout(r, 200));
    }
    return false;
}

describe("Batch E2E: a skipped accrual, then a later batch counts the use", () => {
    const transport = http(RPC_URL);
    const publicClient = createPublicClient({ chain: foundry, transport });
    const testClient = createTestClient({ chain: foundry, transport, mode: "anvil" });
    const deployerWallet = createWalletClient({ chain: foundry, transport, account: deployerAccount });
    const buyerWallet = createWalletClient({ chain: foundry, transport, account: buyerAccount });
    const sellerWallet = createWalletClient({ chain: foundry, transport, account: sellerAccount });

    let anvil: ChildProcess | null = null;
    let relayProcess: ChildProcess | null = null;
    let relayClient: SequencerClient;
    let tokenAddress: Address;
    let batchVerifierAddress: Address;
    let usageCounterAddress: Address;

    const specJson = loadSpecJson("figaro-modalities");
    const clauseKey = keccak256(stringToHex(specJson));
    const clauseLeaf = keccak256(
        keccak256(encodePacked(["bytes32", "bytes32"], [clauseKey, keccak256(stringToHex(CLAUSE_DATA))])),
    );
    const bonds = calculateBonds(PAYMENT, PAYMENT);

    beforeAll(async () => {
        anvil = spawn("anvil", ["--port", String(ANVIL_PORT), "--silent"], { stdio: "ignore" });
        if (!(await waitForRpc(RPC_URL, 30_000))) throw new Error(`anvil did not start on ${RPC_URL}`);

        const stack = await deployBatchStack(
            publicClient,
            deployerWallet,
            { specJson, clauseKey },
            [PERIOD_0_AFTER, PERIOD_1_AFTER],
        );
        tokenAddress = stack.tokenAddress;
        batchVerifierAddress = stack.batchVerifierAddress;
        usageCounterAddress = stack.usageCounterAddress;

        // The counter counts a use only while its seller holds a live stake.
        await sellerWallet
            .writeContract({
                address: stack.membersAddress,
                abi: parseAbi(["function register(string metadataURI) payable"]),
                functionName: "register",
                args: ["ipfs://accrual-skip-seller"],
            })
            .then((hash) => publicClient.waitForTransactionReceipt({ hash }));
        for (const [account, wallet, amount] of [
            [buyerAccount, buyerWallet, bonds.buyerBond],
            [sellerAccount, sellerWallet, bonds.sellerBond],
        ] as const) {
            await deployerWallet
                .writeContract({ address: tokenAddress, abi: MOCK_ERC20_ABI, functionName: "mint", args: [account.address, amount] })
                .then((hash) => publicClient.waitForTransactionReceipt({ hash }));
            await wallet
                .writeContract({ address: tokenAddress, abi: MOCK_ERC20_ABI, functionName: "approve", args: [batchVerifierAddress, amount] })
                .then((hash) => publicClient.waitForTransactionReceipt({ hash }));
        }

        relayProcess = startSequencer(
            {
                batchVerifierAddress,
                usageCounterAddress,
                registries: stack.registries,
                privateKey: DEPLOYER_KEY,
                port: SEQUENCER_PORT,
                statePath: STATE_PATH,
            },
            { RPC_URL },
        );
        attachLogs(relayProcess);
        relayClient = new SequencerClient({ url: SEQUENCER_URL });
        await waitForSequencer(SEQUENCER_URL, 10 * 60_000);
    }, 20 * 60_000);

    afterAll(async () => {
        if (relayProcess) await stopSequencer(relayProcess);
        if (anvil && anvil.exitCode === null) anvil.kill("SIGTERM");
        for (const suffix of ["", ".tmp", ".next.jsonl", ".next.jsonl.tmp"]) {
            fs.rmSync(STATE_PATH + suffix, { force: true });
        }
    });

    it("a use left uncounted by a batch that crossed a period's end is counted by a later batch", async () => {

        // ── Batch 1: the commit ────────────────────────────────────────────
        const domain = buildDomain(31337, batchVerifierAddress);
        const { commitment, typedData } = buildCommitment(
            {
                processId: `0x${"00".repeat(32)}` as Hex,
                buyer: buyerAccount.address,
                seller: sellerAccount.address,
                token: tokenAddress,
                payment: PAYMENT,
                runningTotal: PAYMENT,
                checkoutHash: clauseLeaf,
                salt: 7n,
                commitDeadline: computeDeadline(await readChainTimestamp(publicClient)),
            },
            domain,
        );
        await relayClient.submitCommit(
            commitment,
            await buyerWallet.signTypedData(typedData),
            await sellerWallet.signTypedData(typedData),
        );
        await waitForBatchCount(relayClient, 1, 5 * 60_000);
        const processId = hashTypedData(typedData) as Hex;

        // ── Batch 2: the resolve and its usage claim, assembled in period 0 ──
        // The chain's clock is moved to ten minutes before period 0 ends, and
        // the chain stops mining, so the relay's batch transaction waits in the mempool.
        const period0End = (await publicClient.readContract({
            address: usageCounterAddress, abi: USAGE_COUNTER_ABI, functionName: "periodEnd", args: [0n],
        })) as bigint;
        const assembleAt = period0End - 600n;
        expect(await readChainTimestamp(publicClient)).toBeLessThan(assembleAt);
        await testClient.setNextBlockTimestamp({ timestamp: assembleAt });
        await testClient.mine({ blocks: 1 });
        expect(await publicClient.readContract({
            address: usageCounterAddress, abi: USAGE_COUNTER_ABI, functionName: "currentPeriod",
        })).toBe(0);
        await testClient.setAutomine(false);

        const agreement: Agreement = {
            version: "a1",
            buyer: buyerAccount.address,
            seller: sellerAccount.address,
            clauses: [{ clause: clauseKey, data: JSON.parse(CLAUSE_DATA) }],
        };
        expect(computeCheckoutHash(agreement)).toBe(clauseLeaf);
        const claims = buildUsageClaims(commitment, agreement, await fetchUsageClaimContext(publicClient, usageCounterAddress));
        expect(claims).toHaveLength(1);
        await relayClient.submitResolve(
            processId,
            commitment.runningTotal,
            [commitment],
            await buyerWallet.signTypedData({
                domain,
                types: RESOLVE_TYPES,
                primaryType: "ResolveProcess",
                message: { processId, runningTotal: commitment.runningTotal },
            }),
        );
        expect((await relayClient.submitUsageClaim(claims[0])).pending).toBe(1);

        // The batch transaction reaches the mempool; it is mined one second after period
        // 0 ends, so the counter, asked for period 0, refuses the call whole.
        const relayAddress = deployerAccount.address.toLowerCase();
        const batchQueued = async () => {
            const pool = await testClient.getTxpoolContent();
            const fromRelay = Object.entries(pool.pending).find(([from]) => from.toLowerCase() === relayAddress)?.[1] ?? {};
            return Object.values(fromRelay).some((tx) => tx.to?.toLowerCase() === batchVerifierAddress.toLowerCase());
        };
        const queuedBy = Date.now() + 5 * 60_000;
        while (!(await batchQueued())) {
            if (Date.now() > queuedBy) throw new Error("the relay sent no batch transaction within five minutes");
            await new Promise((r) => setTimeout(r, 500));
        }
        await testClient.setNextBlockTimestamp({ timestamp: period0End + 1n });
        await testClient.mine({ blocks: 1 });
        await testClient.setAutomine(true);
        await waitForBatchCount(relayClient, 2, 5 * 60_000);

        // The tokens moved: the resolve paid out although no use was counted.
        expect(await publicClient.readContract({
            address: tokenAddress, abi: MOCK_ERC20_ABI, functionName: "balanceOf", args: [sellerAccount.address],
        })).toBe(3n * PAYMENT);
        const accrual = async (period: number) => (await publicClient.readContract({
            address: usageCounterAddress, abi: USAGE_COUNTER_ABI, functionName: "accrualOf",
            args: [USAGE_KIND_CLAUSE, clauseKey, period],
        })) as readonly [bigint, bigint, bigint];
        expect(await accrual(0), "batch 2 counted nothing in period 0").toEqual([0n, 0n, 0n]);
        expect(await accrual(1), "nor in period 1").toEqual([0n, 0n, 0n]);

        // The skip, read from the verifier's logs alone: batch 2, its period,
        // and the claim it carried, whole.
        const skipped = await fetchSkippedBatchUses(publicClient, batchVerifierAddress, { fromBlock: 0n, toBlock: "latest" });
        expect(skipped).toHaveLength(1);
        expect(skipped[0].batchId).toBe(2n);
        expect(skipped[0].carried.period).toBe(0);
        expect(skipped[0].carried.claims).toHaveLength(1);
        expect(skipped[0].carried.claims[0].clause_or_process.toLowerCase()).toBe(clauseKey.toLowerCase());
        expect(skipped[0].carried.uses.map((u) => u.processId.toLowerCase())).toEqual([processId.toLowerCase()]);

        // ── Batch 3: the claim sent again, without the agreement ────────────
        expect(await publicClient.readContract({
            address: usageCounterAddress, abi: USAGE_COUNTER_ABI, functionName: "currentPeriod",
        })).toBe(1);
        expect((await relayClient.submitUsageClaim(skipped[0].carried.claims[0])).pending).toBe(1);
        await waitForBatchCount(relayClient, 3, 5 * 60_000);

        // THE CHAIN FACT: the counter's own storage holds the use in period 1.
        const counted = await accrual(1);
        expect(counted[0], "one use: the one seller of the one resolved process").toBe(1n);
        expect(counted[1], "one distinct staked seller").toBe(1n);
        expect(counted[2], "and it is scored").toBeGreaterThan(0n);
        expect(await accrual(0), "period 0 stays as it closed").toEqual([0n, 0n, 0n]);
        // Batch 3 counted, so the skip stays the only one.
        expect(await fetchSkippedBatchUses(publicClient, batchVerifierAddress, { fromBlock: 0n, toBlock: "latest" })).toHaveLength(1);
        expect(await publicClient.readContract({
            address: batchVerifierAddress, abi: BATCH_VERIFIER_ABI, functionName: "batchCount",
        })).toBe(3n);
    }, 20 * 60_000);
});
