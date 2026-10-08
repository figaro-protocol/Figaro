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
 *   - Anvil running at http://127.0.0.1:8545
 *   - Sequencer binary built at prover/target/release/sequencer
 *     (cargo build --release -p figaro-sequencer)
 *
 * Skip with: SKIP_ANVIL=1 npm test
 *
 * Flow:
 *   1. Deploy MockERC20, MockSP1Verifier, ClauseRegistry, FigaroBatchVerifier
 *   2. Register figaro-modalities on ClauseRegistry (anchors contentHashOf)
 *   3. Mint tokens, approve bonds to FigaroBatchVerifier
 *   4. Start sequencer as child process
 *   5. Submit Commit + AttestAsSeller (RuntimeWitness) via SequencerClient
 *   6. Wait for batch 1: bonds pulled, Attestation re-emitted
 *   6b. A relay holding no state refuses to start; a second relay starts
 *       on the state the first publishes (GET /state); the relay that built
 *       batch 1 restarts and resumes on its kept state
 *   7. Submit Resolve; wait for batch 2
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
    encodeAbiParameters,
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
    ERC20_ABI,
    buildCommitment,
    buildDomain,
    calculateBonds,
    computeOrderHash,
    USAGE_COUNTER_ABI,
    buildUsageClaims,
    fetchUsageClaimContext,
    computeAgreementHash,
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

const SECTION_DATA = `{"modality":"delivery"}`;

