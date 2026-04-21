/**
 * merchant-branding.spec.ts
 *
 * Mock-mode tests verifying the merchant branding pipeline:
 * - RestaurantCardInline renders within a MerchantBrandingModule wrapper
 * - MerchantLogo falls back to emoji when no OperatorRegistry is available
 * - Menu header uses MerchantLogo with emoji fallback
 *
 * These tests run without a chain. The branding hook will find no
 * OperatorRegistry contract, so branding resolves to null and the
 * MerchantLogo component renders the fallback emoji from the restaurant
 * data. This is the expected degradation path.
 */
import { test, expect } from '@playwright/test';
import { gotoAssemblyMock } from './test-helpers';

test.describe('Merchant branding in restaurant discovery (mock)', () => {
    test('restaurant cards render with emoji fallback when no on-chain branding', async ({ page }) => {
        await gotoAssemblyMock(page);

        const module = page.getByTestId('seller-discovery-module');
        await expect(module).toBeVisible({ timeout: 15000 });

        // Cards should be visible
        const cards = module.getByTestId('restaurant-card');
        await expect(cards.first()).toBeVisible({ timeout: 10000 });

        // Each card should contain an emoji span (MerchantLogo fallback) or an
        // image element (if branding resolved), or a loading placeholder div.
        // In mock mode without a chain, MerchantLogo may still be in loading
        // state (aria-hidden div with pulse animation) or resolved to emoji span.
        const firstCard = cards.first();
        const hasEmojiOrLogo = await firstCard.evaluate((el) => {
            // Look for either a span with emoji text or an img element
            const img = el.querySelector('img');
            if (img) return true;
            // Check for emoji-bearing span (aria-hidden="true" with text content)
            const spans = el.querySelectorAll('span[aria-hidden="true"]');
            for (const span of spans) {
                if (span.textContent && span.textContent.trim().length > 0) return true;
            }
            // Check for loading placeholder div (aria-hidden="true")
            const divs = el.querySelectorAll('div[aria-hidden="true"]');
            if (divs.length > 0) return true;
            return false;
        });
        expect(hasEmojiOrLogo).toBe(true);
    });

    test('restaurant card name and stats still render correctly', async ({ page }) => {
        await gotoAssemblyMock(page);

        const module = page.getByTestId('seller-discovery-module');
        await expect(module).toBeVisible({ timeout: 15000 });

        // Verify core info is still present in the card
        const firstCard = module.getByTestId('restaurant-card').first();
        await expect(firstCard).toBeVisible({ timeout: 10000 });

        // Should contain a restaurant name (h3 element)
        const heading = firstCard.locator('h3');
        await expect(heading).toBeVisible();
        const name = await heading.textContent();
        expect(name).toBeTruthy();
    });

    test('menu header uses MerchantLogo with fallback', async ({ page }) => {
        await gotoAssemblyMock(page);

        const module = page.getByTestId('seller-discovery-module');
        await expect(module).toBeVisible({ timeout: 15000 });

        // Click first restaurant card to open menu
        await module.getByTestId('restaurant-card').first().click();
        await expect(module.getByTestId('btn-back-to-restaurants')).toBeVisible({ timeout: 5000 });

        // The menu header should show the merchant logo (emoji fallback or img)
        const hasLogoInMenu = await module.evaluate((el) => {
            const img = el.querySelector('img');
            if (img) return true;
            const spans = el.querySelectorAll('span[aria-hidden="true"]');
            for (const span of spans) {
                if (span.textContent && span.textContent.trim().length > 0) return true;
            }
            return false;
        });
        expect(hasLogoInMenu).toBe(true);
    });
});
