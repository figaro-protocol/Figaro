/**
 * admin.shared.spec.ts — Admin page tests that run in both mock and devnet.
 *
 * Verifies static page structure that must render identically regardless of
 * chain mode. The live kernel has no owner and no protocol fee — page shows contract addresses
 * and a design note explaining that posture.
 */
import { test, expect } from './figaro-test';

test.describe('Admin Panel — shared rendering', () => {
    test.beforeEach(async ({ page, figaroMode }) => {
        const qs = figaroMode === 'devnet' ? '?e2e=devnet' : '';
        await page.goto(`/admin${qs}`, { waitUntil: 'load' });
        await page.getByRole('heading', { name: 'Protocol Status' }).waitFor({ timeout: 30000 });
    });

    test('page renders protocol status heading and subtitle', async ({ page }) => {
        await expect(page.getByRole('heading', { name: 'Protocol Status' })).toBeVisible();
        await expect(page.getByText(/Kernel status, deployed addresses, and invariant surface\./)).toBeVisible();
    });

    test('Contract Addresses section is visible', async ({ page }) => {
        await expect(page.getByRole('heading', { name: 'Contract Addresses' })).toBeVisible({ timeout: 10000 });
    });

    test('Kernel Design section is visible', async ({ page }) => {
        await expect(page.getByRole('heading', { name: 'Kernel Design' })).toBeVisible({ timeout: 10000 });
        await expect(page.getByText(/no owner, no protocol fee, and no internal ledger/)).toBeVisible();
    });
});
