/**
 * The batch-path harness shared by the relay's chain-touching suites
 * (`batch-e2e.test.ts`, `batch-revoke-e2e.test.ts`): the chain probe, the
 * stack deployment (MockERC20, MockSP1Verifier, ClauseRegistry with the
 * witness clause anchored, FigaroCore, MembersRegistry, AssemblyRegistry,
 * UsageCounter, FigaroBatchVerifier), and the relay's process management.
 *
 * Requires Anvil at http://127.0.0.1:8545 and the release sequencer binary at
 * prover/target/release/sequencer (cargo build --release -p figaro-sequencer).
 */

import { expect } from "vitest";
import {
    encodeAbiParameters,
    encodePacked,
    getContractAddress,
    keccak256,
    parseAbi,
    stringToHex,
    type Address,
    type Hex,
    type PublicClient,
    type WalletClient,
    type Account,
    type Chain,
    type Transport,
} from "viem";
import { ChildProcess, spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { BATCH_VERIFIER_ABI } from "../src/index.js";
import type { SequencerClient } from "../src/agent/sequencer.js";

export const ANVIL_URL = "http://127.0.0.1:8545";

export async function anvilReachable(): Promise<boolean> {
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

// ── Contract bytecode loaders ───────────────────────────────────────────────

function loadBytecode(contractPath: string): Hex {
    const repoRoot = path.resolve(import.meta.dirname, "../..");
    const artifact = JSON.parse(
        fs.readFileSync(path.join(repoRoot, "out", contractPath), "utf-8"),
    );
    return artifact.bytecode.object as Hex;
}

// ── The witness clause: figaro-modalities, exact registered bytes ────────────

export function loadSpecJson(clauseId: string): string {
    const repoRoot = path.resolve(import.meta.dirname, "../..");
    return fs.readFileSync(path.join(repoRoot, "clauses", `${clauseId}.json`), "utf-8");
}

// ── Genesis state root computation ──────────────────────────────────────────
// The Rust mirror computes:
//   root = keccak256(keccak256("") × 3)
// — one empty-hash per state sub-map (processes, order_status,
// order_process_id); an empty BTreeMap hashes to keccak256("").
// See prover/lib/src/state.rs `compute_root`.

export function computeGenesisRoot(): Hex {
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

// ── The stack ───────────────────────────────────────────────────────────────

export const MOCK_ERC20_ABI = parseAbi([
    "constructor(string name, string symbol)",
    "function mint(address to, uint256 amount) external",
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function balanceOf(address account) external view returns (uint256)",
]);

export interface BatchStack {
    tokenAddress: Address;
    clauseRegistryAddress: Address;
    batchVerifierAddress: Address;
    usageCounterAddress: Address;
    membersAddress: Address;
    registries: { clauses: Address; assemblies: Address; members: Address };
}

type Wallet = WalletClient<Transport, Chain, Account>;

/**
 * Deploy the batch-path stack from `deployerWallet` and anchor the witness
 * clause's EXACT spec bytes. The deployer must be dedicated to this call: the
 * counter and the verifier reference each other, so the verifier's address is
 * predicted from the deployer's nonce, and any other transaction from the same
 * account landing in between makes the prediction wrong.
 */
export async function deployBatchStack(
    publicClient: PublicClient,
    deployerWallet: Wallet,
    witness: { specJson: string; clauseId: string; version: number; clauseKey: Hex },
): Promise<BatchStack> {
    const deployer = deployerWallet.account.address;

    // ── Deploy MockERC20 ────────────────────────────────────

    const tokenBytecode = loadBytecode("MockERC20.sol/MockERC20.json");
    const tokenHash = await deployerWallet.deployContract({
        abi: MOCK_ERC20_ABI,
        bytecode: tokenBytecode,
        args: ["TestToken", "TT"],
    });
    const tokenReceipt = await publicClient.waitForTransactionReceipt({
        hash: tokenHash,
    });
    const tokenAddress = tokenReceipt.contractAddress!;

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
    const clauseRegistryAddress = regReceipt.contractAddress!;

    // Anchor the EXACT spec bytes the witness proof will carry.
    const specHash = keccak256(stringToHex(witness.specJson));
    await deployerWallet
        .writeContract({
            address: clauseRegistryAddress,
            abi: CLAUSE_REGISTRY_DEPLOY_ABI,
            functionName: "registerClause",
            args: [witness.clauseId, BigInt(witness.version), specHash, "ipfs://spec"],
        })
        .then((h) => publicClient.waitForTransactionReceipt({ hash: h }));

    const anchored = await publicClient.readContract({
        address: clauseRegistryAddress,
        abi: CLAUSE_REGISTRY_DEPLOY_ABI,
        functionName: "contentHashOf",
        args: [witness.clauseKey],
    });
    expect(anchored).toBe(specHash);

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
        address: deployer,
    });
    const predictedVerifier = getContractAddress({
        from: deployer,
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
    const usageCounterAddress = (
        await publicClient.waitForTransactionReceipt({ hash: usageCounterHash })
    ).contractAddress!;

    // ── Deploy FigaroBatchVerifier ───────────────────────────

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
            embeddedVkey(),
            clauseRegistryAddress,
            usageCounterAddress,
            genesisRoot,
        ],
    });
    const bvReceipt = await publicClient.waitForTransactionReceipt({
        hash: bvHash,
    });
    const batchVerifierAddress = bvReceipt.contractAddress!;
    expect(batchVerifierAddress.toLowerCase()).toBe(predictedVerifier.toLowerCase());

    // ── Verify genesis root matches ─────────────────────────

    const onChainRoot = await publicClient.readContract({
        address: batchVerifierAddress,
        abi: BATCH_VERIFIER_ABI,
        functionName: "stateRoot",
    });
    expect(onChainRoot).toBe(genesisRoot);

    return {
        tokenAddress,
        clauseRegistryAddress,
        batchVerifierAddress,
        usageCounterAddress,
        membersAddress,
        registries: {
            clauses: clauseRegistryAddress,
            assemblies: assemblyRegistryAddress,
            members: membersAddress,
        },
    };
}