/** The relay's state file for this run: the preimage of the verifier's root. */
const STATE_PATH = path.join(os.tmpdir(), `sequencer-state-e2e-${process.pid}.json`);

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
    let sequencerClient: SequencerClient;
    let relay: RelayConfig;

    const PAYMENT = 100n * 10n ** 18n;
    const bonds = calculateBonds(PAYMENT, PAYMENT);

    const SEQUENCER_URL = `http://127.0.0.1:${SEQUENCER_PORT}`;

    // The witness clause, prepared once: exact spec bytes, clause key,
    // content_ref (canonical ABI encoding at stage 0), and the section
    // leaf that becomes the single-section agreementHash.
    const specJson = loadSpecJson("figaro-modalities");
    const parsedSpec = (() => {
        const r = parseClauseSpec(JSON.parse(specJson));
        if (!r.ok) throw new Error(`spec parse failed: ${JSON.stringify(r.errors)}`);
        return r.spec;
    })();
    const clauseKey = keccak256(
        encodeAbiParameters(
            [{ type: "string" }, { type: "uint64" }],
            [parsedSpec.clauseId, BigInt(parsedSpec.version)],
        ),
    );
    const contentRef = keccak256(
        encodeContentFromSpec(parsedSpec, JSON.parse(SECTION_DATA), { stage: 0 }),
    );
    // Double-hashed leaf (leaf/node domain separation) — must mirror
    // computeSectionLeaf / the coordinator / the prover's Gate I.
    const sectionLeaf = keccak256(
        keccak256(
            encodePacked(["bytes32", "bytes32"], [clauseKey, keccak256(stringToHex(SECTION_DATA))]),
        ),
    );
    const witnessProof: SequencerContentProof = {
        spec_json: specJson,
        content_json: SECTION_DATA,
        section_data: SECTION_DATA,
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
            clauseId: parsedSpec.clauseId,
            version: parsedSpec.version,
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
            archivePath: `sequencer-archive-e2e-${process.pid}.jsonl`,
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
        for (const suffix of ["", ".tmp", ".next.jsonl", ".next.jsonl.tmp"]) {
            fs.rmSync(STATE_PATH + suffix, { force: true });
        }
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
        // The single-section agreement: agreementHash IS the section
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
                agreementHash: sectionLeaf,
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
            role: commitment,
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

        // A second relay takes over from the published state: it fetches
        // the first relay's GET /state into its own STATE_PATH and starts on
        // it, holding the verifier's root. Nothing in the fetched file is
        // trusted — the relay recomputes the root and would refuse a wrong one.
        const takeoverState = path.join(os.tmpdir(), `sequencer-state-e2e-${process.pid}-takeover.json`);
        const publishedState = await fetch(`${SEQUENCER_URL}/state`);
        expect(publishedState.ok).toBe(true);
        fs.writeFileSync(takeoverState, Buffer.from(await publishedState.arrayBuffer()));
        const second = startSequencer(relay, {
            STATE_PATH: takeoverState,
            ARCHIVE_PATH: "",
            LISTEN_ADDR: `0.0.0.0:${SEQUENCER_PORT + 2}`,
        });
        try {
            await waitForSequencer(`http://127.0.0.1:${SEQUENCER_PORT + 2}`, 10 * 60_000);
            const secondStatus = await new SequencerClient({ url: `http://127.0.0.1:${SEQUENCER_PORT + 2}` }).status();
            const rootNow = await publicClient.readContract({
                address: batchVerifierAddress,
                abi: BATCH_VERIFIER_ABI,
                functionName: "stateRoot",
            });
            expect(secondStatus.state_root.toLowerCase()).toBe((rootNow as string).toLowerCase());
        } finally {
            await stopSequencer(second);
            for (const suffix of ["", ".tmp", ".next.jsonl", ".next.jsonl.tmp"]) {
                fs.rmSync(takeoverState + suffix, { force: true });
            }
        }

        // The relay that built batch 1 restarts and resumes on its kept
        // state: the resolve below lands in a batch built on it.
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

        const resolveResult = await sequencerClient.submitResolve(
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
            sections: [
                {
                    clause: parsedSpec.clauseId,
                    version: parsedSpec.version,
                    data: JSON.parse(SECTION_DATA),
                },
            ],
        };
        // The SDK's agreement hash must equal the leaf this test signed by hand;
        // if it did not, the inclusion proof below would be proving a different
        // agreement than the one on chain.
        expect(computeAgreementHash(agreement)).toBe(sectionLeaf);

        const claimContext = await fetchUsageClaimContext(
            publicClient,
            usageCounterAddress,
            agreement,
        );
        const claims = buildUsageClaims(commitment, agreement, claimContext);
        expect(claims).toHaveLength(1);
        expect(claims[0].clause_or_assembly).toBe(clauseKey);

        const submitted = await sequencerClient.submitUsageClaim(claims[0]);
        expect(submitted.pending).toBe(1);

        await waitForBatchCount(sequencerClient, 2);

        // ── 5c. THE CHAIN FACT: the accrual landed on the COUNTER ──
        // Read from the counter's own storage — not from the sequencer's
        // report, and not from the verifier that claims to have written it.
        // A batch can resolve perfectly while crediting nothing, and that is
        // exactly the failure this bridge exists to prevent.
        const batchAccrual = (await publicClient.readContract({
            address: usageCounterAddress,
            abi: USAGE_COUNTER_ABI,
            functionName: "batchAccrualOf",
            args: [clauseKey, 0],
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
            args: [clauseKey, 0],
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

        const status = await sequencerClient.status();
        expect(status.batches_settled).toBe(2);
        expect(status.pending_ops).toBe(0);

        // ── 8. What the relay PUBLISHED, read as a stranger reads it ──
        // The relay's wire and this client's types are two statements of one
        // record; a field the two name differently arrives as `undefined` and
        // reads as a batch that never reached the chain. Every anchor the
        // relay publishes is checked against the chain's own receipt.
        const published = await sequencerClient.order(orderHash);
        expect(published, "the relay publishes the order it resolved").not.toBeNull();
        const commitAnchor = published!.commit!.batch;
        const resolutionAnchor = published!.resolution!.batch;
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
        const page = await sequencerClient.batches();
        expect(page.batches.map((b) => b.resolution_tx)).toEqual([
            commitAnchor.resolution_tx,
            resolutionAnchor.resolution_tx,
        ]);
    }, 5 * 60_000);
});
