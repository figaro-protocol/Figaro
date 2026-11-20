/**
 * E2E: the model's traces through the Core and through the real proof program.
 *
 * `test/fixtures/tlc-traces.json` holds TLC's random simulation of the
 * FigaroCore model (`formal/FigaroCore.tla` under `formal/MC.cfg`, written by
 * `scripts/export-tlc-traces.sh`): one row per step, the action (a root
 * commit, an extension, a resolution) and the model's state after it. This
 * file runs every trace twice on one Anvil of its own:
 *
 *   1. the direct path: each step a call to `FigaroCore`, beside it both
 *      parties attest through `AttestationCoordinator`, and each resolution
 *      counts its root order's clause on a `UsageCounter` bound to that Core;
 *   2. the batch path: the same steps signed under `FigaroBatchVerifier`'s
 *      domain and sent to the relay's release binary, which runs the proof
 *      program (`prover/program`, `prover/lib`, `prover/clause`) and lands
 *      each batch with one `settleBatch`; the attestations go to the relay in
 *      the hash-only form, and each resolution's usage claim to its usage
 *      queue.
 *
 * Every party is a fresh wallet per trace, and every trace counts its own
 * registered clause, so the traces of a wave run side by side on one chain and
 * each is compared alone. A wave's traces advance together, one round at a
 * time; a round applies one to three steps of each trace, cut as
 * `CoreBatchEquivalenceTest` cuts its batches, so commits and the resolution
 * of their process share a batch whenever the cut puts them together. Half
 * the resolutions take the wallet-code form on the batch path (the buyer's
 * account carries `MockERC1271Wallet`'s code); the Core has one form, a call
 * from the buyer's address.
 *
 * The relay's door reads a commit's bonds from the landed chain alone, so it
 * refuses a commit whose bond the model funds from a payout still queued in
 * the same round. The run then waits for what the round sent before that
 * commit to land, sends the commit again, and lists each such step at the
 * end. The step lands in a later batch than the cut put it in; every
 * comparison below still holds it.
 *
 * Compared, per trace:
 *   - tokens: every wallet against the model after every step on the direct
 *     path and after every round on the batch path, and each contract's
 *     holding against the sum of the model's over the traces in flight;
 *   - events: per kind, the sequence of `OrderCommitted`, `OrderSeller`,
 *     `OrderResolved`, `ProcessResolved`, `Attestation` and `UsageRecorded`
 *     on the direct path (`FigaroCore`, `AttestationCoordinator`, its
 *     `UsageCounter`) and on the batch path (`FigaroBatchVerifier`, its
 *     `UsageCounter`), field by field;
 *   - uses: each counter's tally for the trace's clause in the period;
 *   - the operation stream: the entries of every `BatchOperations` log,
 *     decoded, are exactly the commits, resolutions and usage claims the
 *     trace sent, each once, in the trace's order.
 *
 * The one normalization, `CoreBatchEquivalenceTest`'s: an order hash or a
 * process id is read as the model's order or process index, because each
 * path derives its ids under its own contract's EIP-712 domain; a party's
 * address is read as its role in the trace; an `OrderCommitted` token is
 * checked to be the path's own token and then dropped; events are compared
 * per kind, never by log index, because a batch is one transaction and the
 * verifier orders kinds within it its own way. Nothing else is normalized: a
 * payout, a cumulative value, a count, a score or a field order that differs
 * fails the run.
 *
 * Then a set of steps the Core refuses, drawn from the malformed operations
 * `KernelDifferentialFuzzTest` generates (the model's traces hold only valid
 * steps): each is refused by `FigaroCore` and by the relay or the proof
 * program, and none lands.
 *
 * The relay runs SP1's mock prover: it executes the proof program and makes
 * no proof, and `MockSP1Verifier` accepts any. This run holds the program's
 * outputs (the positions, events, uses and stream it computes), not the
 * proof's binding of them, which needs a real proof on a real SP1 verifier.
 *
 * Requires:
 *   - the `anvil` binary on the PATH
 *   - the sequencer binary at prover/target/release/sequencer
 *   - the contracts built into out/ (`forge build`)
 *
 * Skip with: SKIP_ANVIL=1 npm test
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
    concat,
    createPublicClient,
    createWalletClient,
    decodeEventLog,
    encodeAbiParameters,
    encodePacked,
    http,
    keccak256,
    numberToHex,
    parseAbi,
    sliceHex,
    stringToHex,
    toHex,
    type Address,
    type Hex,
    type Log,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
    ATTESTATION_COORDINATOR_ABI,
    BATCH_VERIFIER_ABI,
    CORE_ABI,
    ERC20_ABI,
    USAGE_COUNTER_ABI,
    USAGE_KIND_CLAUSE,
    buildCommitment,
    buildDomain,
    buildUsageClaims,
    computeCheckoutHash,
    computeOrderHash,
    fetchUsageClaimContext,
    hashResolveProcess,
    readChainTimestamp,
    type Agreement,
    type Commitment,
} from "../src/index.js";
import { SequencerClient, type SequencerUsageClaim } from "../src/agent/sequencer.js";
import { computeCommitmentProcessId } from "../src/commitments.js";

import {
    MOCK_ERC20_ABI,
    attachLogs,
    deployBatchStack,
    loadBytecode,
    loadRuntimeBytecode,
    loadSpecJson,
    sequencerBinaryExists,
    sequencerBinaryPath,
    startSequencer,
    stopSequencer,
    waitForSequencer,
} from "./batchHarness.js";

const SKIP = process.env.SKIP_ANVIL === "1";
const REQUIRE = process.env.REQUIRE_BATCH_E2E === "1";

/** This file's own chain and relay. */
const ANVIL_PORT = 18565;
const RPC_URL = `http://127.0.0.1:${ANVIL_PORT}`;
const CHAIN_ID = 31337;
const SEQUENCER_PORT = 13031;
const SEQUENCER_URL = `http://127.0.0.1:${SEQUENCER_PORT}`;
const STATE_PATH = path.join(os.tmpdir(), `sequencer-state-traces-${process.pid}.json`);

// anvil[8] deploys and sends the direct path's unsigned calls; anvil[9] is the
// relay's key, so the relay's settleBatch never races the test for a nonce.
const DEPLOYER_KEY = "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97" as Hex;
const RELAY_KEY = "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6" as Hex;
const deployerAccount = privateKeyToAccount(DEPLOYER_KEY);

const TRACES_PATH = path.resolve(import.meta.dirname, "../../test/fixtures/tlc-traces.json");
/** Traces run side by side in one wave. */
const WAVE = 24;
const STAGE = 1;
const ZERO_ID = `0x${"00".repeat(32)}` as Hex;

