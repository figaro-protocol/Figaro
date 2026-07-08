/**
 * catalogue-fold.devnet.spec.ts — the CATALOGUE→LEAF→DOCUMENT pipeline, end to end.
 *
 * The antecedent is permissionless-clause (a never-seen clause flows soup to nuts
 * generically); this is its sibling for the checkout FOLD. It proves the other
 * open-world half: physical product data a seller authors on its CATALOGUE
 * (mass, volume, packaged L×W×H) is DERIVED onto the committed cargo leaf at
 * checkout — by declared field, naming no clause — and then surfaces in the audit
 * bundle GENERICALLY (the same clause-evidence view + merkle verifier that
 * surfaces any leaf), with ZERO genre code. There is no "cargo page", no
 * hand-rolled BoL/invoice: the folded leaf is just another committed leaf,
 * rendered from its registered spec and hash-verified against the on-chain root.
 *
 *   catalogue → the seller authors an item carrying mass/volume/dimensions
 *               through the REAL catalogue form (the P1 floor inputs)
 *   compose   → an assembly carrying figaro-cargo is authored on the REAL canvas
 *   fold      → at checkout the fold sums mass/volume across the cart and writes
 *               the single-parcel packaged dimensions onto the cargo leaf
 *   commit    → a real bilateral order commits that agreement on-chain
 *   audit     → the committed cargo leaf surfaces in the GENERIC clause-evidence
 *               view (from its spec, no genre code), carries the FOLDED values,
 *               and the merkle verifier ties the whole tree to the on-chain root
 *
 * Self-contained + idempotent like the other devnet specs: onboards its OWN
 * seller (anvil[15], used by no other spec), authors its OWN assembly, and leaves
 * its state on-chain (no snapshot/revert — devnet is a mainnet rehearsal). A
 * per-run nonce keeps every artifact unique against prior runs / retries.
 *
 * NOTE: figaro-cargo is a PROTOCOL clause (seeded at devup), so — unlike
 * permissionless-clause — no clause is registered here; the novelty under test is
 * the FOLD, not clause-agnosticism. figaro-cargo requires massGrams AND volumeMl,
 * so the authored item carries both (plus dimensions), and the fold writes all
 * three onto the leaf.
 *
 * Requires Anvil + ./scripts/deploy-local.sh + Kubo + the dev server (:3100).
 * STATUS: written against the permissionless-clause / local-commerce patterns but
 * NOT YET RUN (devnet was unavailable when authored) — needs one live devnet pass
 * to confirm selectors/timing.
 */
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import { createPublicClient, defineChain, http, type Hex } from 'viem';
import { privateKeyToAccount, mnemonicToAccount } from 'viem/accounts';
import { readLocalDeploymentConfig, assertPinnedInIpfs } from './devnet-helpers';
import { ANVIL_KEYS } from '../anvilAccounts';
import { CORE_ABI } from '@/lib/kernel/contracts';
import type { Page } from '@playwright/test';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});
const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';

const BUYER = privateKeyToAccount(ANVIL_KEYS[0] as Hex).address; // anvil[0] — buyer + author
const seller = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 15 }); // anvil[15] — used by no other spec
const SELLER = seller.address;

// The authored physical facts — mass + volume (both required by figaro-cargo) and
// packaged dimensions. The fold sums mass/volume across the (single) cart line and,
// because it is a single parcel, writes the dimensions straight onto the leaf.
const MASS_G = 500;
const VOLUME_ML = 1000;
const LENGTH_MM = 300;
const WIDTH_MM = 200;
const HEIGHT_MM = 150;

