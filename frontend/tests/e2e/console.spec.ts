/**
 * console.spec.ts — Smoke tests for the /console page.
 *
 * Runs in the mock project (no wallet).
 * Verifies: page loads, header renders, connect-wallet prompt shows,
 * and the mode toggle is not prematurely blocking.
 */
import { test, expect } from './figaro-test';

test.describe('Console — no wallet connected', () => {
    test('renders the console page with header', async ({ page }) => {
        await page.goto('/console');

        // Header elements
        await expect(page.getByText('Figaro Console')).toBeVisible();
        await expect(page.getByText('supervision')).toBeVisible();
    });

    test('renders mode toggle and disconnected sync status when no wallet is connected', async ({ page }) => {
        await page.goto('/console');

        // Console is read-accessible without a wallet (wallet-connect is not auth — see feedback_wallet_connect_not_auth).
        // Verify the page loads with its mode toggle and disconnected sync status.
        await expect(page.getByRole('button', { name: 'operating' })).toBeVisible({ timeout: 15000 });
        await expect(page.getByRole('button', { name: 'building' })).toBeVisible();
        await expect(page.getByText('Disconnected')).toBeVisible();
    });
});
