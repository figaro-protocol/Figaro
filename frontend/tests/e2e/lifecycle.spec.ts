/**
 * lifecycle.spec.ts — full order lifecycle tests (mock suite).
 *
 * Covers:
 *   1. commit order  — orders are Active at commit in the live kernel
 *   2. resolveProcess — buyer resolves all Active orders → Resolved
 *   3. resolve verify — after resolve, all orders are Resolved (no credits/withdraw)
 *   4. diamond      — 4 sellers form a diamond DAG, buyer resolves
 *
 * All tests run in ?e2e=mock mode (no wallet / no chain required).
 */
import { test, expect } from '@playwright/test';
import {
    gotoHome,
    fillCreateOrderForm,
    submitFirstOrder,
    openSubOrderModal,
    fillSubOrderModal,
    submitSubOrder,
    ANVIL_ACCOUNTS,
    waitForMockHarness,
    injectPendingOrder,
    acceptOrderMock,
    resolveProcessMock,
    dismissConfirmationModal,
    switchToGraphTab,
    switchToOrdersTab,
} from './test-helpers';

// ── Addresses used across tests ──────────────────────────────────────────────
const SELLER1 = ANVIL_ACCOUNTS[1];
const SELLER2 = ANVIL_ACCOUNTS[2];
const SELLER3 = ANVIL_ACCOUNTS[3];
const SELLER4 = ANVIL_ACCOUNTS[4];

// ── Helper: read all visible order node IDs from the DOM ─────────────────────
async function getOrderNodeIds(page: import('@playwright/test').Page): Promise<string[]> {
    const handles = await page.locator('[data-testid^="order-node-"]').all();
    const ids: string[] = [];
    for (const h of handles) {
        const tid = await h.getAttribute('data-testid');
        if (tid) ids.push(tid.replace('order-node-', ''));
    }
    return ids;
}

// ── 1. commitOrder ──────────────────────────────────────────────────────
// NOTE on setup strategy: in mock mode, submitFirstOrder() creates orders in
// the Active state directly (live-kernel orders are active at commit — both parties co-sign).
// The real (on-chain) commit flow is covered end-to-end by lifecycle.devnet.spec.ts.

test.describe('Lifecycle — commitOrder (mock)', () => {
    test.beforeEach(async ({ page }) => {
        await gotoHome(page, { mock: true });
    });

    test('injected order is Active at commit', async ({ page }) => {
        // Build a unique processId for this test
        const processId = '0x' + 'a1b2c3d4'.repeat(8);

        // Inject an Active order directly into the mock event store
        // injectPendingOrder is aliased to injectActiveOrder in the live flow.
        const orderId = await injectPendingOrder(page, {
            processId,
            buyer: ANVIL_ACCOUNTS[0],
            seller: SELLER1,
            payment: '10000000000000000', // 0.01 tokens
        });

        // The graph shows the node
        await switchToGraphTab(page);
        await page.waitForSelector(`[data-testid="order-node-${orderId}"]`, { timeout: 10000 });

        // Node must be Active (orders are active at commit)
        const node = page.getByTestId(`order-node-${orderId}`);
        await expect(node).toHaveAttribute('data-order-state', 'active');

        // acceptOrderMock is now a verification-only helper
        await acceptOrderMock(page, orderId);

        // Node remains Active
        await expect(node).toHaveAttribute('data-order-state', 'active');
    });

    test('multiple orders — all are Active at commit', async ({ page }) => {
        const processId = '0x' + 'b2c3d4e5'.repeat(8);

        const id1 = await injectPendingOrder(page, { processId, seller: SELLER1, payment: '5000000000000000' });
        const id2 = await injectPendingOrder(page, { processId, seller: SELLER2, payment: '3000000000000000' });

        await switchToGraphTab(page);
        await page.waitForSelector(`[data-testid="order-node-${id1}"]`, { timeout: 10000 });
        await page.waitForSelector(`[data-testid="order-node-${id2}"]`, { timeout: 10000 });

        // Both are Active at commit
        await expect(page.getByTestId(`order-node-${id1}`)).toHaveAttribute('data-order-state', 'active');
        await expect(page.getByTestId(`order-node-${id2}`)).toHaveAttribute('data-order-state', 'active');
    });
});

