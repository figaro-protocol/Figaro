/**
 * eats-marketplace.spec.ts
 *
 * Mock-mode tests for marketplace modules: restaurant discovery, menu browsing,
 * shopping cart, and driver job market. These verify the assembly pipeline
 * renders the marketplace UX surfaces at /i/local-commerce.
 */
import { test, expect } from '@playwright/test';
import { gotoAssemblyMock } from './test-helpers';

test.describe('Restaurant discovery module (mock)', () => {
    test('renders restaurant cards for buyer role', async ({ page }) => {
        await gotoAssemblyMock(page);

        const module = page.getByTestId('seller-discovery-module');
        await expect(module).toBeVisible({ timeout: 15000 });

        // Should see restaurant cards
        const cards = module.getByTestId('restaurant-card');
        await expect(cards.first()).toBeVisible({ timeout: 10000 });

        // Should see search input
        await expect(module.getByTestId('restaurant-search')).toBeVisible();

        // Should see cuisine filters
        await expect(module.getByTestId('cuisine-filters')).toBeVisible();
    });

    test('search filters restaurants by name', async ({ page }) => {
        await gotoAssemblyMock(page);

        const module = page.getByTestId('seller-discovery-module');
        await expect(module).toBeVisible({ timeout: 15000 });

        const search = module.getByTestId('restaurant-search');
        await search.fill('Pizza');

        // Should see Bob's Pizza but not others
        const cards = module.getByTestId('restaurant-card');
        await expect(cards).toHaveCount(1);
        await expect(module.getByText("Bob's Pizza Palace")).toBeVisible();
    });

    test('cuisine filter narrows results', async ({ page }) => {
        await gotoAssemblyMock(page);

        const module = page.getByTestId('seller-discovery-module');
        await expect(module).toBeVisible({ timeout: 15000 });

        // Click Japanese filter
        await module.getByTestId('cuisine-filter-Japanese').click();

        const cards = module.getByTestId('restaurant-card');
        await expect(cards).toHaveCount(1);
        await expect(module.getByText("Dave's Sushi Bar")).toBeVisible();
    });

    test('clicking a restaurant shows the menu', async ({ page }) => {
        await gotoAssemblyMock(page);

        const module = page.getByTestId('seller-discovery-module');
        await expect(module).toBeVisible({ timeout: 15000 });

        // Click first restaurant card
        await module.getByTestId('restaurant-card').first().click();

        // Should show back button and menu items
        await expect(module.getByTestId('btn-back-to-restaurants')).toBeVisible({ timeout: 5000 });

        // Should see menu items
        await expect(module.getByTestId('menu-item-pizza1')).toBeVisible();
    });

    test('can add items to cart from menu', async ({ page }) => {
        await gotoAssemblyMock(page);

        const module = page.getByTestId('seller-discovery-module');
        await expect(module).toBeVisible({ timeout: 15000 });

        // Open Bob's Pizza menu
        await module.getByTestId('restaurant-card').first().click();
        await expect(module.getByTestId('btn-back-to-restaurants')).toBeVisible({ timeout: 5000 });

        // Add Margherita Pizza to cart
        await module.getByTestId('btn-add-pizza1').click();

        // Verify cart FAB shows badge
        const fab = page.getByTestId('cart-fab');
        await expect(fab).toBeVisible();
    });

    test('back button returns to restaurant list', async ({ page }) => {
        await gotoAssemblyMock(page);

        const module = page.getByTestId('seller-discovery-module');
        await expect(module).toBeVisible({ timeout: 15000 });

        // Go to menu
        await module.getByTestId('restaurant-card').first().click();
        await expect(module.getByTestId('btn-back-to-restaurants')).toBeVisible({ timeout: 5000 });

        // Go back
        await module.getByTestId('btn-back-to-restaurants').click();

        // Should see restaurant cards again
        await expect(module.getByTestId('restaurant-card').first()).toBeVisible({ timeout: 5000 });
    });
});

