/**
 * E2E integration test: the relay's deterministic-revert arm.
 *
 * A seller whose bond passed the relay's funding check revokes its allowance
 * while the batch is being proved. The batch's settleBatch is refused by the
 * chain (the bond pull reverts), and the relay re-reads funding at the latest
 * block: the revoker's operation alone is dead-lettered, the others re-queue,
 * and the next batch lands without the revoker.
 *
 * The arm is `batch_loop`'s `Err(e) if e.deterministic` branch
 * (prover/sequencer/src/main.rs, after `submitter::submit_batch`); the
 * classification is `is_deterministic_send_error` (a send-path "execution
 * reverted") in prover/sequencer/src/submitter.rs; the counter and the reason
 * are `FailureLog` on GET /status (prover/sequencer/src/api.rs).
 *
 * Requires what `batch-e2e.test.ts` requires (Anvil at :8545, the release
 * sequencer binary); skips the same way. Every wallet is a fresh key funded
 * with gas ETH by `anvil_setBalance`, so this file shares the chain without
 * touching any other suite's wallets or nonces, and runs beside
 * `batch-e2e.test.ts` without racing its deployer-nonce prediction.
 *
 * Flow:
 *   1. Deploy the stack (batchHarness), fund one buyer and two sellers
 *   2. Start the relay; submit two commits (buyer × seller A, buyer × seller B)
 *   3. When the relay forms the two-commit batch (its funding check is
 *      behind it, the proof is not yet sent), seller B revokes its allowance
 *   4. Assert from the chain: one batch landed, carrying seller A's commit
 *      alone; seller B's bond never moved
 *   5. Assert from /status: dead_lettered_ops rose by exactly one, the last
 *      error names seller B's revocation; nothing is left pending
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
    createPublicClient,
    createTestClient,
    createWalletClient,
    encodeAbiParameters,
    encodeFunctionData,
    http,
    keccak256,
    parseEther,
    type Address,
    type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import type { ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
    BATCH_VERIFIER_ABI,
    ERC20_ABI,
    buildCommitment,
    buildDomain,
    calculateBonds,
    computeOrderHash,
} from "../src/index.js";
import { parseClauseSpec } from "../src/clauses/index.js";
import { SequencerClient } from "../src/agent/sequencer.js";
import {
    ANVIL_URL,
    MOCK_ERC20_ABI,
    anvilReachable,
    attachLogs,
    deployBatchStack,
    loadSpecJson,
    sequencerBinaryExists,
    sequencerBinaryPath,
    startSequencer,
    stopSequencer,
    waitForSequencer,
    type RelayConfig,
} from "./batchHarness.js";

const SKIP = process.env.SKIP_ANVIL === "1";
const REQUIRE = process.env.REQUIRE_BATCH_E2E === "1";
// batch-e2e.test.ts holds 13001-13003.
const SEQUENCER_PORT = 13011;
const SEQUENCER_URL = `http://127.0.0.1:${SEQUENCER_PORT}`;
const STATE_PATH = path.join(os.tmpdir(), `sequencer-state-revoke-e2e-${process.pid}.json`);
const ARCHIVE_PATH = `sequencer-archive-revoke-e2e-${process.pid}.jsonl`;

// Fresh wallets per run: no anvil index is shared with another suite.
const relayKey = generatePrivateKey();
const deployerAccount = privateKeyToAccount(generatePrivateKey());
const buyerAccount = privateKeyToAccount(generatePrivateKey());
const sellerAAccount = privateKeyToAccount(generatePrivateKey());
const sellerBAccount = privateKeyToAccount(generatePrivateKey());

/** The relay's tracing line for a formed batch, after every formation filter. */
const ASSEMBLING = /Assembling batch.*?ops\W*=\W*(\d+)/;
// eslint-disable-next-line no-control-regex
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");

