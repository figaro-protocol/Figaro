/**
 * batch-events.devnet.spec.ts — a batch-resolved order, read in the app from
 * chain events alone, end to end.
 *
 * Batch and Core are equivalent to a reader: FigaroBatchVerifier emits
 * FigaroCore's own order events for every batched order, and the order
 * readers fold both emitters. No relay is read by the page.
 *
 *   relay    → the sequencer this tree built, started with nothing and
 *              REBUILD_FROM_CHAIN=1, so it rebuilds the state behind the
 *              devnet verifier's root from the chain whatever other specs
 *              settled, and serves only as transport
 *   commit   → an agent for the buyer and one for the seller fund their bonds,
 *              sign one commitment under the verifier's EIP-712 domain and
 *              submit it through the relay; the relay proves and lands it
 *   evidence → OUT OF BAND: the verifier's root moved, the buyer bond left the
 *              buyer (read from the token), and the verifier's OrderCommitted
 *              names the order
 *   attest   → the seller signs an attestation of a process-log clause of the
 *              agreement and the relay lands it; the verifier emits the
 *              `Attestation`, the coordinator emits none
 *   resolve  → the buyer signs the resolution, the relay lands it; the verifier
 *              emits `OrderResolved` and `ProcessResolved`, FigaroCore none
 *   read     → each surface, with no relay endpoint anywhere:
 *              /orders/view lists the batched attestation, tagged batch, and
 *              the sealed handoff key the buyer's tab held for the order is
 *              purged when the batched resolution lands (useHandoffCleanup);
 *              /audit/view renders the order, its signatures "Proved in a
 *              batch", bound to the batch the chain names, and the clause
 *              evidence lists the batched attestation, tagged batch;
 *              /evidence-display lists the commit, the attestation and the
 *              resolution, each tagged batch
 *
 * Skips when no sequencer binary is built. Depends on populate-test-data, as
 * every devnet spec does; needs nothing it seeds.
 */
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createWalletClient, hashTypedData, http, keccak256, parseAbi, stringToHex, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { LOCAL_ANVIL, RPC_URL, keyOf, localPublicClient, pinJSONToIPFS, primeRegisteredClauseSpecs, readLocalDeploymentConfig } from './devnet-helpers';
import { ANVIL_KEYS } from '../anvilAccounts';
import {
    BATCH_VERIFIER_ABI,
    ERC20_ABI,
    buildCommitment,
    buildDomain,
    buildOrderAgreement,
    buildSignedClauseInclusionProof,
    calculateBonds,
    computeOrderHash,
    hashClauseData,
} from '@figaro-protocol/sdk';
import { SequencerClient } from '@figaro-protocol/sdk/agent';
import { specSource } from '@/lib/shared/clauseSpecSource';

const SEQUENCER_BIN = path.resolve(__dirname, '../../../prover/target/release/sequencer');
const RELAY_PORT = 3011;
const RELAY_URL = `http://127.0.0.1:${RELAY_PORT}`;
const MINT_ABI = parseAbi(['function mint(address to, uint256 amount) external']);

// anvil[0] is the fixture buyer; anvil[14] serves as a counterparty across the
// suite and seeds no profile here; anvil[4] signs the relay's transactions
// (gas only). None is a populate-owned index.
const BUYER = privateKeyToAccount(ANVIL_KEYS[0] as Hex);
const SELLER = privateKeyToAccount(ANVIL_KEYS[14] as Hex);
const RELAY_SIGNER_KEY = ANVIL_KEYS[4] as Hex;

const PAYMENT = 1n * 10n ** 18n;

// The batch path's typed data (the verifier's EIP-712 domain): the signature
// replaces msg.sender, as the direct path's caller does.
const RESOLVE_TYPES = {
    ResolveProcess: [
        { name: 'processId', type: 'bytes32' },
        { name: 'cumulativeValue', type: 'uint256' },
    ],
} as const;
const ATTEST_SELLER_TYPES = {
    AttestSeller: [
        { name: 'orderHash', type: 'bytes32' },
        { name: 'clauseId', type: 'bytes32' },
        { name: 'stage', type: 'uint8' },
        { name: 'contentRef', type: 'bytes32' },
    ],
} as const;

