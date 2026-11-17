/**
 * private-filings.devnet.spec.ts — the private filings of one order,
 * delivered on the receiver's request, UI both ends.
 *
 * A filing at a stage whose set of fields is private puts only its content
 * reference on the chain; its attester's browser keeps the content, blinding
 * value included. The counterparty receives a copy only by asking on its
 * order page; the attester's page then offers one control that seals every
 * copy it kept for the order to the asker's key; the asker's page checks
 * each entry against the chain and keeps it in the same store every reader
 * reads (`PrivateFilingsPanel`, `lib/handoff/privateFilings.ts`).
 *
 *   register → a clause no file in `clauses/` holds, written here: a public
 *              committed field and a private witness stage 1 (the reading
 *              and its blinding field), assembly-scoped, registered
 *              permissionlessly on ClauseRegistry (per-run name)
 *   commit   → one order, buyer anvil[0] and seller anvil[14], its agreement
 *              composing the commerce clause and that clause, signed by both
 *              and committed on FigaroCore out of band (as
 *              attestations-compared does); the agreement is pinned and its
 *              locator handed to the browser, as a party that witnessed it
 *   attest   → the seller files the private stage through the order page's
 *              rail; the Attestation event lands, out of band
 *   request  → the buyer's page (in a browser that does not hold the
 *              seller's copy) shows the private filing it does not hold and
 *              asks: "Request the private filings"
 *   send     → the seller's page, with its kept copy, shows "Send the private
 *              filings (1)"; one click seals and sends
 *   receive  → the buyer's page keeps the entry; the comparison of filings
 *              shows the reading and no blinding value; out of band, the
 *              kept bytes hash to the contentRef the chain holds and the
 *              entry is marked received
 *   close    → the buyer resolves the process, out of band
 *
 * The two parties share one browser here, as every devnet spec's wallet
 * switch does: the mock coordination channel lives in that browser's
 * storage. Each party's private copies are therefore moved aside while the
 * other party's page is open, as on two devices.
 *
 * Requires Anvil + ./scripts/devup.sh (deploy + populate) + Kubo + :3100.
 */
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import { createWalletClient, http, keccak256, parseAbi, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { Page } from '@playwright/test';
import {
    ATTESTATION_COORDINATOR_ABI,
    ERC20_ABI,
    buildCommitment,
    buildDomain,
    buildOrderAgreement,
    calculateBonds,
    generateSalt,
} from '@figaro-protocol/sdk';
import { decodeContentFromSpec, parseClauseSpec } from '@figaro-protocol/sdk/clauses';
import { specSource } from '@/lib/shared/clauseSpecSource';
import { CORE_ABI } from '@/lib/core/contracts';
import {
    LOCAL_ANVIL, RPC_URL, keyOf, localPublicClient, pinJSONToIPFS, primeRegisteredClauseSpecs,
    readLocalDeploymentConfig, waitForConnected,
} from './devnet-helpers';
import { registerProbeClause } from './probeAssembly';
import { ANVIL_KEYS } from '../anvilAccounts';

const MINT_ABI = parseAbi(['function mint(address to, uint256 amount) external']);
const BUYER = privateKeyToAccount(ANVIL_KEYS[0] as Hex);
const SELLER = privateKeyToAccount(ANVIL_KEYS[14] as Hex);
const PAYMENT = 10n ** 18n;
const STAGE = 1;
const READING = '41.2';
const KEPT_PREFIX = 'figaro-kept-witness-content';

/** A clause written in this test: its stage 1 is private, so its set
 *  declares the one blinding field a private set carries. */
function privateStageSpec(nonce: string) {
    return {
        clauseId: `figaro-probe-private-stage-${nonce}`,
        version: 1,
        title: `Private reading ${nonce}`,
        description: 'A clause whose stage-1 witness is private: only its fingerprint reaches the chain.',
        fields: [
            { name: 'probePolicy', type: 'string', required: true, minLength: 1, description: 'Committed policy token.' },
        ],
        stages: {
            1: [
                { name: 'reading', type: 'string', required: true, minLength: 1, maxLength: 64, disposition: 'private', label: 'Reading' },
                { name: 'blinding', type: 'string', format: 'bytes32-hex', required: true, disposition: 'private', blinding: true },
            ],
        },
        block: { design: { article: 'logistics', scope: 'assembly' } },
    };
}

/** Every kept private copy in this browser, by storage key. */
async function keptEntries(page: Page): Promise<Record<string, string>> {
    return page.evaluate((prefix) => {
        const out: Record<string, string> = {};
        for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i)!;
            if (key.startsWith(prefix)) out[key] = window.localStorage.getItem(key)!;
        }
        return out;
    }, KEPT_PREFIX);
}