// ── Sequencer process management ────────────────────────────────────────────

export function sequencerBinaryPath(): string {
    const repoRoot = path.resolve(import.meta.dirname, "../..");
    // The RELEASE binary: SP1's key setup runs inside the sequencer (the
    // startup fingerprint check, `--vkey`), seconds optimized and the better
    // part of an hour unoptimized.
    return path.join(repoRoot, "prover", "target", "release", "sequencer");
}

export function sequencerBinaryExists(): boolean {
    return fs.existsSync(sequencerBinaryPath());
}

/// The fingerprint of the guest the binary embeds (`sequencer --vkey`). The
/// verifier is deployed with THIS value, so the run proves the wiring the
/// way a real deploy does: the relay's startup check compares its own
/// fingerprint with the verifier's and refuses to run on a mismatch.
function embeddedVkey(): Hex {
    const out = spawnSync(sequencerBinaryPath(), ["--vkey"], { encoding: "utf8" });
    const line = (out.stdout ?? "").split("\n").find((l) => l.startsWith("SP1_PROGRAM_VKEY="));
    if (out.status !== 0 || !line) {
        throw new Error(`sequencer --vkey failed (status ${out.status}): ${out.stderr}`);
    }
    return line.slice("SP1_PROGRAM_VKEY=".length).trim() as Hex;
}

/** One relay's wiring: the stack it resolves against and its own process facts. */
export interface RelayConfig {
    batchVerifierAddress: Address;
    usageCounterAddress: Address;
    registries: { clauses: Address; assemblies: Address; members: Address };
    /** The relay's signing key (it sends settleBatch). */
    privateKey: Hex;
    port: number;
    /** The relay's state file: the preimage of the verifier's root. */
    statePath: string;
    archivePath: string;
}

export function startSequencer(
    relay: RelayConfig,
    overrides: Record<string, string> = {},
): ChildProcess {
    const binPath = sequencerBinaryPath();
    const child = spawn(binPath, [], {
        env: {
            ...process.env,
            RPC_URL: ANVIL_URL,
            CHAIN_ID: "31337",
            BATCH_VERIFIER_ADDRESS: relay.batchVerifierAddress,
            // The RPGF counter the sequencer reads the open period and the
            // provenance clause from.
            USAGE_COUNTER_ADDRESS: relay.usageCounterAddress,
            // The registry addresses the usage-claim PRE-FILTER eth-calls
            // (excluded / live-deposit / live-stake gates). Left unset they
            // default to address(0), every read fails, and each claim is
            // dropped "conservatively" — the batch resolves with EMPTY accruals
            // and the counter credits nothing, silently (056365a6).
            CLAUSE_REGISTRY_ADDRESS: relay.registries.clauses,
            ASSEMBLY_REGISTRY_ADDRESS: relay.registries.assemblies,
            MEMBERS_REGISTRY_ADDRESS: relay.registries.members,
            // FigaroCore uses this as the EIP-712 verifyingContract.
            // For the batch path, it must be the batch verifier address.
            FIGARO_CORE_ADDRESS: relay.batchVerifierAddress,
            SEQUENCER_PRIVATE_KEY: relay.privateKey,
            // A fresh archive per run: the default path persists in the sdk/
            // cwd across runs, and a replayed journal re-admits operations
            // against the PREVIOUS run's (dead) contract addresses — the
            // batch poisons and nothing resolves.
            ARCHIVE_PATH: relay.archivePath,
            STATE_PATH: relay.statePath,
            LISTEN_ADDR: `0.0.0.0:${relay.port}`,
            BATCH_INTERVAL_SECS: "2",
            MAX_BATCH_OPS: "50",
            // Both targets: the library's modules and the binary's own lines
            // (startup, refusals, the batch loop).
            RUST_LOG: "figaro_sequencer=debug,sequencer=info",
            ...overrides,
        },
        stdio: ["ignore", "pipe", "pipe"],
    });

    return child;
}

export function attachLogs(child: ChildProcess): void {
    child.stderr?.on("data", (chunk: Buffer) => {
        const line = chunk.toString().trim();
        if (line) console.error("[sequencer:err]", line);
    });
    child.stdout?.on("data", (chunk: Buffer) => {
        const line = chunk.toString().trim();
        if (line) console.log("[sequencer:out]", line);
    });
}

/** Stop a relay and wait until its process has exited (and its port is free). */
export async function stopSequencer(child: ChildProcess): Promise<void> {
    if (child.exitCode !== null) return;
    const gone = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
    await gone;
    clearTimeout(timer);
}

export async function waitForSequencer(url: string, timeoutMs = 15000): Promise<void> {
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

export async function waitForBatchCount(
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
