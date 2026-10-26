/**
 * E2E integration test: SDK → Sequencer → FigaroBatchVerifier → on-chain.
 *
 * The cross-language lock for the proof apparatus: TypeScript signs the
 * ops and builds the witness payload, the Rust sequencer runs the mirror
 * + guest and submits, and the Solidity verifier checks the hashes and
 * the ClauseRegistry spec-binding anchor. If any layer's bytes drift,
 * this test fails.
 *
 * Requires:
 *   - Anvil running at http://127.0.0.1:8545 (or at ANVIL_URL)
 *   - Sequencer binary built at prover/target/release/sequencer
 *     (cargo build --release -p figaro-sequencer)
 *
 * Skip with: SKIP_ANVIL=1 npm test
 *
 * Flow:
 *   1. Deploy MockERC20, MockSP1Verifier, ClauseRegistry, FigaroBatchVerifier
 *   2. Register figaro-modalities on ClauseRegistry under its key (the hash of its pinned bytes)
 *   3. Mint tokens, approve bonds to FigaroBatchVerifier
 *   4. Start sequencer as child process
 *   5. Submit Commit + AttestAsSeller (RuntimeWitness) via SequencerClient
 *   6. Wait for batch 1: bonds pulled, Attestation re-emitted
 *   6b. A relay holding no state refuses to start; a second relay starts
 *       on the state the first serves (STATE_FROM=<its URL>, fetched and
 *       checked by the relay itself); the relay that built batch 1
 *       restarts and resumes on its kept state
 *   7. Submit Resolve to the second relay; it settles batch 2
 *   8. Verify: final balances, state root advanced, batch count
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
    createPublicClient,
    createWalletClient,
    http,
    parseAbi,
    keccak256,
    encodePacked,
    hashTypedData,
    stringToHex,
    type Hex,
    type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import type { ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
    BATCH_VERIFIER_ABI,
    CORE_ABI,
    ERC20_ABI,
    buildCommitment,
    buildDomain,
    calculateBonds,
    computeOrderHash,
    USAGE_COUNTER_ABI,
    USAGE_KIND_CLAUSE,
    buildUsageClaims,
    fetchUsageClaimContext,
    computeCheckoutHash,
    type Agreement,
} from "../src/index.js";
import { parseClauseSpec, encodeContentFromSpec } from "../src/clauses/index.js";
import { SequencerClient } from "../src/agent/sequencer.js";
import type { SequencerContentProof } from "../src/agent/sequencer.js";

import {
    ANVIL_URL,
    MOCK_ERC20_ABI,
    anvilReachable,
    attachLogs,
    computeGenesisRoot,
    deployBatchStack,
    loadSpecJson,
    sequencerBinaryExists,
    sequencerBinaryPath,
    startSequencer,
    stopSequencer,
    waitForBatchCount,
    waitForSequencer,
    type RelayConfig,
} from "./batchHarness.js";

// ── Skip unless Anvil is reachable ──────────────────────────────────────────

const SKIP = process.env.SKIP_ANVIL === "1";
// In CI the chain and the binary are both provided, so a missing one is a
// failure, never a skip (prover-ci's SP1 job sets this).
const REQUIRE = process.env.REQUIRE_BATCH_E2E === "1";
const SEQUENCER_PORT = 13001; // Use a non-standard port to avoid conflicts

// ── Anvil pre-funded accounts ───────────────────────────────────────────────

// anvil[4] — a DEDICATED deployer, and it has to be dedicated. The counter and
// the verifier reference each other, so this suite predicts the verifier's
// address from the deployer's nonce; any other transaction from the same
// account landing in between makes the prediction wrong. anvil[0] is
// `integration.test.ts`'s buyer and vitest runs the two files concurrently, so
// sharing it turned a correct deploy dance into a race. (The deploy SCRIPTS are
// unaffected — forge broadcasts sequentially from one key.)
const DEPLOYER_KEY =
    "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a" as Hex;
const BUYER_KEY =
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex;
const SELLER_KEY =
    "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" as Hex;

const deployerAccount = privateKeyToAccount(DEPLOYER_KEY);
const buyerAccount = privateKeyToAccount(BUYER_KEY);
const sellerAccount = privateKeyToAccount(SELLER_KEY);

const CLAUSE_DATA = `{"modality":"delivery"}`;

/** The relay's state file for this run: the preimage of the verifier's root. */
const STATE_PATH = path.join(os.tmpdir(), `sequencer-state-e2e-${process.pid}.json`);
/** The second relay's state file: written by the relay itself from the first's GET /state. */
const TAKEOVER_STATE_PATH = path.join(os.tmpdir(), `sequencer-state-e2e-${process.pid}-takeover.json`);
/** The relay's sequencer archive for this run, deleted with the state in afterAll. */
const ARCHIVE_PATH = `sequencer-archive-e2e-${process.pid}.jsonl`;
/** The state file of the relay that rebuilds from the chain alone (the pass test). */
const REBUILT_STATE_PATH = path.join(os.tmpdir(), `sequencer-state-e2e-${process.pid}-rebuilt.json`);

