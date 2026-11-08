/**
 * @figaro-protocol/sdk/relay — run the relay program on your own machine.
 *
 * A process open on the batch path holds its bonds in `FigaroBatchVerifier`
 * and resolves only through a batch built on the state behind the verifier's
 * root. Every landed batch logs its whole operation stream, so that state is
 * rebuilt from the chain alone, and `settleBatch` is permissionless, so the
 * buyer needs no relay but its own. `proveAndSettle` starts the relay program
 * (`prover/sequencer`) with `REBUILD_FROM_CHAIN=1`, submits the buyer's signed
 * resolve to it, waits for the verifier's `ProcessResolved` for that process,
 * and stops the relay.
 *
 * Node only: it starts a program. The relay program must be the build whose
 * guest fingerprint the verifier pins — the relay refuses to start otherwise —
 * and it proves with the backend its settings name (`SP1_PROVER`: a local CPU
 * or GPU, or the Succinct Prover Network; a devnet verifier accepts the mock
 * prover). Its settings are documented in `prover/sequencer/README.md`.
 */
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { createPublicClient, http, type Address, type Hex } from "viem";
import { BATCH_VERIFIER_ABI } from "../abis.js";
import { SequencerClient } from "../agent/sequencer.js";
import type { Commitment } from "../types.js";

/** Where the relay runs and what it proves with. */
export interface ProveAndSettleConfig {
    /** The relay program, built from the recipe whose guest the verifier pins. */
    relayBinary: string;
    /** The chain's RPC URL. */
    rpcUrl: string;
    /** The `FigaroBatchVerifier` that holds the process. */
    batchVerifier: Address;
    /** The key that sends `settleBatch` and pays its gas: the buyer's own, or anyone's. */
    submitterKey: Hex;
    /** The block the verifier's logs begin at (its deployment block); 0 reads from genesis. */
    fromBlock?: bigint;
    /** Further relay settings: the prover (`SP1_PROVER`, `SP1_PROOF_MODE`, the network key),
     *  the usage counter and the registries a usage claim is checked against. The relay also
     *  inherits this process's environment; the settings `proveAndSettle` itself names (the
     *  chain, the verifier, the key, the port, the state file, the rebuild) override both. */
    env?: Record<string, string>;
    /** How long to wait for the relay to start and the batch to land. Default ten minutes. */
    timeoutMs?: number;
}

/** The buyer's resolve, in either of its forms: the buyer's own EIP-712 signature over
 *  `ResolveProcess(processId, cumulativeValue)` under the verifier's domain, or the bytes
 *  the buyer's wallet code validates for that digest (ERC-1271). */
export type BuyerResolve =
    | { processId: Hex; cumulativeValue: bigint; commitments: Commitment[]; buyerSignature: Hex }
    | { processId: Hex; cumulativeValue: bigint; commitments: Commitment[]; walletAuthorization: Hex };

/** The landing of the batch that resolved the process. */
export interface Settled {
    /** The `settleBatch` transaction. */
    transactionHash: Hex;
    /** The block it landed in. */
    blockNumber: bigint;
    /** The batch's id, from the verifier's `BatchSettled` in the same transaction. */
    batchId: bigint;
}

const DEFAULT_TIMEOUT_MS = 10 * 60_000;
/** The relay's own words when the verifier's root moved to a state it does not hold
 *  (`prover/sequencer/src/main.rs`, the batch loop's out-of-step branch): another
 *  submitter's batch landed after this relay rebuilt, and it builds nothing more. */
const OUT_OF_STEP = "is not a state this relay holds";
const POLL_MS = 1_000;

/** A port no other program is listening on, asked of the operating system. */
async function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            const port = typeof address === "object" && address ? address.port : 0;
            server.close(() => resolve(port));
        });
    });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Prove and land the buyer's resolve with a relay of the caller's own, started on the
 * state it rebuilds from the chain. Resolves with the transaction that emitted the
 * verifier's `ProcessResolved` for `resolve.processId`; rejects, with the relay's own
 * output, when the relay refuses to start or exits, when it refuses the resolve, or when
 * nothing lands within the timeout. The relay is stopped and its state file deleted in
 * every case.
 */
