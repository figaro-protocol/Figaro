/**
 * eats-marketplace.spec.ts
 *
 * Mock-mode tests for the buyer entry path:
 *
 *   /discover  → operator catalogue (browse + filter)
 *   /m/<addr>  → merchant detail (hero + menu + inline cart + place order)
 *
 * Pre-2026-05 these tests targeted the `/i/local-commerce` assembly runtime;
 * after the runtime was deleted in favour of purpose-shaped pages, the
 * marketplace concepts moved to `/discover` (catalogue) and `/m/[merchant]`
 * (catalogue → checkout). Component contracts (filter chrome, cart store
 * mutations) are covered by vitest; this file keeps the pipe-end tests that
 * verify the live route renders + checkout reaches the wallet gate.
 */
import { test, expect } from '@playwright/test';
import { gotoDiscoverMock, gotoMerchantMock } from './test-helpers';

// Bob's Pizza Palace is the long-standing mock fixture used by the
// runtime-identity registry — see `lib/shared/runtime-fixtures/`.
const BOB_PIZZA_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

test.describe('Operator discovery (mock)', () => {
    test('renders operator cards on /discover', async ({ page }) => {
        await gotoDiscoverMock(page);
        await expect(page.getByTestId('operator-card').first()).toBeVisible({ timeout: 10000 });
    });

    test('clicking an operator routes to /m/<address>', async ({ page }) => {
        await gotoDiscoverMock(page);
        const firstCard = page.getByTestId('operator-card').first();
        await expect(firstCard).toBeVisible({ timeout: 10000 });
        await firstCard.click();
        await expect(page).toHaveURL(/\/m\/0x[0-9a-fA-F]{40}/, { timeout: 10000 });
        await expect(page.getByTestId('merchant-detail-view')).toBeVisible({ timeout: 15000 });
    });
});

test.describe('Merchant detail + cart (mock)', () => {
    test('menu renders for a known merchant', async ({ page }) => {
        await gotoMerchantMock(page, BOB_PIZZA_ADDRESS);
        await expect(page.getByTestId('merchant-menu')).toBeVisible({ timeout: 15000 });
        // Pizza1 is a known menu item id in the fixture.
        await expect(page.getByTestId('menu-item-pizza1')).toBeVisible({ timeout: 5000 });
    });

    test('add to cart populates the inline cart panel', async ({ page }) => {
        await gotoMerchantMock(page, BOB_PIZZA_ADDRESS);
        await expect(page.getByTestId('btn-add-pizza1')).toBeVisible({ timeout: 5000 });
        await page.getByTestId('btn-add-pizza1').click();
        await expect(page.getByTestId('merchant-cart')).toBeVisible();
        // Cart shows the merchant's own line items.
        await expect(page.getByTestId('merchant-cart')).toContainText(/Pizza/i);
    });

    test('place-order surfaces the wallet gate when no wallet is connected', async ({ page }) => {
        await gotoMerchantMock(page, BOB_PIZZA_ADDRESS);
        await page.getByTestId('btn-add-pizza1').click();

        const placeOrder = page.getByTestId('btn-place-order');
        await expect(placeOrder).toBeVisible({ timeout: 5000 });

        // No wallet connected in mock mode → the button text is the wallet
        // hint and the action is disabled.
        await expect(placeOrder).toHaveText(/Connect wallet to order/i);
        await expect(placeOrder).toBeDisabled();
    });
});
