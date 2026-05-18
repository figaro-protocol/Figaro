import { test, expect } from '@playwright/test';
import {
    gotoHome,
    fillCreateOrderForm,
    submitFirstOrder,
    openSubOrderModal,
    fillSubOrderModal,
    submitSubOrder,
    dismissConfirmationModal,
    switchToGraphTab,
    injectActiveOrder,
    waitForApproved,
} from './test-helpers';

const BUYER = '0x000000000000000000000000000000000000dEaD';
const SELLER = '0x000000000000000000000000000000000000b00b';

test.describe('Sub-order flows — Create SubOrder (mocked)', () => {
    test.beforeEach(async ({ page }) => {
        await gotoHome(page, { mock: true });
    });

    test('subOrder: create sub-order with mock permit', async ({ page }) => {
        // ── Step 1: first order ────────────────────────────────────────────
        await fillCreateOrderForm(page, BUYER, '0.01', 'u4pruydqqvj', 'u4pruydqqvj');
        await page.getByTestId('approve-button').click();
        await waitForApproved(page, undefined, 10000);
        await submitFirstOrder(page);
        await dismissConfirmationModal(page);

        // ── Step 2: open sub-order modal (the "+" button lives on the
        // OrderNodeSemanticCard rendered in the default "orders" tab)
        await openSubOrderModal(page);

        // Inject a pending permit blob for the upcoming subOrder
        await page.evaluate(() => {
            window.__FIGARO_PENDING_PERMIT__ = { target: '0x0000000000000000000000000000000000000002', data: '0xcafe' };
        });

        // ── Step 3: fill + approve + submit inside the modal ───────────────
        await fillSubOrderModal(page, SELLER, '0.005', 'u4pruydqqvj', 'u4pruydqqvj');

        // Approve button is inside the modal (scoped to avoid collision with main form)
        // Use JS click to bypass viewport clipping (ManifestForm makes the modal taller)
        await page.evaluate(() => {
            const modal = document.querySelector('[data-testid="suborder-modal"]');
            const btn = modal?.querySelector('[data-testid="approve-button"]') as HTMLElement | null;
            btn?.click();
        });
        await page.waitForFunction(
            () => {
                const modal = document.querySelector('[data-testid="suborder-modal"]');
                return modal?.querySelector('[data-testid="approval-status"]')?.textContent?.includes('Authorized');
            },
            null, { timeout: 10000 }
        );

        await submitSubOrder(page);

        // ── Assertions ─────────────────────────────────────────────────────
        // Graph tab is where order-node-* elements live.
        await switchToGraphTab(page);
        await page.waitForSelector('[data-testid^="order-node-"]', { timeout: 8000 });
        const nodes = page.locator('[data-testid^="order-node-"]');
        await expect(nodes.first()).toBeVisible();
        // Sub-order payment (0.005 tokens) should appear in the graph nodes
        await expect(nodes.last()).toContainText('0.005');
    });

    test('graph renders an edge between two orders in the same process', async ({ page }) => {
        // At the V5 kernel level, sub-orders ARE orders — `commit` calls
        // extending a monotonic cumulative-value accumulator on the same
        // processId, with parent/child structure living in the
        // off-chain topology section (or, when absent, derived by
        // `deriveOrderTopology`'s linear-fallback from cumulative-value
        // sort). The UI-driven flow above (test #21) already covers
        // the sub-order modal end-to-end; this test only needs to
        // confirm that two orders in the same process render with a
        // connecting edge in the ReactFlow graph.
        //
        // The prior shape of this test re-ran the full 12-step UI flow
        // (form-fill → approve → submit → modal-open → fill → approve →
        // submit) just to set up two orders, then asserted on the edge.
        // That orchestration was structurally flaky (~40% under load) —
        // any single waitForFunction missing its window aborted the
        // chain. Replaced with two `injectActiveOrder` calls that match
        // the pattern `create-order-home:172` uses for lens coverage.
        const processId = '0x' + 'edd1edd1'.repeat(8);

        // Distinct cumulativeValue (= payment) so the linear-fallback
        // topology sort produces a deterministic order.
        await injectActiveOrder(page, {
            processId,
            id: '5000',
            buyer: BUYER,
            seller: SELLER,
            payment: '10000000000000000', // 0.01
        });
        await injectActiveOrder(page, {
            processId,
            id: '5001',
            buyer: BUYER,
            seller: SELLER,
            payment: '20000000000000000', // 0.02
        });

        await switchToGraphTab(page);
        await page.waitForFunction(
            () => document.querySelectorAll('[data-testid^="order-node-"]').length >= 2,
            null, { timeout: 10000 }
        );
        await expect(page.locator('.react-flow__edge-path').first()).toBeVisible({ timeout: 5000 });
    });
});

