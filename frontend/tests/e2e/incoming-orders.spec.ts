/**
 * incoming-orders.spec.ts
 *
 * Mock-mode tests for the merchant entry path: `/inbox`.
 *
 * Pre-2026-05 these tests targeted the `IncomingOrdersModule` rendered
 * inside the `/i/local-commerce` assembly runtime under a merchant role
 * switch. After the runtime was deleted in favour of purpose-shaped
 * pages, "the merchant inbox" became its own route at `/inbox` (no
 * role-switcher; the connected wallet's identity drives section gating
 * inside the page).
 */
import { test, expect } from '@playwright/test';
import { gotoInboxMock } from './test-helpers';

test.describe('Merchant inbox (mock)', () => {
    test('renders the inbox shell with a wallet gate when no wallet is connected', async ({ page }) => {
        await gotoInboxMock(page);

        // Shell renders regardless of wallet state.
        const inbox = page.getByTestId('merchant-inbox');
        await expect(inbox).toBeVisible({ timeout: 15000 });

        // Mock mode does not auto-connect a wallet, so the inbox surfaces a
        // wallet gate. Section testids (pending / active / completed) only
        // render once a wallet is connected — the gate copy is the
        // canonical disconnected-state assertion here.
        await expect(inbox).toContainText(
            /Connect a wallet to receive incoming orders/i,
            { timeout: 15000 },
        );
    });

    test('inbox header copy describes both incoming and active orders', async ({ page }) => {
        await gotoInboxMock(page);

        const inbox = page.getByTestId('merchant-inbox');
        await expect(inbox).toBeVisible({ timeout: 15000 });
        await expect(inbox).toContainText(/Incoming orders awaiting acceptance/i);
        await expect(inbox).toContainText(/orders you'?re currently fulfilling/i);
    });
});