// ── Batch-only typed data (EIP-712 signature replaces msg.sender) ───────────

const RESOLVE_TYPES = {
    ResolveProcess: [{ name: "processId", type: "bytes32" }],
} as const;

const ATTEST_SELLER_TYPES = {
    AttestSeller: [
        { name: "orderHash", type: "bytes32" },
        { name: "clauseId", type: "bytes32" },
        { name: "stage", type: "uint8" },
        { name: "contentRef", type: "bytes32" },
    ],
} as const;

// ── Test suite ──────────────────────────────────────────────────────────────

describe.skipIf(SKIP)("Batch E2E: SDK → Sequencer → BatchVerifier", () => {
    const transport = http(ANVIL_URL);

    const publicClient = createPublicClient({ chain: foundry, transport });

    const deployerWallet = createWalletClient({
        chain: foundry,
        transport,
        account: deployerAccount,
    });
    const buyerWallet = createWalletClient({
        chain: foundry,
        transport,
        account: buyerAccount,
    });
    const sellerWallet = createWalletClient({
        chain: foundry,
        transport,
        account: sellerAccount,
    });

    let tokenAddress: Address;
    let batchVerifierAddress: Address;
    let usageCounterAddress: Address;
    let alive = false;
    let hasBinary = false;
    let sequencerProcess: ChildProcess | null = null;
    /** The relay that takes over from the first and settles batch 2. */
    let secondProcess: ChildProcess | null = null;
    /** The relay the pass test starts with nothing, to rebuild from the chain. */
    let rebuiltProcess: ChildProcess | null = null;
    let sequencerClient: SequencerClient;
    let relay: RelayConfig;

    const PAYMENT = 100n * 10n ** 18n;
    const bonds = calculateBonds(PAYMENT, PAYMENT);

    const SEQUENCER_URL = `http://127.0.0.1:${SEQUENCER_PORT}`;

    // The witness clause, prepared once: exact spec bytes, clause key,
    // content_ref (canonical ABI encoding at stage 0), and the clause
    // leaf that becomes the single-clause checkoutHash.
    const specJson = loadSpecJson("figaro-modalities");
    const parsedSpec = (() => {
        const r = parseClauseSpec(JSON.parse(specJson));
        if (!r.ok) throw new Error(`spec parse failed: ${JSON.stringify(r.errors)}`);
        return r.spec;
    })();
    // The key is the hash of the pinned (canonical) bytes the witness carries.
    const clauseKey = keccak256(stringToHex(specJson));
    const contentRef = keccak256(
        encodeContentFromSpec(parsedSpec, JSON.parse(CLAUSE_DATA), { stage: 0 }),
    );
    // Double-hashed leaf (leaf/node domain separation) — must mirror
    // computeClauseLeaf / the coordinator / the prover's Gate I.
    const clauseLeaf = keccak256(
        keccak256(
            encodePacked(["bytes32", "bytes32"], [clauseKey, keccak256(stringToHex(CLAUSE_DATA))]),
        ),
    );
    const witnessProof: SequencerContentProof = {
        spec_json: specJson,
        content_json: CLAUSE_DATA,
        clause_data: CLAUSE_DATA,
        inclusion_proof: [],
        content_kind: "RuntimeWitness",
    };

    beforeAll(async () => {
        alive = await anvilReachable();
        if (!alive) return;

        hasBinary = sequencerBinaryExists();
        if (!hasBinary) return;

        // ── Deploy the stack and anchor the witness clause ─────

        const stack = await deployBatchStack(publicClient, deployerWallet, {
            specJson,
            clauseKey,
        });
        tokenAddress = stack.tokenAddress;
        batchVerifierAddress = stack.batchVerifierAddress;
        usageCounterAddress = stack.usageCounterAddress;

        // The counter counts a resolved process only while its seller-of-record
        // holds a LIVE MembersRegistry stake. Zero deposit here — the gate
        // under test is the stake's EXISTENCE, not its size.
        const registerHash = await sellerWallet.writeContract({
            address: stack.membersAddress,
            abi: parseAbi(["function register(string metadataURI) payable"]),
            functionName: "register",
            args: ["ipfs://batch-e2e-seller"],
        });
        await publicClient.waitForTransactionReceipt({ hash: registerHash });

        // ── Mint tokens and approve to batch verifier ───────────

        await deployerWallet
            .writeContract({
                address: tokenAddress,
                abi: MOCK_ERC20_ABI,
                functionName: "mint",
                args: [buyerAccount.address, bonds.buyerBond],
            })
            .then((h) => publicClient.waitForTransactionReceipt({ hash: h }));

        await deployerWallet
            .writeContract({
                address: tokenAddress,
                abi: MOCK_ERC20_ABI,
                functionName: "mint",
                args: [sellerAccount.address, bonds.sellerBond],
            })
            .then((h) => publicClient.waitForTransactionReceipt({ hash: h }));

        await buyerWallet
            .writeContract({
                address: tokenAddress,
                abi: MOCK_ERC20_ABI,
                functionName: "approve",
                args: [batchVerifierAddress, bonds.buyerBond],
            })
            .then((h) => publicClient.waitForTransactionReceipt({ hash: h }));

        await sellerWallet
            .writeContract({
                address: tokenAddress,
                abi: MOCK_ERC20_ABI,
                functionName: "approve",
                args: [batchVerifierAddress, bonds.sellerBond],
            })
            .then((h) => publicClient.waitForTransactionReceipt({ hash: h }));

        // ── Start sequencer ─────────────────────────────────────

        relay = {
            batchVerifierAddress,
            usageCounterAddress,
            registries: stack.registries,
            privateKey: DEPLOYER_KEY,
            port: SEQUENCER_PORT,
            // The relay's state, kept across the restart this test performs
            // between its two batches.
            statePath: STATE_PATH,
            archivePath: ARCHIVE_PATH,
        };
        sequencerProcess = startSequencer(relay);

        attachLogs(sequencerProcess);

        sequencerClient = new SequencerClient({ url: SEQUENCER_URL });
        // The sequencer derives its guest fingerprint at startup (minutes on
        // a first run, cached per guest after); `--vkey` above paid it first.
        await waitForSequencer(SEQUENCER_URL, 10 * 60_000);
    }, 20 * 60_000);

    afterAll(async () => {
        if (sequencerProcess) {
            sequencerProcess.kill("SIGTERM");
            await new Promise((r) => setTimeout(r, 500));
            if (!sequencerProcess.killed) {
                sequencerProcess.kill("SIGKILL");
            }
            sequencerProcess = null;
        }
        if (secondProcess) {
            await stopSequencer(secondProcess);
            secondProcess = null;
        }
        if (rebuiltProcess) {
            await stopSequencer(rebuiltProcess);
            rebuiltProcess = null;
        }
        for (const suffix of ["", ".tmp", ".next.jsonl", ".next.jsonl.tmp"]) {
            fs.rmSync(STATE_PATH + suffix, { force: true });
            fs.rmSync(TAKEOVER_STATE_PATH + suffix, { force: true });
            fs.rmSync(REBUILT_STATE_PATH + suffix, { force: true });
        }
        fs.rmSync(ARCHIVE_PATH, { force: true });
    });

    it("skips when Anvil is unreachable", () => {
        if (!alive) {
            if (REQUIRE) throw new Error(`REQUIRE_BATCH_E2E=1 but Anvil is not reachable at ${ANVIL_URL}`);
            console.log("⏭ Skipping: Anvil not reachable");
            return;
        }
        expect(alive).toBe(true);
    });

    it("skips when sequencer binary is not built", () => {
        if (!hasBinary) {
            if (REQUIRE) {
                throw new Error(`REQUIRE_BATCH_E2E=1 but the sequencer binary is not at ${sequencerBinaryPath()}`);
            }
            console.log(
                `⏭ Skipping: sequencer binary not found at ${sequencerBinaryPath()}`,
            );
            return;
        }
        expect(hasBinary).toBe(true);
    });

    it("full batch lifecycle: commit + witness attest resolve in a batch, then resolve pays out", async () => {
        if (!alive || !hasBinary) return;

        // ── 1. Build commitment ─────────────────────────────────
        // The single-clause agreement: checkoutHash IS the clause
        // leaf, so the attestation's inclusion proof is empty.

        const domain = buildDomain(31337, batchVerifierAddress);
        const { commitment, typedData } = buildCommitment(
            {
                processId:
                    "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex,
                buyer: buyerAccount.address,
                seller: sellerAccount.address,
                currency: tokenAddress,
                payment: PAYMENT,
                expectedCumulativeValue: PAYMENT,
                checkoutHash: clauseLeaf,
                salt: 42n,
                deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
            },
            domain,
        );

        // ── 2. Sign + submit Commit ─────────────────────────────

        const buyerSig = await buyerWallet.signTypedData(typedData);
        const sellerSig = await sellerWallet.signTypedData(typedData);

        const commitResult = await sequencerClient.submitCommit(
            commitment,
            buyerSig,
            sellerSig,
        );
        expect(typeof commitResult.id).toBe("number");

        // ── 3. Sign + submit the witness attestation ────────────
        // For root orders, processId = the commitment's EIP-712 digest.

        // computeOrderHash derives the root processId itself from the
        // signed commitment (processId = 0) — pass the ORIGINAL struct.
        const processId = hashTypedData(typedData) as Hex;
        const orderHash = computeOrderHash(commitment, 31337, batchVerifierAddress);

        const attestSig = await sellerWallet.signTypedData({
            domain,
            types: ATTEST_SELLER_TYPES,
            primaryType: "AttestSeller",
            message: { orderHash, clauseId: clauseKey, stage: 0, contentRef },
        });

        const attestResult = await sequencerClient.submitAttestAsSeller({
            target: commitment,
            clauseId: clauseKey,
            stage: 0,
            contentRef,
            sellerSig: attestSig,
            proof: witnessProof,
        });
        expect(typeof attestResult.id).toBe("number");

        // ── 4. Wait for batch 1: bonds pulled, attestation emitted ──

        await waitForBatchCount(sequencerClient, 1);

        const [buyerBalAfterCommit, sellerBalAfterCommit, verifierBalAfterCommit] =
            await Promise.all([
                publicClient.readContract({
                    address: tokenAddress, abi: ERC20_ABI, functionName: "balanceOf",
                    args: [buyerAccount.address],
                }) as Promise<bigint>,
                publicClient.readContract({
                    address: tokenAddress, abi: ERC20_ABI, functionName: "balanceOf",
                    args: [sellerAccount.address],
                }) as Promise<bigint>,
                publicClient.readContract({
                    address: tokenAddress, abi: ERC20_ABI, functionName: "balanceOf",
                    args: [batchVerifierAddress],
                }) as Promise<bigint>,
            ]);

        expect(buyerBalAfterCommit).toBe(0n);
        expect(sellerBalAfterCommit).toBe(0n);
        expect(verifierBalAfterCommit).toBe(bonds.buyerBond + bonds.sellerBond);

        // The verifier re-emitted the proven attestation — checked from
        // the chain, not from the sequencer's own report.
        const attestationLogs = await publicClient.getContractEvents({
            address: batchVerifierAddress,
            abi: BATCH_VERIFIER_ABI,
            eventName: "Attestation",
            fromBlock: 0n,
        });
        expect(attestationLogs.length).toBe(1);
        expect(attestationLogs[0].args.orderHash).toBe(orderHash);
        expect(attestationLogs[0].args.attester?.toLowerCase()).toBe(
            sellerAccount.address.toLowerCase(),
        );
        expect(attestationLogs[0].args.contentRef).toBe(contentRef);

        // ── 4b. The relay's state is the preimage of the verifier's root ──
        // The bonds now sit in the verifier, and only a batch built on the
        // state behind its root refunds them. Two chain-facing facts:

        // A relay that does not hold that state refuses to start. It never
        // builds on genesis against a verifier that is past it.
        const stateless = startSequencer(relay, {
            STATE_PATH: path.join(os.tmpdir(), `sequencer-state-e2e-${process.pid}-holds-nothing.json`),
            ARCHIVE_PATH: "",
            LISTEN_ADDR: `0.0.0.0:${SEQUENCER_PORT + 1}`,
        });
        let statelessOutput = "";
        stateless.stdout?.on("data", (chunk: Buffer) => (statelessOutput += chunk.toString()));
        stateless.stderr?.on("data", (chunk: Buffer) => (statelessOutput += chunk.toString()));
        const statelessExit = await new Promise<number | null>((resolve) => {
            const timer = setTimeout(() => {
                stateless.kill("SIGKILL");
                resolve(null);
            }, 2 * 60_000);
            // "close", not "exit": the pipes are drained by then, so the
            // refusal line is in `statelessOutput`.
            stateless.once("close", (code) => {
                clearTimeout(timer);
                resolve(code);
            });
        });
        expect(statelessOutput).toContain("does not hold the state behind the verifier's root");
        expect(statelessExit).toBe(2);

        // A second relay takes over from the served state: started with
        // STATE_FROM=<the first relay's URL> and an empty STATE_PATH, it
        // fetches the first relay's GET /state itself, recomputes the root,
        // writes the state over its own kept file only because that root is
        // the verifier's, and starts on it. It settles the next batch.
        const SECOND_URL = `http://127.0.0.1:${SEQUENCER_PORT + 2}`;
        expect(fs.existsSync(TAKEOVER_STATE_PATH)).toBe(false);
        secondProcess = startSequencer(relay, {
            STATE_PATH: TAKEOVER_STATE_PATH,
            STATE_FROM: SEQUENCER_URL,
            ARCHIVE_PATH: "",
            LISTEN_ADDR: `0.0.0.0:${SEQUENCER_PORT + 2}`,
        });
        attachLogs(secondProcess);
        await waitForSequencer(SECOND_URL, 10 * 60_000);
        const secondClient = new SequencerClient({ url: SECOND_URL });
        const rootAtTakeover = (await publicClient.readContract({
            address: batchVerifierAddress,
            abi: BATCH_VERIFIER_ABI,
            functionName: "stateRoot",
        })) as string;
        expect((await secondClient.status()).state_root.toLowerCase()).toBe(rootAtTakeover.toLowerCase());
        expect(fs.existsSync(TAKEOVER_STATE_PATH), "the relay wrote the adopted state as its kept file").toBe(true);

        // The relay that built batch 1 restarts and resumes on its kept
        // state, beside the second; the batch below is the second's.
        await stopSequencer(sequencerProcess!);
        sequencerProcess = startSequencer(relay);
        attachLogs(sequencerProcess);
        await waitForSequencer(SEQUENCER_URL, 10 * 60_000);
        const onChainRoot = await publicClient.readContract({
            address: batchVerifierAddress,
            abi: BATCH_VERIFIER_ABI,
            functionName: "stateRoot",
        });
        expect((await sequencerClient.status()).state_root.toLowerCase()).toBe(
            (onChainRoot as string).toLowerCase(),
        );

        // ── 5. Sign + submit Resolve; wait for batch 2 ──────────

        const buyerResolveSig = await buyerWallet.signTypedData({
            domain,
            types: RESOLVE_TYPES,
            primaryType: "ResolveProcess" as const,
            message: { processId },
        });

        const resolveResult = await secondClient.submitResolve(
            processId,
            [commitment],
            buyerResolveSig,
        );
        expect(typeof resolveResult.id).toBe("number");

        // ── 5b. Claim the RPGF usage for the process this batch resolves ──
        // Claims apply against the batch's POST-state, so a claim for an order
        // resolved by this very batch is credited by it. The clause-or-assembly set and
        // the exclusion list are asked of the CHAIN, never assumed.
        const agreement: Agreement = {
            version: "a1",
            buyer: buyerAccount.address,
            seller: sellerAccount.address,
            clauses: [
                {
                    clause: clauseKey,
                    data: JSON.parse(CLAUSE_DATA),
                },
            ],
        };
        // The SDK's checkout hash must equal the leaf this test signed by hand;
        // if it did not, the inclusion proof below would be proving a different
        // agreement than the one on chain.
        expect(computeCheckoutHash(agreement)).toBe(clauseLeaf);

        const claimContext = await fetchUsageClaimContext(publicClient, usageCounterAddress);
        const claims = buildUsageClaims(commitment, agreement, claimContext);
        expect(claims).toHaveLength(1);
        expect(claims[0].clause_or_assembly).toBe(clauseKey);

        const submitted = await secondClient.submitUsageClaim(claims[0]);
        expect(submitted.pending).toBe(1);

        // The second relay settles it: its first batch, on the state it
        // took over.
        await waitForBatchCount(secondClient, 1, 5 * 60_000);

        // ── 5c. THE CHAIN FACT: the accrual landed on the COUNTER ──
        // Read from the counter's own storage — not from the sequencer's
        // report, and not from the verifier that claims to have written it.
        // A batch can resolve perfectly while crediting nothing, and that is
        // exactly the failure this bridge exists to prevent.
        const batchAccrual = (await publicClient.readContract({
            address: usageCounterAddress,
            abi: USAGE_COUNTER_ABI,
            functionName: "batchAccrualOf",
            args: [USAGE_KIND_CLAUSE, clauseKey, 0],
        })) as readonly [bigint, bigint, bigint];

        expect(batchAccrual[0], "one distinct resolved process").toBe(1n);
        expect(batchAccrual[1], "one distinct (buyer, seller) pair").toBe(1n);
        expect(batchAccrual[2], "and it is scored").toBeGreaterThan(0n);

        // The reward reads the MERGED score; nothing resolved on the direct
        // path, so here it equals the batch score alone.
        const merged = (await publicClient.readContract({
            address: usageCounterAddress,
            abi: USAGE_COUNTER_ABI,
            functionName: "scoreOf",
            args: [USAGE_KIND_CLAUSE, clauseKey, 0],
        })) as bigint;
        expect(merged).toBe(batchAccrual[2]);

        // ── 6. Verify final token balances ──────────────────────

        const [buyerFinal, sellerFinal, verifierFinal] = await Promise.all([
            publicClient.readContract({
                address: tokenAddress, abi: ERC20_ABI, functionName: "balanceOf",
                args: [buyerAccount.address],
            }) as Promise<bigint>,
            publicClient.readContract({
                address: tokenAddress, abi: ERC20_ABI, functionName: "balanceOf",
                args: [sellerAccount.address],
            }) as Promise<bigint>,
            publicClient.readContract({
                address: tokenAddress, abi: ERC20_ABI, functionName: "balanceOf",
                args: [batchVerifierAddress],
            }) as Promise<bigint>,
        ]);

        // Buyer gets payment back (bond was 2×payment, net payout = payment);
        // seller gets 3×payment; the verifier retains nothing.
        expect(buyerFinal).toBe(PAYMENT);
        expect(sellerFinal).toBe(3n * PAYMENT);
        expect(verifierFinal).toBe(0n);

        // ── 7. State root advanced; both batches resolved ────────

        const finalRoot = (await publicClient.readContract({
            address: batchVerifierAddress,
            abi: BATCH_VERIFIER_ABI,
            functionName: "stateRoot",
        })) as Hex;
        expect(finalRoot).not.toBe(computeGenesisRoot());

        const finalBatchCount = (await publicClient.readContract({
            address: batchVerifierAddress,
            abi: BATCH_VERIFIER_ABI,
            functionName: "batchCount",
        })) as bigint;
        expect(finalBatchCount).toBe(2n);

        const status = await secondClient.status();
        expect(status.batches_settled, "the second relay settled batch 2").toBe(1);
        expect(status.pending_ops).toBe(0);
        expect(status.state_root.toLowerCase()).toBe(finalRoot.toLowerCase());
        expect((await sequencerClient.status()).batches_settled, "the first relay settled batch 1 alone").toBe(1);

        // ── 8. What the relay PUBLISHED, read as a stranger reads it ──
        // The relay's wire and this client's types are two statements of one
        // record; a field the two name differently arrives as `undefined` and
        // reads as a batch that never reached the chain. Every anchor the
        // relay publishes is checked against the chain's own receipt.
        // Each relay publishes what it settled: the first the commit, the
        // second the resolution.
        const publishedCommit = await sequencerClient.order(orderHash);
        expect(publishedCommit, "the first relay publishes the order it committed").not.toBeNull();
        const publishedResolution = await secondClient.order(orderHash);
        expect(publishedResolution, "the second relay publishes the order it resolved").not.toBeNull();
        const commitAnchor = publishedCommit!.commit!.batch;
        const resolutionAnchor = publishedResolution!.resolution!.batch;
        expect(resolutionAnchor.new_state_root, "the resolution's batch left the final root").toBe(finalRoot);
        for (const [leg, anchor] of [["commit", commitAnchor], ["resolution", resolutionAnchor]] as const) {
            expect(anchor.resolution_tx, `${leg}: the relay names the transaction`).toMatch(/^0x[0-9a-f]{64}$/);
            const receipt = await publicClient.getTransactionReceipt({ hash: anchor.resolution_tx! });
            expect(receipt.status, `${leg}: that transaction succeeded`).toBe("success");
            expect(receipt.to?.toLowerCase(), `${leg}: and it called the verifier`).toBe(
                batchVerifierAddress.toLowerCase(),
            );
            expect(anchor.verifying_contract.toLowerCase()).toBe(batchVerifierAddress.toLowerCase());
            expect(anchor.chain_id).toBe(Number(await publicClient.getChainId()));
        }
        expect(commitAnchor.resolution_tx).not.toBe(resolutionAnchor.resolution_tx);
        expect((await sequencerClient.batches()).batches.map((b) => b.resolution_tx)).toEqual([
            commitAnchor.resolution_tx,
        ]);
        expect((await secondClient.batches()).batches.map((b) => b.resolution_tx)).toEqual([
            resolutionAnchor.resolution_tx,
        ]);
    }, 5 * 60_000);
    // ── The pass test of the batch design (punch-list band 0) ─────────────
    // Batch and Core are equivalent: with every relay's state file and archive
    // deleted and every relay stopped, a stranger rebuilds the state behind
    // the verifier's root from the chain alone, and the buyer, or anyone
    // carrying the buyer's signed resolve, proves and submits the resolution.
    // The chain also carries the commitment in the Core's own event shape, so
    // the event readers find batched trade where they find direct trade.
    //
    // The rebuild-from-chain start is `REBUILD_FROM_CHAIN=1`
    // (`prover/sequencer/src/rebuild.rs`): it replays every landed batch's
    // operation stream from the verifier's transactions and holds each root to
    // the one the batch's log names. The formal twin is `formal/RelayState.tla`'s
    // `OpsOnChain` and `StartFromChain`.
    it(
        "the pass test: every relay's state deleted, a relay rebuilds from the chain alone and the buyer's resolve pays out",
        async () => {
            if (!alive || !hasBinary) {
                return;
            }

            // ── 1. A second order, committed through the relay in step ──
            // The second relay settled batch 2, so it holds the verifier's
            // root; the first relay is out of step and builds nothing.
            const inStep = new SequencerClient({ url: `http://127.0.0.1:${SEQUENCER_PORT + 2}` });
            for (const [wallet, who, amount] of [
                [buyerWallet, buyerAccount.address, bonds.buyerBond],
                [sellerWallet, sellerAccount.address, bonds.sellerBond],
            ] as const) {
                await deployerWallet
                    .writeContract({
                        address: tokenAddress, abi: MOCK_ERC20_ABI, functionName: "mint",
                        args: [who, amount],
                    })
                    .then((h) => publicClient.waitForTransactionReceipt({ hash: h }));
                await wallet
                    .writeContract({
                        address: tokenAddress, abi: MOCK_ERC20_ABI, functionName: "approve",
                        args: [batchVerifierAddress, amount],
                    })
                    .then((h) => publicClient.waitForTransactionReceipt({ hash: h }));
            }

            const domain = buildDomain(31337, batchVerifierAddress);
            const { commitment, typedData } = buildCommitment(
                {
                    processId:
                        "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex,
                    buyer: buyerAccount.address,
                    seller: sellerAccount.address,
                    currency: tokenAddress,
                    payment: PAYMENT,
                    expectedCumulativeValue: PAYMENT,
                    checkoutHash: clauseLeaf,
                    salt: 43n,
                    deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
                },
                domain,
            );
            const buyerSig = await buyerWallet.signTypedData(typedData);
            const sellerSig = await sellerWallet.signTypedData(typedData);
            await inStep.submitCommit(commitment, buyerSig, sellerSig);
            const processId = hashTypedData(typedData) as Hex;
            const orderHash = computeOrderHash(commitment, 31337, batchVerifierAddress);
            await waitForBatchCount(inStep, 2, 5 * 60_000);

            const rootAfterCommit = (await publicClient.readContract({
                address: batchVerifierAddress, abi: BATCH_VERIFIER_ABI, functionName: "stateRoot",
            })) as Hex;
            expect((await publicClient.readContract({
                address: tokenAddress, abi: ERC20_ABI, functionName: "balanceOf",
                args: [batchVerifierAddress],
            })) as bigint, "both bonds sit in the verifier").toBe(bonds.buyerBond + bonds.sellerBond);

            // ── 2. The chain carries the commitment, in the Core's shape ──
            // A stranger's first fact: the verifier emitted `OrderCommitted`
            // for this order, as `FigaroCore` would have.
            const committedLogs = await publicClient.getContractEvents({
                address: batchVerifierAddress,
                abi: CORE_ABI,
                eventName: "OrderCommitted",
                args: { orderHash },
                fromBlock: 0n,
            });
            expect(committedLogs.length, "the batch published the commitment on the chain").toBe(1);

            // ── 3. Every relay stopped, every copy of the state gone ──
            if (sequencerProcess) {
                await stopSequencer(sequencerProcess);
                sequencerProcess = null;
            }
            if (secondProcess) {
                await stopSequencer(secondProcess);
                secondProcess = null;
            }
            for (const suffix of ["", ".tmp", ".next.jsonl", ".next.jsonl.tmp"]) {
                fs.rmSync(STATE_PATH + suffix, { force: true });
                fs.rmSync(TAKEOVER_STATE_PATH + suffix, { force: true });
            }
            fs.rmSync(ARCHIVE_PATH, { force: true });

            // ── 4. A relay with nothing rebuilds the state from the chain ──
            // It replays every settled batch's operations from the verifier's
            // transactions, checks each root against the chain's, writes the
            // state behind the current root as its kept file, and serves it.
            const REBUILT_URL = `http://127.0.0.1:${SEQUENCER_PORT + 3}`;
            rebuiltProcess = startSequencer(relay, {
                STATE_PATH: REBUILT_STATE_PATH,
                ARCHIVE_PATH: "",
                LISTEN_ADDR: `0.0.0.0:${SEQUENCER_PORT + 3}`,
                REBUILD_FROM_CHAIN: "1",
            });
            attachLogs(rebuiltProcess);
            // A relay that refuses to start exits at once; waiting the full
            // ready timeout for it would hide the refusal behind a timeout.
            let rebuiltOutput = "";
            rebuiltProcess.stdout?.on("data", (chunk: Buffer) => (rebuiltOutput += chunk.toString()));
            rebuiltProcess.stderr?.on("data", (chunk: Buffer) => (rebuiltOutput += chunk.toString()));
            const exited = new Promise<never>((_, reject) => {
                rebuiltProcess!.once("close", (code) =>
                    reject(new Error(`the rebuilt relay exited with ${code} before it was ready:\n${rebuiltOutput}`)),
                );
            });
            await Promise.race([waitForSequencer(REBUILT_URL, 10 * 60_000), exited]);
            const rebuilt = new SequencerClient({ url: REBUILT_URL });
            expect((await rebuilt.status()).state_root.toLowerCase(), "the rebuilt state is the chain's root").toBe(
                rootAfterCommit.toLowerCase(),
            );
            expect(fs.existsSync(REBUILT_STATE_PATH), "the rebuilt state is kept").toBe(true);

            // ── 5. The buyer's resolve, carried by the rebuilt relay ──
            const buyerResolveSig = await buyerWallet.signTypedData({
                domain,
                types: RESOLVE_TYPES,
                primaryType: "ResolveProcess" as const,
                message: { processId },
            });
            await rebuilt.submitResolve(processId, [commitment], buyerResolveSig);
            await waitForBatchCount(rebuilt, 1, 5 * 60_000);

            // ── 6. Paid out: the chain's facts ──
            const [buyerFinal, sellerFinal, verifierFinal] = await Promise.all([
                publicClient.readContract({
                    address: tokenAddress, abi: ERC20_ABI, functionName: "balanceOf",
                    args: [buyerAccount.address],
                }) as Promise<bigint>,
                publicClient.readContract({
                    address: tokenAddress, abi: ERC20_ABI, functionName: "balanceOf",
                    args: [sellerAccount.address],
                }) as Promise<bigint>,
                publicClient.readContract({
                    address: tokenAddress, abi: ERC20_ABI, functionName: "balanceOf",
                    args: [batchVerifierAddress],
                }) as Promise<bigint>,
            ]);
            // The first order left the buyer P and the seller 3P; this one adds the same.
            expect(buyerFinal).toBe(2n * PAYMENT);
            expect(sellerFinal).toBe(6n * PAYMENT);
            expect(verifierFinal).toBe(0n);
            const resolvedLogs = await publicClient.getContractEvents({
                address: batchVerifierAddress,
                abi: CORE_ABI,
                eventName: "OrderResolved",
                args: { orderHash },
                fromBlock: 0n,
            });
            expect(resolvedLogs.length, "the batch published the resolution on the chain").toBe(1);
        },
        15 * 60_000,
    );
});
