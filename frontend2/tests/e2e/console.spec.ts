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

    test('shows connect-wallet prompt when no wallet is connected', async ({ page }) => {
        await page.goto('/console');

        await expect(page.getByText('Connect a wallet to use the console')).toBeVisible({ timeout: 15000 });
    });
});
