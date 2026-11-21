/**
 * relayProcess.ts — the relay this repository builds (`prover/sequencer`),
 * started for a devnet spec against the devnet's batch verifier and stopped
 * after it.
 *
 * The relay starts with nothing and `REBUILD_FROM_CHAIN=1`, so it rebuilds
 * the state behind the verifier's root from the chain whatever other specs
 * settled. It proves with the prover its environment names (the devnet's
 * verifier accepts the mock prover). A spec that needs it skips when no
 * binary is built, unless `REQUIRE_BATCH_E2E=1`, which the full devnet suite
 * in CI sets: a missing binary is then a failure.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Hex } from 'viem';
import { RPC_URL, readLocalDeploymentConfig } from './devnet-helpers';

export const SEQUENCER_BIN = path.resolve(__dirname, '../../../prover/target/release/sequencer');
/** Set where the binary is built for this run: a missing binary then fails. */
export const REQUIRE_RELAY = process.env.REQUIRE_BATCH_E2E === '1';

export interface StartedRelay {
    url: string;
    stop: () => Promise<void>;
}

async function waitForRelay(url: string, exit: { code: number | null; lines: string[] }, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (exit.code !== null) {
            await new Promise((r) => setTimeout(r, 300));
            throw new Error(`the relay exited with code ${exit.code} before serving /status:\n${exit.lines.slice(-12).join('\n')}`);
        }
        try {
            const res = await fetch(`${url}/status`, { signal: AbortSignal.timeout(1000) });
            if (res.ok) return;
        } catch { /* not up yet */ }
        await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error(`the relay at ${url} did not serve /status within ${timeoutMs}ms`);
}

async function stopRelay(child: ChildProcess): Promise<void> {
    if (child.exitCode !== null) return;
    const gone = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    child.kill('SIGTERM');
    await Promise.race([gone, new Promise<void>((r) => setTimeout(r, 5000))]);
    if (child.exitCode === null) child.kill('SIGKILL');
}

/** Start the relay on `port`, sending its batches from `signerKey` (gas only),
 *  and wait for its `/status`. The first start derives the guest fingerprint
 *  (minutes); later starts read it from the cache. `browserOrigins` are the
 *  page origins the relay lets submit from a browser
 *  (`BROWSER_SUBMIT_ORIGINS`): the app under test's origin, for a spec whose
 *  page sends to the relay; none for a spec that submits from Node.
 *
 *  The relay refuses to start unless the devnet's verifier pins the key of
 *  this binary's proof program: the devnet deploy pins the key the built
 *  relay reports (`sequencer --vkey`), so the relay must be built before the
 *  devnet is deployed, as the full devnet suite in CI does. */
export async function startRelay(opts: { port: number; signerKey: Hex; scratchPrefix: string; browserOrigins?: string[] }): Promise<StartedRelay> {
    const config = readLocalDeploymentConfig();
    const verifier = config.batchVerifier as Hex;
    const url = `http://127.0.0.1:${opts.port}`;
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), opts.scratchPrefix));
    const exit = { code: null as number | null, lines: [] as string[] };
    const child = spawn(SEQUENCER_BIN, [], {
        env: {
            ...process.env,
            RPC_URL,
            BATCH_VERIFIER_ADDRESS: verifier,
            USAGE_COUNTER_ADDRESS: config.usageCounter as string,
            CLAUSE_REGISTRY_ADDRESS: config.clauseRegistry as string,
            PROCESS_REGISTRY_ADDRESS: config.processRegistry as string,
            AGREEMENT_REGISTRY_ADDRESS: config.agreementRegistry as string,
            MEMBERS_REGISTRY_ADDRESS: config.membersRegistry as string,
            // The batch path's EIP-712 verifyingContract is the verifier.
            FIGARO_CORE_ADDRESS: verifier,
            SEQUENCER_PRIVATE_KEY: opts.signerKey,
            STATE_PATH: path.join(scratch, 'state.json'),
            REBUILD_FROM_CHAIN: '1',
            LISTEN_ADDR: `127.0.0.1:${opts.port}`,
            BATCH_INTERVAL_SECS: '2',
            MAX_BATCH_OPS: '50',
            BROWSER_SUBMIT_ORIGINS: (opts.browserOrigins ?? []).join(','),
            RUST_LOG: 'figaro_sequencer=info,sequencer=info',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    const collect = (chunk: Buffer) => { exit.lines.push(...chunk.toString().split('\n').filter(Boolean)); };
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);
    child.on('exit', (code) => { exit.code = code ?? -1; });
    const stop = async () => {
        await stopRelay(child);
        fs.rmSync(scratch, { recursive: true, force: true });
    };
    try {
        await waitForRelay(url, exit, 10 * 60_000);
    } catch (error) {
        await stop();
        const fingerprint = exit.lines.some((l) => l.includes('guest fingerprint is not the one the verifier pins'));
        throw fingerprint
            ? new Error(`the devnet's verifier pins another proof program's key than the relay at ${SEQUENCER_BIN}: build the relay (cargo build --release -p figaro-sequencer), then deploy the devnet, which pins the key the built relay reports\n${(error as Error).message}`)
            : error;
    }
    return { url, stop };
}
