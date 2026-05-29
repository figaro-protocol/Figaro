/**
 * operator-track-record.devnet.spec.ts
 *
 * The operator track record reflects real on-chain history. Runs a full
 * local-commerce scenario (buyer commits → merchant + courier coordinate →
 * buyer resolves), then asserts the track record reflects it — on each
 * operator's /s/[seller] page and on the /discover card-level summary.
 * Every figure is recomputed live from events, not a stored score.
 *
 * Requires Anvil + ./deploy-local.sh + Kubo + a seeded devnet.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import type { Page } from '@playwright/test';
import { type Hex } from 'viem';
import {
    ensureTokenApprovals,
    evmRevert,
    evmSnapshot,
    placeLocalCommerceOrderUI,
    readLocalDeploymentConfig,
    runDeliveryCoordination,
} from './devnet-helpers';

// Buyer — anvil[0], the default ?e2e=devnet account.
const BUYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const BUYER_ADDR = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;
// Mercato General — seeded merchant, anvil[8].
const MERCATO_ADDR = '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f' as const;
// Swift Courier — seeded courier, anvil[7].
const SWIFT_COURIER_ADDR = '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955' as const;

const catalogueFixture = JSON.parse(
    fs.readFileSync(
        path.resolve(__dirname, '../../scripts/fixtures/operator-catalogue.json'),
        'utf8',
    ),
) as { menu: Array<{ id: string }> };
const ITEM = catalogueFixture.menu[0];

function coreToken(): { core: Hex; token: Hex } {
    const config = readLocalDeploymentConfig();
    return {
        core: (process.env.NEXT_PUBLIC_FIGARO_CORE ?? config.figaroCore) as Hex,
        token: (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex,
    };
}

/** Load an operator's page and read one track-record stat tile. Reload-based
 *  so expect.poll can absorb any indexer lag after resolution. */
async function loadAndStat(page: Page, operator: string, testId: string): Promise<number> {
    await page.goto(`/s/${operator}?e2e=devnet`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('operator-track-record').waitFor({ state: 'visible', timeout: 30000 });
    const txt = await page.getByTestId(testId).textContent();
    return Number((txt ?? '').trim());
}

let outerSnapshot: string;
test.beforeAll(async () => { outerSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (outerSnapshot) await evmRevert(outerSnapshot); });

test.describe('Operator track record reflects on-chain history (devnet)', () => {
    let testSnapshot: string;
    test.beforeEach(async () => { testSnapshot = await evmSnapshot(); });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    // Full scenario (commit + coordinate + resolve) + two operator-page reads.
    test.setTimeout(420_000);

    test('a resolved local-commerce process surfaces on each operator track record', async ({ page }) => {
        const { core, token } = coreToken();
        await ensureTokenApprovals(core, token, BUYER_KEY);
        page.on('dialog', (dialog) => { dialog.accept().catch(() => {}); });

        // ── Run a full local-commerce scenario to completion ──────────
        const processId = await placeLocalCommerceOrderUI(page, {
            merchant: MERCATO_ADDR,
            itemId: ITEM.id,
            courier: { partnerName: 'Swift Courier', deliveryItemId: 'delivery-standard' },
        });
        await runDeliveryCoordination(page, {
            processId, merchant: MERCATO_ADDR, courier: SWIFT_COURIER_ADDR,
        });
        await gotoAsWallet(page, BUYER_ADDR, `/orders/${processId}?e2e=devnet`);
        const confirmBtn = page.getByTestId('btn-confirm-receipt');
        await confirmBtn.waitFor({ timeout: 30000 });
        await confirmBtn.click();
        await expect(page.getByTestId('order-status-pill')).toHaveText('Completed', { timeout: 90000 });

        // ── The merchant's track record carries the resolved process ──
        await expect
            .poll(() => loadAndStat(page, MERCATO_ADDR, 'track-stat-completed'), { timeout: 60000 })
            .toBeGreaterThanOrEqual(1);
        // The page is now on /m/MERCATO with the record loaded — read the rest.
        await expect(page.getByTestId('track-record-empty')).toHaveCount(0);
        expect(Number(await page.getByTestId('track-stat-orders-sold').textContent()))
            .toBeGreaterThanOrEqual(1);
        expect(Number(await page.getByTestId('track-stat-buyers-served').textContent()))
            .toBeGreaterThanOrEqual(1);

        // ── The courier's track record carries its order + handoff proofs ──
        await expect
            .poll(() => loadAndStat(page, SWIFT_COURIER_ADDR, 'track-stat-orders-sold'), { timeout: 60000 })
            .toBeGreaterThanOrEqual(1);
        expect(Number(await page.getByTestId('track-stat-attestations').textContent()))
            .toBeGreaterThanOrEqual(1);

        // ── The /discover card-level summary reflects it too ──────────
        await page.goto('/discover?e2e=devnet', { waitUntil: 'domcontentloaded' });
        const mercatoCard = page
            .locator('[data-testid="operator-card"]')
            .filter({ hasText: 'Mercato General' });
        await expect(mercatoCard.getByTestId('card-track-record'))
            .toContainText('completed', { timeout: 30000 });
    });
});
