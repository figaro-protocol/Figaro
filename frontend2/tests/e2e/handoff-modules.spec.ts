/**
 * handoff-modules.spec.ts
 *
 * Mock-mode tests for the handoff modules: HandoffDetailsModule,
 * HandoffTrackerModule, and HandoffKeyExchangeModule. These verify
 * the assembly pipeline renders the handoff UX surfaces at /i/local-commerce.
 */
import { test, expect } from '@playwright/test';
import { gotoAssemblyMock } from './test-helpers';

test.describe('HandoffDetailsModule (mock)', () => {
    test('preserves geolocation access under the production header policy', async ({ page, context }) => {
        await context.grantPermissions(['geolocation']);
        await context.setGeolocation({ latitude: 37.7749, longitude: -122.4194 });

        const response = await page.goto('/i/local-commerce?e2e=mock', { waitUntil: 'load' });
        expect(response?.headers()['permissions-policy']).toContain('geolocation=(self)');

        const module = page.getByTestId('handoff-details-module');
        await expect(module).toBeVisible({ timeout: 15000 });

        await module.getByRole('button', { name: /use my gps location/i }).click();
        await expect(module.getByTestId('input-dropoff-geohash')).not.toHaveValue('', { timeout: 10000 });
        await expect(module.getByTestId('input-destination-address')).toHaveValue(/\(GPS:/, { timeout: 10000 });
        await expect(module.getByText(/^GPS error:/)).toHaveCount(0);
    });

    test('renders only for buyer role', async ({ page }) => {
        await gotoAssemblyMock(page);

        // Should be visible since default role is buyer
        const module = page.getByTestId('handoff-details-module');
        await expect(module).toBeVisible({ timeout: 15000 });

        // Should have the title
        await expect(module.getByRole('heading', { name: 'Handoff Details' })).toBeVisible();
    });

    test('has destination address input', async ({ page }) => {
        await gotoAssemblyMock(page);

        const module = page.getByTestId('handoff-details-module');
        await expect(module).toBeVisible({ timeout: 15000 });

        const addressInput = module.getByTestId('input-destination-address');
        await expect(addressInput).toBeVisible();
        await addressInput.fill('123 Main St');
        await expect(addressInput).toHaveValue('123 Main St');
    });

    test('has geohash input for manual override', async ({ page }) => {
        await gotoAssemblyMock(page);

        const module = page.getByTestId('handoff-details-module');
        await expect(module).toBeVisible({ timeout: 15000 });

        const geohashInput = module.getByTestId('input-dropoff-geohash');
        await expect(geohashInput).toBeVisible();
        await geohashInput.fill('dqcjr5');
        await expect(geohashInput).toHaveValue('dqcjr5');
    });

    test('has fulfiller budget cap input', async ({ page }) => {
        await gotoAssemblyMock(page);

        const module = page.getByTestId('handoff-details-module');
        await expect(module).toBeVisible({ timeout: 15000 });

        const priceInput = module.getByTestId('input-fulfiller-max-price');
        await expect(priceInput).toBeVisible();
        await expect(priceInput).toHaveValue('0.002');
    });

    test('has class-of-service buttons', async ({ page }) => {
        await gotoAssemblyMock(page);

        const module = page.getByTestId('handoff-details-module');
        await expect(module).toBeVisible({ timeout: 20000 });

        // Standard (S) should be selected by default
        const sButton = module.getByTestId('cos-btn-S');
        await expect(sButton).toBeVisible({ timeout: 10000 });

        // All four CoS options should exist
        await expect(module.getByTestId('cos-btn-S')).toBeVisible();
        await expect(module.getByTestId('cos-btn-E')).toBeVisible();
        await expect(module.getByTestId('cos-btn-F')).toBeVisible();
        await expect(module.getByTestId('cos-btn-C')).toBeVisible();
    });

    test('confirm button is disabled without required fields', async ({ page }) => {
        await gotoAssemblyMock(page);

        const module = page.getByTestId('handoff-details-module');
        await expect(module).toBeVisible({ timeout: 15000 });

        const confirmBtn = module.getByTestId('btn-confirm-handoff');
        await expect(confirmBtn).toBeDisabled();
    });

    test('confirm button enables after filling required fields', async ({ page }) => {
        await gotoAssemblyMock(page);

        const module = page.getByTestId('handoff-details-module');
        await expect(module).toBeVisible({ timeout: 15000 });

        // Fill address and check the verification checkbox
        await module.getByTestId('input-destination-address').fill('123 Main St');
        await module.getByTestId('handoff-verified-checkbox').check();
        // Budget cap has default value, so confirm should now be enabled
        const confirmBtn = module.getByTestId('btn-confirm-handoff');
        await expect(confirmBtn).toBeEnabled();
    });

    test('submitting shows confirmation state', async ({ page }) => {
        await gotoAssemblyMock(page);

        const module = page.getByTestId('handoff-details-module');
        await expect(module).toBeVisible({ timeout: 15000 });

        await module.getByTestId('input-destination-address').fill('456 Oak Ave');
        await module.getByTestId('handoff-verified-checkbox').check();
        await module.getByTestId('btn-confirm-handoff').click();

        // Should show confirmed state
        await expect(module.getByText('Handoff details confirmed')).toBeVisible({ timeout: 5000 });
        await expect(module.getByText('456 Oak Ave')).toBeVisible();

        // Should show edit button
        await expect(module.getByTestId('btn-edit-handoff')).toBeVisible();
    });

    test('edit button returns to form', async ({ page }) => {
        await gotoAssemblyMock(page);

        const module = page.getByTestId('handoff-details-module');
        await expect(module).toBeVisible({ timeout: 15000 });

        await module.getByTestId('input-destination-address').fill('789 Elm St');
        await module.getByTestId('handoff-verified-checkbox').check();
        await module.getByTestId('btn-confirm-handoff').click();

        await expect(module.getByText('Handoff details confirmed')).toBeVisible({ timeout: 5000 });

        // Click edit
        await module.getByTestId('btn-edit-handoff').click();

        // Form should be visible again
        await expect(module.getByTestId('input-destination-address')).toBeVisible();
    });

    test('privacy callout is visible', async ({ page }) => {
        await gotoAssemblyMock(page);

        const module = page.getByTestId('handoff-details-module');
        await expect(module).toBeVisible({ timeout: 15000 });

        await expect(module.getByText('Privacy:', { exact: false })).toBeVisible();
        await expect(module.getByText('On-chain:', { exact: false })).toBeVisible();
    });
});

test.describe('HandoffTrackerModule (mock)', () => {
    test('renders when coordinator mechanism is present', async ({ page }) => {
        await gotoAssemblyMock(page);

        const module = page.getByTestId('handoff-tracker-module');
        await expect(module).toBeVisible({ timeout: 15000 });
        await expect(module).toContainText('Dispatch requested');
    });
});

test.describe('HandoffKeyExchangeModule (mock)', () => {
    test('does not render without a stored key', async ({ page }) => {
        await gotoAssemblyMock(page);

        // Key exchange module should not be visible when no key is stored
        const module = page.getByTestId('handoff-key-module');
        // It should either not exist or not be visible
        await expect(module).toHaveCount(0);
    });
});

test.describe('Handoff modules coexistence (mock)', () => {
    test('handoff modules coexist with existing marketplace modules', async ({ page }) => {
        await gotoAssemblyMock(page);

        // Existing modules should still work
        await expect(page.getByTestId('seller-discovery-module')).toBeVisible({ timeout: 15000 });
        // Shopping cart is rendered but hidden until toggled
        await expect(page.getByTestId('cart-module')).toBeAttached({ timeout: 15000 });

        // Handoff details should be visible for buyer
        await expect(page.getByTestId('handoff-details-module')).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('handoff-tracker-module')).toBeVisible({ timeout: 15000 });

        // Page heading is no longer rendered as a runtime banner; modules still render correctly
    });

    test('all mechanism modules render together', async ({ page }) => {
        await gotoAssemblyMock(page);

        // Core modules

        // Marketplace
        await expect(page.getByTestId('seller-discovery-module')).toBeVisible({ timeout: 10000 });

        // Buyer-side handoff surfaces
        await expect(page.getByTestId('handoff-details-module')).toBeVisible({ timeout: 10000 });
        await expect(page.getByTestId('handoff-tracker-module')).toBeVisible({ timeout: 10000 });
    });
});
