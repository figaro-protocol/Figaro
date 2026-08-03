/**
 * content-delivery.devnet.spec.ts — the DIGITAL hand-off ceremony, UI both
 * ends (the `ecdh-content` interaction's `encrypted-transfer` mode; the
 * public-release mode is clause-coverage's rung).
 *
 * The scenario: a buyer orders a digital deliverable; the artifact travels
 * the per-order ECDH channel counterparty-private (wallet-authenticated —
 * the transport proves nothing), the seller's stage-1 attestation anchors
 * keccak256 of the artifact's bytes as the completion evidence, and the
 * buyer VERIFIES BY REHASHING what it decrypted against that on-chain
 * anchor. The chain never learns the bytes.
 *
 *   compose  → the assembly composing figaro-content-handoff is authored on
 *              the REAL canvas and published — or ADOPTED when the identical
 *              composition is already anchored (first-write-wins; the
 *              refusal names the slug); identity is the composition
 *   bind     → a fresh seller registers through the REAL wizard and binds
 *              the assembly (funded by a plain ETH transfer — the one
 *              mainnet-real way a new wallet arrives)
 *   commit   → the buyer PICKS encrypted-transfer at checkout (the mode is
 *              a transaction particular), places, relays; the seller
 *              accepts; the asymmetric bonds move in the payment token
 *   ceremony → buyer requests the deliverable on the process page; the
 *              seller delivers a file through the panel (encrypt → channel
 *              → stage-1 attestation in one gesture); the buyer decrypts,
 *              sees the rehash match the on-chain evidence, and saves the
 *              artifact
 *
 * Out-of-band: the Attestation event's contentRef equals keccak of the
 * stage-1 content encoded per the REGISTERED spec (ClauseRegistered → IPFS
 * — the same read every consumer does) over the artifact's keccak256.
 *
 * No resolve — the rung precedent: the bond LOCK is the commit's on-chain
 * effect; full-cycle settlement is permissionless-clause's assertion.
 *
 * Requires Anvil + ./scripts/deploy-local.sh + populate-test-data + Kubo + :3100.
 */
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import { createPublicClient, createWalletClient, defineChain, http, keccak256, parseAbi, parseEther, type Hex } from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import { readLocalDeploymentConfig } from './devnet-helpers';
import { ANVIL_KEYS } from '../anvilAccounts';
import { CORE_ABI } from '@/lib/kernel/contracts';
import { calculateBonds, ATTESTATION_COORDINATOR_ABI, CLAUSE_REGISTRY_ABI } from '@figaro/sdk';
import { encodeContentFromSpec, parseClauseSpec } from '@figaro/sdk/clauses';
import type { Page } from '@playwright/test';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});
const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';
const ERC20_ABI = parseAbi(['function balanceOf(address) view returns (uint256)']);

const TARGET_CLAUSE = 'figaro-content-handoff';

const BUYER = privateKeyToAccount(ANVIL_KEYS[0] as Hex).address; // anvil[0] — the fixture default buyer
// This scenario's seller — anvil[19], SHARED with assembly-withdraw and
// clause-authoring by design: every sharer's wizard leg self-establishes
// (uncheck all bindings, bind its own), the tolerance the wizard's
// profile-update path exists for. Indexes past 19 are not unlocked on the
// devnet Anvil (`--accounts 20`), so a transacting wallet must sit within.
const seller = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 19 });
const SELLER = seller.address;

// The deliverable — TEST INPUT (what a seller would deliver): a small
// artifact whose bytes the completion evidence hashes.
const ARTIFACT_NAME = 'production-cut-v1.svg';
const ARTIFACT_BYTES = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><title>the paid deliverable</title><rect width="8" height="8"/></svg>',
);
const ARTIFACT_HASH = keccak256(new Uint8Array(ARTIFACT_BYTES));

