/**
 * operators-onboarding.spec.ts
 *
 * Mock-mode tests for /operators — the operator-profile route.
 * No wallet is injected, so these tests cover static page structure
 * and the no-wallet UI state.
 */
import { test, expect } from './figaro-test';

test.describe('/operators — page structure', () => {
    test('renders the operator-profile heading and intro', async ({ page }) => {
        await page.goto('/operators', { waitUntil: 'load' });

        await expect(page.getByRole('heading', { name: 'Register or update your operator profile.' })).toBeVisible({ timeout: 15000 });
        await expect(page.getByText(/An operator is any address that has posted a reclaimable ETH deposit/)).toBeVisible();
        await expect(page.getByText('How the registry works')).toBeVisible();
    });
});

test.describe('/operators — no wallet connected', () => {
    test('shows connect-wallet prompt and hides the registration form when wallet is absent', async ({ page }) => {
        await page.goto('/operators', { waitUntil: 'load' });

        await expect(page.getByText('Connect your wallet to continue')).toBeVisible({ timeout: 15000 });
        await expect(page.getByRole('button', { name: 'Connect Wallet' }).first()).toBeVisible();
        // Registration form must not render without a wallet.
        await expect(page.getByPlaceholder('e.g. your service name')).not.toBeVisible();
    });
});
