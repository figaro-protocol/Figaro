/**
 * designer-delivery-modality.devnet.spec.ts
 *
 * Phase 3d of the e2e remediation plan: the delivery-modality
 * side-effect on the canvas — selecting "delivery" in the
 * Fulfilment article auto-spawns a courier sub-order node;
 * selecting any non-delivery modality removes it again.
 *
 * Flow:
 *   1. /builders/designer/new?fresh=1 — wait for canvas hydration.
 *   2. Assert exactly one order node (the root).
 *   3. Click root node → drawer opens.
 *   4. Open Fulfilment article → select Delivery modality.
 *   5. Assert a second order node appears (the auto-courier).
 *   6. Switch modality to Consume on-site.
 *   7. Assert the courier sub-order is removed.
 */
import { test, expect } from './devnet-multi-test';

test.describe('Designer delivery modality side-effect (devnet)', () => {
    test.setTimeout(120_000);

    test('delivery modality spawns a courier sub-order; switching away removes it', async ({ page }) => {
        await page.addInitScript(() => {
            try {
                window.localStorage.removeItem('figaro:designer:current');
                window.localStorage.removeItem('figaro:designer:drafts');
            } catch { /* noop */ }
        });
        await page.goto('/builders/designer/new?fresh=1&e2e=devnet', { waitUntil: 'domcontentloaded' });
        await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
        await page.getByTestId('designer-saved-hint').waitFor({ timeout: 15000 });

        // Blank seed = one root order. The :not([data-testid$="-delete"])
        // filter excludes the per-node delete buttons that share the
        // order-node-* prefix.
        const orderNodes = page.locator('[data-testid^="order-node-"]:not([data-testid$="-delete"])');
        await expect(orderNodes).toHaveCount(1, { timeout: 10000 });

        // Open the drawer for the root order.
        await orderNodes.first().click();
        await page.getByTestId('agreement-drawer').waitFor({ state: 'visible', timeout: 10000 });

        // Open the Fulfilment article. Geo's already default-on, but
        // the modality is initially unset; selecting Delivery should
        // both write the clause AND trigger `onDeliverySelected` which
        // spawns a courier sub-order node.
        await page.getByTestId('drawer-tab-fulfilment').click();
        await page.getByTestId('drawer-section-fulfilment').waitFor({ state: 'visible', timeout: 5000 });

        await page.getByTestId('drawer-fulfilment-modality-delivery').click();

        // Side-effect: courier sub-order node appears.
        await expect(orderNodes).toHaveCount(2, { timeout: 10000 });

        // Switch back to a non-delivery modality. The courier sub-order
        // should be removed.
        await page.getByTestId('drawer-fulfilment-modality-consume-onsite').click();
        await expect(orderNodes).toHaveCount(1, { timeout: 10000 });
    });
});
