/**
 * seller-track-record.devnet.spec.ts
 *
 * The seller track record reflects real on-chain history. Runs a full
 * local-commerce scenario (buyer commits → merchant + courier coordinate →
 * buyer resolves), then asserts the track record reflects it — on each
 * seller's /s/[seller] page and on the /discover card-level summary.
 * Every figure is recomputed live from events, not a stored score.
 *
 * Consumes the sellers + assembly from chain→IPFS. PERSISTED, like mainnet:
 * no chain snapshot/revert — the ≥1 stat assertions hold on any history.
 *
 * Prerequisite: scenario-local-commerce anchored + its merchant onboarded
 * (designating a courier), on this devnet.
 *
 * Requires Anvil + ./scripts/deploy-local.sh + Kubo + the dev server.
 */
import { test, expect, ANVIL_ACCOUNTS } from './devnet-multi-test';
import type { Page } from '@playwright/test';
import { type Hex } from 'viem';
import {
    courierAddressFor,
    discoverSellerByAssembly,
    discoverSellers,
    ensureTokenApprovalsByAddress,
    acceptOrderInInboxUI,
    placeBilateralOrderUI,
    readLocalDeploymentConfig,
    runDeliveryCoordination,
    walkClauseAttestations,
} from './devnet-helpers';

// Buyer — anvil[0], the default ?e2e=devnet account.
const BUYER_ADDR = ANVIL_ACCOUNTS[0] as Hex;

/** Load a seller's page and read one track-record stat tile. Reload-based
 *  so expect.poll can absorb any indexer lag after resolution. */
async function loadAndStat(page: Page, seller: string, testId: string): Promise<number> {
    await page.goto(`/s/${seller}?e2e=devnet`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('seller-track-record').waitFor({ state: 'visible', timeout: 30000 });
    const txt = await page.getByTestId(testId).textContent();
    return Number((txt ?? '').trim());
}

test.describe('Seller track record reflects on-chain history (devnet)', () => {
    // Full scenario (commit + coordinate + resolve) + two seller-page reads.
    test.setTimeout(420_000);

    test('a resolved local-commerce process surfaces on each seller track record', async ({ page }) => {
        page.on('dialog', (dialog) => { dialog.accept().catch(() => {}); });

        const config = readLocalDeploymentConfig();
        const coreAddress = (process.env.NEXT_PUBLIC_FIGARO_CORE ?? config.figaroCore) as Hex;
        const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex;

        // Discover the sellers the mainnet way: the local-commerce merchant
        // designates its courier on-chain.
        const sellers = await discoverSellers();
        const merchant = await discoverSellerByAssembly('local-commerce', { withCourier: true }, sellers);
        const courierAddr = courierAddressFor(merchant, 'local-commerce');
        const courier = sellers.find((s) => s.address.toLowerCase() === courierAddr.toLowerCase());
        expect(courier, `courier ${courierAddr} (designated by ${merchant.name}) must be a registered seller`).toBeTruthy();

        await ensureTokenApprovalsByAddress(coreAddress, tokenAddress, BUYER_ADDR, merchant.address, courier!.address);

        // ── Run a full local-commerce scenario to completion ──────────
        await placeBilateralOrderUI(page, {
            seller: merchant.address,
            fulfilmentMode: 'deliver:seller-assigned',
        });
        const processId = await acceptOrderInInboxUI(page, merchant.address);
        await acceptOrderInInboxUI(page, courier!.address);

        await runDeliveryCoordination(page, {
            processId, merchant: merchant.address, courier: courier!.address,
        });

        // Buyer co-witnesses proximity on both orders, then resolves.
        await walkClauseAttestations(page, {
            wallet: BUYER_ADDR, processId, clicks: 2, who: 'buyer',
        });
        const resolveBtn = page.getByTestId('capability-execute-resolve-process');
        await resolveBtn.waitFor({ state: 'visible', timeout: 30000 });
        await resolveBtn.click();
        await expect(page.getByTestId('order-status-pill')).toHaveText(/Completed/i, { timeout: 90000 });

        // ── The merchant's track record carries the resolved process ──
        await expect
            .poll(() => loadAndStat(page, merchant.address, 'track-stat-completed'), { timeout: 60000 })
            .toBeGreaterThanOrEqual(1);
        // The page is now on the merchant's /s page with the record loaded.
        await expect(page.getByTestId('track-record-empty')).toHaveCount(0);
        expect(Number(await page.getByTestId('track-stat-orders-sold').textContent()))
            .toBeGreaterThanOrEqual(1);
        expect(Number(await page.getByTestId('track-stat-buyers-served').textContent()))
            .toBeGreaterThanOrEqual(1);

        // ── The courier's track record carries its order + handoff proofs ──
        await expect
            .poll(() => loadAndStat(page, courier!.address, 'track-stat-orders-sold'), { timeout: 60000 })
            .toBeGreaterThanOrEqual(1);
        expect(Number(await page.getByTestId('track-stat-attestations').textContent()))
            .toBeGreaterThanOrEqual(1);

        // ── The /discover card-level summary reflects it too ──────────
        await page.goto('/discover?e2e=devnet', { waitUntil: 'domcontentloaded' });
        const merchantCard = page
            .locator('[data-testid="seller-card"]')
            .filter({ hasText: merchant.name });
        await expect(merchantCard.getByTestId('card-track-record'))
            .toContainText('completed', { timeout: 30000 });
    });
});
