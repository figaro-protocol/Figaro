/**
 * audit-relay.devnet.spec.ts — /audit/view READING A RUNNING RELAY, end to end.
 *
 * A batch-resolved order emits no FigaroCore event: its struct exists only
 * under FigaroBatchVerifier's proven state root, and the audit page reads it
 * from a relay, taking nothing on the relay's word. This spec puts a real
 * relay behind that page, on the devnet's own verifier:
 *
 *   relay    → the sequencer this tree built (prover/target/release/sequencer)
 *              is started against the devnet's FigaroBatchVerifier, whose
 *              programVKey is that binary's guest (scripts/deploy-local.sh pins
 *              it at deploy; a relay refuses a verifier that pins another key)
 *   commit   → an agent for the buyer and one for the seller fund their bonds
 *              on the devnet token, sign one commitment under the verifier's
 *              EIP-712 domain and submit it through the relay (SequencerClient),
 *              as an ecosystem agent would; the relay proves and settles it
 *   evidence → OUT OF BAND: the verifier's `stateRoot()` moved off the root it
 *              held, the buyer's balance dropped by the buyer bond (read from
 *              the token), and the relay's `GET /state` recomputes, with the
 *              page's own state-root code, to exactly the chain's root and the
 *              root its own header names
 *   read     → the browser points at the relay through the per-browser endpoint
 *              override (`figaro.user-endpoints`, what /members/edit/endpoints
 *              writes), opens /audit/view for the process, and the order
 *              renders with its verdict: every check passed, `state-inclusion`
 *              among them — the check that was unit-tested only until here
 *
 * Skips when no sequencer binary is built (a fresh clone, CI's frontend job).
 * Depends on populate-test-data (the devnet-authoring gate), as every devnet
 * spec does; needs nothing it seeds.
 */
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createWalletClient, hashTypedData, http, parseAbi, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { LOCAL_ANVIL, RPC_URL, keyOf, localPublicClient, primeRegisteredClauseSpecs, readLocalDeploymentConfig } from './devnet-helpers';
import { ANVIL_KEYS } from '../anvilAccounts';
import {
    BATCH_VERIFIER_ABI,
    ERC20_ABI,
    buildCommitment,
    buildDomain,
    buildOrderAgreement,
    calculateBonds,
    computeOrderHash,
} from '@figaro-protocol/sdk';
import { SequencerClient } from '@figaro-protocol/sdk/agent';
import { computeKernelStateRoot, parseKernelStateSnapshot } from '@/lib/audit/batchStateRoot';
import { specSource } from '@/lib/shared/clauseSpecSource';

const SEQUENCER_BIN = path.resolve(__dirname, '../../../prover/target/release/sequencer');
const RELAY_PORT = 3011;
const RELAY_URL = `http://127.0.0.1:${RELAY_PORT}`;
const MINT_ABI = parseAbi(['function mint(address to, uint256 amount) external']);

// anvil[0] is the fixture buyer; anvil[14] serves as a counterparty across the
// suite and seeds no profile here; anvil[4] signs the relay's settle
// transactions (gas only). None is a populate-owned index.
const BUYER = privateKeyToAccount(ANVIL_KEYS[0] as Hex);
const SELLER = privateKeyToAccount(ANVIL_KEYS[14] as Hex);
const RELAY_SIGNER_KEY = ANVIL_KEYS[4] as Hex;

const PAYMENT = 1n * 10n ** 18n;

/** The relay's own words for a kept state behind the verifier's root. */
const BEHIND_THE_ROOT = 'does not hold the state behind the verifier\'s root';

async function waitForRelay(child: ChildProcess, exit: { code: number | null; stderr: string[] }, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (exit.code !== null) {
            // The exit event can land before the last output chunk: let it arrive.
            await new Promise((r) => setTimeout(r, 300));
            // Another settler moved the verifier's root since this relay's last batch
            // (data-explore settles on the verifier directly): the relay holds no state
            // behind that root and refuses, as it must — a relay builds only on a state
            // it holds. This spec then has nothing to drive until the devnet is redeployed.
            test.skip(exit.stderr.some((l) => l.includes(BEHIND_THE_ROOT)),
                `the verifier's root moved past this relay's kept state since its last run (another spec settled a batch directly); the relay refuses to build on a state it does not hold — redeploy the devnet (devup) to run this spec again`);
            throw new Error(`the relay exited with code ${exit.code} before serving /status — a code 2 is the relay's own refusal, printed below: a guest fingerprint the verifier does not pin (redeploy the devnet so it pins this binary's), or a state file that is not the one behind the verifier's root (this spec keeps it under the system temp directory, named by the verifier).\n${exit.stderr.slice(-12).join('\n')}`);
        }
        try {
            const res = await fetch(`${RELAY_URL}/status`, { signal: AbortSignal.timeout(1000) });
            if (res.ok) return;
        } catch { /* not up yet */ }
        await new Promise((r) => setTimeout(r, 300));
    }
    throw new Error(`the relay at ${RELAY_URL} did not serve /status within ${timeoutMs}ms`);
}

