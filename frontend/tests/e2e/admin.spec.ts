/**
 * admin.spec.ts — Admin Panel page tests (mock suite).
 *
 * Static page structure tests (heading, fee section) have been moved to
 * admin.shared.spec.ts so they run in both mock and devnet projects.
 * This file retains mock-only tests that cannot run without a specific
 * chain context (e.g. connect-wallet state with no provider).
 */
import { test, expect } from '@playwright/test';

test.describe('Admin Panel (/admin)', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/admin', { waitUntil: 'load' });
    });

    test('contract addresses section visible', async ({ page }) => {
        // Live kernel: no protocol fee — admin shows contract addresses and the design note.
        await expect(page.getByRole('heading', { name: 'Contract Addresses' })).toBeVisible({ timeout: 10000 });
    });

});
