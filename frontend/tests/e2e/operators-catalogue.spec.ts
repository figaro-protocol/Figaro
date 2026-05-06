/**
 * operators-catalogue.spec.ts
 *
 * Mock-mode tests for /operators/catalogue — the CatalogueBuilder route.
 * No wallet is injected, so these tests cover page structure, default
 * form rendering, and the no-wallet button state.
 *
 * The publish flow itself requires a connected wallet (the catalogue's
 * `subjectAddress` is read via `useAccount`) and a local IPFS node, so
 * it sits in devnet-test territory rather than mock-mode page-structure
 * coverage.
 */
import { test, expect } from './figaro-test';

test.describe('/operators/catalogue — page structure', () => {
    test('renders catalogue heading + step indicator linking back to /operators', async ({ page }) => {
        await page.goto('/operators/catalogue', { waitUntil: 'load' });
        await expect(page.getByRole('heading', { name: 'Build your catalogue.' })).toBeVisible({ timeout: 15000 });
        await expect(page.getByText('Operator Registry').first()).toBeVisible();
        await expect(page.getByText('Define your service items, publish them to IPFS')).toBeVisible();
        // Step indicator: catalogue (active) → register (link to /operators).
        // Inverted from the pre-2026-05 ordering, which dead-ended already-
        // registered operators because there is no on-chain `updateProfile`.
        // `exact: true` disambiguates from the brand-logo link in the header,
        // whose accessible name is "Figaroregistered trademark".
        await expect(page.getByRole('link', { name: 'Register', exact: true })).toHaveAttribute('href', '/operators');
        await expect(page.getByText('Catalogue', { exact: true }).first()).toBeVisible();
    });
});

test.describe('/operators/catalogue — form', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/operators/catalogue', { waitUntil: 'load' });
        await page.getByPlaceholder('e.g. your service name').waitFor({ timeout: 15000 });
    });

    test('renders identity, where, fulfilment, and item sections by default', async ({ page }) => {
        await expect(page.getByPlaceholder('e.g. your service name')).toBeVisible();
        await expect(page.getByPlaceholder('e.g. dr5reg')).toBeVisible();
        await expect(page.getByPlaceholder('e.g. your offering')).toHaveCount(1);
        await expect(page.getByRole('button', { name: 'Add item' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Add token' })).toBeVisible();
    });

    test('publish button shows the wallet hint when no wallet is connected', async ({ page }) => {
        // No wallet injected in mock mode → the submit button text reads
        // "Connect wallet to publish". Clicking would open the RainbowKit
        // modal (via `useConnectModal`) — same pattern as the
        // merchant-detail "Place order" button. We don't actually click;
        // verifying the text + enabled state is sufficient page-structure
        // coverage for mock mode.
        const publishBtn = page.getByRole('button', { name: 'Connect wallet to publish' });
        await expect(publishBtn).toBeVisible();
        await expect(publishBtn).toBeEnabled();
    });
});
