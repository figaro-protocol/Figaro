/**
 * handoff-modules.spec.ts
 *
 * Mock-mode tests for the handoff modules: HandoffDetailsModule,
 * HandoffTrackerModule, and HandoffKeyExchangeModule. These verify
 * the assembly pipeline renders the handoff UX surfaces at /i/local-commerce.
 *
 * Component contract (input shapes, button labels, validation rules) is
 * covered by vitest. This file keeps the e2e cases that genuinely need a
 * real browser:
 *  1. Production-CSP geolocation grant — Playwright + grantPermissions
 *     can't be reproduced in JSDOM.
 *  2. Full happy path through the form (fill → confirm → edit returns) —
 *     state-machine integration that the component test covers
 *     individually but not end-to-end with the assembly shell.
 *  3. Coexistence of all handoff modules with the surrounding assembly
 *     marketplace surface — verifies module-registry routing.
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

    test('full handoff flow: buyer-only render → fill → confirm → edit returns', async ({ page }) => {
        await gotoAssemblyMock(page);

        // Module is buyer-scoped (not visible on other roles).
        const module = page.getByTestId('handoff-details-module');
        await expect(module).toBeVisible({ timeout: 15000 });
        await expect(module.getByRole('heading', { name: 'Handoff Details' })).toBeVisible();

        // Fill required fields and confirm.
        await module.getByTestId('input-destination-address').fill('123 Main St');
        await module.getByTestId('handoff-verified-checkbox').check();
        await module.getByTestId('btn-confirm-handoff').click();

        // Confirmed state shows the entered address + Edit button.
        await expect(module.getByText('Handoff details confirmed')).toBeVisible({ timeout: 5000 });
        await expect(module.getByText('123 Main St')).toBeVisible();

        // Edit returns to the form.
        await module.getByTestId('btn-edit-handoff').click();
        await expect(module.getByTestId('input-destination-address')).toBeVisible();
    });
});

test.describe('Handoff modules coexistence (mock)', () => {
    test('all buyer-scoped surfaces render together with marketplace modules', async ({ page }) => {
        await gotoAssemblyMock(page);

        // Marketplace
        await expect(page.getByTestId('seller-discovery-module')).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('cart-module')).toBeAttached({ timeout: 15000 });

        // Handoff modules — details + tracker are both buyer-visible.
        await expect(page.getByTestId('handoff-details-module')).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('handoff-tracker-module')).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('handoff-tracker-module')).toContainText('Dispatch requested');

        // Key-exchange module is gated on a stored key — should not render.
        await expect(page.getByTestId('handoff-key-module')).toHaveCount(0);
    });
});