export async function proveAndSettle(config: ProveAndSettleConfig, resolve: BuyerResolve): Promise<Settled> {
    const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const giveUpAt = Date.now() + timeoutMs;
    const client = createPublicClient({ transport: http(config.rpcUrl) });
    const startBlock = await client.getBlockNumber();
    const port = await freePort();
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "figaro-relay-"));

    const child = spawn(config.relayBinary, [], {
        env: {
            ...process.env,
            ...config.env,
            RPC_URL: config.rpcUrl,
            BATCH_VERIFIER_ADDRESS: config.batchVerifier,
            // The batch path's EIP-712 domain names the verifier.
            FIGARO_CORE_ADDRESS: config.batchVerifier,
            SEQUENCER_PRIVATE_KEY: config.submitterKey,
            STATE_PATH: path.join(stateDir, "state.json"),
            LISTEN_ADDR: `127.0.0.1:${port}`,
            REBUILD_FROM_CHAIN: "1",
            REBUILD_FROM_BLOCK: (config.fromBlock ?? 0n).toString(),
        },
        stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    // A program that cannot be started (a wrong path, no permission) is an
    // `error` event, then `close`; unhandled, it would end this process.
    child.on("error", (e) => (output += `${e}\n`));
    child.stdout?.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr?.on("data", (chunk: Buffer) => (output += chunk.toString()));
    let exited: number | null | undefined;
    const closed = new Promise<void>((r) => child.once("close", (code) => { exited = code; r(); }));
    const failure = (why: string) => new Error(`${why}\n--- the relay's output ---\n${output}`);

    try {
        const relay = new SequencerClient({ url: `http://127.0.0.1:${port}` });
        while (!(await relay.isAvailable())) {
            if (exited !== undefined) throw failure(`the relay exited with ${exited} before it was ready`);
            if (Date.now() > giveUpAt) throw failure("the relay was not ready within the timeout");
            await sleep(POLL_MS);
        }

        if ("buyerSignature" in resolve) {
            await relay.submitResolve(resolve.processId, resolve.cumulativeValue, resolve.commitments, resolve.buyerSignature);
        } else {
            await relay.submitResolveByWalletCode(resolve.processId, resolve.cumulativeValue, resolve.commitments, resolve.walletAuthorization);
        }

        for (;;) {
            const [resolved] = await client.getContractEvents({
                address: config.batchVerifier,
                abi: BATCH_VERIFIER_ABI,
                eventName: "ProcessResolved",
                args: { processId: resolve.processId },
                fromBlock: startBlock,
            });
            if (resolved) {
                const settled = (await client.getContractEvents({
                    address: config.batchVerifier,
                    abi: BATCH_VERIFIER_ABI,
                    eventName: "BatchSettled",
                    fromBlock: resolved.blockNumber,
                    toBlock: resolved.blockNumber,
                })).find((log) => log.transactionHash === resolved.transactionHash);
                if (!settled) {
                    throw failure("the verifier resolved the process without a BatchSettled in the same transaction");
                }
                return {
                    transactionHash: resolved.transactionHash,
                    blockNumber: resolved.blockNumber,
                    batchId: BigInt(settled.args.batchId as bigint),
                };
            }
            if (exited !== undefined) throw failure(`the relay exited with ${exited} before the batch landed`);
            const status = await relay.status().catch(() => null);
            if ((status?.dead_lettered_ops ?? 0) > 0) {
                throw failure(`the relay refused the resolve: ${status?.last_settle_error ?? "dead-lettered"}`);
            }
            if (status?.last_settle_error?.includes(OUT_OF_STEP)) {
                throw failure(
                    `another batch landed on the verifier after this relay rebuilt its state; call proveAndSettle again to rebuild on the new root: ${status.last_settle_error}`,
                );
            }
            if (Date.now() > giveUpAt) {
                throw failure(`no batch resolved the process within the timeout; the relay's last error: ${status?.last_settle_error ?? "none"}`);
            }
            await sleep(POLL_MS);
        }
    } finally {
        if (exited === undefined) {
            child.kill("SIGTERM");
            const killer = setTimeout(() => child.kill("SIGKILL"), 10_000);
            await closed;
            clearTimeout(killer);
        }
        fs.rmSync(stateDir, { recursive: true, force: true });
    }
}
