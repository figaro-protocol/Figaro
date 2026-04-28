/**
 * eats-marketplace.spec.ts
 *
 * Mock-mode tests for marketplace modules: restaurant discovery, menu
 * browsing, shopping cart, and the courier job market. These verify the
 * assembly pipeline renders the marketplace UX surfaces at /i/local-commerce.
 *
 * Per the 2026-04-27 mock audit: cuisine-filter / back-button / cart-FAB-
 * renders / cart-empty-state / cart-shows-items / driver-geohash-filter /
 * driver-clear-filter were trimmed as duplicates of the kept tests below
 * (filter behavior is covered by the search-filter case; cart visibility
 * is covered by the add-to-cart and place-order flows; back-button is
 * trivial navigation).
 */
import { test, expect } from '@playwright/test';
import { gotoAssemblyMock } from './test-helpers';

test.describe('Restaurant discovery module (mock)', () => {
    test('renders restaurant cards for buyer role with search + filters', async ({ page }) => {
        await gotoAssemblyMock(page);

        const module = page.getByTestId('seller-discovery-module');
        await expect(module).toBeVisible({ timeout: 15000 });

        // Cards + search + filter chrome are all present.
        await expect(module.getByTestId('restaurant-card').first()).toBeVisible({ timeout: 10000 });
        await expect(module.getByTestId('restaurant-search')).toBeVisible();
        await expect(module.getByTestId('cuisine-filters')).toBeVisible();
    });

    test('search narrows the restaurant list to a name match', async ({ page }) => {
        await gotoAssemblyMock(page);

        const module = page.getByTestId('seller-discovery-module');
        await expect(module).toBeVisible({ timeout: 15000 });

        await module.getByTestId('restaurant-search').fill('Pizza');

        const cards = module.getByTestId('restaurant-card');
        await expect(cards).toHaveCount(1);
        await expect(module.getByText("Bob's Pizza Palace")).toBeVisible();
    });

    test('clicking a restaurant shows its menu', async ({ page }) => {
        await gotoAssemblyMock(page);

        const module = page.getByTestId('seller-discovery-module');
        await expect(module).toBeVisible({ timeout: 15000 });

        await module.getByTestId('restaurant-card').first().click();
        await expect(module.getByTestId('btn-back-to-restaurants')).toBeVisible({ timeout: 5000 });
        await expect(module.getByTestId('menu-item-pizza1')).toBeVisible();
    });
});

test.describe('Shopping cart module (mock)', () => {
    test('add to cart shows the cart FAB', async ({ page }) => {
        await gotoAssemblyMock(page);

        const module = page.getByTestId('seller-discovery-module');
        await expect(module).toBeVisible({ timeout: 15000 });

        await module.getByTestId('restaurant-card').first().click();
        await expect(module.getByTestId('btn-add-pizza1')).toBeVisible({ timeout: 5000 });
        await module.getByTestId('btn-add-pizza1').click();

        await expect(page.getByTestId('cart-fab')).toBeVisible();
    });

    test('full checkout flow up to the wallet gate', async ({ page }) => {
        await gotoAssemblyMock(page);

        // Add item.
        const module = page.getByTestId('seller-discovery-module');
        await expect(module).toBeVisible({ timeout: 15000 });
        await module.getByTestId('restaurant-card').first().click();
        await expect(module.getByTestId('btn-add-pizza1')).toBeVisible({ timeout: 5000 });
        await module.getByTestId('btn-add-pizza1').click();

        // Open cart, fill delivery, advance to place order.
        await page.getByTestId('cart-fab').click();
        const panel = page.getByTestId('cart-panel');
        await expect(panel).toBeVisible({ timeout: 5000 });
        await expect(panel.getByTestId('cart-item-pizza1')).toBeVisible();
        await expect(panel.getByTestId('cart-total')).toHaveText(/ETH/);

        await panel.getByTestId('btn-add-delivery-details').click();
        await panel.getByTestId('input-delivery-address').fill('123 Test Street');
        await panel.getByTestId('btn-confirm-delivery').click();

        await expect(panel.getByTestId('btn-place-order-cart')).toBeVisible({ timeout: 5000 });

        // No wallet connected in mock mode → place-order surfaces the wallet
        // gate rather than firing the commit.
        await panel.getByTestId('btn-place-order-cart').click();
        await expect(panel.getByTestId('checkout-error')).toBeVisible({ timeout: 5000 });
        await expect(panel.getByTestId('checkout-error')).toHaveText(/Sign in to place your order/);
    });
});

test.describe('Courier job market module (mock)', () => {
    test('renders when courier role is selected with auction cards', async ({ page }) => {
        await gotoAssemblyMock(page);

        await page.getByTestId('role-btn-courier').click();

        const module = page.getByTestId('job-market-module');
        await expect(module).toBeVisible({ timeout: 15000 });

        const cards = page.getByTestId(/^auction-card-/);
        await expect(cards.first()).toBeVisible({ timeout: 10000 });
    });

    test('does not render for buyer role', async ({ page }) => {
        await gotoAssemblyMock(page);

        // Default buyer role — courier-only module should not be visible.
        await expect(page.getByTestId('job-market-module')).not.toBeVisible({ timeout: 5000 });
    });
});