describe.skipIf(SKIP)("Batch E2E: a revocation mid-flight dead-letters the revoker alone", () => {
    const transport = http(ANVIL_URL);
    const publicClient = createPublicClient({ chain: foundry, transport });
    const testClient = createTestClient({ chain: foundry, transport, mode: "anvil" });
    const wallet = (account: ReturnType<typeof privateKeyToAccount>) =>
        createWalletClient({ chain: foundry, transport, account });
    const deployerWallet = wallet(deployerAccount);
    const buyerWallet = wallet(buyerAccount);
    const sellerAWallet = wallet(sellerAAccount);
    const sellerBWallet = wallet(sellerBAccount);

    const PAYMENT = 100n * 10n ** 18n;
    const bonds = calculateBonds(PAYMENT, PAYMENT);

    let alive = false;
    let hasBinary = false;
    let tokenAddress: Address;
    let batchVerifierAddress: Address;
    let relay: RelayConfig;
    let sequencerProcess: ChildProcess | null = null;
    const sequencerClient = new SequencerClient({ url: SEQUENCER_URL });

    beforeAll(async () => {
        alive = await anvilReachable();
        if (!alive) return;
        hasBinary = sequencerBinaryExists();
        if (!hasBinary) return;

        for (const who of [
            privateKeyToAccount(relayKey).address,
            deployerAccount.address,
            buyerAccount.address,
            sellerAAccount.address,
            sellerBAccount.address,
        ]) {
            await testClient.setBalance({ address: who, value: parseEther("100") });
        }

        const specJson = loadSpecJson("figaro-modalities");
        const parsed = parseClauseSpec(JSON.parse(specJson));
        if (!parsed.ok) throw new Error(`spec parse failed: ${JSON.stringify(parsed.errors)}`);
        const clauseKey = keccak256(
            encodeAbiParameters(
                [{ type: "string" }, { type: "uint64" }],
                [parsed.spec.clauseId, BigInt(parsed.spec.version)],
            ),
        );
        const stack = await deployBatchStack(publicClient, deployerWallet, {
            specJson,
            clauseId: parsed.spec.clauseId,
            version: parsed.spec.version,
            clauseKey,
        });
        tokenAddress = stack.tokenAddress;
        batchVerifierAddress = stack.batchVerifierAddress;

        // One buyer funds both commits; each seller funds its own.
        const fund: [ReturnType<typeof wallet>, bigint][] = [
            [buyerWallet, 2n * bonds.buyerBond],
            [sellerAWallet, bonds.sellerBond],
            [sellerBWallet, bonds.sellerBond],
        ];
        for (const [w, amount] of fund) {
            await deployerWallet
                .writeContract({
                    address: tokenAddress,
                    abi: MOCK_ERC20_ABI,
                    functionName: "mint",
                    args: [w.account.address, amount],
                })
                .then((h) => publicClient.waitForTransactionReceipt({ hash: h }));
            await w
                .writeContract({
                    address: tokenAddress,
                    abi: MOCK_ERC20_ABI,
                    functionName: "approve",
                    args: [batchVerifierAddress, amount],
                })
                .then((h) => publicClient.waitForTransactionReceipt({ hash: h }));
        }

        relay = {
            batchVerifierAddress,
            usageCounterAddress: stack.usageCounterAddress,
            registries: stack.registries,
            privateKey: relayKey,
            port: SEQUENCER_PORT,
            statePath: STATE_PATH,
            archivePath: ARCHIVE_PATH,
        };
    }, 20 * 60_000);

    afterAll(async () => {
        if (sequencerProcess) {
            await stopSequencer(sequencerProcess);
            sequencerProcess = null;
        }
        for (const suffix of ["", ".tmp", ".next.jsonl", ".next.jsonl.tmp"]) {
            fs.rmSync(STATE_PATH + suffix, { force: true });
        }
        fs.rmSync(ARCHIVE_PATH, { force: true });
    });

    it("skips when Anvil is unreachable or the sequencer binary is not built", () => {
        if (!alive) {
            if (REQUIRE) throw new Error(`REQUIRE_BATCH_E2E=1 but Anvil is not reachable at ${ANVIL_URL}`);
            console.log("⏭ Skipping: Anvil not reachable");
            return;
        }
        if (!hasBinary) {
            if (REQUIRE) {
                throw new Error(`REQUIRE_BATCH_E2E=1 but the sequencer binary is not at ${sequencerBinaryPath()}`);
            }
            console.log(`⏭ Skipping: sequencer binary not found at ${sequencerBinaryPath()}`);
            return;
        }
        expect(alive && hasBinary).toBe(true);
    });

    it("the revoker's commit dead-letters alone; the other lands in the next batch", async () => {
        if (!alive || !hasBinary) return;

        // ── 1. The revocation, signed ahead ─────────────────────
        // Sent the moment the relay forms the batch, so it lands inside the
        // proving window: after the formation funding check, before the send.
        const revokeRequest = await sellerBWallet.prepareTransactionRequest({
            to: tokenAddress,
            data: encodeFunctionData({
                abi: MOCK_ERC20_ABI,
                functionName: "approve",
                args: [batchVerifierAddress, 0n],
            }),
            gas: 100_000n,
        });
        const signedRevoke = await sellerBWallet.signTransaction(revokeRequest);

        // ── 2. Start the relay; arm the trigger on its formation line ──
        // A long interval keeps both commits inside one batch window.
        sequencerProcess = startSequencer(relay, {
            BATCH_INTERVAL_SECS: "6",
            NO_COLOR: "1",
        });
        attachLogs(sequencerProcess);
        const formations: number[] = [];
        const firstFormation = new Promise<number>((resolve) => {
            let buffered = "";
            sequencerProcess!.stdout!.on("data", (chunk: Buffer) => {
                buffered += stripAnsi(chunk.toString());
                let nl: number;
                while ((nl = buffered.indexOf("\n")) >= 0) {
                    const line = buffered.slice(0, nl);
                    buffered = buffered.slice(nl + 1);
                    const m = ASSEMBLING.exec(line);
                    if (!m) continue;
                    formations.push(Number(m[1]));
                    if (formations.length === 1) resolve(Number(m[1]));
                }
            });
        });
        await waitForSequencer(SEQUENCER_URL, 10 * 60_000);
        const before = await sequencerClient.status();
        const deadBefore = before.dead_lettered_ops ?? 0;
        expect(before.batches_settled).toBe(0);

        // ── 3. Two commits: buyer × seller A, buyer × seller B ──
        const domain = buildDomain(31337, batchVerifierAddress);
        const commitWith = async (seller: typeof sellerAWallet, salt: bigint) => {
            const { commitment, typedData } = buildCommitment(
                {
                    processId:
                        "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex,
                    buyer: buyerAccount.address,
                    seller: seller.account.address,
                    currency: tokenAddress,
                    payment: PAYMENT,
                    expectedCumulativeValue: PAYMENT,
                    agreementHash: keccak256(`0x${salt.toString(16).padStart(64, "0")}`),
                    salt,
                    deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
                },
                domain,
            );
            const buyerSig = await buyerWallet.signTypedData(typedData);
            const sellerSig = await seller.signTypedData(typedData);
            const submitted = await sequencerClient.submitCommit(commitment, buyerSig, sellerSig);
            expect(typeof submitted.id).toBe("number");
            return computeOrderHash(commitment, 31337, batchVerifierAddress);
        };
        const [orderA, orderB] = await Promise.all([
            commitWith(sellerAWallet, 1n),
            commitWith(sellerBWallet, 2n),
        ]);

        // ── 4. The formation: both commits funded; seller B revokes ──
        const formedOps = await Promise.race([
            firstFormation,
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("the relay formed no batch within 60s")), 60_000),
            ),
        ]);
        const revokeHash = await publicClient.sendRawTransaction({ serializedTransaction: signedRevoke });
        expect(formedOps, "both commits passed the formation funding check together").toBe(2);
        const revokeReceipt = await publicClient.waitForTransactionReceipt({ hash: revokeHash });
        expect(revokeReceipt.status).toBe("success");
        expect(
            await publicClient.readContract({
                address: tokenAddress,
                abi: MOCK_ERC20_ABI,
                functionName: "allowance",
                args: [sellerBAccount.address, batchVerifierAddress],
            }),
        ).toBe(0n);

        // ── 5. Wait: one batch settled AND one op dead-lettered ──
        const deadline = Date.now() + 3 * 60_000;
        let status = await sequencerClient.status();
        while (
            Date.now() < deadline &&
            !(status.batches_settled >= 1 && (status.dead_lettered_ops ?? 0) > deadBefore)
        ) {
            await new Promise((r) => setTimeout(r, 500));
            status = await sequencerClient.status();
        }
        console.log(`[revoke] status: ${JSON.stringify(status)}; formations: ${formations.join(",")}`);

        // ── 6. CHAIN FACTS ──────────────────────────────────────
        // One batch landed: the refused one was never mined (the node's
        // simulation refused the send), the re-formed one carries seller A.
        expect(
            await publicClient.readContract({
                address: batchVerifierAddress,
                abi: BATCH_VERIFIER_ABI,
                functionName: "batchCount",
            }),
            "exactly one batch reached the verifier",
        ).toBe(1n);
        const settled = await publicClient.getContractEvents({
            address: batchVerifierAddress,
            abi: BATCH_VERIFIER_ABI,
            eventName: "BatchSettled",
            fromBlock: 0n,
        });
        expect(settled).toHaveLength(1);
        expect(
            settled[0].blockNumber > revokeReceipt.blockNumber,
            "the batch that landed is the one formed after the revocation",
        ).toBe(true);

        const balanceOf = (who: Address) =>
            publicClient.readContract({
                address: tokenAddress,
                abi: ERC20_ABI,
                functionName: "balanceOf",
                args: [who],
            }) as Promise<bigint>;
        const [buyerBal, sellerABal, sellerBBal, verifierBal] = await Promise.all([
            balanceOf(buyerAccount.address),
            balanceOf(sellerAAccount.address),
            balanceOf(sellerBAccount.address),
            balanceOf(batchVerifierAddress),
        ]);
        expect(sellerABal, "seller A's bond was pulled").toBe(0n);
        expect(sellerBBal, "seller B's bond never moved").toBe(bonds.sellerBond);
        expect(buyerBal, "the buyer bonded the one commit that landed").toBe(bonds.buyerBond);
        expect(verifierBal).toBe(bonds.buyerBond + bonds.sellerBond);

        // ── 7. What the relay publishes, beside the chain ───────
        const publishedA = await sequencerClient.order(orderA);
        expect(publishedA, "the relay publishes seller A's order").not.toBeNull();
        expect(publishedA!.commit!.batch.resolution_tx).toBe(settled[0].transactionHash);
        expect(await sequencerClient.order(orderB), "seller B's order is in no batch").toBeNull();

        // ── 8. The relay's claim: /status ────────────────────────
        expect(status.batches_settled).toBe(1);
        expect(status.pending_ops).toBe(0);
        expect((status.dead_lettered_ops ?? 0) - deadBefore, "the revoker's op alone").toBe(1);
        const lastError = status.last_settle_error ?? "";
        expect(lastError).toContain("revoked after the funding check");
        expect(lastError.toLowerCase()).toContain(`seller ${sellerBAccount.address.toLowerCase()}`);
        expect(lastError).toContain("allows 0 to the verifier");
    }, 15 * 60_000);
});
