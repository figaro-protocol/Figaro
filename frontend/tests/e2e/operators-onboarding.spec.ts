/**
 * operators-onboarding.spec.ts
 *
 * Mock-mode tests for /operators — the operator registration route.
 * No wallet is injected, so these tests cover static page structure
 * and the no-wallet UI state.
 *
 * Per the 2026-04-27 mock audit: 'step indicator shows step 2 as
 * pending' and 'registration form is not shown without a wallet'
 * trimmed — both subset of the kept tests below.
 */
import { test, expect } from './figaro-test';

test.describe('/operators — page structure', () => {
    test('renders the registration heading + step indicator', async ({ page }) => {
        await page.goto('/operators', { waitUntil: 'load' });

        await expect(page.getByRole('heading', { name: 'Self-registered participants.' })).toBeVisible({ timeout: 15000 });
        await expect(page.getByText(/An operator is an address that has posted a reclaimable ETH deposit/)).toBeVisible();
        // Step 2 ("Catalogue") visible alongside the heading.
        await expect(page.getByText('Catalogue', { exact: true })).toBeVisible();
    });
});

test.describe('/operators — no wallet connected', () => {
    test('shows connect-wallet prompt and hides the registration form when wallet is absent', async ({ page }) => {
        await page.goto('/operators', { waitUntil: 'load' });

        await expect(page.getByText('Connect your wallet to continue')).toBeVisible({ timeout: 15000 });
        await expect(page.getByRole('button', { name: 'Connect Wallet' }).first()).toBeVisible();
        // Registration form must not render without a wallet.
        await expect(page.getByPlaceholder('e.g. Tasty Burger')).not.toBeVisible();
    });
});