// The fixture's columns.
const C_ACTION = 0;
const C_PID = 1;
const C_BUYER = 2;
const C_SELLER = 3;
const C_PAYMENT = 4;
const C_CUMULATIVE = 5;
const C_WALLETS = 6;
const C_CONTRACT = 10;
const ROLE = ["b1", "b2", "s1", "s2"] as const;

const ATTEST_SELLER_TYPES = {
    AttestSeller: [
        { name: "orderHash", type: "bytes32" },
        { name: "clauseId", type: "bytes32" },
        { name: "stage", type: "uint8" },
        { name: "contentRef", type: "bytes32" },
    ],
} as const;
const ATTEST_BUYER_TYPES = {
    AttestBuyer: [
        { name: "processId", type: "bytes32" },
        { name: "orderHash", type: "bytes32" },
        { name: "clauseId", type: "bytes32" },
        { name: "stage", type: "uint8" },
        { name: "contentRef", type: "bytes32" },
    ],
} as const;
const RESOLVE_TYPES = {
    ResolveProcess: [
        { name: "processId", type: "bytes32" },
        { name: "runningTotal", type: "uint256" },
    ],
} as const;

const WALLET_CODE_ABI = parseAbi(["function approve(bytes32 digest, bytes signature) external"]);
const CLAUSE_REGISTRY_ABI = parseAbi(["function registerClause(bytes32 clauseKey, string contentURI) external payable"]);
const MEMBERS_ABI = parseAbi(["function register(string metadataURI) payable"]);

/** Every event either path's contracts emit, for decoding. */
const EVENTS_ABI = [
    ...CORE_ABI.filter((x) => x.type === "event"),
    ...ATTESTATION_COORDINATOR_ABI.filter((x) => x.type === "event"),
    ...USAGE_COUNTER_ABI.filter((x) => x.type === "event"),
    ...BATCH_VERIFIER_ABI.filter((x) => x.type === "event" && x.name !== "Attestation"),
];
const COMPARED_KINDS = [
    "OrderCommitted",
    "OrderSeller",
    "OrderResolved",
    "ProcessResolved",
    "Attestation",
    "UsageRecorded",
] as const;
/** The verifier's own batch events: a batch exists only on the batch path. */
const BATCH_ONLY = new Set(["BatchOperations", "BatchSettled", "BatchAccrualSkipped"]);

type Path = "direct" | "batch";

interface Fixture {
    initialBalance: number;
    traceCount: number;
    traces: { source: string; rows: number[][] }[];
}

interface Party {
    account: PrivateKeyAccount;
    wallet: ReturnType<typeof createWalletClient>;
}

interface OrderRec {
    d: Commitment;
    b: Commitment;
    clauseDataHash: Hex;
    proof: Hex[];
    contentRef: Hex;
    claim: SequencerUsageClaim;
}

interface TraceRun {
    t: number;
    rows: number[][];
    parties: Party[];
    clause: Hex;
    orders: OrderRec[]; // by the model's order index, from 1
    processOrders: Map<number, number[]>;
    processId: Record<Path, Map<number, Hex>>;
    chunks: number[][];
    resolveCount: number;
    /** The model's row after the last step each path applied. */
    at: Record<Path, number[] | null>;
}

function anvilBinaryExists(): boolean {
    return spawnSync("anvil", ["--version"], { encoding: "utf8" }).status === 0;
}

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