test.describe('Shopping cart module (mock)', () => {
    test('cart FAB renders for buyer role', async ({ page }) => {
        await gotoAssemblyMock(page);

        const fab = page.getByTestId('cart-fab');
        await expect(fab).toBeVisible({ timeout: 15000 });
    });

    test('opens cart panel and shows empty state', async ({ page }) => {
        await gotoAssemblyMock(page);

        const fab = page.getByTestId('cart-fab');
        await expect(fab).toBeVisible({ timeout: 15000 });
        await fab.click();

        const panel = page.getByTestId('cart-panel');
        await expect(panel).toBeVisible({ timeout: 5000 });

        // Empty cart message
        await expect(panel.getByText('Your cart is empty')).toBeVisible();
    });

    test('cart shows items after adding from menu', async ({ page }) => {
        await gotoAssemblyMock(page);

        // Add item to cart via menu
        const module = page.getByTestId('seller-discovery-module');
        await expect(module).toBeVisible({ timeout: 15000 });
        await module.getByTestId('restaurant-card').first().click();
        await expect(module.getByTestId('btn-add-pizza1')).toBeVisible({ timeout: 5000 });
        await module.getByTestId('btn-add-pizza1').click();

        // Open cart
        await page.getByTestId('cart-fab').click();
        const panel = page.getByTestId('cart-panel');
        await expect(panel).toBeVisible({ timeout: 5000 });

        // Should show the item
        await expect(panel.getByTestId('cart-item-pizza1')).toBeVisible();
        await expect(panel.getByTestId('cart-total')).toHaveText(/ETH/);
    });

    test('delivery details flow works in cart', async ({ page }) => {
        await gotoAssemblyMock(page);

        // Add item
        const module = page.getByTestId('seller-discovery-module');
        await expect(module).toBeVisible({ timeout: 15000 });
        await module.getByTestId('restaurant-card').first().click();
        await expect(module.getByTestId('btn-add-pizza1')).toBeVisible({ timeout: 5000 });
        await module.getByTestId('btn-add-pizza1').click();

        // Open cart and go to delivery
        await page.getByTestId('cart-fab').click();
        const panel = page.getByTestId('cart-panel');
        await expect(panel).toBeVisible({ timeout: 5000 });
        await panel.getByTestId('btn-add-delivery-details').click();

        // Fill delivery form
        await panel.getByTestId('input-delivery-address').fill('123 Test Street');
        await panel.getByTestId('btn-confirm-delivery').click();

        // Should be back to cart with Place Order button
        await expect(panel.getByTestId('btn-place-order-cart')).toBeVisible({ timeout: 5000 });
    });

    test('place order requires wallet connection before approval', async ({ page }) => {
        await gotoAssemblyMock(page);

        // Add item
        const module = page.getByTestId('seller-discovery-module');
        await expect(module).toBeVisible({ timeout: 15000 });
        await module.getByTestId('restaurant-card').first().click();
        await expect(module.getByTestId('btn-add-pizza1')).toBeVisible({ timeout: 5000 });
        await module.getByTestId('btn-add-pizza1').click();

        // Open cart and go to delivery
        await page.getByTestId('cart-fab').click();
        const panel = page.getByTestId('cart-panel');
        await expect(panel).toBeVisible({ timeout: 5000 });
        await panel.getByTestId('btn-add-delivery-details').click();

        // Fill delivery form
        await panel.getByTestId('input-delivery-address').fill('123 Test Street');
        await panel.getByTestId('btn-confirm-delivery').click();

        // Click Place Order without wallet — should show error
        await panel.getByTestId('btn-place-order-cart').click();

        // In mock mode (no wallet) the cart should show a wallet connection error
        await expect(panel.getByTestId('checkout-error')).toBeVisible({ timeout: 5000 });
        await expect(panel.getByTestId('checkout-error')).toHaveText(/Sign in to place your order/);
    });
});

test.describe('Driver job market module (mock)', () => {
    test('renders when driver role is selected', async ({ page }) => {
        await gotoAssemblyMock(page);

        // Switch to driver role
        const driverBtn = page.getByTestId('role-btn-courier');
        await expect(driverBtn).toBeVisible({ timeout: 15000 });
        await driverBtn.click();

        const module = page.getByTestId('job-market-module');
        await expect(module).toBeVisible({ timeout: 15000 });

        // Should show auction cards
        const cards = page.getByTestId(/^auction-card-/);
        await expect(cards.first()).toBeVisible({ timeout: 10000 });
    });

    test('geohash filter narrows job list', async ({ page }) => {
        await gotoAssemblyMock(page);

        // Switch to driver role
        await page.getByTestId('role-btn-courier').click();

        const module = page.getByTestId('job-market-module');
        await expect(module).toBeVisible({ timeout: 15000 });

        // Filter by geohash that matches only one job
        const filter = module.getByTestId('geohash-filter-input');
        await filter.fill('dr5');

        // Should show only the dr5 job
        const cards = module.getByTestId(/^auction-card-/);
        await expect(cards).toHaveCount(1);
    });

    test('clear filter shows all jobs', async ({ page }) => {
        await gotoAssemblyMock(page);

        // Switch to driver role
        await page.getByTestId('role-btn-courier').click();

        const module = page.getByTestId('job-market-module');
        await expect(module).toBeVisible({ timeout: 15000 });

        // Filter then clear
        await module.getByTestId('geohash-filter-input').fill('dr5');
        await module.getByTestId('btn-clear-geohash-filter').click();

        // Should show all jobs again
        const cards = module.getByTestId(/^auction-card-/);
        const count = await cards.count();
        expect(count).toBeGreaterThanOrEqual(2);
    });

    test('does not render for buyer role', async ({ page }) => {
        await gotoAssemblyMock(page);

        // Default buyer role — driver module should not be visible
        await expect(page.getByTestId('job-market-module')).not.toBeVisible({ timeout: 5000 });
    });
});
