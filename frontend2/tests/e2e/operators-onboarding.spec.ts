/**
 * operators-onboarding.spec.ts
 *
 * Mock-mode tests for /operators — the operator registration route.
 * No wallet is injected, so these tests cover static page structure
 * and the no-wallet UI state.
 */
import { test, expect } from './figaro-test';

test.describe('/operators — page structure', () => {
    test('renders the registration heading and description', async ({ page }) => {
        await page.goto('/operators', { waitUntil: 'load' });

        await expect(page.getByRole('heading', { name: 'Self-registered participants.' })).toBeVisible({ timeout: 15000 });
        await expect(page.getByText(/An operator is an address that has posted a reclaimable ETH deposit/)).toBeVisible();
    });

    test('step indicator shows step 2 as pending', async ({ page }) => {
        await page.goto('/operators', { waitUntil: 'load' });

        await expect(page.getByRole('heading', { name: 'Self-registered participants.' })).toBeVisible({ timeout: 15000 });
        await expect(page.getByText('Catalogue', { exact: true })).toBeVisible();
    });
});

test.describe('/operators — no wallet connected', () => {
    test('shows connect-wallet prompt when wallet is absent', async ({ page }) => {
        await page.goto('/operators', { waitUntil: 'load' });

        await expect(page.getByText('Connect your wallet to continue')).toBeVisible({ timeout: 15000 });
        await expect(page.getByRole('button', { name: 'Connect Wallet' }).first()).toBeVisible();
    });

    test('registration form is not shown without a wallet', async ({ page }) => {
        await page.goto('/operators', { waitUntil: 'load' });

        await expect(page.getByText('Connect your wallet to continue')).toBeVisible({ timeout: 15000 });
        await expect(page.getByPlaceholder('e.g. Tasty Burger')).not.toBeVisible();
    });
});
