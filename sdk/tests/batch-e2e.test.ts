/**
 * E2E integration test: SDK → Sequencer → FigaroBatchVerifier → on-chain.
 *
 * The cross-language lock for the proof apparatus: TypeScript signs the
 * ops and builds the witness payload, the Rust sequencer runs the kernel
 * + guest and submits, and the Solidity verifier checks the hashes and
 * the ClauseRegistry spec-binding anchor. If any layer's bytes drift,
 * this test fails.
 *
 * Requires:
 *   - Anvil running at http://127.0.0.1:8545
 *   - Sequencer binary built at prover/target/debug/sequencer
 *     (cargo build -p figaro-sequencer)
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
    getContractAddress,
    hashTypedData,
    stringToHex,
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

// ── Contract bytecode loaders ───────────────────────────────────────────────

function loadBytecode(contractPath: string): Hex {
    const repoRoot = path.resolve(import.meta.dirname, "../..");
    const artifact = JSON.parse(
        fs.readFileSync(path.join(repoRoot, "out", contractPath), "utf-8"),
    );
    return artifact.bytecode.object as Hex;
}

// ── The witness clause: figaro-modalities, exact registered bytes ────────────

function loadSpecJson(clauseId: string): string {
    const repoRoot = path.resolve(import.meta.dirname, "../..");
    return fs.readFileSync(path.join(repoRoot, "clauses", `${clauseId}.json`), "utf-8");
}

const SECTION_DATA = `{"modality":"delivery"}`;

// ── Genesis state root computation ──────────────────────────────────────────
// The Rust kernel computes:
//   root = keccak256(keccak256("") × 3)
// — one empty-hash per state sub-map (processes, order_status,
// order_process_id); an empty BTreeMap hashes to keccak256("").
// See prover/lib/src/state.rs `compute_root`.

function computeGenesisRoot(): Hex {
    const emptyHash = keccak256("0x"); // keccak256("") = 0xc5d2460186...
    // The fourth leg is the RPGF usage state — the counted set, the per-period
    // pair set, and the running accrual. Each is length-prefixed, so on the
    // empty state the leg is keccak over three zero-length sections.
    const emptyUsage = keccak256(encodePacked(["uint64", "uint64", "uint64"], [0n, 0n, 0n]));
    const packed = encodePacked(
        ["bytes32", "bytes32", "bytes32", "bytes32"],
        [emptyHash, emptyHash, emptyHash, emptyUsage],
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
    usageCounterAddress: Address,
    registries: { clauses: Address; assemblies: Address; members: Address },
): ChildProcess {
    const binPath = sequencerBinaryPath();
    const child = spawn(binPath, [], {
        env: {
            ...process.env,
            RPC_URL: ANVIL_URL,
            CHAIN_ID: "31337",
            BATCH_VERIFIER_ADDRESS: batchVerifierAddress,
            // The RPGF counter the sequencer reads the open period and the
            // provenance clause from.
            USAGE_COUNTER_ADDRESS: usageCounterAddress,
            // The registry addresses the usage-claim PRE-FILTER eth-calls
            // (excluded / live-deposit / live-stake gates). Left unset they
            // default to address(0), every read fails, and each claim is
            // dropped "conservatively" — the batch settles with EMPTY accruals
            // and the counter credits nothing, silently (056365a6).
            CLAUSE_REGISTRY_ADDRESS: registries.clauses,
            ASSEMBLY_REGISTRY_ADDRESS: registries.assemblies,
            MEMBERS_REGISTRY_ADDRESS: registries.members,
            // The kernel uses this as the EIP-712 verifyingContract.
            // For the batch path, it must be the batch verifier address.
            FIGARO_CORE_ADDRESS: batchVerifierAddress,
            SEQUENCER_PRIVATE_KEY: DEPLOYER_KEY,
            // A fresh archive per run: the default path persists in the sdk/
            // cwd across runs, and a replayed journal re-admits operations
            // against the PREVIOUS run's (dead) contract addresses — the
            // batch poisons and nothing settles.
            ARCHIVE_PATH: `sequencer-archive-e2e-${process.pid}.jsonl`,
            LISTEN_ADDR: `0.0.0.0:${SEQUENCER_PORT}`,
            BATCH_INTERVAL_SECS: "2",
            MAX_BATCH_OPS: "50",
            RUST_LOG: "figaro_sequencer=debug",
        },
        stdio: ["ignore", "pipe", "pipe"],
    });

    return child;
}

async function waitForSequencer(url: string, timeoutMs = 15000): Promise<void> {
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
    let clauseRegistryAddress: Address;
    let batchVerifierAddress: Address;
    let usageCounterAddress: Address;
    let alive = false;
    let hasBinary = false;
    let sequencerProcess: ChildProcess | null = null;
    let sequencerClient: SequencerClient;

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

        // ── Deploy ClauseRegistry + anchor the witness clause ───

        const CLAUSE_REGISTRY_DEPLOY_ABI = parseAbi([
            "constructor(uint256 _registrationDeposit)",
            "function registerClause(string clauseId, uint64 version, bytes32 contentHash, string contentURI) external payable",
            "function contentHashOf(bytes32 idHash) view returns (bytes32)",
        ]);
        const registryBytecode = loadBytecode("ClauseRegistry.sol/ClauseRegistry.json");
        const regHash = await deployerWallet.deployContract({
            abi: CLAUSE_REGISTRY_DEPLOY_ABI,
            bytecode: registryBytecode,
            args: [0n], // zero-deposit registry keeps the e2e's value legs about bonds only
        });
        const regReceipt = await publicClient.waitForTransactionReceipt({ hash: regHash });
        clauseRegistryAddress = regReceipt.contractAddress!;

        // Anchor the EXACT spec bytes the witness proof will carry.
        const specHash = keccak256(stringToHex(specJson));
        await deployerWallet
            .writeContract({
                address: clauseRegistryAddress,
                abi: CLAUSE_REGISTRY_DEPLOY_ABI,
                functionName: "registerClause",
                args: [parsedSpec.clauseId, BigInt(parsedSpec.version), specHash, "ipfs://spec"],
            })
            .then((h) => publicClient.waitForTransactionReceipt({ hash: h }));

        const anchored = await publicClient.readContract({
            address: clauseRegistryAddress,
            abi: CLAUSE_REGISTRY_DEPLOY_ABI,
            functionName: "contentHashOf",
            args: [clauseKey],
        });
        expect(anchored).toBe(specHash);

        // ── Deploy FigaroBatchVerifier ───────────────────────────

        // ── Deploy the RPGF counter the verifier writes through ──
        // The two reference each other, so the verifier's address is predicted
        // from the deployer nonce and asserted after — the same dance the
        // deploy scripts perform.
        const coreHashForCounter = await deployerWallet.deployContract({
            abi: parseAbi(["constructor()"]),
            bytecode: loadBytecode("FigaroCore.sol/FigaroCore.json"),
            args: [],
        });
        const coreAddress = (
            await publicClient.waitForTransactionReceipt({ hash: coreHashForCounter })
        ).contractAddress!;

        const membersHash = await deployerWallet.deployContract({
            abi: parseAbi(["constructor(uint256 _registrationDeposit, uint256 _withdrawalCooldown)"]),
            bytecode: loadBytecode("MembersRegistry.sol/MembersRegistry.json"),
            args: [0n, 0n],
        });
        const membersAddress = (
            await publicClient.waitForTransactionReceipt({ hash: membersHash })
        ).contractAddress!;

        // The counter counts a settled process only while its seller-of-record
        // holds a LIVE MembersRegistry stake. Zero deposit here — the gate
        // under test is the stake's EXISTENCE, not its size.
        const registerHash = await sellerWallet.writeContract({
            address: membersAddress,
            abi: parseAbi(["function register(string metadataURI) payable"]),
            functionName: "register",
            args: ["ipfs://batch-e2e-seller"],
        });
        await publicClient.waitForTransactionReceipt({ hash: registerHash });

        // The counter gates accrual on LIVE clause-or-assembly registration (the 08-01
        // audit fix), so it takes both clause-or-assembly registries. The clause under
        // test is already anchored in clauseRegistryAddress above; assemblies
        // play no part in this fixture, so an empty zero-deposit registry
        // satisfies the constructor's nonzero check.
        const assemblyRegistryHash = await deployerWallet.deployContract({
            abi: parseAbi(["constructor(uint256 _registrationDeposit)"]),
            bytecode: loadBytecode("AssemblyRegistry.sol/AssemblyRegistry.json"),
            args: [0n],
        });
        const assemblyRegistryAddress = (
            await publicClient.waitForTransactionReceipt({ hash: assemblyRegistryHash })
        ).contractAddress!;

        const deployerNonce = await publicClient.getTransactionCount({
            address: deployerAccount.address,
        });
        const predictedVerifier = getContractAddress({
            from: deployerAccount.address,
            nonce: BigInt(deployerNonce) + 1n,
        });

        const usageCounterHash = await deployerWallet.deployContract({
            abi: parseAbi([
                "constructor(address _core, address _members, address _clauses, address _assemblies, address _batchVerifier, bytes32 _provenanceClause, bytes32[] _excluded, uint64 _minSellers, uint64[] _periodEnd)",
            ]),
            bytecode: loadBytecode("UsageCounter.sol/UsageCounter.json"),
            args: [
                coreAddress,
                membersAddress,
                clauseRegistryAddress,
                assemblyRegistryAddress,
                predictedVerifier,
                keccak256(encodeAbiParameters(
                    [{ type: "string" }, { type: "uint64" }],
                    ["figaro-assembly-provenance", 1n],
                )),
                [],
                // minSellers = 1: this fixture drives ONE seller end to end and
                // proves the bridge's plumbing; the floor's own behavior is
                // proven in UsageCounterTest's floor section and driven at the
                // mainnet value by rpgf-rewards.devnet.spec.ts.
                1n,
                [BigInt(Math.floor(Date.now() / 1000) + 3600)],
            ],
        });
        usageCounterAddress = (
            await publicClient.waitForTransactionReceipt({ hash: usageCounterHash })
        ).contractAddress!;

        const BATCH_VERIFIER_DEPLOY_ABI = parseAbi([
            "constructor(address _verifier, bytes32 _programVKey, address _clauseRegistry, address _usageCounter, bytes32 _initialRoot)",
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
                clauseRegistryAddress,
                usageCounterAddress,
                genesisRoot,
            ],
        });
        const bvReceipt = await publicClient.waitForTransactionReceipt({
            hash: bvHash,
        });
        batchVerifierAddress = bvReceipt.contractAddress!;
        expect(batchVerifierAddress.toLowerCase()).toBe(predictedVerifier.toLowerCase());

        // ── Verify genesis root matches ─────────────────────────

        const onChainRoot = await publicClient.readContract({
            address: batchVerifierAddress,
            abi: BATCH_VERIFIER_ABI,
            functionName: "stateRoot",
        });
        expect(onChainRoot).toBe(genesisRoot);

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

        sequencerProcess = startSequencer(batchVerifierAddress, usageCounterAddress, {
            clauses: clauseRegistryAddress,
            assemblies: assemblyRegistryAddress,
            members: membersAddress,
        });

        sequencerProcess.stderr?.on("data", (chunk: Buffer) => {
            const line = chunk.toString().trim();
            if (line) console.error("[sequencer:err]", line);
        });
        sequencerProcess.stdout?.on("data", (chunk: Buffer) => {
            const line = chunk.toString().trim();
            if (line) console.log("[sequencer:out]", line);
        });

        sequencerClient = new SequencerClient({ url: SEQUENCER_URL });
        await waitForSequencer(SEQUENCER_URL);
    }, 60_000);

    afterAll(async () => {
        if (sequencerProcess) {
            sequencerProcess.kill("SIGTERM");
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

    it("full batch lifecycle: commit + witness attest settle, then resolve pays out", async () => {
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

        // ── 5b. Claim the RPGF usage for the process this batch settles ──
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
        // A batch can settle perfectly while crediting nothing, and that is
        // exactly the failure this bridge exists to prevent.
        const batchAccrual = (await publicClient.readContract({
            address: usageCounterAddress,
            abi: USAGE_COUNTER_ABI,
            functionName: "batchAccrualOf",
            args: [clauseKey, 0],
        })) as readonly [bigint, bigint, bigint];

        expect(batchAccrual[0], "one distinct settled process").toBe(1n);
        expect(batchAccrual[1], "one distinct (buyer, seller) pair").toBe(1n);
        expect(batchAccrual[2], "and it is scored").toBeGreaterThan(0n);

        // The reward reads the MERGED score; nothing settled on the direct
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

        // ── 7. State root advanced; both batches settled ────────

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
    }, 60_000);
});
