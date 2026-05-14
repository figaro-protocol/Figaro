/**
 * operators-onboarding.spec.ts
 *
 * Mock-mode tests for the seven-screen operator-registration wizard.
 *
 * Mock mode does not inject `window.ethereum`, so wallet-connected
 * flows (form fill, autosave, wallet-switch) are covered separately
 * in `operators-onboarding.devnet.spec.ts`. This file covers what is
 * testable without a wallet: route shape, indicator state, and the
 * wallet-required gating that every per-wallet step depends on.
 */
import { test, expect } from '@playwright/test';

test.describe('/operators/onboard — entry + routing', () => {
    test('welcome page renders with all seven step labels', async ({ page }) => {
        await page.goto('/operators/onboard?e2e=mock', { waitUntil: 'load' });
        await expect(page.getByRole('heading', { name: /What happens in each step/i })).toBeVisible({ timeout: 15000 });

        const indicator = page.getByLabel('Onboarding progress');
        await expect(indicator).toBeVisible();

        // Step labels — protects against accidental relabeling. "Identity"
        // (not "Profile") is the canonical name after the rename.
        for (const label of ['Welcome', 'Identity', 'Catalogue', 'Link', 'Assemblies', 'Agents', 'Done']) {
            await expect(indicator.getByText(label, { exact: true }).first()).toBeVisible();
        }
    });

    test('Start link routes to /operators/onboard/profile', async ({ page }) => {
        await page.goto('/operators/onboard?e2e=mock', { waitUntil: 'load' });
        const startLink = page.getByRole('link', { name: /Start/ });
        await expect(startLink).toBeVisible({ timeout: 15000 });
        await startLink.click();
        await expect(page).toHaveURL(/\/operators\/onboard\/profile/);
    });
});

test.describe('/operators/onboard — wallet-required gating (mock, no wallet)', () => {
    const subRoutes = [
        { path: 'profile', gateText: /Connect a wallet to start your profile draft/i },
        { path: 'catalogue', gateText: /Connect a wallet/i },
        { path: 'assemblies', gateText: /Connect a wallet/i },
        { path: 'agents', gateText: /Connect a wallet/i },
    ];

    for (const { path, gateText } of subRoutes) {
        test(`/${path} shows the wallet-required gate`, async ({ page }) => {
            await page.goto(`/operators/onboard/${path}?e2e=mock`, { waitUntil: 'load' });
            await expect(page.getByText(gateText).first()).toBeVisible({ timeout: 15000 });
        });
    }
});

test.describe('/operators/onboard — step indicator current state', () => {
    test('profile screen marks step 2 (Identity) as current', async ({ page }) => {
        await page.goto('/operators/onboard/profile?e2e=mock', { waitUntil: 'load' });
        const indicator = page.getByLabel('Onboarding progress');
        await expect(indicator).toBeVisible({ timeout: 15000 });

        const current = indicator.locator('[aria-current="step"]');
        await expect(current).toContainText('Identity');
    });

    test('agents screen marks step 6 (Agents) as current', async ({ page }) => {
        await page.goto('/operators/onboard/agents?e2e=mock', { waitUntil: 'load' });
        const indicator = page.getByLabel('Onboarding progress');
        await expect(indicator).toBeVisible({ timeout: 15000 });

        const current = indicator.locator('[aria-current="step"]');
        await expect(current).toContainText('Agents');
    });
});
