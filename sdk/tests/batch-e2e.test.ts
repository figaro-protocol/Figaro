/**
 * E2E integration test: SDK → Sequencer → FigaroBatchVerifier → on-chain.
 *
 * Requires:
 *   - Anvil running at http://127.0.0.1:8545
 *   - Sequencer binary built at prover/target/debug/sequencer
 *
 * Skip with: SKIP_ANVIL=1 npm test
 *
 * Flow:
 *   1. Deploy MockERC20, MockSP1Verifier, FigaroBatchVerifier
 *   2. Mint tokens, approve bonds to FigaroBatchVerifier
 *   3. Start sequencer as child process
 *   4. Submit Commit via SequencerClient
 *   5. Wait for batch to settle
 *   6. Verify: BatchSettled event, token balances
 *   7. Submit Resolve via SequencerClient
 *   8. Wait for second batch to settle
 *   9. Verify: final balances, state root advanced
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
    type Hex,
    type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { ChildProcess, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import {
    BATCH_VERIFIER_ABI,
    ERC20_ABI,
    buildCommitment,
    buildDomain,
    calculateBonds,
} from "../src/index.js";
import { SequencerClient } from "../src/agent/sequencer.js";

// ── Skip unless Anvil is reachable ──────────────────────────────────────────

const ANVIL_URL = "http://127.0.0.1:8545";
const SKIP = process.env.SKIP_ANVIL === "1";
const SEQUENCER_PORT = 13001; // Use a non-standard port to avoid conflicts

async function anvilReachable(): Promise<boolean> {
    try {
        const res = await fetch(ANVIL_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                method: "eth_chainId",
                params: [],
                id: 1,
            }),
            signal: AbortSignal.timeout(2000),
        });
        return res.ok;
    } catch {
        return false;
    }
}

// ── Anvil pre-funded accounts ───────────────────────────────────────────────

const DEPLOYER_KEY =
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const BUYER_KEY =
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex;
const SELLER_KEY =
    "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" as Hex;

const deployerAccount = privateKeyToAccount(DEPLOYER_KEY);
const buyerAccount = privateKeyToAccount(BUYER_KEY);
const sellerAccount = privateKeyToAccount(SELLER_KEY);

// ── Contract bytecode loaders ───────────────────────────────────────────────

function loadBytecode(contractPath: string): Hex {
    const repoRoot = path.resolve(import.meta.dirname, "../..");
    const artifact = JSON.parse(
        fs.readFileSync(path.join(repoRoot, "out", contractPath), "utf-8"),
    );
    return artifact.bytecode.object as Hex;
}

// ── Genesis state root computation ──────────────────────────────────────────
// The Rust kernel computes:
//   root = keccak256(keccak256("") × 5)
// — one empty-hash per state sub-map (processes, order_status,
// order_process_id, clauses_registered, sellers_registered); an empty
// BTreeMap hashes to keccak256(""). See prover/lib/src/state.rs `compute_root`.

function computeGenesisRoot(): Hex {
    const emptyHash = keccak256("0x"); // keccak256("") = 0xc5d2460186...
    // Concatenate 5 copies of the empty hash (each 32 bytes).
    const packed = encodePacked(
        ["bytes32", "bytes32", "bytes32", "bytes32", "bytes32"],
        [emptyHash, emptyHash, emptyHash, emptyHash, emptyHash],
    );
    return keccak256(packed);
}

// ── Sequencer process management ────────────────────────────────────────────

function sequencerBinaryPath(): string {
    const repoRoot = path.resolve(import.meta.dirname, "../..");
    return path.join(repoRoot, "prover", "target", "debug", "sequencer");
}

function sequencerBinaryExists(): boolean {
    return fs.existsSync(sequencerBinaryPath());
}

function startSequencer(
    batchVerifierAddress: Address,
): ChildProcess {
    const binPath = sequencerBinaryPath();
    const child = spawn(binPath, [], {
        env: {
            ...process.env,
            RPC_URL: ANVIL_URL,
            CHAIN_ID: "31337",
            BATCH_VERIFIER_ADDRESS: batchVerifierAddress,
            // The kernel uses this as the EIP-712 verifyingContract.
            // For the batch path, it must be the batch verifier address.
            FIGARO_CORE_ADDRESS: batchVerifierAddress,
            SEQUENCER_PRIVATE_KEY: DEPLOYER_KEY,
            LISTEN_ADDR: `0.0.0.0:${SEQUENCER_PORT}`,
            BATCH_INTERVAL_SECS: "2",
            MAX_BATCH_OPS: "50",
            RUST_LOG: "figaro_sequencer=debug,alloy=debug",
        },
        stdio: ["ignore", "pipe", "pipe"],
    });

    return child;
}

async function waitForSequencer(
    url: string,
    timeoutMs = 15000,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`${url}/status`, {
                signal: AbortSignal.timeout(1000),
            });
            if (res.ok) return;
        } catch {
            // Not ready yet
        }
        await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error(`Sequencer at ${url} did not become ready within ${timeoutMs}ms`);
}

async function waitForBatchCount(
    client: SequencerClient,
    minBatches: number,
    timeoutMs = 30000,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let lastStatus: string = "";
    while (Date.now() < deadline) {
        try {
            const status = await client.status();
            const statusStr = JSON.stringify(status);
            if (statusStr !== lastStatus) {
                console.log(`[batch-wait] status: ${statusStr}`);
                lastStatus = statusStr;
            }
            if (status.batches_settled >= minBatches) return;
        } catch (e) {
            console.log(`[batch-wait] error: ${e}`);
        }
        await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(
        `Sequencer did not reach ${minBatches} batches within ${timeoutMs}ms`,
    );
}

// ── Resolve typed data (batch-only construct) ───────────────────────────────

const RESOLVE_TYPES = {
    ResolveProcess: [{ name: "processId", type: "bytes32" }],
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
    let alive = false;
    let hasBinary = false;
    let sequencerProcess: ChildProcess | null = null;
    let sequencerClient: SequencerClient;

    const PAYMENT = 100n * 10n ** 18n;
    const bonds = calculateBonds(PAYMENT, PAYMENT);

    const SEQUENCER_URL = `http://127.0.0.1:${SEQUENCER_PORT}`;

    beforeAll(async () => {
        alive = await anvilReachable();
        if (!alive) return;

        hasBinary = sequencerBinaryExists();
        if (!hasBinary) return;

        // ── Deploy MockERC20 ────────────────────────────────────

        const MOCK_ERC20_ABI = parseAbi([
            "constructor(string name, string symbol)",
            "function mint(address to, uint256 amount) external",
            "function approve(address spender, uint256 amount) external returns (bool)",
            "function balanceOf(address account) external view returns (uint256)",
        ]);

        const tokenBytecode = loadBytecode("MockERC20.sol/MockERC20.json");
        const tokenHash = await deployerWallet.deployContract({
            abi: MOCK_ERC20_ABI,
            bytecode: tokenBytecode,
            args: ["TestToken", "TT"],
        });
        const tokenReceipt = await publicClient.waitForTransactionReceipt({
            hash: tokenHash,
        });
        tokenAddress = tokenReceipt.contractAddress!;

        // ── Deploy MockSP1Verifier ──────────────────────────────

        const mockVerifierBytecode = loadBytecode(
            "MockSP1Verifier.sol/MockSP1Verifier.json",
        );
        const verifierHash = await deployerWallet.deployContract({
            abi: [],
            bytecode: mockVerifierBytecode,
        });
        const verifierReceipt = await publicClient.waitForTransactionReceipt({
            hash: verifierHash,
        });
        const mockVerifierAddress = verifierReceipt.contractAddress!;

        // ── Deploy FigaroBatchVerifier ───────────────────────────

        const BATCH_VERIFIER_DEPLOY_ABI = parseAbi([
            "constructor(address _verifier, bytes32 _programVKey, bytes32 _initialRoot)",
        ]);

        const genesisRoot = computeGenesisRoot();
        const batchVerifierBytecode = loadBytecode(
            "FigaroBatchVerifier.sol/FigaroBatchVerifier.json",
        );
        const bvHash = await deployerWallet.deployContract({
            abi: BATCH_VERIFIER_DEPLOY_ABI,
            bytecode: batchVerifierBytecode,
            args: [
                mockVerifierAddress,
                keccak256(encodePacked(["string"], ["figaro-kernel-dev"])),
                genesisRoot,
            ],
        });
        const bvReceipt = await publicClient.waitForTransactionReceipt({
            hash: bvHash,
        });
        batchVerifierAddress = bvReceipt.contractAddress!;

        // ── Verify genesis root matches ─────────────────────────

        const onChainRoot = await publicClient.readContract({
            address: batchVerifierAddress,
            abi: BATCH_VERIFIER_ABI,
            functionName: "stateRoot",
        });
        expect(onChainRoot).toBe(genesisRoot);

        // ── Mint tokens and approve to batch verifier ───────────

        // Buyer: needs 2×payment for bond
        await deployerWallet
            .writeContract({
                address: tokenAddress,
                abi: MOCK_ERC20_ABI,
                functionName: "mint",
                args: [buyerAccount.address, bonds.buyerBond],
            })
            .then((h) => publicClient.waitForTransactionReceipt({ hash: h }));

        // Seller: needs 2×payment for bond
        await deployerWallet
            .writeContract({
                address: tokenAddress,
                abi: MOCK_ERC20_ABI,
                functionName: "mint",
                args: [sellerAccount.address, bonds.sellerBond],
            })
            .then((h) => publicClient.waitForTransactionReceipt({ hash: h }));

        // Approve batch verifier to pull bonds
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

        sequencerProcess = startSequencer(batchVerifierAddress);

        // Capture stderr for debugging
        let sequencerLogs: string[] = [];
        sequencerProcess.stderr?.on("data", (chunk: Buffer) => {
            const line = chunk.toString().trim();
            if (line) {
                sequencerLogs.push("[err] " + line);
                console.error("[sequencer:err]", line);
            }
        });
        sequencerProcess.stdout?.on("data", (chunk: Buffer) => {
            const line = chunk.toString().trim();
            if (line) {
                sequencerLogs.push("[out] " + line);
                console.log("[sequencer:out]", line);
            }
        });

        sequencerClient = new SequencerClient({ url: SEQUENCER_URL });
        await waitForSequencer(SEQUENCER_URL);
    }, 60_000);

    afterAll(async () => {
        if (sequencerProcess) {
            sequencerProcess.kill("SIGTERM");
            // Wait briefly for graceful shutdown
            await new Promise((r) => setTimeout(r, 500));
            if (!sequencerProcess.killed) {
                sequencerProcess.kill("SIGKILL");
            }
            sequencerProcess = null;
        }
    });

    it("skips when Anvil is unreachable", () => {
        if (!alive) {
            console.log("⏭ Skipping: Anvil not reachable");
            return;
        }
        expect(alive).toBe(true);
    });

    it("skips when sequencer binary is not built", () => {
        if (!hasBinary) {
            console.log(
                `⏭ Skipping: sequencer binary not found at ${sequencerBinaryPath()}`,
            );
            return;
        }
        expect(hasBinary).toBe(true);
    });

    it("deploys contracts successfully", () => {
        if (!alive || !hasBinary) return;
        expect(tokenAddress).toBeDefined();
        expect(batchVerifierAddress).toBeDefined();
    });

    it("full batch lifecycle: submit commit → batch settles → submit resolve → verify", async () => {
        if (!alive || !hasBinary) return;

        // ── 1. Build commitment ─────────────────────────────────

        // Domain uses batch verifier as verifying contract (batch path)
        const domain = buildDomain(31337, batchVerifierAddress);
        const agreementHash =
            "0x0000000000000000000000000000000000000000000000000000000000000001" as Hex;

        const { commitment, typedData } = buildCommitment(
            {
                processId:
                    "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex,
                buyer: buyerAccount.address,
                seller: sellerAccount.address,
                currency: tokenAddress,
                payment: PAYMENT,
                expectedCumulativeValue: PAYMENT,
                agreementHash,
                salt: 42n,
                deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
            },
            domain,
        );

        // ── 2. Sign (both parties) ──────────────────────────────

        const buyerSig = await buyerWallet.signTypedData(typedData);
        const sellerSig = await sellerWallet.signTypedData(typedData);

        // ── 3. Submit Commit to sequencer ────────────────────────

        const commitResult = await sequencerClient.submitCommit(
            commitment,
            buyerSig,
            sellerSig,
        );
        expect(commitResult.id).toBeDefined();
        expect(typeof commitResult.id).toBe("number");

        // Check the sequencer accepted the operation
        const statusAfterSubmit = await sequencerClient.status();
        console.log("[test] Status after commit submit:", JSON.stringify(statusAfterSubmit));
        expect(statusAfterSubmit.pending_ops).toBeGreaterThanOrEqual(1);

        // ── 4. Wait for batch 1 to settle ───────────────────────

        await waitForBatchCount(sequencerClient, 1);

        // ── 5. Verify batch 1: tokens pulled from users ─────────

        const buyerBalAfterCommit = (await publicClient.readContract({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [buyerAccount.address],
        })) as bigint;

        const sellerBalAfterCommit = (await publicClient.readContract({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [sellerAccount.address],
        })) as bigint;

        const verifierBalAfterCommit = (await publicClient.readContract({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [batchVerifierAddress],
        })) as bigint;

        // Buyer and seller each had 2×payment, now it's all in the verifier
        expect(buyerBalAfterCommit).toBe(0n);
        expect(sellerBalAfterCommit).toBe(0n);
        expect(verifierBalAfterCommit).toBe(bonds.buyerBond + bonds.sellerBond);

        // ── 6. Verify BatchSettled event emitted ────────────────

        const batchCount = (await publicClient.readContract({
            address: batchVerifierAddress,
            abi: BATCH_VERIFIER_ABI,
            functionName: "batchCount",
        })) as bigint;
        expect(batchCount).toBe(1n);

        // ── 7. Compute processId for Resolve ────────────────────

        // For root orders, processId = hashTypedData(domain, commitmentStructHash)
        const processId = hashTypedData(typedData) as Hex;

        // ── 8. Build & sign Resolve ─────────────────────────────

        const resolveTypedData = {
            domain,
            types: RESOLVE_TYPES,
            primaryType: "ResolveProcess" as const,
            message: { processId },
        };

        const buyerResolveSig = await buyerWallet.signTypedData(resolveTypedData);

        // ── 9. Submit Resolve to sequencer ───────────────────────

        const resolveResult = await sequencerClient.submitResolve(
            processId,
            [commitment],
            buyerResolveSig,
        );
        expect(resolveResult.id).toBeDefined();

        // ── 10. Wait for batch 2 to settle ──────────────────────

        await waitForBatchCount(sequencerClient, 2);

        // ── 11. Verify final token balances ─────────────────────

        const [buyerFinal, sellerFinal, verifierFinal] = await Promise.all([
            publicClient.readContract({
                address: tokenAddress,
                abi: ERC20_ABI,
                functionName: "balanceOf",
                args: [buyerAccount.address],
            }) as Promise<bigint>,
            publicClient.readContract({
                address: tokenAddress,
                abi: ERC20_ABI,
                functionName: "balanceOf",
                args: [sellerAccount.address],
            }) as Promise<bigint>,
            publicClient.readContract({
                address: tokenAddress,
                abi: ERC20_ABI,
                functionName: "balanceOf",
                args: [batchVerifierAddress],
            }) as Promise<bigint>,
        ]);

        // After full lifecycle:
        // Buyer gets payment back (bond was 2×payment, net payout = payment)
        // Seller gets 3×payment (bond was 2×payment, net payout = 3×payment)
        // Verifier holds nothing
        expect(buyerFinal).toBe(PAYMENT);
        expect(sellerFinal).toBe(3n * PAYMENT);
        expect(verifierFinal).toBe(0n);

        // ── 12. Verify state root advanced ──────────────────────

        const finalRoot = (await publicClient.readContract({
            address: batchVerifierAddress,
            abi: BATCH_VERIFIER_ABI,
            functionName: "stateRoot",
        })) as Hex;

        const genesisRoot = computeGenesisRoot();
        expect(finalRoot).not.toBe(genesisRoot);

        const finalBatchCount = (await publicClient.readContract({
            address: batchVerifierAddress,
            abi: BATCH_VERIFIER_ABI,
            functionName: "batchCount",
        })) as bigint;
        expect(finalBatchCount).toBe(2n);

        // ── 13. Verify sequencer status matches ─────────────────

        const status = await sequencerClient.status();
        expect(status.batches_settled).toBe(2);
        expect(status.pending_ops).toBe(0);
    }, 60_000);
});