async function stopRelay(child: ChildProcess): Promise<void> {
    if (child.exitCode !== null) return;
    const gone = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    child.kill('SIGTERM');
    await Promise.race([gone, new Promise<void>((r) => setTimeout(r, 5000))]);
    if (child.exitCode === null) child.kill('SIGKILL');
}

test.describe('AUDIT RELAY — /audit/view reads a batch-resolved order from a running relay (devnet)', () => {
    test.setTimeout(900_000);

    test('one order through the relay: the chain moves, GET /state recomputes to the chain root, and the page renders the verified order', async ({ page }) => {
        test.skip(!fs.existsSync(SEQUENCER_BIN), `no sequencer binary at ${SEQUENCER_BIN} (cargo build --release -p figaro-sequencer)`);
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });

        const config = readLocalDeploymentConfig();
        const verifier = config.batchVerifier as Hex;
        const token = config.tokenAddress as Hex;
        expect(verifier, 'the devnet names its batch verifier').toMatch(/^0x[0-9a-fA-F]{40}$/);
        const publicClient = localPublicClient();
        const wallet = (account: typeof BUYER) => createWalletClient({ account, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const balanceOf = (who: Hex) => publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;
        const chainRoot = () => publicClient.readContract({ address: verifier, abi: BATCH_VERIFIER_ABI, functionName: 'stateRoot' }) as Promise<Hex>;

        // ── The relay, on the devnet's verifier, with a state of its own. ──
        // The relay's state lives where a later run on the SAME devnet finds it: a
        // relay refuses to start without the state behind the verifier's root, and
        // this spec moves that root every run. The directory is named by the
        // verifier, so a fresh devnet (a new verifier) starts from a fresh state.
        const scratch = path.join(os.tmpdir(), `figaro-audit-relay-${verifier.toLowerCase()}`);
        fs.mkdirSync(scratch, { recursive: true });
        const exit = { code: null as number | null, stderr: [] as string[] };
        const relay = spawn(SEQUENCER_BIN, [], {
            env: {
                ...process.env,
                RPC_URL,
                CHAIN_ID: '31337',
                BATCH_VERIFIER_ADDRESS: verifier,
                USAGE_COUNTER_ADDRESS: config.usageCounter as string,
                CLAUSE_REGISTRY_ADDRESS: config.clauseRegistry as string,
                ASSEMBLY_REGISTRY_ADDRESS: config.assemblyRegistry as string,
                AGREEMENT_REGISTRY_ADDRESS: config.agreementRegistry as string,
                MEMBERS_REGISTRY_ADDRESS: config.membersRegistry as string,
                // The batch path's EIP-712 verifyingContract is the verifier.
                FIGARO_CORE_ADDRESS: verifier,
                SEQUENCER_PRIVATE_KEY: RELAY_SIGNER_KEY,
                ARCHIVE_PATH: path.join(scratch, 'archive.jsonl'),
                STATE_PATH: path.join(scratch, 'state.json'),
                LISTEN_ADDR: `127.0.0.1:${RELAY_PORT}`,
                BATCH_INTERVAL_SECS: '2',
                MAX_BATCH_OPS: '50',
                RUST_LOG: 'figaro_sequencer=info,sequencer=info',
            },
            // The relay's log (tracing) goes to stdout; both streams are kept.
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        const collect = (chunk: Buffer) => { exit.stderr.push(...chunk.toString().split('\n').filter(Boolean)); };
        relay.stdout?.on('data', collect);
        relay.stderr?.on('data', collect);
        relay.on('exit', (code) => { exit.code = code ?? -1; });

        try {
            // The first start derives the guest fingerprint (minutes); cached after.
            await waitForRelay(relay, exit, 10 * 60_000);
            const client = new SequencerClient({ url: RELAY_URL });
            const settledBefore = (await client.status()).batches_settled;
            const rootBefore = await chainRoot();

            // ── Both agents fund their bonds on the devnet token. ──
            const bonds = calculateBonds(PAYMENT, PAYMENT);
            const send = async (who: typeof BUYER, args: Parameters<ReturnType<typeof wallet>['writeContract']>[0]) =>
                publicClient.waitForTransactionReceipt({ hash: await wallet(who).writeContract(args) });
            await send(BUYER, { address: token, abi: MINT_ABI, functionName: 'mint', args: [BUYER.address, bonds.buyerBond] });
            await send(BUYER, { address: token, abi: MINT_ABI, functionName: 'mint', args: [SELLER.address, bonds.sellerBond] });
            await send(BUYER, { address: token, abi: ERC20_ABI, functionName: 'approve', args: [verifier, bonds.buyerBond] });
            await send(SELLER, { address: token, abi: ERC20_ABI, functionName: 'approve', args: [verifier, bonds.sellerBond] });
            const buyerBefore = await balanceOf(BUYER.address);

            // ── The agreement and the commitment, signed by both, submitted. ──
            await primeRegisteredClauseSpecs();
            const { checkoutHash } = buildOrderAgreement(BUYER.address, SELLER.address, {
                [keyOf('figaro-commerce')]: {
                    currency: token,
                    payment: PAYMENT.toString(),
                    lineItems: [{ itemId: 'audit-relay-1', name: 'One batch-resolved order', quantity: 1, unitPrice: PAYMENT.toString() }],
                },
                [keyOf('figaro-topology')]: { follows: [] },
            }, specSource());
            const domain = buildDomain(31337, verifier);
            const { commitment, typedData } = buildCommitment({
                processId: `0x${'0'.repeat(64)}` as Hex,
                buyer: BUYER.address,
                seller: SELLER.address,
                currency: token,
                payment: PAYMENT,
                expectedCumulativeValue: PAYMENT,
                checkoutHash,
                salt: BigInt(Date.now()),
                deadline: BigInt((await publicClient.getBlock()).timestamp) + 3600n,
            }, domain);
            const buyerSig = await BUYER.signTypedData(typedData);
            const sellerSig = await SELLER.signTypedData(typedData);
            const submitted = await client.submitCommit(commitment, buyerSig, sellerSig);
            expect(typeof submitted.id, 'the relay admits the commit').toBe('number');
            const processId = hashTypedData(typedData) as Hex;
            const orderHash = computeOrderHash(commitment, 31337, verifier);

            // ── The batch lands: a CHAIN FACT, then the relay's published state against it. ──
            await expect.poll(async () => (await client.status()).batches_settled, {
                timeout: 120_000, message: 'the relay settles the batch that carries the commit',
            }).toBeGreaterThanOrEqual(settledBefore + 1);
            const rootAfter = await chainRoot();
            expect(rootAfter, 'the verifier moved off the root it held').not.toBe(rootBefore);
            expect(await balanceOf(BUYER.address), 'the buyer bond left the buyer on the batch path').toBe(buyerBefore - bonds.buyerBond);

            const stateRes = await fetch(`${RELAY_URL}/state`);
            expect(stateRes.ok, 'the relay serves GET /state').toBe(true);
            const headerRoot = stateRes.headers.get('x-figaro-state-root');
            const recomputed = computeKernelStateRoot(parseKernelStateSnapshot(await stateRes.text()));
            expect(recomputed.toLowerCase(), 'GET /state recomputes to the verifier\'s root on chain').toBe(rootAfter.toLowerCase());
            expect((headerRoot ?? '').toLowerCase(), 'the relay\'s header names the root its body recomputes to').toBe(recomputed.toLowerCase());

            // ── The page, pointed at the relay through the per-browser endpoint override. ──
            await page.addInitScript((url) => {
                window.localStorage.setItem('figaro.user-endpoints', JSON.stringify({ batchRelayUrl: url }));
            }, RELAY_URL);
            await gotoAsWallet(page, BUYER.address, `/audit/view?process=${processId}&e2e=devnet`);
            await page.getByTestId('audit-page').waitFor({ timeout: 30000 });
            await expect(page.getByTestId('batch-relay-source'), 'the panel names the relay it read')
                .toContainText(RELAY_URL, { timeout: 60000 });
            await expect(page.getByTestId(`batch-verdict-${orderHash}`), 'the order passed every check')
                .toContainText('Passed every check', { timeout: 30000 });
            await expect(page.getByTestId(`batch-check-state-inclusion-${orderHash}`), 'the state-inclusion check passed against the live relay')
                .toContainText('✓', { timeout: 30000 });
            await expect(page.getByTestId(`batch-check-state-root-anchor-${orderHash}`), 'the batch root is anchored on chain')
                .toContainText('✓', { timeout: 30000 });
            await expect(page.getByTestId(`batch-order-${orderHash}`), 'the order renders as trade under the verifier\'s root')
                .toContainText(orderHash);
        } finally {
            await stopRelay(relay);
            // The state stays: the next run on this devnet resumes from it.
        }
    });
});
