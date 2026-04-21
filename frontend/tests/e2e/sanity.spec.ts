/**
 * sanity.spec.ts — application smoke tests.
 *
 * Verifies that both major entry points (home / eats) render their key UI
 * elements and are reachable.  These are the first tests that run in the
 * mock suite and act as a signal that the dev server is healthy.
 */
import { test, expect } from '@playwright/test';
import { gotoHome } from './test-helpers';

test.describe('Smoke — home page', () => {
    test('home page renders create-order form', async ({ page }) => {
        await gotoHome(page, { mock: true });

        // Core always-visible create-order elements
        await expect(page.getByTestId('create-order-heading')).toBeVisible();
        await expect(page.getByTestId('input-counterparty')).toBeVisible();
        await expect(page.getByTestId('input-payment')).toBeVisible();
        await expect(page.getByTestId('btn-submit-order')).toBeVisible();

        // Manifest form — both required fields must be visible
        await expect(page.getByTestId('manifest-input-origin')).toBeVisible();
        await expect(page.getByTestId('manifest-input-destination')).toBeVisible();
    });

    test('home page shows empty-state graph when no orders exist', async ({ page }) => {
        await gotoHome(page, { mock: true });

        // Switch to the Graph tab
        await page.getByRole('tab', { name: 'Graph' }).click();

        // With a fresh localStorage the graph shows the empty-state placeholder
        await expect(page.getByTestId('no-orders')).toBeVisible({ timeout: 10000 });
    });
});