/** Wait for ClientInit's devnet auto-connect (the "Connect Wallet" button goes). */
async function waitForConnected(page: Page) {
    await page.waitForFunction(
        () => !Array.from(document.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Connect Wallet'),
        null,
        { timeout: 30000 },
    );
}

test.describe('CATALOGUE→LEAF fold — physical catalogue data derives onto the cargo leaf, surfaced generically (devnet)', () => {
    test.setTimeout(360_000);

    test('authored mass/volume/dimensions fold onto the committed cargo leaf and surface in the generic audit', async ({ page }) => {
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });

        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const runNonce = `${Date.now()}`;

        // ── COMPOSE: author a single-node assembly carrying figaro-cargo on the REAL
        //    canvas. The clause appears because the drawer read it from the live
        //    registry → IPFS (event-driven), exactly like any other clause. ──
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
        // figaro-cargo — a protocol clause; composed exactly like any other.
        await page.getByTestId('drawer-registry-clause-figaro-cargo').check();

        const assemblyName = `Cargo fold ${runNonce}`;
        await page.getByTestId('designer-name-input').fill(assemblyName);
        await page.getByTestId('designer-summary-input').fill('Catalogue→leaf fold: authored physical data lands on the cargo leaf.');
        await page.getByTestId('designer-description-input').fill('Single-node assembly carrying figaro-cargo — the fold derives mass/volume/dimensions from the catalogue.');
        await expect(page.getByTestId('designer-review')).toBeEnabled({ timeout: 5000 });
        await page.getByTestId('designer-review').click();

        await page.waitForURL(/\/builders\/designer\/view\/asm-/, { timeout: 15000 });
        const handle = page.url().match(/\/view\/(asm-[a-z0-9-]+)/)?.[1];
        expect(handle, 'review navigated to a draft handle').toBeTruthy();
        await page.goto(`/builders/designer/view/${handle}?intent=publish&e2e=devnet`, { waitUntil: 'domcontentloaded' });
        const confirmBtn = page.getByTestId('review-confirm-publish');
        await confirmBtn.waitFor({ state: 'visible', timeout: 15000 });
        await waitForConnected(page);
        await confirmBtn.click();
        await page.getByTestId('assembly-publish-receipt').waitFor({ timeout: 60000 });
        const slug = (await page.getByTestId('receipt-slug').textContent())?.trim();
        expect(slug, 'publish receipt shows the content slug').toMatch(/^asm-/);

        // ── CATALOGUE: onboard anvil[15] and author an item carrying mass, volume,
        //    and packaged dimensions through the REAL catalogue form (the P1 floor
        //    inputs), binding the cargo assembly. Storage is metric. ──
        await gotoAsWallet(page, SELLER, '/sellers');
        await page.goto('/sellers/identity', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#profile-name')).toBeVisible({ timeout: 30000 });
        await page.locator('#profile-name').fill('Cargo Seller');
        await page.locator('#profile-specialty').fill('shipped goods');
        await page.locator('#profile-geohash').fill('9q8yyk8yu');
        await page.getByRole('button', { name: /\+ MOCK$/ }).click();
        await page.locator('input[name="defaultTokenAddress"]').first().check();
        await page.getByRole('button', { name: /^Next/ }).click();
        await expect(page).toHaveURL(/\/sellers\/catalogue/);

        // The item + its physical facts. The dim/mass/volume inputs are the P1 floor
        // fields (`item-<uid>-{name,price,mass,volume,length,width,height}`).
        await page.locator('[id^="item-"][id$="-name"]').first().fill('Boxed good');
        await page.locator('[id^="item-"][id$="-price"]').first().fill('1');
        await page.locator('[id^="item-"][id$="-mass"]').first().fill(String(MASS_G));
        await page.locator('[id^="item-"][id$="-volume"]').first().fill(String(VOLUME_ML));
        await page.locator('[id^="item-"][id$="-length"]').first().fill(String(LENGTH_MM));
        await page.locator('[id^="item-"][id$="-width"]').first().fill(String(WIDTH_MM));
        await page.locator('[id^="item-"][id$="-height"]').first().fill(String(HEIGHT_MM));
        await page.getByRole('button', { name: /^Next/ }).click();
        await expect(page).toHaveURL(/\/sellers\/assemblies/);

        const myRow = page.locator('[data-testid^="seller-assembly-row-"]').filter({ hasText: assemblyName });
        await myRow.first().waitFor({ state: 'visible', timeout: 30000 });
        await myRow.first().locator('input[type="checkbox"]').first().check();
        await page.getByRole('button', { name: /^Next/ }).click();
        await expect(page).toHaveURL(/\/sellers\/agents/);
        await page.getByRole('button', { name: /^Next/ }).click();
        await page.waitForURL(/\/sellers\/review/, { timeout: 30000 });
        await page.getByTestId('review-confirm-publish').click();
        await expect(page.getByRole('heading', { name: /Registered\.|Profile updated/i })).toBeVisible({ timeout: 60000 });

        // ── COMMIT: the buyer orders the boxed good; at checkout the FOLD sums
        //    mass/volume and writes the packaged dimensions onto the cargo leaf. ──
        const committedBefore = (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: BUYER }, fromBlock: 0n,
        })).length;
        await gotoAsWallet(page, BUYER, `/s/${SELLER}?e2e=devnet`);
        await page.getByTestId('seller-detail-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const addBtn = page.locator('[data-testid^="btn-add-"]').first();
        await addBtn.waitFor({ state: 'visible', timeout: 20000 });
        await addBtn.click();
        await page.getByTestId('btn-review-order').click();
        await page.getByTestId('checkout-view').waitFor({ timeout: 20000 });
        const place = page.getByTestId('btn-place-order');
        await expect(place, 'buyer connected + order ready → "Place order"').toHaveText(/Place order/, { timeout: 20000 });
        await place.click();
        await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId('preview-confirm').click();
        await page.getByTestId('buyer-share-panel').waitFor({ timeout: 60000 });
        await page.getByTestId('send-commitment-xmtp').click();
        await expect(page.getByTestId('commitment-xmtp-status')).toBeVisible({ timeout: 30000 });

        // ── ACCEPT: the seller counter-signs → the order commits on-chain ──
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
        expect(event.args.seller?.toLowerCase(), 'committed against the cargo seller').toBe(SELLER.toLowerCase());
        const processId = event.args.processId!;
        const agreementHash = event.args.agreementHash as `0x${string}`;

        // ── THE FOLD, PROVEN OUT-OF-BAND: fetch the committed agreement from IPFS (the
        //    network SSoT, not a local cache) and assert the cargo leaf carries the
        //    FOLDED physical values — mass + volume summed from the cart, the packaged
        //    dimensions written straight through (single parcel). The leaf is found by
        //    its committed clauseId; the values are what the fold derived, not authored. ──
        const agreementUri = await page.evaluate(
            (key) => window.localStorage.getItem(key),
            `figaro:agreement-uri:${agreementHash}`,
        );
        expect(agreementUri, 'the committed agreement has a network (IPFS) locator').toMatch(/^ipfs:\/\//);
        const agreementCid = agreementUri!.replace(/^ipfs:\/\//, '');
        await assertPinnedInIpfs(agreementCid);
        const ipfsApi = process.env.NEXT_PUBLIC_IPFS_API_URL ?? 'http://127.0.0.1:5001';
        const agreementJson = await (await fetch(`${ipfsApi}/api/v0/cat?arg=${agreementCid}`, { method: 'POST' })).text();
        const agreement = JSON.parse(agreementJson) as { sections: { clause: string; data: Record<string, unknown> }[] };
        const cargo = agreement.sections.find((s) => s.clause === 'figaro-cargo');
        expect(cargo, 'the committed tree carries a folded cargo leaf').toBeTruthy();
        expect(cargo!.data, 'the fold derived mass + volume + packaged dimensions onto the cargo leaf').toMatchObject({
            massGrams: MASS_G,
            volumeMl: VOLUME_ML,
            lengthMm: LENGTH_MM,
            widthMm: WIDTH_MM,
            heightMm: HEIGHT_MM,
        });

        // ── AUDIT — GENERIC (no genre code): the audit bundle surfaces the cargo leaf
        //    in the same clause-evidence view that surfaces any leaf, rendered from the
        //    registered figaro-cargo spec title. There is NO "cargo page", no BoL/invoice
        //    genre — the folded leaf is just another committed leaf. Then the merkle
        //    verifier recomputes the root over EVERY leaf to match the on-chain hash. ──
        await page.goto(`/audit/${processId}?e2e=devnet`, { waitUntil: 'domcontentloaded' });
        await page.getByTestId('audit-page').waitFor({ timeout: 30000 });
        await waitForConnected(page);

        const evidence = page.getByTestId('audit-clause-evidence');
        await evidence.waitFor({ state: 'visible', timeout: 30000 });
        await expect(evidence.getByText('Commerce terms'), 'the commerce leaf surfaces generically').toBeVisible({ timeout: 30000 });
        await expect(
            evidence.getByText('Cargo'),
            'the folded cargo leaf surfaces GENERICALLY by its spec title — no genre code',
        ).toBeVisible({ timeout: 15000 });

        // Merkle proof: the whole committed tree (cargo included) ties to the on-chain root.
        await page.getByTestId('verify-mode-agreement').click();
        await page.getByTestId('verify-agreement-input').fill(agreementJson);
        await page.getByTestId('verify-agreement-expected').fill(agreementHash);
        await expect(
            page.getByTestId('verify-result-status'),
            'the recomputed root over every leaf — cargo included — matches the on-chain agreementHash',
        ).toHaveText(/Matches expected hash/, { timeout: 15000 });
    });
});
