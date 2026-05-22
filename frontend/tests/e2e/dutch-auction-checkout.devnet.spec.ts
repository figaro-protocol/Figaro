/**
 * dutch-auction-checkout.devnet.spec.ts
 *
 * Stage E piece 3 — the dutch-auction delivery path, end to end through the
 * UI. The courier edge of a local-commerce process is DEFERRED: at checkout
 * the buyer opens a descending-price auction for the courier job instead of
 * committing a seller-assigned courier. The courier order joins the process
 * only when a courier claims the auction and commits it at the cleared
 * price — incremental process assembly (a process opened by the root commit,
 * extended over time as each edge resolves).
 *
 *   1. Buyer browses Mercato General, picks `deliver:dutch-auction`, places
 *      the order — the food order commits; the courier auction opens.
 *   2. The process carries ONE order; the auction panel is open, unclaimed.
 *   3. Swift Courier opens the order page, claims the auction at the decayed
 *      price, then commits the courier order at the cleared price.
 *   4. The process carries TWO orders — the courier edge joined.
 *   5. Merchant coordinates and the courier delivers; the buyer resolves,
 *      settling both atomically.
 *
 * Mercato General is bound to `local-commerce-dutch` (seed-devnet.mjs) — the
 * dutch-auction variant of the local-commerce assembly.
 *
 * Requires Anvil + ./deploy-local.sh + Kubo + a seeded devnet.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import { createPublicClient, defineChain, http, parseAbi, type Hex } from 'viem';
import {
    ensureTokenApprovals,
    evmRevert,
    evmSnapshot,
    readLocalDeploymentConfig,
    runDeliveryCoordination,
} from './devnet-helpers';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});

// Buyer — anvil[0], the default ?e2e=devnet account.
const BUYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const BUYER_ADDR = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;
// Swift Courier — seeded courier operator on anvil[7]. In the dutch-auction
// flow the courier is NOT pre-designated; any operator may claim the job.
const COURIER_KEY = '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356' as const;
const SWIFT_COURIER_ADDR = '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955' as const;
// Mercato General — seeded merchant, anvil[8]; bound to local-commerce-dutch.
const MERCATO_ADDR = '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f' as const;

const catalogueFixture = JSON.parse(
    fs.readFileSync(
        path.resolve(__dirname, '../../scripts/fixtures/operator-catalogue.json'),
        'utf8',
    ),
) as { menu: Array<{ id: string }> };
const ITEM = catalogueFixture.menu[0];

const PROCESSES_ABI = parseAbi([
    'function processes(bytes32) view returns (address rootBuyer, address currency, uint256 cumulativeValue, uint32 activeOrderCount)',
]);

function deployment(): { core: Hex; token: Hex } {
    const config = readLocalDeploymentConfig();
    return {
        core: (process.env.NEXT_PUBLIC_FIGARO_CORE ?? config.figaroCore) as Hex,
        token: (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex,
    };
}

const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

test.describe('Dutch-auction delivery — deferred courier edge (devnet)', () => {
    let testSnapshot: string;
    test.beforeEach(async () => { testSnapshot = await evmSnapshot(); });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    // Buyer commit + auction open + courier claim + courier-order commit +
    // merchant walk + courier handoffs + resolve — every step through its UI.
    test.setTimeout(420_000);

    test('buyer opens the courier auction; a courier claims and commits; buyer resolves', async ({ page }) => {
        const { core, token } = deployment();

        // The buyer initiates the food order; the courier initiates the
        // courier order (as seller). Both need an allowance — signAndBroadcast
        // only auto-approves the COUNTERPARTY in devnet, not the initiator.
        await ensureTokenApprovals(core, token, BUYER_KEY, COURIER_KEY);
        page.on('dialog', (dialog) => { dialog.accept().catch(() => {}); });

        // ── 1. Buyer picks dutch-auction delivery ─────────────────────
        await page.goto(`/m/${MERCATO_ADDR}?e2e=devnet`, { waitUntil: 'domcontentloaded' });
        const detailView = page.getByTestId('merchant-detail-view');
        try {
            await detailView.waitFor({ state: 'visible', timeout: 30000 });
        } catch {
            await page.reload({ waitUntil: 'domcontentloaded' });
            await detailView.waitFor({ state: 'visible', timeout: 30000 });
        }
        const menuItem = page.getByTestId(`menu-item-${ITEM.id}`);
        try {
            await menuItem.waitFor({ state: 'visible', timeout: 15000 });
        } catch {
            await page.reload({ waitUntil: 'domcontentloaded' });
            await detailView.waitFor({ state: 'visible', timeout: 30000 });
            await menuItem.waitFor({ state: 'visible', timeout: 30000 });
        }
        await page.getByTestId(`btn-add-${ITEM.id}`).click();
        await expect(page.getByTestId(`cart-line-${ITEM.id}`)).toBeVisible({ timeout: 10000 });

        await expect(page.getByTestId('option-fulfilment-deliver:dutch-auction')).toHaveCount(1, { timeout: 20000 });
        await page.getByTestId('select-fulfilment-mode').selectOption('deliver:dutch-auction');
        await page.getByTestId('input-delivery-geohash').fill('dr5regw3pg');
        await page.getByTestId('input-delivery-address').fill('12 Market St, Apt 4B — ring bell');
        await page.getByTestId('btn-place-order').click();

        // ONE agreement-preview modal — the food order. The courier order is
        // deferred to the auction, so it does NOT commit at checkout.
        const foodModal = page.getByTestId('agreement-preview-modal');
        await foodModal.waitFor({ state: 'visible', timeout: 45000 });
        await page.getByTestId('preview-confirm').click();

        await page.waitForURL(/\/orders\/0x[0-9a-fA-F]+/, { timeout: 90000 });
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
        const processId = page.url().match(/\/orders\/(0x[0-9a-fA-F]+)/)![1] as Hex;

        // ── 2. The process carries ONE order; the auction is open ─────
        const opened = await publicClient.readContract({
            address: core, abi: PROCESSES_ABI, functionName: 'processes', args: [processId],
        });
        expect(opened[3]).toBe(1); // activeOrderCount — food order only
        await expect(page.getByTestId('courier-auction-panel')).toBeVisible({ timeout: 30000 });

        // ── 3. The courier claims the auction at the decayed price ────
        await gotoAsWallet(page, SWIFT_COURIER_ADDR, `/orders/${processId}?e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
        const claimButton = page.getByTestId('btn-claim-courier-auction');
        await claimButton.waitFor({ state: 'visible', timeout: 30000 });
        await claimButton.click();
        await expect(page.getByTestId('courier-auction-claimed')).toBeVisible({ timeout: 60000 });

        // ── 4. The courier commits the courier order at the cleared price ──
        const commitButton = page.getByTestId('btn-commit-courier-order');
        await commitButton.waitFor({ state: 'visible', timeout: 30000 });
        await commitButton.click();
        // The courier-order commit gates on its own agreement-preview modal.
        const courierModal = page.getByTestId('agreement-preview-modal');
        await courierModal.waitFor({ state: 'visible', timeout: 45000 });
        await page.getByTestId('preview-confirm').click();
        await expect(page.getByTestId('courier-auction-committed')).toBeVisible({ timeout: 90000 });

        // The courier edge joined the process — TWO orders now, and the
        // cumulative value grew by the cleared price.
        const assembled = await publicClient.readContract({
            address: core, abi: PROCESSES_ABI, functionName: 'processes', args: [processId],
        });
        expect(assembled[3]).toBe(2); // food + courier
        expect(assembled[2]).toBeGreaterThan(opened[2]); // cumulativeValue grew

        // ── 5. Merchant coordinates, courier delivers ─────────────────
        await runDeliveryCoordination(page, {
            processId, merchant: MERCATO_ADDR, courier: SWIFT_COURIER_ADDR,
        });

        // ── 6. Buyer resolves — both orders settle atomically ─────────
        await gotoAsWallet(page, BUYER_ADDR, `/orders/${processId}?e2e=devnet`);
        const confirmButton = page.getByTestId('btn-confirm-receipt');
        await confirmButton.waitFor({ timeout: 30000 });
        await confirmButton.click();
        await expect(page.getByTestId('order-status-pill')).toHaveText('Completed', { timeout: 90000 });

        const resolved = await publicClient.readContract({
            address: core, abi: PROCESSES_ABI, functionName: 'processes', args: [processId],
        });
        expect(resolved[3]).toBe(0); // both orders atomically settled
    });
});