async function waitForRelay(exit: { code: number | null; lines: string[] }, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (exit.code !== null) {
            await new Promise((r) => setTimeout(r, 300));
            throw new Error(`the relay exited with code ${exit.code} before serving /status:\n${exit.lines.slice(-12).join('\n')}`);
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

test.describe('BATCH EVENTS — a batch-resolved order renders from chain events alone (devnet)', () => {
    test.setTimeout(900_000);

    test('one order through a relay rebuilt from the chain, attested and resolved in batches: the chain names each, and every surface shows it tagged batch', async ({ page }) => {
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

        // ── The relay: started with nothing, rebuilt from the chain. ──
        const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'figaro-batch-events-'));
        const exit = { code: null as number | null, lines: [] as string[] };
        const relay = spawn(SEQUENCER_BIN, [], {
            env: {
                ...process.env,
                RPC_URL,
                BATCH_VERIFIER_ADDRESS: verifier,
                USAGE_COUNTER_ADDRESS: config.usageCounter as string,
                CLAUSE_REGISTRY_ADDRESS: config.clauseRegistry as string,
                ASSEMBLY_REGISTRY_ADDRESS: config.assemblyRegistry as string,
                AGREEMENT_REGISTRY_ADDRESS: config.agreementRegistry as string,
                MEMBERS_REGISTRY_ADDRESS: config.membersRegistry as string,
                // The batch path's EIP-712 verifyingContract is the verifier.
                FIGARO_CORE_ADDRESS: verifier,
                SEQUENCER_PRIVATE_KEY: RELAY_SIGNER_KEY,
                STATE_PATH: path.join(scratch, 'state.json'),
                REBUILD_FROM_CHAIN: '1',
                LISTEN_ADDR: `127.0.0.1:${RELAY_PORT}`,
                BATCH_INTERVAL_SECS: '2',
                MAX_BATCH_OPS: '50',
                RUST_LOG: 'figaro_sequencer=info,sequencer=info',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        const collect = (chunk: Buffer) => { exit.lines.push(...chunk.toString().split('\n').filter(Boolean)); };
        relay.stdout?.on('data', collect);
        relay.stderr?.on('data', collect);
        relay.on('exit', (code) => { exit.code = code ?? -1; });

        try {
            // The first start derives the guest fingerprint (minutes); cached after.
            await waitForRelay(exit, 10 * 60_000);
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
            const { agreement, checkoutHash } = buildOrderAgreement(BUYER.address, SELLER.address, {
                [keyOf('figaro-commerce')]: {
                    currency: token,
                    payment: PAYMENT.toString(),
                    lineItems: [{ itemId: 'batch-events-1', name: 'One batch-resolved order', quantity: 1, unitPrice: PAYMENT.toString() }],
                },
                [keyOf('figaro-topology')]: { follows: [] },
                // A process-log clause: the seller's attestation below names it, and the
                // audit page's clause evidence and the order page's timeline list it.
                [keyOf('figaro-merchant-process')]: {},
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

            // ── The batch lands: CHAIN FACTS, read out of band. ──
            await expect.poll(async () => (await client.status()).batches_settled, {
                timeout: 120_000, message: 'the relay lands the batch that carries the commit',
            }).toBeGreaterThanOrEqual(settledBefore + 1);
            expect(await chainRoot(), 'the verifier moved off the root it held').not.toBe(rootBefore);
            expect(await balanceOf(BUYER.address), 'the buyer bond left the buyer on the batch path').toBe(buyerBefore - bonds.buyerBond);
            const committed = await publicClient.getContractEvents({
                address: verifier, abi: BATCH_VERIFIER_ABI, eventName: 'OrderCommitted',
                args: { orderHash }, fromBlock: 0n,
            });
            expect(committed, 'the verifier names the order in the Core\'s own event').toHaveLength(1);
            expect(committed[0].args.processId).toBe(processId);

            // ── The seller's attestation, through the relay. ──
            const processClause = keyOf('figaro-merchant-process');
            const processClauseEntry = agreement.clauses.find((c) => c.clause.toLowerCase() === processClause.toLowerCase())!;
            const { proof } = buildSignedClauseInclusionProof(agreement, processClause);
            const contentRef = keccak256(stringToHex('batch-events: preparation started'));
            const attestSig = await SELLER.signTypedData({
                domain, types: ATTEST_SELLER_TYPES, primaryType: 'AttestSeller',
                message: { orderHash, clauseId: processClause, stage: 0, contentRef },
            });
            const attested = await client.submitAttestAsSeller({
                target: commitment, clauseId: processClause, stage: 0, contentRef, sellerSig: attestSig,
                clauseDataHash: hashClauseData(processClauseEntry), inclusionProof: proof,
            });
            expect(typeof attested.id, 'the relay admits the attestation').toBe('number');
            // CHAIN FACT, out of band: the verifier emitted the Attestation; the coordinator emitted none.
            const attestationsAt = (address: Hex) => publicClient.getContractEvents({
                address, abi: BATCH_VERIFIER_ABI, eventName: 'Attestation', args: { orderHash }, fromBlock: 0n,
            });
            await expect.poll(async () => (await attestationsAt(verifier)).length, {
                timeout: 120_000, message: 'the relay lands the batch that carries the attestation',
            }).toBe(1);
            expect(await attestationsAt(config.attestationCoordinator as Hex), 'the coordinator emitted none: the attestation is batch-only').toHaveLength(0);

            // ── The agreement's content is the parties' own: pin it for the buyer's browser. ──
            // The chain holds the agreement's fingerprint only; its content is pinned by the buyer's
            // client when the buyer signs (`publishAgreement` → the wallet's
            // `figaro:agreement-uri:<checkoutHash>` locator). This spec signed for the buyer out of
            // band, so it does that one step the buyer's client would have done. Nothing here comes
            // from a relay.
            const { uri: agreementUri } = await pinJSONToIPFS(agreement);
            const ecdhKey = `${BUYER.address.toLowerCase()}:${orderHash}`;
            await page.addInitScript(([locatorKey, uri, storeKey]: [string, string, string]) => {
                window.localStorage.setItem(locatorKey, uri);
                // The buyer's tab holds a sealed-handoff key for the order (seeded once, so a later
                // navigation does not put back what the purge removed).
                if (!window.sessionStorage.getItem('batch-events-seeded')) {
                    window.sessionStorage.setItem('batch-events-seeded', '1');
                    window.sessionStorage.setItem('figaro-ecdh-keys', JSON.stringify({
                        [storeKey]: { privateKeyHex: '11'.repeat(32), publicKeyHex: '02' + '22'.repeat(32), createdAt: Date.now() },
                    }));
                }
            }, [`figaro:agreement-uri:${checkoutHash}`, agreementUri, ecdhKey] as [string, string, string]);
            const ecdhHeld = () => page.evaluate((key) => {
                const store = JSON.parse(window.sessionStorage.getItem('figaro-ecdh-keys') ?? '{}');
                return key in store;
            }, ecdhKey);

            // ── The order page, while the order is still open: the batched attestation. ──
            await gotoAsWallet(page, BUYER.address, `/orders/view?process=${processId}&e2e=devnet`);
            await page.getByTestId('order-timeline-view').waitFor({ timeout: 60000 });
            await expect(page.getByTestId('timeline-event-prep-started').getByTestId('timeline-event-path'), 'the order page lists the batched attestation, tagged batch')
                .toHaveAttribute('data-universe', 'batch', { timeout: 60000 });
            expect(await ecdhHeld(), 'the buyer\'s tab holds the sealed-handoff key while the order is open').toBe(true);

            // ── The buyer's resolution, through the relay. ──
            const resolveSig = await BUYER.signTypedData({
                domain, types: RESOLVE_TYPES, primaryType: 'ResolveProcess',
                message: { processId, cumulativeValue: PAYMENT },
            });
            const resolved = await client.submitResolve(processId, PAYMENT, [commitment], resolveSig);
            expect(typeof resolved.id, 'the relay admits the resolution').toBe('number');
            const resolvedAt = (address: Hex) => publicClient.getContractEvents({
                address, abi: BATCH_VERIFIER_ABI, eventName: 'OrderResolved', args: { orderHash }, fromBlock: 0n,
            });
            await expect.poll(async () => (await resolvedAt(verifier)).length, {
                timeout: 120_000, message: 'the relay lands the batch that carries the resolution',
            }).toBe(1);
            expect(await resolvedAt(config.figaroCore as Hex), 'FigaroCore emitted no OrderResolved: the resolution is batch-only').toHaveLength(0);
            expect(await balanceOf(BUYER.address), 'the buyer\'s bond came back less the payment, on the batch path').toBe(buyerBefore - PAYMENT);

            // ── The cleanup of sealed handoff data, on the buyer's open tab. ──
            await expect.poll(ecdhHeld, {
                timeout: 60000, message: 'the batched OrderResolved purges the sealed-handoff key the tab held',
            }).toBe(false);

            // ── The audit page, with no relay endpoint anywhere. ──
            await gotoAsWallet(page, BUYER.address, `/audit/view?process=${processId}&e2e=devnet`);
            await page.getByTestId('audit-page').waitFor({ timeout: 30000 });
            await expect(page.getByTestId('financials-empty'), 'the order is found, from events').toHaveCount(0, { timeout: 60000 });
            await expect(page.getByTestId(`audit-sig-buyer-${orderHash}`), 'the buyer\'s signature was checked inside the proof')
                .toContainText('Proved in a batch', { timeout: 60000 });
            await expect(page.getByTestId(`audit-sig-seller-${orderHash}`), 'and the seller\'s')
                .toContainText('Proved in a batch');
            await expect(page.getByTestId(`audit-sig-batch-${orderHash}`), 'bound to the batch the chain names')
                .toContainText('Batch #', { timeout: 30000 });
            await expect(page.getByTestId(`audit-attestation-path-${processClause.toLowerCase()}-0`), 'the clause evidence lists the batched attestation, tagged batch')
                .toHaveAttribute('data-universe', 'batch', { timeout: 60000 });

            // ── The evidence timeline: the commit, the attestation and the resolution, each from the verifier. ──
            await page.goto(
                `/evidence-display?processId=${processId}&chainID=31337&coreAddress=${config.figaroCore}` +
                `&arbitrableJsonRpcUrl=${encodeURIComponent(RPC_URL)}&e2e=devnet`,
                { waitUntil: 'domcontentloaded' },
            );
            await expect(page.getByRole('heading', { name: 'Figaro Process Timeline' })).toBeVisible({ timeout: 30000 });
            await expect(page.getByTestId('evidence-batch-verifier'), 'the header names the verifier it read').toContainText('batch verifier', { timeout: 30000 });
            const paths = page.getByTestId('evidence-event-path');
            await expect(paths, 'three events: committed, attested, resolved').toHaveCount(3, { timeout: 60000 });
            for (const path of await paths.all()) await expect(path).toHaveAttribute('data-universe', 'batch');
            await expect(page.getByText('Order Committed').first()).toBeVisible();
            await expect(page.getByText('Order Resolved').first()).toBeVisible();
        } finally {
            await stopRelay(relay);
            fs.rmSync(scratch, { recursive: true, force: true });
        }
    });
});