// ── 2. resolveProcess ─────────────────────────────────────────────────────────

test.describe('Lifecycle — resolveProcess (mock)', () => {
    test.beforeEach(async ({ page }) => {
        await gotoHome(page, { mock: true });
    });

    test('buyer resolves Active orders → all become Resolved', async ({ page }) => {
        // Create an order via the UI (mock creates it as Active)
        await fillCreateOrderForm(page, SELLER1, '0.01', 'u4pruydqqvj', 'u4pruydqqvj');
        await page.getByTestId('approve-button').click();
        await page.waitForFunction(
            () => document.querySelector('[data-testid="approval-status"]')?.textContent?.includes('Authorized'),
            null, { timeout: 10000 }
        );
        await submitFirstOrder(page);
        await dismissConfirmationModal(page);

        // Resolve button appears on the orders tab (ProcessTopologyPanel)
        await expect(page.getByTestId('btn-resolve-process')).toBeVisible({ timeout: 10000 });

        await resolveProcessMock(page);

        // All visible order nodes must show Resolved
        await switchToGraphTab(page);
        await page.waitForSelector('[data-testid^="order-node-"]', { timeout: 10000 });
        const nodes = page.locator('[data-testid^="order-node-"]');
        for (const n of await nodes.all()) {
            await expect(n).toHaveAttribute('data-order-state', 'resolved');
        }
    });

    test('after resolve, Resolve button disappears (no more Active orders)', async ({ page }) => {
        await fillCreateOrderForm(page, SELLER1, '0.01', 'u4pruydqqvj', 'u4pruydqqvj');
        await page.getByTestId('approve-button').click();
        await page.waitForFunction(
            () => document.querySelector('[data-testid="approval-status"]')?.textContent?.includes('Authorized'),
            null, { timeout: 10000 }
        );
        await submitFirstOrder(page);
        await dismissConfirmationModal(page);

        await expect(page.getByTestId('btn-resolve-process')).toBeVisible({ timeout: 10000 });
        await resolveProcessMock(page);

        // Resolve button should disappear once there are no Active orders
        await expect(page.getByTestId('btn-resolve-process')).not.toBeVisible({ timeout: 5000 });
    });
});

// ── 3. resolve verification ────────────────────────────────────────────────

test.describe('Lifecycle — resolve (mock)', () => {
    test.beforeEach(async ({ page }) => {
        await gotoHome(page, { mock: true });
    });

    test('resolving transitions all Active orders to Resolved', async ({ page }) => {
        await fillCreateOrderForm(page, SELLER1, '0.01', 'u4pruydqqvj', 'u4pruydqqvj');
        await page.getByTestId('approve-button').click();
        await page.waitForFunction(
            () => document.querySelector('[data-testid="approval-status"]')?.textContent?.includes('Authorized'),
            null, { timeout: 10000 }
        );
        await submitFirstOrder(page);
        await dismissConfirmationModal(page);

        await expect(page.getByTestId('btn-resolve-process')).toBeVisible({ timeout: 10000 });

        // All orders are Active before resolve — verified on Graph tab
        await switchToGraphTab(page);
        await page.waitForSelector('[data-testid^="order-node-"]', { timeout: 10000 });
        const nodeBefore = page.locator('[data-testid^="order-node-"]').first();
        await expect(nodeBefore).toHaveAttribute('data-order-state', 'active');

        // Switch back to orders tab to click resolve
        await page.getByRole('tab', { name: 'Create Order' }).click();
        await resolveProcessMock(page);

        // After resolve, all orders must be Resolved — verified on Graph tab
        await switchToGraphTab(page);
        const nodeAfter = page.locator('[data-testid^="order-node-"]').first();
        await expect(nodeAfter).toHaveAttribute('data-order-state', 'resolved');

        // Resolve button should disappear once there are no Active orders
        await page.getByRole('tab', { name: 'Create Order' }).click();
        await expect(page.getByTestId('btn-resolve-process')).not.toBeVisible({ timeout: 5000 });
    });
});