async function waitForConnected(page: Page) {
    await page.waitForFunction(
        () => !Array.from(document.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Connect Wallet'),
        null,
        { timeout: 30000 },
    );
}

test.describe('CONTENT DELIVERY — the digital hand-off ceremony, encrypted to the counterparty (devnet)', () => {
    test.setTimeout(420_000);

    test('compose → bind → encrypted-transfer checkout → deliver through the panel → rehash matches the on-chain evidence', async ({ page }) => {
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });

        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const token = config.tokenAddress as Hex;
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const balanceOf = (who: Hex) =>
            publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;

        // ── FUND the seller wallet (idempotent): a plain ETH transfer from
        //    the buyer — how any new wallet arrives on mainnet. ──
        if ((await publicClient.getBalance({ address: SELLER })) < parseEther('1')) {
            const funder = createWalletClient({
                account: privateKeyToAccount(ANVIL_KEYS[0] as Hex), chain: LOCAL_ANVIL, transport: http(RPC_URL),
            });
            const hash = await funder.sendTransaction({ to: SELLER, value: parseEther('10') });
            await publicClient.waitForTransactionReceipt({ hash });
        }

        // ── COMPOSE-OR-ADOPT: author the digital-deliverable assembly on the
        //    real canvas; identity is the composition, so a re-run adopts the
        //    anchored slug from the registry's refusal. ──
        await page.addInitScript(() => {
            try {
                window.localStorage.removeItem('figaro:designer:current');
                window.localStorage.removeItem('figaro:designer:drafts');
            } catch { /* noop */ }
        });
        await page.goto('/builders/designer/new?fresh=1&e2e=devnet', { waitUntil: 'domcontentloaded' });
        await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
        await page.getByTestId('designer-saved-hint').waitFor({ timeout: 15000 });
        const rootNode = page.locator('[data-testid^="order-node-"]:not([data-testid$="-delete"])').first();
        await rootNode.waitFor({ state: 'visible', timeout: 10000 });
        await rootNode.click();
        await page.getByTestId('agreement-drawer').waitFor({ state: 'visible', timeout: 10000 });
        await page.getByTestId('drawer-tab-registry').click();
        await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });
        const checkbox = page.getByTestId(`drawer-registry-clause-${TARGET_CLAUSE}`);
        await expect(checkbox, `the drawer surfaces ${TARGET_CLAUSE} from the live registry`).toHaveCount(1, { timeout: 20000 });
        await checkbox.check();
        // The composition IS the freelancer reference (assemblies/freelancer.json):
        // content-handoff + modalities + geolocation. Identity is the
        // composition, so publishing collapses onto the reference's anchor —
        // this spec is the freelancer reference's named test
        // (assemblies/README.md).
        await page.getByTestId('drawer-registry-clause-figaro-modalities').check();
        await page.getByTestId('drawer-registry-clause-figaro-geolocation').check();
        await page.getByTestId('designer-name-input').fill('Freelance deliverable');
        await page.getByTestId('designer-summary-input').fill('A single-order digital hand-off: the artifact travels the encrypted channel.');
        await page.getByTestId('designer-description-input').fill('Composes the content hand-off clause; the deliverable is counterparty-private and completion-evidenced by content hash.');
        await expect(page.getByTestId('designer-review')).toBeEnabled({ timeout: 5000 });
        await page.getByTestId('designer-review').click();
        await page.waitForURL(/\/builders\/designer\/view\?slug=asm-/, { timeout: 15000 });
        const handle = page.url().match(/[?&]slug=(asm-[a-z0-9-]+)/)?.[1];
        expect(handle, 'review navigated to a draft handle').toBeTruthy();

        await page.goto(`/builders/designer/view?slug=${handle}&intent=publish&e2e=devnet`, { waitUntil: 'domcontentloaded' });
        const confirmBtn = page.getByTestId('review-confirm-publish');
        await confirmBtn.waitFor({ state: 'visible', timeout: 15000 });
        await waitForConnected(page);
        await confirmBtn.click();
        const receipt = page.getByTestId('assembly-publish-receipt');
        const publishError = page.getByTestId('publish-error');
        await expect(receipt.or(publishError)).toBeVisible({ timeout: 60000 });
        let slug: string;
        if (await publishError.isVisible()) {
            await expect(publishError, 'the registry refuses the identical composition (adopt path)')
                .toContainText(/already published/);
            slug = (await publishError.textContent())?.match(/"(asm-[a-z0-9-]+)"/)?.[1] ?? '';
            expect(slug, 'the refusal names the anchored content slug').toMatch(/^asm-/);
        } else {
            slug = (await page.getByTestId('receipt-slug').textContent())?.trim() ?? '';
            expect(slug, 'publish receipt shows the content slug').toMatch(/^asm-/);
        }

        // ── BIND: the seller onboards through the REAL wizard and binds
        //    exactly this assembly. ──
        await gotoAsWallet(page, SELLER, '/sellers');
        await page.goto('/sellers/identity', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#profile-name')).toBeVisible({ timeout: 30000 });
        await page.locator('#profile-name').fill('Digital Deliverables Studio');
        await page.locator('#profile-specialty').fill('digital production work');
        await page.locator('#profile-geohash').fill('9q8yyk');
        await page.getByRole('button', { name: /\+ MOCK$/ }).click();
        await page.locator('input[name="defaultTokenAddress"]').first().check();
        await page.getByRole('button', { name: /^Next/ }).click();
        await expect(page).toHaveURL(/\/sellers\/catalogue/);
        await page.locator('[id^="item-"][id$="-name"]').first().fill('Production cut');
        await page.locator('[id^="item-"][id$="-price"]').first().fill('1');
        await page.getByRole('button', { name: /^Next/ }).click();
        await expect(page).toHaveURL(/\/sellers\/assemblies/);
        const checkedRows = page.locator('[data-testid^="seller-assembly-row-"] input[type="checkbox"]:checked');
        while ((await checkedRows.count()) > 0) await checkedRows.first().uncheck();
        const myRow = page.getByTestId(`seller-assembly-row-${slug}`);
        await myRow.waitFor({ state: 'visible', timeout: 30000 });
        await myRow.locator('input[type="checkbox"]').first().check();
        await page.getByRole('button', { name: /^Next/ }).click();
        await expect(page).toHaveURL(/\/sellers\/agents/);
        await page.getByRole('button', { name: /^Next/ }).click();
        await page.waitForURL(/\/sellers\/review/, { timeout: 30000 });
        await page.getByTestId('review-confirm-publish').click();
        await expect(page.getByRole('heading', { name: /Registered\.|Profile updated/i })).toBeVisible({ timeout: 60000 });

        // ── COMMIT: the buyer picks the ENCRYPTED-TRANSFER mode at checkout
        //    (a transaction particular on the spec-routed fill surface),
        //    places, relays; the seller accepts; bonds move. ──
        const committedBefore = (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: BUYER }, fromBlock: 0n,
        })).length;
        const [buyerBefore, sellerBefore, coreBefore] = await Promise.all([
            balanceOf(BUYER), balanceOf(SELLER), balanceOf(core),
        ]);
        await gotoAsWallet(page, BUYER, `/s/view?seller=${SELLER}&e2e=devnet`);
        await page.getByTestId('seller-detail-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const addBtn = page.locator('[data-testid^="btn-add-"]').first();
        await addBtn.waitFor({ state: 'visible', timeout: 20000 });
        await addBtn.click();
        await page.getByTestId('btn-review-order').click();
        await page.getByTestId('checkout-view').waitFor({ timeout: 20000 });
        await page.locator(`[data-testid^="checkout-field-"][data-testid$="-${TARGET_CLAUSE}-contentHandoff-encrypted-transfer"]`).first().check();
        // The freelancer reference's remaining particulars: a virtual
        // deliverable; the geolocation endpoints carry jurisdiction, typed.
        await page.locator('[data-testid^="checkout-field-"][data-testid$="-figaro-modalities-modality-virtual"]').first().check();
        await page.locator('[data-testid^="checkout-field-"][data-testid$="-figaro-geolocation-origin"]').first().fill('9q8yyk');
        await page.locator('[data-testid^="checkout-field-"][data-testid$="-figaro-geolocation-destination"]').first().fill('u15pk4');
        const place = page.getByTestId('btn-place-order');
        await expect(place, 'buyer connected + order ready → "Place order"').toHaveText(/Place order/, { timeout: 20000 });
        await place.click();
        await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId('preview-confirm').click();
        await page.getByTestId('buyer-share-panel').waitFor({ timeout: 60000 });
        await page.getByTestId('send-commitment-xmtp').click();
        await expect(page.getByTestId('commitment-xmtp-status')).toBeVisible({ timeout: 30000 });

        await gotoAsWallet(page, SELLER, '/orders?e2e=devnet');
        await page.getByTestId('orders-list').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        await page.getByTestId('order-your-turn-card').first().waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId('btn-accept-order').first().click();
        await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId('preview-confirm').click();

        const queryCommitted = () => publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: BUYER }, fromBlock: 0n,
        });
        await expect.poll(async () => (await queryCommitted()).length, {
            timeout: 60000, message: 'a new OrderCommitted lands on-chain',
        }).toBe(committedBefore + 1);
        const committed = await queryCommitted();
        const event = committed[committed.length - 1];
        expect(event.args.seller?.toLowerCase(), 'committed against the digital seller').toBe(SELLER.toLowerCase());
        const processId = event.args.processId!;

        // Value leg — the bond LOCK, read from the token contract.
        const { buyerBond, sellerBond } = calculateBonds(event.args.cumulativeValue!, event.args.payment!);
        const [buyerAfter, sellerAfter, coreAfter] = await Promise.all([
            balanceOf(BUYER), balanceOf(SELLER), balanceOf(core),
        ]);
        expect(buyerBefore - buyerAfter, 'buyer balance decreased by the buyer bond').toBe(buyerBond);
        expect(sellerBefore - sellerAfter, 'seller balance decreased by the seller bond').toBe(sellerBond);
        expect(coreAfter - coreBefore, 'FigaroCore escrow increased by both bonds').toBe(buyerBond + sellerBond);

        // ── CEREMONY, buyer side: the declared interaction mounts on the
        //    process page; the buyer requests the deliverable. ──
        await gotoAsWallet(page, BUYER, `/orders/view?process=${processId}&e2e=devnet`);
        await waitForConnected(page);
        await expect(
            page.getByTestId('interaction-content-panel'),
            "the content clause's declared interaction mounts on the buyer's page",
        ).toBeVisible({ timeout: 30000 });
        await page.getByTestId('interaction-content-request').click();
        await expect(page.getByTestId('interaction-content-request')).toContainText(/Requested/, { timeout: 30000 });

        // ── CEREMONY, seller side: the request arrives (wallet-verified);
        //    the seller delivers the file — encrypt → channel → stage-1
        //    attestation in one gesture. ──
        const attestationsBefore = (await publicClient.getContractEvents({
            address: config.attestationCoordinator as Hex, abi: ATTESTATION_COORDINATOR_ABI,
            eventName: 'Attestation', args: { processId }, fromBlock: 0n,
        })).length;
        await gotoAsWallet(page, SELLER, `/orders/view?process=${processId}&e2e=devnet`);
        await waitForConnected(page);
        await expect(page.getByTestId('interaction-content-panel')).toBeVisible({ timeout: 30000 });
        const fileInput = page.getByTestId('interaction-content-file');
        await fileInput.waitFor({ state: 'visible', timeout: 30000 });
        await fileInput.setInputFiles({ name: ARTIFACT_NAME, mimeType: 'image/svg+xml', buffer: ARTIFACT_BYTES });
        await expect(
            page.getByTestId('interaction-content-sent'),
            'the artifact delivers privately and the completion evidence anchors',
        ).toBeVisible({ timeout: 60000 });

        // Out-of-band: the Attestation event landed at stage 1 with
        // contentRef = keccak of the stage-1 content encoded per the
        // REGISTERED spec (ClauseRegistered → IPFS) over the artifact hash.
        const ipfsApi = process.env.NEXT_PUBLIC_IPFS_API_URL ?? 'http://127.0.0.1:5001';
        const regEvents = await publicClient.getContractEvents({
            address: config.clauseRegistry as Hex, abi: CLAUSE_REGISTRY_ABI,
            eventName: 'ClauseRegistered', fromBlock: 0n,
        });
        const registration = regEvents.filter((e) => e.args.clauseId === TARGET_CLAUSE).pop();
        expect(registration, `${TARGET_CLAUSE} is anchored on ClauseRegistry`).toBeTruthy();
        const specCid = (registration!.args.contentURI as string).replace(/^ipfs:\/\//, '');
        const specRaw = await (await fetch(`${ipfsApi}/api/v0/cat?arg=${specCid}`, { method: 'POST' })).json();
        const parsed = parseClauseSpec(specRaw);
        if (!parsed.ok) throw new Error('the registered spec failed to parse');
        const expectedRef = keccak256(
            encodeContentFromSpec(parsed.spec, { contentHash: ARTIFACT_HASH }, { stage: 1 }),
        ).toLowerCase();
        await expect.poll(async () => {
            const logs = await publicClient.getContractEvents({
                address: config.attestationCoordinator as Hex, abi: ATTESTATION_COORDINATOR_ABI,
                eventName: 'Attestation', args: { processId }, fromBlock: 0n,
            });
            return logs.slice(attestationsBefore).some((log) =>
                Number(log.args.stage) === 1
                && (log.args.contentRef as string).toLowerCase() === expectedRef
                && (log.args.attester as string).toLowerCase() === SELLER.toLowerCase());
        }, {
            timeout: 60000,
            message: "the seller's stage-1 completion evidence — keccak over the ENCODED artifact hash — lands on-chain",
        }).toBe(true);

        // ── CEREMONY, buyer side again: decrypt, REHASH, verify against the
        //    anchor, save the artifact. The chain never learned the bytes —
        //    what the buyer verifies is its OWN rehash of what it received. ──
        await gotoAsWallet(page, BUYER, `/orders/view?process=${processId}&e2e=devnet`);
        await waitForConnected(page);
        await expect(
            page.getByTestId('interaction-content-received'),
            'the buyer decrypts the delivered artifact',
        ).toBeVisible({ timeout: 60000 });
        await expect(page.getByTestId('interaction-content-received')).toContainText(ARTIFACT_NAME);
        await expect(
            page.getByTestId('interaction-content-hash'),
            "the buyer's rehash of the DECRYPTED bytes equals the artifact hash",
        ).toHaveText(ARTIFACT_HASH);
        await expect(
            page.getByTestId('interaction-content-verified'),
            'the rehash matches the on-chain completion evidence',
        ).toBeVisible({ timeout: 60000 });
        const download = page.waitForEvent('download');
        await page.getByTestId('interaction-content-download').click();
        expect((await download).suggestedFilename(), 'the buyer saves what it paid for').toBe(ARTIFACT_NAME);
    });
});
