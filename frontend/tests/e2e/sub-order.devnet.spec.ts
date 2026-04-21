// Sub-order / process lifecycle devnet tests.
//
// After a commitOrder is confirmed on-chain the order is in the Active state —
// Live-kernel orders are active at commit (both parties co-sign). The UI must show the
// active order node and enable the subOrder flow immediately.
//
// Full subOrder form testing (bond preview, submit) requires the buyer to
// create sub-commitments with new sellers.

import { test, expect } from './devnet-test';
import { evmRevert, evmSnapshot, waitAndApproveIfNeeded } from './devnet-helpers';
import { DEFAULT_LOCAL_MOCK_TOKEN, fillWithRetry, gotoHome, fillCreateOrderForm, submitFirstOrder, waitForFirstOrderUiSync } from './test-helpers';

const COUNTERPARTY = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'; // Anvil account[1]

// ── EVM snapshot/revert: isolate this file's on-chain state ──────────────────
let chainSnapshot: string;
test.beforeAll(async () => { chainSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (chainSnapshot) await evmRevert(chainSnapshot); });

// ---------------------------------------------------------------------------
// Shared helper: submit commitOrder on devnet, dismiss modal, return.
// After this helper the UI should show an Active order.
// ---------------------------------------------------------------------------
async function submitFirstOrderOnDevnet(page: import('@playwright/test').Page) {
    const previousNodeCount = await page.locator('[data-testid^="order-node-"]').count();
    const previousProcessOrderCount = await page.locator('[data-testid^="process-order-item-"]').count();
    await fillCreateOrderForm(page, COUNTERPARTY, '0.01', 'u4pruydqqvj', 'u4pruydqqvj');

    // Approve if needed
    await waitAndApproveIfNeeded(page);

    await submitFirstOrder(page);
    await waitForFirstOrderUiSync(page, { previousNodeCount, previousProcessOrderCount });
}

// ---------------------------------------------------------------------------

test.describe('Sub-order flows (devnet)', () => {
    test.beforeEach(async ({ page }) => {
        await gotoHome(page, { devnet: true });
    });

    test('after commitOrder confirms on devnet, form resets to firstOrder mode (devnet)', async ({ page }) => {
        // After on-chain confirmation the order is Active. The form should
        // reset (fields cleared) and remain in firstOrder mode — the subOrder
        // form is only activated by clicking "+" on an Active order card.
        await submitFirstOrderOnDevnet(page);

        // Submit button must still be present
        await expect(
            page.getByTestId('btn-submit-order')
        ).toBeVisible({ timeout: 10000 });

        // Form fields must have been cleared after the successful submission
        await expect(page.getByTestId('input-counterparty')).toHaveValue('');
        await expect(page.getByTestId('input-payment')).toHaveValue('');
    });

    test('after firstOrder confirms, graph shows the order node (devnet)', async ({ page }) => {
        await submitFirstOrderOnDevnet(page);

        // At least one order node must appear in the graph
        await expect(
            page.locator('[data-testid^="order-node-"]').first()
        ).toBeVisible({ timeout: 10000 });
    });

    test('after commitOrder, form fields are clear and another order can be filled (devnet)', async ({ page }) => {
        // After a commitOrder confirms the form must reset so the user can either
        // submit another firstOrder (new process) or use the graph to create sub-orders.
        await submitFirstOrderOnDevnet(page);

        // Wait for the order node to appear in the graph — this is a strong signal
        // that addOrder fired and the store/UI have fully settled after the tx.
        await expect(
            page.locator('[data-testid^="order-node-"]').first()
        ).toBeVisible({ timeout: 15000 });

        // Fields must have been cleared
        await expect(page.getByTestId('input-counterparty')).toHaveValue('', { timeout: 10000 });
        await expect(page.getByTestId('input-payment')).toHaveValue('');

        // Filling the form again should re-enable the submit button
        await fillWithRetry(page.getByTestId('input-counterparty'), COUNTERPARTY);
        await fillWithRetry(page.getByTestId('input-currency'), DEFAULT_LOCAL_MOCK_TOKEN);
        await fillWithRetry(page.getByTestId('input-payment'), '0.005');
        await fillWithRetry(page.getByTestId('manifest-input-origin'), 'u4pruydqqvj');
        await fillWithRetry(page.getByTestId('manifest-input-destination'), 'u4pruydqqvj');

        await expect(
            page.getByTestId('btn-submit-order')
        ).toBeEnabled({ timeout: 5000 });
    });

    test('negative: missing origin/destination on firstOrder blocks submit with guidance (devnet)', async ({ page }) => {
        // Fill form without origin/destination — guarded submit should remain disabled.
        await fillCreateOrderForm(page, COUNTERPARTY, '0.01');

        const submitBtn = page.getByTestId('btn-submit-order');
        await expect(submitBtn).toBeDisabled();
        await expect(page.getByTestId('order-submit-requirements')).toContainText('set origin');
        await expect(page.getByTestId('order-submit-requirements')).toContainText('set destination');
    });
});