/** Move every kept copy out of this browser (another device's storage). */
async function moveKeptAside(page: Page): Promise<Record<string, string>> {
    const kept = await keptEntries(page);
    await page.evaluate((keys) => { for (const k of keys) window.localStorage.removeItem(k); }, Object.keys(kept));
    return kept;
}

async function putKeptBack(page: Page, kept: Record<string, string>): Promise<void> {
    await page.evaluate((entries) => { for (const [k, v] of Object.entries(entries)) window.localStorage.setItem(k, v); }, kept);
}

test.describe('PRIVATE FILINGS — the counterparty asks, the attester sends sealed, the asker keeps what the chain confirms (devnet)', () => {
    test.setTimeout(300_000);

    test('a private witness filed by the seller reaches the buyer on its request, checked against the chain', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const coordinator = config.attestationCoordinator as Hex;
        const token = config.tokenAddress as Hex;
        const publicClient = localPublicClient();
        const wallet = (account: typeof BUYER) => createWalletClient({ account, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const send = async (who: typeof BUYER, args: Parameters<ReturnType<typeof wallet>['writeContract']>[0]) => {
            const receipt = await publicClient.waitForTransactionReceipt({ hash: await wallet(who).writeContract(args) });
            expect(receipt.status, `${String(args.functionName)} succeeded`).toBe('success');
            return receipt;
        };

        // ── REGISTER the private-stage clause, then read it back as every
        //    consumer does (ClauseRegistered → IPFS). ──
        const nonce = `${Date.now()}`;
        const rawSpec = privateStageSpec(nonce);
        const parsed = parseClauseSpec(rawSpec);
        expect(parsed.ok, 'the private-stage clause parses: its private set declares one blinding field').toBe(true);
        const PRIVATE = await registerProbeClause(rawSpec);
        await primeRegisteredClauseSpecs();
        const COMMERCE = keyOf('figaro-commerce');

        // ── COMMIT one order composing commerce and the private-stage clause. ──
        const { agreement, checkoutHash } = buildOrderAgreement(BUYER.address, SELLER.address, {
            [COMMERCE]: { lineItems: [{ itemId: `private-filings-${nonce}`, name: 'Calibrated reading', quantity: 1, unitPrice: PAYMENT.toString() }] },
            [PRIVATE]: { probePolicy: 'reading-on-delivery' },
        }, specSource());
        const { commitment, typedData } = buildCommitment({
            processId: `0x${'0'.repeat(64)}` as Hex,
            buyer: BUYER.address,
            seller: SELLER.address,
            currency: token,
            payment: PAYMENT,
            expectedCumulativeValue: PAYMENT,
            checkoutHash,
            salt: generateSalt(),
            deadline: BigInt((await publicClient.getBlock()).timestamp) + 3600n,
        }, buildDomain(LOCAL_ANVIL.id, core));
        const bonds = calculateBonds(PAYMENT, PAYMENT);
        await send(BUYER, { address: token, abi: MINT_ABI, functionName: 'mint', args: [BUYER.address, bonds.buyerBond] });
        await send(BUYER, { address: token, abi: MINT_ABI, functionName: 'mint', args: [SELLER.address, bonds.sellerBond] });
        await send(BUYER, { address: token, abi: ERC20_ABI, functionName: 'approve', args: [core, bonds.buyerBond] });
        await send(SELLER, { address: token, abi: ERC20_ABI, functionName: 'approve', args: [core, bonds.sellerBond] });
        const receipt = await send(BUYER, {
            address: core, abi: CORE_ABI, functionName: 'commit',
            args: [commitment, await BUYER.signTypedData(typedData), await SELLER.signTypedData(typedData)],
        });
        const committed = await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted',
            args: { buyer: BUYER.address }, fromBlock: receipt.blockNumber, toBlock: receipt.blockNumber,
        });
        expect(committed, 'OrderCommitted lands').toHaveLength(1);
        const processId = committed[0].args.processId as Hex;
        const orderHash = committed[0].args.orderHash as Hex;

        // Both parties witnessed the agreement: its locator is in their browser.
        const { uri } = await pinJSONToIPFS(agreement);
        await page.addInitScript(([key, value]) => {
            try { window.localStorage.setItem(key, value); } catch { /* noop */ }
        }, [`figaro:agreement-uri:${checkoutHash}`, uri] as const);

        // ── ATTEST, seller: the private stage through the order page's rail. ──
        await gotoAsWallet(page, SELLER.address, `/orders/view?process=${processId}&e2e=devnet`);
        await waitForConnected(page);
        const witnessCap = page.locator(`[data-testid="capability-submit-clause-attestation"][data-clause-key="${PRIVATE}"]`);
        await expect(witnessCap, "the rail derives the clause's private witness capability from its declaration").toBeVisible({ timeout: 60000 });
        await page.getByTestId(`capability-input-${PRIVATE}-reading`).fill(READING);
        await expect(page.getByTestId(`capability-input-${PRIVATE}-blinding`), 'no form offers an input for the blinding value').toHaveCount(0);
        await witnessCap.getByTestId('capability-execute-submit-clause-attestation').click();

        const attestationOf = async () => (await publicClient.getContractEvents({
            address: coordinator, abi: ATTESTATION_COORDINATOR_ABI, eventName: 'Attestation', args: { processId }, fromBlock: 0n,
        })).find((e) => Number(e.args.stage) === STAGE
            && (e.args.clauseId as string).toLowerCase() === PRIVATE.toLowerCase()
            && (e.args.attester as string).toLowerCase() === SELLER.address.toLowerCase());
        await expect.poll(async () => !!(await attestationOf()), {
            timeout: 60000, message: "the seller's private stage-1 attestation lands on the chain",
        }).toBe(true);
        const contentRef = ((await attestationOf())!.args.contentRef as string).toLowerCase();

        // The seller's browser kept the content; move it aside (another device).
        const sellerKept = await moveKeptAside(page);
        const sellerEntry = Object.entries(sellerKept).find(([key]) => key.endsWith(contentRef));
        expect(sellerEntry, "the seller's browser kept the private content under its reference").toBeTruthy();

        // ── REQUEST, buyer: the page shows the filing it does not hold. ──
        await gotoAsWallet(page, BUYER.address, `/orders/view?process=${processId}&e2e=devnet`);
        await waitForConnected(page);
        await expect(page.getByTestId('private-filings-not-held')).toContainText('1 private filing', { timeout: 60000 });
        await expect(page.getByTestId('private-filings-wallet-note')).toContainText('Your wallet signs the request');
        const request = page.getByTestId('private-filings-request');
        await expect(request).toBeEnabled({ timeout: 30000 });
        await request.click();
        await expect(request).toContainText(/Requested/, { timeout: 30000 });

        // ── SEND, seller: its kept copy back in its browser. ──
        await putKeptBack(page, sellerKept);
        await gotoAsWallet(page, SELLER.address, `/orders/view?process=${processId}&e2e=devnet`);
        await waitForConnected(page);
        const sendControl = page.getByTestId('private-filings-send');
        await expect(sendControl, 'the request arrived and the seller holds one private filing').toHaveText('Send the private filings (1)', { timeout: 60000 });
        await sendControl.click();
        await expect(page.getByTestId('private-filings-sent')).toBeVisible({ timeout: 60000 });
        await moveKeptAside(page);

        // ── RECEIVE, buyer: the entry is checked against the chain and kept. ──
        await gotoAsWallet(page, BUYER.address, `/orders/view?process=${processId}&e2e=devnet`);
        await waitForConnected(page);
        await expect(page.getByTestId('private-filings-kept')).toContainText('Kept 1 private filing', { timeout: 60000 });
        const card = page.getByTestId(`stage-comparison-${PRIVATE.toLowerCase()}-${STAGE}`);
        await expect(card.getByTestId(`stage-filing-${SELLER.address.toLowerCase()}-${orderHash.toLowerCase()}`)).toContainText(READING, { timeout: 60000 });

        // Out of band: the buyer's kept bytes hash to the contentRef the
        // chain holds, the entry says it was received, and the blinding value
        // inside it is printed nowhere on the page.
        const buyerKept = await keptEntries(page);
        const buyerEntry = Object.entries(buyerKept).find(([key]) => key.endsWith(contentRef));
        expect(buyerEntry, "the buyer's browser keeps the seller's private filing").toBeTruthy();
        const entry = JSON.parse(buyerEntry![1]) as { content: Hex; received?: boolean };
        expect(keccak256(entry.content).toLowerCase(), 'the kept bytes hash to the on-chain contentRef').toBe(contentRef);
        expect(entry.received, 'the copy is marked received from the counterparty').toBe(true);
        const values = decodeContentFromSpec(parsed.ok ? parsed.spec : (undefined as never), entry.content, { stage: STAGE });
        expect(values.reading).toBe(READING);
        const blinding = String(values.blinding).toLowerCase();
        expect(blinding).toMatch(/^0x[0-9a-f]{64}$/);
        expect((await page.content()).toLowerCase(), 'the blinding value is printed nowhere on the page').not.toContain(blinding.slice(2));

        // ── CLOSE: the buyer resolves, out of band. ──
        const resolveReceipt = await send(BUYER, {
            address: core, abi: CORE_ABI, functionName: 'resolveProcess', args: [processId, [commitment]],
        });
        const resolved = await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'ProcessResolved',
            args: { processId }, fromBlock: resolveReceipt.blockNumber, toBlock: resolveReceipt.blockNumber,
        });
        expect(resolved, 'ProcessResolved lands').toHaveLength(1);
    });
});