async function anvilCall(method: string, params: unknown[]): Promise<void> {
    const res = await fetch(RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const body = (await res.json()) as { error?: { message: string } };
    if (body.error) throw new Error(`${method} failed: ${body.error.message}`);
}

/** The stream's 252-byte commitment (`prover/lib/src/operation_stream.rs`). */
function packCommitment(c: Commitment): Hex {
    return encodePacked(
        ["bytes32", "address", "address", "address", "uint256", "uint256", "bytes32", "uint256", "uint256"],
        [c.processId, c.buyer, c.seller, c.token, c.payment, c.runningTotal, c.checkoutHash, c.salt, c.commitDeadline],
    );
}

function u16(n: number): Hex {
    return numberToHex(n, { size: 2 });
}

/** Split a logged operation stream into its entries, by the format's lengths. */
function splitStream(ops: Hex): Hex[] {
    const bytes = (ops.length - 2) / 2;
    const entries: Hex[] = [];
    let at = 0;
    const read16 = (o: number) => Number.parseInt(ops.slice(2 + o * 2, 2 + (o + 2) * 2), 16);
    while (at < bytes) {
        const start = at;
        const tag = Number.parseInt(ops.slice(2 + at * 2, 4 + at * 2), 16);
        at += 1;
        if (tag === 0x01) {
            at += 252 + 65 + 65;
        } else if (tag === 0x02) {
            at += 32 + 65;
            const n = read16(at);
            at += 2 + n * 252;
        } else if (tag === 0x03) {
            at += 252 + 32;
            const kind = Number.parseInt(ops.slice(2 + at * 2, 4 + at * 2), 16);
            at += 1;
            if (kind === 0x00 || kind === 0x02) {
                at += 32;
            } else if (kind === 0x01) {
                at += 64;
                at += 2 + read16(at) * 32;
            } else {
                throw new Error(`usage claim of unknown kind ${kind} at byte ${start}`);
            }
            at += 2 + read16(at) * 32;
        } else if (tag === 0x04) {
            at += 32;
            at += 2 + read16(at);
            const n = read16(at);
            at += 2 + n * 252;
        } else if (tag === 0x05) {
            at += 1 + 252 + 32 + 1 + 32;
            at += 2 + read16(at);
        } else {
            throw new Error(`unknown stream tag ${tag} at byte ${start}`);
        }
        if (at > bytes) throw new Error(`stream entry at byte ${start} runs past the stream`);
        entries.push(sliceHex(ops, start, at));
    }
    return entries;
}

function errorName(e: unknown): string {
    const err = e as { cause?: { data?: { errorName?: string } }; shortMessage?: string; message?: string };
    return err.cause?.data?.errorName ?? err.shortMessage ?? err.message ?? String(e);
}

describe.skipIf(SKIP)("Batch E2E: the model's traces through the Core and the proof program", () => {
    const transport = http(RPC_URL);
    // Anvil mines each transaction at once: a receipt is polled for every 50 ms, not every 4 s.
    const publicClient = createPublicClient({ chain: foundry, transport, pollingInterval: 50 });
    const deployerWallet = createWalletClient({ chain: foundry, transport, account: deployerAccount });

    let ready = false;
    let anvil: ChildProcess | null = null;
    let relayProcess: ChildProcess | null = null;
    let relay: SequencerClient;

    // The batch path.
    let tokenB: Address;
    let verifier: Address;
    let counterB: Address;
    let clauseRegistry: Address;
    let members: Address;
    // The direct path.
    let tokenD: Address;
    let core: Address;
    let coordinator: Address;
    let counterD: Address;

    let fixture: Fixture;
    let claimContext: Awaited<ReturnType<typeof fetchUsageClaimContext>>;
    let walletCode: Hex;
    let startBlock: bigint;

    /** Either path's order hash or process id, and every party's address, as its label in the trace. */
    const label = new Map<string, string>();
    /** Every stream entry a trace sent, as its trace and its place in the trace's sequence. */
    const expectedEntries = new Map<string, { t: number; seq: number; kind: "op" | "claim" }>();
    const entrySeq = new Map<number, number>();
    /** The claims a round's resolutions made, sent once the round has landed. */
    let claimsToSend: SequencerUsageClaim[] = [];
    let claimsSent = 0;
    /** The commits the relay's door refused until a payout queued before them in the round had landed. */
    const fundedByAQueuedPayout: string[] = [];

    const send = async (party: Party | null, address: Address, abi: readonly unknown[], functionName: string, args: unknown[]) => {
        const wallet = party ? party.wallet : deployerWallet;
        const hash = await wallet.writeContract({
            address,
            abi: abi as never,
            functionName: functionName as never,
            args: args as never,
            chain: foundry,
            account: (party ? party.account : deployerAccount) as never,
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash }).catch(async (e) => {
            // Say why the chain left it unmined: its nonce and fee against the chain's.
            const tx = await publicClient.getTransaction({ hash }).catch(() => null);
            const block = await publicClient.getBlock();
            const nonce = tx ? await publicClient.getTransactionCount({ address: tx.from }) : -1;
            throw new Error(
                `${functionName} was not mined: nonce ${tx?.nonce} of ${tx?.from} (chain at ${nonce}), ` +
                    `max fee ${tx?.maxFeePerGas} against base fee ${block.baseFeePerGas}: ${(e as Error).message}`,
            );
        });
        if (receipt.status !== "success") throw new Error(`${functionName} reverted`);
    };
    const balanceOf = async (token: Address, who: Address) =>
        (await publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: "balanceOf", args: [who] })) as bigint;
    const deploy = async (artifact: string, abi: string[], args: unknown[]) => {
        const hash = await deployerWallet.deployContract({
            abi: parseAbi(abi),
            bytecode: loadBytecode(artifact),
            args: args as never,
        });
        return (await publicClient.waitForTransactionReceipt({ hash })).contractAddress!;
    };
    const expectEntry = (t: number, kind: "op" | "claim", entry: Hex) => {
        const seq = entrySeq.get(t) ?? 0;
        entrySeq.set(t, seq + 1);
        const key = entry.toLowerCase();
        if (expectedEntries.has(key)) throw new Error(`trace ${t} sent one stream entry twice`);
        expectedEntries.set(key, { t, seq, kind });
    };

    beforeAll(async () => {
        if (!anvilBinaryExists() || !sequencerBinaryExists()) return;
        fixture = JSON.parse(fs.readFileSync(TRACES_PATH, "utf-8")) as Fixture;
        // A base fee of zero stays zero: a large settleBatch never raises the
        // fee past what a transaction the run sent just before it offered.
        anvil = spawn("anvil", ["--port", String(ANVIL_PORT), "--silent", "--base-fee", "0"], { stdio: "ignore" });
        if (!(await waitForRpc(RPC_URL, 30_000))) throw new Error(`anvil did not start on ${RPC_URL}`);

        const specJson = loadSpecJson("figaro-modalities");
        const stack = await deployBatchStack(
            publicClient,
            deployerWallet,
            { specJson, clauseKey: keccak256(stringToHex(specJson)) },
            [7n * 24n * 3600n],
        );
        tokenB = stack.tokenAddress;
        verifier = stack.batchVerifierAddress;
        counterB = stack.usageCounterAddress;
        clauseRegistry = stack.clauseRegistryAddress;
        members = stack.membersAddress;

        // The direct path's own stack, on the same registries and in the same
        // period as the batch path's counter.
        tokenD = await deploy("MockERC20.sol/MockERC20.json", ["constructor(string name, string symbol)"], ["Direct", "D"]);
        core = await deploy("FigaroCore.sol/FigaroCore.json", ["constructor()"], []);
        coordinator = await deploy(
            "AttestationCoordinator.sol/AttestationCoordinator.json",
            ["constructor(address _core)"],
            [core],
        );
        const periodEnd = (await publicClient.readContract({
            address: counterB,
            abi: USAGE_COUNTER_ABI,
            functionName: "periodEnd",
            args: [0n],
        })) as bigint;
        counterD = await deploy(
            "UsageCounter.sol/UsageCounter.json",
            [
                "constructor(address _core, address _members, address _clauses, address _assemblies, address _agreements, address _batchVerifier, uint64 _minSellers, uint64[] _periodEnd)",
            ],
            [
                core,
                members,
                clauseRegistry,
                stack.registries.assemblies,
                stack.registries.agreements,
                // No batch verifier hands this counter a batch: an address that never calls.
                "0x000000000000000000000000000000000000dEaD",
                1n,
                [periodEnd],
            ],
        );
        claimContext = await fetchUsageClaimContext(publicClient, counterB);
        walletCode = loadRuntimeBytecode("MockERC1271Wallet.sol/MockERC1271Wallet.json");
        startBlock = await publicClient.getBlockNumber();

        relayProcess = startSequencer(
            {
                batchVerifierAddress: verifier,
                usageCounterAddress: counterB,
                registries: stack.registries,
                privateKey: RELAY_KEY,
                port: SEQUENCER_PORT,
                statePath: STATE_PATH,
            },
            {
                RPC_URL,
                BATCH_INTERVAL_SECS: "2",
                MAX_BATCH_OPS: "400",
                // The run sends thousands of operations from one address.
                SUBMITS_PER_MINUTE_PER_IP: "1000000",
                // A step the Core refuses for good but the relay may yet see
                // applied (a cumulative value a later commit could reach) is
                // deferred, then dropped when its window ends: thirty seconds
                // here, ten minutes by default.
                DEFER_WINDOW_SECS: "30",
                RUST_LOG: "figaro_sequencer=info,sequencer=info",
            },
        );
        attachLogs(relayProcess);
        relay = new SequencerClient({ url: SEQUENCER_URL });
        await waitForSequencer(SEQUENCER_URL, 10 * 60_000);
        ready = true;
    }, 20 * 60_000);

    afterAll(async () => {
        if (relayProcess) await stopSequencer(relayProcess);
        if (anvil && anvil.exitCode === null) anvil.kill("SIGTERM");
        for (const suffix of ["", ".tmp", ".next.jsonl", ".next.jsonl.tmp"]) {
            fs.rmSync(STATE_PATH + suffix, { force: true });
        }
    });

    /** Four fresh wallets for one trace, funded on both paths, the sellers staked, the buyers carrying wallet code. */
    async function newParties(tag: string, initial: bigint): Promise<Party[]> {
        const parties: Party[] = [];
        for (let i = 0; i < 4; i++) {
            const account = privateKeyToAccount(keccak256(stringToHex(`traces-e2e ${tag} ${ROLE[i]}`)));
            const wallet = createWalletClient({ chain: foundry, transport, account });
            await anvilCall("anvil_setBalance", [account.address, toHex(10n ** 20n)]);
            for (const [token, spender] of [
                [tokenD, core],
                [tokenB, verifier],
            ] as const) {
                await send(null, token, MOCK_ERC20_ABI, "mint", [account.address, initial]);
                await send({ account, wallet }, token, MOCK_ERC20_ABI, "approve", [spender, 2n ** 255n]);
            }
            if (i >= 2) await send({ account, wallet }, members, MEMBERS_ABI, "register", [`ipfs://traces-e2e-${tag}`]);
            parties.push({ account, wallet });
            label.set(account.address.toLowerCase(), `${tag}:${ROLE[i]}`);
        }
        // The buyers' accounts carry code that answers ERC-1271 for the batch
        // path's wallet-code resolve; their keys still sign as before.
        for (const i of [0, 1]) await anvilCall("anvil_setCode", [parties[i].account.address, walletCode]);
        return parties;
    }

    function cut(t: number, length: number): number[][] {
        const chunks: number[][] = [];
        let chunk: number[] = [];
        for (let j = 0; j < length; j++) {
            chunk.push(j);
            if ((j + t) % 3 === 2 || j + 1 === length) {
                chunks.push(chunk);
                chunk = [];
            }
        }
        return chunks;
    }

    // ── One step, on each path ────────────────────────────────────────────

    async function commitStep(
        run: TraceRun,
        j: number,
        landSentSoFar: () => Promise<void>,
    ): Promise<{ orderHashB: Hex }> {
        const row = run.rows[j];
        const oid = run.orders.length + 1;
        const pid = row[C_PID];
        const buyer = run.parties[row[C_BUYER]];
        const seller = run.parties[row[C_SELLER]];
        const root = row[C_ACTION] === 0;
        const agreement: Agreement = {
            version: "a1",
            buyer: buyer.account.address,
            seller: seller.account.address,
            clauses: [
                { clause: run.clause, data: { trace: run.t, order: oid } },
                { clause: keccak256(stringToHex(`traces-e2e other clause ${run.t}`)), data: { order: oid } },
            ],
        };
        const deadline = (await readChainTimestamp(publicClient)) + 24n * 3600n;
        const params = (token: Address, processId: Hex) => ({
            processId,
            buyer: buyer.account.address,
            seller: seller.account.address,
            token,
            payment: BigInt(row[C_PAYMENT]),
            runningTotal: BigInt(row[C_CUMULATIVE]),
            checkoutHash: computeCheckoutHash(agreement),
            salt: BigInt(keccak256(stringToHex(`traces-e2e salt ${run.t} ${oid}`))),
            commitDeadline: deadline,
        });
        const direct = buildCommitment(params(tokenD, root ? ZERO_ID : run.processId.direct.get(pid)!), buildDomain(CHAIN_ID, core));
        const batch = buildCommitment(params(tokenB, root ? ZERO_ID : run.processId.batch.get(pid)!), buildDomain(CHAIN_ID, verifier));
        const claim = buildUsageClaims(batch.commitment, agreement, claimContext).find(
            (c) => c.clause_or_process.toLowerCase() === run.clause.toLowerCase(),
        )!;
        const clauseDataHash = (claim.kind as { Clause: { clause_data_hash: Hex } }).Clause.clause_data_hash;
        const order: OrderRec = {
            d: direct.commitment,
            b: batch.commitment,
            clauseDataHash,
            proof: claim.inclusion_proof,
            contentRef: keccak256(stringToHex(`traces-e2e content ${run.t} ${oid}`)),
            claim,
        };
        run.orders.push(order);
        if (!run.processOrders.has(pid)) run.processOrders.set(pid, []);
        run.processOrders.get(pid)!.push(oid);

        // Ids: each path's own derivation, each read as the model's index.
        for (const [p, c, contract] of [
            ["direct", order.d, core],
            ["batch", order.b, verifier],
        ] as const) {
            const processId = computeCommitmentProcessId(c, CHAIN_ID, contract);
            if (root) run.processId[p].set(pid, processId);
            label.set(processId.toLowerCase(), `${run.t}:p${pid}`);
            label.set(computeOrderHash(c, CHAIN_ID, contract).toLowerCase(), `${run.t}:o${oid}`);
        }

        // The direct path: the commit, then both parties attest on it.
        const dBuyerSig = await buyer.account.signTypedData(direct.typedData);
        const dSellerSig = await seller.account.signTypedData(direct.typedData);
        await send(null, core, CORE_ABI, "commit", [order.d, dBuyerSig, dSellerSig]);
        await send(seller, coordinator, ATTESTATION_COORDINATOR_ABI, "attestAsSeller", [
            order.d, run.clause, STAGE, clauseDataHash, order.proof, order.contentRef,
        ]);
        await send(buyer, coordinator, ATTESTATION_COORDINATOR_ABI, "attestAsBuyer", [
            order.d, run.clause, STAGE, clauseDataHash, order.proof, order.contentRef,
        ]);

        // The batch path: the same three, signed, to the relay.
        const bBuyerSig = await buyer.account.signTypedData(batch.typedData);
        const bSellerSig = await seller.account.signTypedData(batch.typedData);
        try {
            await relay.submitCommit(order.b, bBuyerSig, bSellerSig);
        } catch (e) {
            // The relay's door reads a commit's bonds from the landed chain
            // alone. A bond the model funds from a payout still queued in
            // this round is refused there, so the commit is sent again once
            // what the round sent before it has landed.
            if (!(e instanceof Error) || !e.message.startsWith("unfunded commitment")) throw e;
            await landSentSoFar();
            await relay.submitCommit(order.b, bBuyerSig, bSellerSig);
            fundedByAQueuedPayout.push(`trace ${run.t} step ${j}: ${e.message}`);
        }
        expectEntry(run.t, "op", concat(["0x01", packCommitment(order.b), bBuyerSig, bSellerSig]));
        const orderHashB = computeOrderHash(order.b, CHAIN_ID, verifier);
        const domain = buildDomain(CHAIN_ID, verifier);
        await relay.submitAttestAsSeller({
            target: order.b,
            clauseId: run.clause,
            stage: STAGE,
            contentRef: order.contentRef,
            sellerSig: await seller.account.signTypedData({
                domain,
                types: ATTEST_SELLER_TYPES,
                primaryType: "AttestSeller",
                message: { orderHash: orderHashB, clauseId: run.clause, stage: STAGE, contentRef: order.contentRef },
            }),
            clauseDataHash,
            inclusionProof: order.proof,
        });
        await relay.submitAttestAsBuyer({
            target: order.b,
            clauseId: run.clause,
            stage: STAGE,
            contentRef: order.contentRef,
            buyerSig: await buyer.account.signTypedData({
                domain,
                types: ATTEST_BUYER_TYPES,
                primaryType: "AttestBuyer",
                message: {
                    processId: run.processId.batch.get(pid)!,
                    orderHash: orderHashB,
                    clauseId: run.clause,
                    stage: STAGE,
                    contentRef: order.contentRef,
                },
            }),
            clauseDataHash,
            inclusionProof: order.proof,
        });
        return { orderHashB };
    }

    async function resolveStep(run: TraceRun, row: number[]): Promise<{ processIdB: Hex }> {
        const pid = row[C_PID];
        const oids = run.processOrders.get(pid)!;
        const buyer = run.parties[row[C_BUYER]];
        const listD = oids.map((o) => run.orders[o - 1].d);
        const listB = oids.map((o) => run.orders[o - 1].b);
        const runningTotal = BigInt(row[C_CUMULATIVE]);

        // The direct path: the buyer's call, then the root order's clause counted.
        await send(buyer, core, CORE_ABI, "resolveProcess", [run.processId.direct.get(pid)!, listD]);
        const root = run.orders[oids[0] - 1];
        await send(null, counterD, USAGE_COUNTER_ABI, "recordClauseUsage", [root.d, run.clause, root.clauseDataHash, root.proof]);

        // The batch path: the buyer's signature, or bytes its wallet code validates.
        const processIdB = run.processId.batch.get(pid)!;
        const listed = concat(listB.map(packCommitment));
        if ((run.t + run.resolveCount++) % 2 === 1) {
            const authorization = encodeAbiParameters(
                [{ type: "string" }, { type: "uint256" }, { type: "uint256" }],
                ["wallet-code", BigInt(run.t), BigInt(pid)],
            );
            const digest = hashResolveProcess(processIdB, runningTotal, { chainId: CHAIN_ID, core: verifier });
            await send(null, buyer.account.address, WALLET_CODE_ABI, "approve", [digest, authorization]);
            await relay.submitResolveByWalletCode(processIdB, runningTotal, listB, authorization);
            expectEntry(
                run.t,
                "op",
                concat(["0x04", processIdB, u16((authorization.length - 2) / 2), authorization, u16(listB.length), listed]),
            );
        } else {
            const sig = await buyer.account.signTypedData({
                domain: buildDomain(CHAIN_ID, verifier),
                types: RESOLVE_TYPES,
                primaryType: "ResolveProcess",
                message: { processId: processIdB, runningTotal },
            });
            await relay.submitResolve(processIdB, runningTotal, listB, sig);
            expectEntry(run.t, "op", concat(["0x02", processIdB, sig, u16(listB.length), listed]));
        }
        claimsToSend.push(root.claim);
        expectEntry(
            run.t,
            "claim",
            concat([
                "0x03",
                packCommitment(root.b),
                run.clause,
                "0x00",
                root.clauseDataHash,
                u16(root.proof.length),
                ...root.proof,
            ]),
        );
        return { processIdB };
    }

    // ── The checks ────────────────────────────────────────────────────────

    async function checkWallets(run: TraceRun, p: Path) {
        const row = run.at[p]!;
        const token = p === "direct" ? tokenD : tokenB;
        for (let i = 0; i < 4; i++) {
            const held = await balanceOf(token, run.parties[i].account.address);
            expect(held, `tokens: ${p} wallet ${ROLE[i]} of trace ${run.t} against the model`).toBe(BigInt(row[C_WALLETS + i]));
        }
    }

    async function checkHolding(runs: TraceRun[], p: Path) {
        const model = runs.reduce((sum, r) => sum + BigInt(r.at[p]?.[C_CONTRACT] ?? 0), 0n);
        const held = await balanceOf(p === "direct" ? tokenD : tokenB, p === "direct" ? core : verifier);
        expect(held, `tokens: ${p === "direct" ? "FigaroCore" : "FigaroBatchVerifier"} against the model's open bonds`).toBe(model);
    }

    /** Wait until every commit and resolution a round sent has landed on the verifier. */
    async function waitForLanding(fromBlock: bigint, orderHashes: Set<string>, processIds: Set<string>, deadLettered: number) {
        const deadline = Date.now() + 10 * 60_000;
        for (;;) {
            const logs = await publicClient.getLogs({ address: verifier, fromBlock });
            for (const log of logs) {
                let decoded;
                try {
                    decoded = decodeEventLog({ abi: EVENTS_ABI, data: log.data, topics: log.topics });
                } catch {
                    continue;
                }
                const args = decoded.args as Record<string, unknown>;
                if (decoded.eventName === "OrderCommitted") orderHashes.delete((args.orderHash as string).toLowerCase());
                if (decoded.eventName === "ProcessResolved") processIds.delete((args.processId as string).toLowerCase());
            }
            if (orderHashes.size === 0 && processIds.size === 0) return;
            const status = await relay.status();
            if ((status.dead_lettered_ops ?? 0) > deadLettered) {
                throw new Error(`the relay dead-lettered an operation of the run: ${status.last_settle_error}`);
            }
            if ((status.dropped_usage_claims ?? 0) > 0) {
                throw new Error(`the relay dropped a usage claim of the run: ${status.last_dropped_claim_error}`);
            }
            if (Date.now() > deadline) {
                throw new Error(`the round did not land: ${orderHashes.size} commits, ${processIds.size} resolutions missing`);
            }
            await new Promise((r) => setTimeout(r, 500));
        }
    }

    async function waitForUses(expected: number) {
        const deadline = Date.now() + 10 * 60_000;
        for (;;) {
            const logs = await publicClient.getContractEvents({ address: counterB, abi: USAGE_COUNTER_ABI, eventName: "UsageRecorded", fromBlock: startBlock });
            if (logs.length >= expected) return;
            const status = await relay.status();
            if ((status.dropped_usage_claims ?? 0) > 0) {
                throw new Error(`the relay dropped a usage claim of the run: ${status.last_dropped_claim_error}`);
            }
            if (Date.now() > deadline) throw new Error(`the batch counter counted ${logs.length} uses of ${expected}`);
            await new Promise((r) => setTimeout(r, 500));
        }
    }

    // ── The events, normalized ────────────────────────────────────────────

    const lab = (x: unknown, what: string): string => {
        const l = label.get(String(x).toLowerCase());
        if (l === undefined) throw new Error(`ids: a ${what} neither path derived: ${String(x)}`);
        return l;
    };
    const traceOf = (l: string) => Number(l.split(":")[0]);

    /** Each compared event of `logs` as [trace, kind, record], the record its fields with ids read as labels. */
    function normalize(logs: Log[], p: Path): { t: number; kind: string; record: string }[] {
        const out: { t: number; kind: string; record: string }[] = [];
        const token = p === "direct" ? tokenD : tokenB;
        for (const log of logs) {
            const decoded = decodeEventLog({ abi: EVENTS_ABI, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
            const name = decoded.eventName;
            const a = decoded.args as Record<string, unknown>;
            if (p === "batch" && log.address.toLowerCase() === verifier.toLowerCase() && BATCH_ONLY.has(name)) continue;
            let fields: unknown[];
            let owner: string;
            switch (name) {
                case "OrderCommitted":
                    expect(String(a.token).toLowerCase(), `events: OrderCommitted names the ${p} path's token`).toBe(token.toLowerCase());
                    owner = lab(a.orderHash, "order hash");
                    fields = [owner, lab(a.processId, "process id"), lab(a.buyer, "party"), lab(a.seller, "party"), a.payment, a.runningTotal, a.checkoutHash, a.salt, a.commitDeadline];
                    break;
                case "OrderSeller":
                    owner = lab(a.orderHash, "order hash");
                    fields = [owner, lab(a.seller, "party")];
                    break;
                case "OrderResolved":
                    owner = lab(a.orderHash, "order hash");
                    fields = [owner, lab(a.processId, "process id"), a.sellerPayout, a.buyerPayout];
                    break;
                case "ProcessResolved":
                    owner = lab(a.processId, "process id");
                    fields = [owner, lab(a.buyer, "party"), a.orderCount];
                    break;
                case "Attestation":
                    owner = lab(a.orderHash, "order hash");
                    fields = [owner, lab(a.processId, "process id"), lab(a.attester, "party"), a.clauseId, a.stage, a.contentRef];
                    break;
                case "UsageRecorded":
                    owner = lab(a.processId, "process id");
                    fields = [a.kind, a.clauseOrProcess, a.period, owner, lab(a.seller, "party"), a.c, a.d, a.score];
                    break;
                default:
                    throw new Error(`events: ${name} from ${log.address} is an event this test does not list`);
            }
            out.push({ t: traceOf(owner), kind: name, record: JSON.stringify(fields, (_k, v) => (typeof v === "bigint" ? v.toString() : v)) });
        }
        return out;
    }

    it("every trace is the same on the Core and through the proof program", async () => {
        if (!ready) {
            if (REQUIRE) {
                throw new Error(`REQUIRE_BATCH_E2E=1 but anvil or the sequencer binary (${sequencerBinaryPath()}) is missing`);
            }
            console.log("⏭ Skipping: anvil or the sequencer binary is missing");
            return;
        }
        const began = Date.now();
        expect(fixture.traceCount).toBe(fixture.traces.length);
        expect(fixture.traceCount).toBeGreaterThan(0);
        const initial = BigInt(fixture.initialBalance);
        const all: TraceRun[] = [];
        let steps = 0;
        let rounds = 0;
        let usesExpected = 0;

        for (let w = 0; w < fixture.traceCount; w += WAVE) {
            const wave: TraceRun[] = [];
            for (let t = w; t < Math.min(w + WAVE, fixture.traceCount); t++) {
                const clause = keccak256(stringToHex(`traces-e2e clause ${t}`));
                await send(null, clauseRegistry, CLAUSE_REGISTRY_ABI, "registerClause", [clause, `ipfs://traces-e2e-${t}`]);
                const rows = fixture.traces[t].rows;
                wave.push({
                    t,
                    rows,
                    parties: await newParties(String(t), initial),
                    clause,
                    orders: [],
                    processOrders: new Map(),
                    processId: { direct: new Map(), batch: new Map() },
                    chunks: cut(t, rows.length),
                    resolveCount: 0,
                    at: { direct: null, batch: null },
                });
            }
            all.push(...wave);
            const roundsInWave = Math.max(...wave.map((r) => r.chunks.length));
            for (let k = 0; k < roundsInWave; k++) {
                const fromBlock = await publicClient.getBlockNumber();
                const deadLettered = (await relay.status()).dead_lettered_ops ?? 0;
                // The claims of the round before ride this round's batches.
                for (const claim of claimsToSend) await relay.submitUsageClaim(claim);
                claimsSent += claimsToSend.length;
                claimsToSend = [];
                const commits = new Set<string>();
                const resolutions = new Set<string>();
                const landSentSoFar = () => waitForLanding(fromBlock, new Set(commits), new Set(resolutions), deadLettered);
                for (const run of wave) {
                    for (const j of run.chunks[k] ?? []) {
                        const row = run.rows[j];
                        if (row[C_ACTION] === 2) {
                            resolutions.add((await resolveStep(run, row)).processIdB.toLowerCase());
                            usesExpected++;
                        } else {
                            commits.add((await commitStep(run, j, landSentSoFar)).orderHashB.toLowerCase());
                        }
                        run.at.direct = row;
                        await checkWallets(run, "direct");
                        await checkHolding(all, "direct");
                        steps++;
                    }
                }
                await waitForLanding(fromBlock, commits, resolutions, deadLettered);
                for (const run of wave) {
                    const last = run.chunks[k]?.at(-1);
                    if (last === undefined) continue;
                    run.at.batch = run.rows[last];
                    await checkWallets(run, "batch");
                }
                await checkHolding(all, "batch");
                rounds++;
            }
        }
        for (const claim of claimsToSend) await relay.submitUsageClaim(claim);
        claimsSent += claimsToSend.length;
        claimsToSend = [];
        expect(claimsSent).toBe(usesExpected);
        await waitForUses(usesExpected);

        // ── Events, per trace and per kind ──
        const toBlock = await publicClient.getBlockNumber();
        const direct = normalize(await publicClient.getLogs({ address: [core, coordinator, counterD], fromBlock: startBlock, toBlock }), "direct");
        const batch = normalize(await publicClient.getLogs({ address: [verifier, counterB], fromBlock: startBlock, toBlock }), "batch");
        const byTraceKind = (events: typeof direct) => {
            const m = new Map<string, string[]>();
            for (const e of events) {
                const key = `${e.t}/${e.kind}`;
                if (!m.has(key)) m.set(key, []);
                m.get(key)!.push(e.record);
            }
            return m;
        };
        const d = byTraceKind(direct);
        const b = byTraceKind(batch);
        for (const run of all) {
            const commitsInTrace = run.rows.filter((r) => r[C_ACTION] !== 2).length;
            const resolvesInTrace = run.rows.length - commitsInTrace;
            for (const kind of COMPARED_KINDS) {
                const key = `${run.t}/${kind}`;
                expect(d.get(key)?.length ?? 0, `events: ${kind} of trace ${run.t} on the direct path`).toBeGreaterThan(0);
                expect(b.get(key) ?? [], `events: ${kind} of trace ${run.t}, the batch path against the direct path`).toEqual(d.get(key));
            }
            expect(d.get(`${run.t}/OrderCommitted`)!.length, `trace ${run.t}: one OrderCommitted per commit`).toBe(commitsInTrace);
            expect(d.get(`${run.t}/ProcessResolved`)!.length, `trace ${run.t}: one ProcessResolved per resolution`).toBe(resolvesInTrace);
            expect(d.get(`${run.t}/UsageRecorded`)!.length, `trace ${run.t}: one use per resolution`).toBe(resolvesInTrace);

            // ── Uses: each counter's tally for the trace's clause ──
            const [tallyD, tallyB] = await Promise.all(
                [counterD, counterB].map((counter) =>
                    publicClient.readContract({ address: counter, abi: USAGE_COUNTER_ABI, functionName: "accrualOf", args: [USAGE_KIND_CLAUSE, run.clause, 0] }),
                ),
            );
            expect(tallyB, `uses: the tally of trace ${run.t}'s clause`).toEqual(tallyD);
            expect((tallyD as readonly bigint[])[0]).toBe(BigInt(resolvesInTrace));

            // ── Final tokens: the model's, on both paths ──
            for (const p of ["direct", "batch"] as const) {
                expect(run.at[p], `trace ${run.t} ran to its end on the ${p} path`).toBe(run.rows.at(-1));
                await checkWallets(run, p);
            }
        }
        // Nothing beyond the traces' events was emitted.
        expect(batch.length, "events: the batch path emitted exactly the direct path's").toBe(direct.length);

        // ── The operation stream: exactly what the traces sent, each once, in each trace's order ──
        const streams = await publicClient.getContractEvents({ address: verifier, abi: BATCH_VERIFIER_ABI, eventName: "BatchOperations", fromBlock: startBlock, toBlock });
        const seen = new Set<string>();
        const lastSeq = new Map<string, number>();
        for (const log of streams) {
            for (const entry of splitStream(log.args.operations as Hex)) {
                const key = entry.toLowerCase();
                const sent = expectedEntries.get(key);
                expect(sent, `stream: batch ${log.args.batchId} logs an entry no trace sent (${entry.slice(0, 4)})`).toBeDefined();
                expect(seen.has(key), `stream: an entry of trace ${sent!.t} is logged twice`).toBe(false);
                seen.add(key);
                const order = `${sent!.t}/${sent!.kind}`;
                expect(sent!.seq, `stream: trace ${sent!.t}'s entries are logged in the order it sent them`).toBeGreaterThan(lastSeq.get(order) ?? -1);
                lastSeq.set(order, sent!.seq);
            }
        }
        expect(seen.size, "stream: every entry the traces sent is logged").toBe(expectedEntries.size);

        // Both holdings empty: every trace of the model ends resolved.
        expect(await balanceOf(tokenD, core)).toBe(0n);
        expect(await balanceOf(tokenB, verifier)).toBe(0n);

        const batches = (await publicClient.readContract({ address: verifier, abi: BATCH_VERIFIER_ABI, functionName: "batchCount" })) as bigint;
        for (const line of fundedByAQueuedPayout) {
            console.log(`[traces] sent again once the round's earlier operations landed: ${line}`);
        }
        console.log(
            `[traces] ${all.length} traces, ${steps} steps, ${rounds} rounds, ${batches} batches, ` +
                `${direct.length} events per path, ${expectedEntries.size} stream entries, ${Math.round((Date.now() - began) / 1000)} s`,
        );
    }, 60 * 60_000);

    it("a step the Core refuses is refused by the relay or the proof program, and never lands", async () => {
        if (!ready) return;
        const parties = await newParties("refusals", 1000n);
        const [b1, b2, s1, s2] = parties;
        const clause = keccak256(stringToHex("traces-e2e clause refusals"));
        const checkoutHash = computeCheckoutHash({
            version: "a1",
            buyer: b1.account.address,
            seller: s1.account.address,
            clauses: [{ clause, data: { refusals: true } }],
        });
        const now = await readChainTimestamp(publicClient);
        type Draft = { processId?: Hex; buyer?: Party; seller?: Party; payment: bigint; runningTotal: bigint; deadline?: bigint; salt: bigint; buyerSigner?: Party };
        const signed = async (draft: Draft, p: Path) => {
            const contract = p === "direct" ? core : verifier;
            const built = buildCommitment(
                {
                    processId: draft.processId ?? ZERO_ID,
                    buyer: (draft.buyer ?? b1).account.address,
                    seller: (draft.seller ?? s1).account.address,
                    token: p === "direct" ? tokenD : tokenB,
                    payment: draft.payment,
                    runningTotal: draft.runningTotal,
                    checkoutHash,
                    salt: draft.salt,
                    commitDeadline: draft.deadline ?? now + 24n * 3600n,
                },
                buildDomain(CHAIN_ID, contract),
            );
            return {
                c: built.commitment,
                buyerSig: await (draft.buyerSigner ?? draft.buyer ?? b1).account.signTypedData(built.typedData),
                sellerSig: await (draft.seller ?? s1).account.signTypedData(built.typedData),
            };
        };
        const resolveSig = (signer: Party, processId: Hex, runningTotal: bigint) =>
            signer.account.signTypedData({
                domain: buildDomain(CHAIN_ID, verifier),
                types: RESOLVE_TYPES,
                primaryType: "ResolveProcess",
                message: { processId, runningTotal },
            });

        // An open process of two orders on each path, landed.
        const ids: Record<Path, Hex> = { direct: ZERO_ID, batch: ZERO_ID };
        const opened: Record<Path, Commitment[]> = { direct: [], batch: [] };
        for (const [i, payment, total] of [
            [1, 3n, 3n],
            [2, 2n, 5n],
        ] as const) {
            const fromBlock = await publicClient.getBlockNumber();
            const landed = new Set<string>();
            for (const p of ["direct", "batch"] as const) {
                const draft: Draft = { processId: i === 1 ? undefined : ids[p], payment, runningTotal: total, salt: BigInt(i) };
                const { c, buyerSig, sellerSig } = await signed(draft, p);
                if (i === 1) ids[p] = computeCommitmentProcessId(c, CHAIN_ID, p === "direct" ? core : verifier);
                opened[p].push(c);
                if (p === "direct") await send(null, core, CORE_ABI, "commit", [c, buyerSig, sellerSig]);
                else {
                    await relay.submitCommit(c, buyerSig, sellerSig);
                    landed.add(computeOrderHash(c, CHAIN_ID, verifier).toLowerCase());
                }
            }
            await waitForLanding(fromBlock, landed, new Set(), (await relay.status()).dead_lettered_ops ?? 0);
        }

        const refusals: { name: string; direct: string; batch: string }[] = [];
        const holdings = async () =>
            Promise.all([verifier, ...parties.map((x) => x.account.address)].map((who) => balanceOf(tokenB, who)));

        /** Try one refused step on both paths. */
        const refuse = async (
            name: string,
            direct: () => Promise<unknown>,
            batch: () => Promise<unknown>,
        ) => {
            let directAnswer = "";
            await expect(
                direct().catch((e) => {
                    directAnswer = errorName(e);
                    throw e;
                }),
                `${name}: FigaroCore refuses it`,
            ).rejects.toThrow();
            const before = await holdings();
            const batchesBefore = (await publicClient.readContract({ address: verifier, abi: BATCH_VERIFIER_ABI, functionName: "batchCount" })) as bigint;
            const deadBefore = (await relay.status()).dead_lettered_ops ?? 0;
            let batchAnswer = "";
            try {
                await batch();
            } catch (e) {
                batchAnswer = `refused at the relay's door: ${(e as Error).message}`;
            }
            if (batchAnswer === "") {
                const deadline = Date.now() + 2 * 60_000;
                for (;;) {
                    const status = await relay.status();
                    if ((status.dead_lettered_ops ?? 0) > deadBefore) {
                        batchAnswer = `refused by the relay's batch formation: ${status.last_settle_error}`;
                        break;
                    }
                    if (Date.now() > deadline) throw new Error(`${name}: the relay neither refused nor dropped it`);
                    await new Promise((r) => setTimeout(r, 500));
                }
            }
            // A tick more: nothing it carried may land after the refusal either.
            await new Promise((r) => setTimeout(r, 5000));
            expect(await holdings(), `${name}: no token moved on the batch path`).toEqual(before);
            expect(
                (await publicClient.readContract({ address: verifier, abi: BATCH_VERIFIER_ABI, functionName: "batchCount" })) as bigint,
                `${name}: no batch landed`,
            ).toBe(batchesBefore);
            refusals.push({ name, direct: directAnswer, batch: batchAnswer });
        };
        const commitBoth = (name: string, draft: (p: Path) => Draft, reuse?: Record<Path, Awaited<ReturnType<typeof signed>>>) =>
            refuse(
                name,
                async () => {
                    const s = reuse?.direct ?? (await signed(draft("direct"), "direct"));
                    await publicClient.simulateContract({ address: core, abi: CORE_ABI, functionName: "commit", args: [s.c, s.buyerSig, s.sellerSig], account: deployerAccount });
                },
                async () => {
                    const s = reuse?.batch ?? (await signed(draft("batch"), "batch"));
                    await relay.submitCommit(s.c, s.buyerSig, s.sellerSig);
                },
            );

        await commitBoth("a commit past its deadline", (p) => ({ processId: ids[p], payment: 1n, runningTotal: 6n, salt: 10n, deadline: now - 1n }));
        await commitBoth("a commit of zero payment", () => ({ payment: 0n, runningTotal: 0n, salt: 11n }));
        await commitBoth("a commit the buyer did not sign", () => ({ payment: 1n, runningTotal: 1n, salt: 12n, buyerSigner: s2 }));
        await commitBoth("an extension whose cumulative value is off by one", (p) => ({ processId: ids[p], payment: 1n, runningTotal: 7n, salt: 13n }));
        await commitBoth("an extension of a process nobody opened", () => ({ processId: keccak256(stringToHex("nobody opened this")), payment: 1n, runningTotal: 6n, salt: 14n }));
        await commitBoth("an extension by another buyer", (p) => ({ processId: ids[p], buyer: b2, payment: 1n, runningTotal: 6n, salt: 15n }));
        {
            // A replay: the root order, as signed and landed.
            const replay = {
                direct: await signed({ payment: 3n, runningTotal: 3n, salt: 1n }, "direct"),
                batch: await signed({ payment: 3n, runningTotal: 3n, salt: 1n }, "batch"),
            };
            await commitBoth("a replay of a landed commit", () => ({ payment: 0n, runningTotal: 0n, salt: 0n }), replay);
        }
        await refuse(
            "a resolution that lists only some of the process's orders",
            () => publicClient.simulateContract({ address: core, abi: CORE_ABI, functionName: "resolveProcess", args: [ids.direct, [opened.direct[0]]], account: b1.account }),
            async () => relay.submitResolve(ids.batch, 5n, [opened.batch[0]], await resolveSig(b1, ids.batch, 5n)),
        );
        await refuse(
            "a resolution by a wallet that is not the buyer",
            () => publicClient.simulateContract({ address: core, abi: CORE_ABI, functionName: "resolveProcess", args: [ids.direct, opened.direct], account: s1.account }),
            async () => relay.submitResolve(ids.batch, 5n, opened.batch, await resolveSig(s1, ids.batch, 5n)),
        );

        // The valid resolution lands on both paths, then the process is closed.
        {
            const fromBlock = await publicClient.getBlockNumber();
            await send(b1, core, CORE_ABI, "resolveProcess", [ids.direct, opened.direct]);
            await relay.submitResolve(ids.batch, 5n, opened.batch, await resolveSig(b1, ids.batch, 5n));
            await waitForLanding(fromBlock, new Set(), new Set([ids.batch.toLowerCase()]), (await relay.status()).dead_lettered_ops ?? 0);
            for (const p of ["direct", "batch"] as const) {
                const token = p === "direct" ? tokenD : tokenB;
                expect(await balanceOf(token, b1.account.address), `${p}: the buyer's two payments back`).toBe(1000n - 10n + 10n - 5n);
                expect(await balanceOf(token, s1.account.address), `${p}: the seller paid`).toBe(1000n + 3n + 2n);
            }
        }
        await commitBoth("an extension of a resolved process", (p) => ({ processId: ids[p], payment: 1n, runningTotal: 6n, salt: 16n }));

        for (const r of refusals) console.log(`[refusals] ${r.name} — FigaroCore: ${r.direct}; batch path: ${r.batch}`);
        expect(refusals.length).toBe(10);
    }, 30 * 60_000);
});