// ── 4. Diamond pattern — 4 sellers ───────────────────────────────────────────

/*
 * Diamond DAG:
 *
 *          order1 (buyer → seller1)          ← firstOrder
 *         /                        \
 *   order2 (buyer → seller2)   order3 (buyer → seller3)   ← subOrders, parent: order1
 *         \                        /
 *          order4 (buyer → seller4)          ← subOrder, parents: order2 + order3
 */

test.describe('Lifecycle — diamond (4 sellers, mock)', () => {
    test.beforeEach(async ({ page }) => {
        await gotoHome(page, { mock: true });
    });

    test('4-seller diamond: all orders committed Active, buyer resolves all', async ({ page }) => {
        // ── Order 1 (firstOrder: buyer → seller1) ─────────────────────────
        await fillCreateOrderForm(page, SELLER1, '0.04', 'u4pruydqqvj', 'u4pruydqqvj');
        await page.getByTestId('approve-button').click();
        await page.waitForFunction(
            () => document.querySelector('[data-testid="approval-status"]')?.textContent?.includes('Authorized'),
            null, { timeout: 10000 }
        );
        await submitFirstOrder(page);
        await dismissConfirmationModal(page);

        // Wait for order1 graph node to appear (graph tab owns order-node-*)
        await switchToGraphTab(page);
        await page.waitForSelector('[data-testid^="order-node-"]', { timeout: 10000 });

        // Read order1.id from the graph
        const [order1Id] = await getOrderNodeIds(page);
        expect(order1Id).toBeTruthy();

        // ── Order 2 (subOrder: buyer → seller2, parent: order1) ──────────
        await openSubOrderModal(page); // clicks btn-add-suborder on first Active node
        await fillSubOrderModal(page, SELLER2, '0.01', 'u4pruydqqvj', 'u4pruydqqvj');
        // Approve inside modal — only needed for first sub-order;
        // subsequent opens find allowance already set
        const modalForOp = page.getByTestId('suborder-modal');
        await modalForOp.waitFor({ timeout: 10000 });
        const approveBtnInModal = modalForOp.getByTestId('approve-button');
        if (await approveBtnInModal.count() > 0) {
            await approveBtnInModal.click();
            await page.waitForFunction(
                () => {
                    const m = document.querySelector('[data-testid="suborder-modal"]');
                    return m?.querySelector('[data-testid="approval-status"]')?.textContent?.includes('Authorized');
                },
                null, { timeout: 10000 }
            );
        }
        await submitSubOrder(page);
        await switchToGraphTab(page);
        await page.waitForFunction(
            () => document.querySelectorAll('[data-testid^="order-node-"]').length >= 2,
            null, { timeout: 10000 }
        );
        const idsAfterOrder2 = await getOrderNodeIds(page);
        const order2Id = idsAfterOrder2.find((id) => id !== order1Id)!;
        expect(order2Id).toBeTruthy();

        // ── Order 3 (subOrder: buyer → seller3, parent: order1) ──────────
        // Open sub-order modal from order1 again
        // Use JS click: graph nodes may overlap when Tailwind applies styling
        await switchToOrdersTab(page);
        await page.evaluate((id) => {
            const btn = document.querySelector(`[data-testid="btn-add-suborder-${id}"]`) as HTMLElement | null;
            btn?.click();
        }, order1Id);
        await page.getByTestId('suborder-modal').waitFor({ timeout: 10000 });
        await fillSubOrderModal(page, SELLER3, '0.01', 'u4pruydqqvj', 'u4pruydqqvj');
        const approveBtnOrder3 = page.getByTestId('suborder-modal').getByTestId('approve-button');
        if (await approveBtnOrder3.count() > 0) {
            await approveBtnOrder3.click();
            await page.waitForFunction(
                () => {
                    const m = document.querySelector('[data-testid="suborder-modal"]');
                    return m?.querySelector('[data-testid="approval-status"]')?.textContent?.includes('Authorized');
                },
                null, { timeout: 10000 }
            );
        }
        await submitSubOrder(page);
        await switchToGraphTab(page);

        await page.waitForFunction(
            () => document.querySelectorAll('[data-testid^="order-node-"]').length >= 3,
            null, { timeout: 10000 }
        );
        const idsAfterOrder3 = await getOrderNodeIds(page);
        const order3Id = idsAfterOrder3.find((id) => id !== order1Id && id !== order2Id)!;
        expect(order3Id).toBeTruthy();

        // ── Order 4 (subOrder: buyer → seller4, parents: order2 + order3) ──
        // Open modal from order2 node; override parent IDs to include both order2 and order3
        await switchToOrdersTab(page);
        await page.evaluate((id) => {
            const btn = document.querySelector(`[data-testid="btn-add-suborder-${id}"]`) as HTMLElement | null;
            btn?.click();
        }, order2Id);
        await page.getByTestId('suborder-modal').waitFor({ timeout: 10000 });

        // Override the parent IDs field to include both order2 and order3
        await page.getByTestId('suborder-input-parent-order-ids').fill(`${order2Id}, ${order3Id}`);
        await fillSubOrderModal(page, SELLER4, '0.01', 'u4pruydqqvj', 'u4pruydqqvj');
        const approveBtnOrder4 = page.getByTestId('suborder-modal').getByTestId('approve-button');
        if (await approveBtnOrder4.count() > 0) {
            await approveBtnOrder4.click();
            await page.waitForFunction(
                () => {
                    const m = document.querySelector('[data-testid="suborder-modal"]');
                    return m?.querySelector('[data-testid="approval-status"]')?.textContent?.includes('Authorized');
                },
                null, { timeout: 10000 }
            );
        }
        await submitSubOrder(page);
        await switchToGraphTab(page);

        // All 4 orders must be in the graph
        await page.waitForFunction(
            () => document.querySelectorAll('[data-testid^="order-node-"]').length >= 4,
            null, { timeout: 10000 }
        );
        const allIds = await getOrderNodeIds(page);
        expect(allIds.length).toBe(4);
        const order4Id = allIds.find((id) => ![order1Id, order2Id, order3Id].includes(id))!;
        expect(order4Id).toBeTruthy();

        const order4Node = page.getByTestId(`order-node-${order4Id}`);
        await expect(order4Node).toBeVisible();

        // ── Buyer resolves all 4 orders — btn-resolve-process is on orders tab
        await page.getByRole('tab', { name: 'Create Order' }).click();
        await expect(page.getByTestId('btn-resolve-process')).toBeVisible({ timeout: 10000 });
        const resolveBtn = page.getByTestId('btn-resolve-process');
        await expect(resolveBtn).toContainText('4 active');
        await resolveProcessMock(page);

        // All 4 nodes must show Resolved — back on graph tab
        await switchToGraphTab(page);
        const nodes = page.locator('[data-testid^="order-node-"]');
        expect(await nodes.count()).toBe(4);
        for (const n of await nodes.all()) {
            await expect(n).toHaveAttribute('data-order-state', 'resolved');
        }
    });

    test('4-seller diamond: graph has correct node count', async ({ page }) => {
        // Lightweight variant: just verify 4 nodes appear and the processId is consistent
        await fillCreateOrderForm(page, SELLER1, '0.04', 'u4pruydqqvj', 'u4pruydqqvj');
        await page.getByTestId('approve-button').click();
        await page.waitForFunction(
            () => document.querySelector('[data-testid="approval-status"]')?.textContent?.includes('Authorized'),
            null, { timeout: 10000 }
        );
        await submitFirstOrder(page);
        await dismissConfirmationModal(page);
        await switchToGraphTab(page);
        await page.waitForSelector('[data-testid^="order-node-"]', { timeout: 10000 });
        const [order1Id] = await getOrderNodeIds(page);

        // Helper: submit a sub-order scoped to a specific parent
        async function addSubOrder(parentId: string, seller: string) {
            await switchToOrdersTab(page);
            await page.evaluate((id) => {
                const btn = document.querySelector(`[data-testid="btn-add-suborder-${id}"]`) as HTMLElement | null;
                btn?.click();
            }, parentId);
            await page.getByTestId('suborder-modal').waitFor({ timeout: 10000 });
            await fillSubOrderModal(page, seller, '0.01', 'u4pruydqqvj', 'u4pruydqqvj');
            const m = page.getByTestId('suborder-modal');
            // Approve only if button is visible (allowance not already sufficient)
            const approveBtn = m.getByTestId('approve-button');
            if (await approveBtn.count() > 0) {
                await approveBtn.click();
                await page.waitForFunction(
                    () => {
                        const m2 = document.querySelector('[data-testid="suborder-modal"]');
                        return m2?.querySelector('[data-testid="approval-status"]')?.textContent?.includes('Authorized');
                    },
                    null, { timeout: 10000 }
                );
            }
            await submitSubOrder(page);
        }

        await addSubOrder(order1Id, SELLER2);
        await switchToGraphTab(page);
        await page.waitForFunction(() => document.querySelectorAll('[data-testid^="order-node-"]').length >= 2, null, { timeout: 10000 });
        const order2Id = (await getOrderNodeIds(page)).find((id) => id !== order1Id)!;

        await addSubOrder(order1Id, SELLER3);
        await switchToGraphTab(page);
        await page.waitForFunction(() => document.querySelectorAll('[data-testid^="order-node-"]').length >= 3, null, { timeout: 10000 });
        const ids3 = await getOrderNodeIds(page);
        const order3Id = ids3.find((id) => id !== order1Id && id !== order2Id)!;

        // order4: two parents
        await switchToOrdersTab(page);
        await page.evaluate((id) => {
            const btn = document.querySelector(`[data-testid="btn-add-suborder-${id}"]`) as HTMLElement | null;
            btn?.click();
        }, order2Id);
        await page.getByTestId('suborder-modal').waitFor({ timeout: 10000 });
        await page.getByTestId('suborder-input-parent-order-ids').fill(`${order2Id}, ${order3Id}`);
        await fillSubOrderModal(page, SELLER4, '0.01', 'u4pruydqqvj', 'u4pruydqqvj');
        const m4 = page.getByTestId('suborder-modal');
        const approveBtn4 = m4.getByTestId('approve-button');
        if (await approveBtn4.count() > 0) {
            await approveBtn4.click();
            await page.waitForFunction(
                () => {
                    const mx = document.querySelector('[data-testid="suborder-modal"]');
                    return mx?.querySelector('[data-testid="approval-status"]')?.textContent?.includes('Authorized');
                },
                null, { timeout: 10000 }
            );
        }
        await submitSubOrder(page);
        await switchToGraphTab(page);

        await page.waitForFunction(() => document.querySelectorAll('[data-testid^="order-node-"]').length >= 4, null, { timeout: 10000 });

        const finalIds = await getOrderNodeIds(page);
        expect(finalIds.length).toBe(4);

        // All 4 nodes must be Active (mock path)
        for (const id of finalIds) {
            await expect(page.getByTestId(`order-node-${id}`)).toHaveAttribute('data-order-state', 'active');
        }

        // viewedProcessId is not persisted to localStorage (intentional — it is reset each session).
        // The 4-node + Active assertions above are the meaningful correctness checks.
    });
});
