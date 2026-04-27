/**
 * lifecycle.devnet.spec.ts — multi-wallet on-chain lifecycle tests.
 *
 * Runs against a local Anvil node with deployed contracts.
 * Requires: anvil running + contracts deployed + tokens minted.
 *   ./setup-local.sh   OR
 *   anvil → forge script ... → mint-tokens.sh <TOKEN>
 *
 * Accounts used:
 *   [0] 0xf39F…2266  buyer  (default injected wallet)
 *   [1] 0x7099…79C8  seller1
 *   [2] 0x3C44…93BC  seller2
 *   [3] 0x90F7…b906  seller3
 *   [4] 0x15d3…A65   seller4
 *
 * All accounts are unlocked on Anvil and have 100,000 test tokens.
 */
import { expect } from '@playwright/test';
import { test, ANVIL_ACCOUNTS } from './devnet-multi-test';
import {
    assertOrderActive,
    approveIfNeeded,
    clickSuborderCloseIfOpen,
    evmRevert,
    evmSnapshot,
    getNodeIds,
    resolveVisibleProcess,
    waitAndApproveIfNeeded,
    waitForCreateConfirm,
    waitForApproved,
    waitForWalletReady,
} from './devnet-helpers';

// Devnet tests share a single Anvil node and the same wallet accounts.
// Running tests in parallel causes nonce conflicts (multiple txs from the same
// address submitted simultaneously). Force serial execution for this file.
test.describe.configure({ mode: 'serial' });
import { gotoHome, fillCreateOrderForm, submitFirstOrder, openSubOrderModal, fillSubOrderModal, submitSubOrder, waitForFirstOrderUiSync, switchToGraphTab, switchToOrdersTab } from './test-helpers';

// ── Constants ────────────────────────────────────────────────────────────────
const BUYER = ANVIL_ACCOUNTS[0];
const SELLER1 = ANVIL_ACCOUNTS[1];
const SELLER2 = ANVIL_ACCOUNTS[2];
const SELLER3 = ANVIL_ACCOUNTS[3];
const SELLER4 = ANVIL_ACCOUNTS[4];

const LOCATION = 'u4pruydqqvj';

// ── EVM snapshot/revert: isolate this file's on-chain state ──────────────────
let chainSnapshot: string;

test.beforeAll(async () => {
    chainSnapshot = await evmSnapshot();
});

test.afterAll(async () => {
    if (chainSnapshot) await evmRevert(chainSnapshot);
});

// ── Test suite ────────────────────────────────────────────────────────────────

test.describe('Lifecycle — commitOrder + resolveProcess (devnet)', () => {
    let describeSnapshot: string;
    test.beforeAll(async () => { describeSnapshot = await evmSnapshot(); });
    test.afterAll(async () => { if (describeSnapshot) await evmRevert(describeSnapshot); });

    test.beforeEach(async ({ page }) => {
        await gotoHome(page, { devnet: true });
    });

    test(
        'buyer commits order → Active; buyer resolves → Resolved',
        async ({ page }) => {
            // ── Buyer creates commitOrder for seller1 ────────────────────────
            await fillCreateOrderForm(page, SELLER1, '0.01', LOCATION, LOCATION);
            await waitAndApproveIfNeeded(page);
            await submitFirstOrder(page);
            await waitForCreateConfirm(page);
            await switchToGraphTab(page);

            // Order appears in graph as Active immediately (dual-signed)
            await page.waitForSelector('[data-testid^="order-node-"]', { timeout: 15000 });
            const [orderId] = await getNodeIds(page);
            await assertOrderActive(page, orderId);

            // ── Buyer resolves ──────────────────────────────────────────────
            await resolveVisibleProcess(page);
            await expect(page.getByTestId(`order-node-${orderId}`)).toHaveAttribute('data-order-state', 'resolved');
        }
    );
});

// ── Diamond — 4 sellers ───────────────────────────────────────────────────────
/*
 * Diamond DAG (same structure as mock test):
 *
 *       order1 (buyer → seller1)          ← firstOrder
 *      /                        \
 * order2 (→ seller2)        order3 (→ seller3)   ← subOrders, parent: order1
 *      \                        /
 *       order4 (→ seller4)               ← subOrder, parents: order2 + order3
 */

test.describe('Lifecycle — 4-seller diamond (devnet)', () => {
    // This test fires ~10 on-chain transactions; give it plenty of time for Anvil.
    test.setTimeout(420_000);

    let describeSnapshot2: string;
    test.beforeAll(async () => { describeSnapshot2 = await evmSnapshot(); });
    test.afterAll(async () => { if (describeSnapshot2) await evmRevert(describeSnapshot2); });

    test.beforeEach(async ({ page }) => {
        await gotoHome(page, { devnet: true });
    });

    test(
        'buyer builds diamond, each seller accepts, buyer resolves all 4',
        async ({ page }) => {
            // Diamond test needs multiple wallet switches + on-chain TXs — give it 3 min.
            test.setTimeout(180000);

            // Helper: approve + submit firstOrder
            async function submitDevnetFirstOrder(sellerAddr: string, payment: string) {
                await fillCreateOrderForm(page, sellerAddr, payment, LOCATION, LOCATION);
                await waitAndApproveIfNeeded(page);
                await submitFirstOrder(page);
                await waitForCreateConfirm(page);
            }

            // Helper: approve (if needed) + submit one sub-order modal.
            //
            // expectedNodes: total order-node count expected after this sub-order lands.
            //
            // Sync strategy: instead of waiting for the modal to close (which
            // depends on wagmi's useWaitForTransactionReceipt receipt-polling),
            // we wait for the new order node to appear in the graph.  The graph
            // is driven by watchContractEvent — a completely separate poll path.
            // Once the node is visible we know the TX was mined and close the
            // modal manually if it hasn't already auto-closed.
            async function approveAndSubmitSubOrderModal(expectedNodes: number) {
                const modal = page.getByTestId('suborder-modal');

                // ── Step 1: approve if needed — HARD wait, no catch ────────
                // If the approval TX doesn't confirm on Anvil within 60 s,
                // throw and fail the test rather than submit without allowance.
                await approveIfNeeded(page, 'suborder-modal');
                if (await modal.getByTestId('approve-button').count()) {
                    await waitForApproved(page, 'suborder-modal', 60000);
                }

                // ── Step 3: submit ─────────────────────────────────────────
                await submitSubOrder(page);

                // ── Step 4: wait for the new order node (graph-driven sync) ─
                // watchContractEvent polls independently of useWaitForTransactionReceipt.
                // When the OrderCreated event is picked up, the graph re-renders
                // with the new node. Switch to Graph tab to observe it (modal
                // closes when the tab changes too).
                await switchToGraphTab(page);
                await page.waitForFunction(
                    (n: number) => document.querySelectorAll('[data-testid^="order-node-"]').length >= n,
                    expectedNodes,
                    { timeout: 90000 }
                );

                // ── Step 5: close modal manually if still open ─────────────
                // The modal auto-closes when wagmi fires isSuccess.  If receipt
                // polling is lagging, we close it ourselves so the next step
                // can interact with the page.
                await clickSuborderCloseIfOpen(page);
            }

            // ── Order 1 (commitOrder: buyer → seller1) ─────────────────────
            await submitDevnetFirstOrder(SELLER1, '0.04');
            // order-node-* only renders on Graph tab; switch to verify.
            await switchToGraphTab(page);
            await page.waitForSelector('[data-testid^="order-node-"]', { timeout: 15000 });
            const [order1Id] = await getNodeIds(page);
            // Order is Active immediately (dual-signed commit)
            await assertOrderActive(page, order1Id);

            /**
             * Navigate to the diamond process by exact order membership.
             * No wallet switching needed — all orders are Active at commit.
             */
            async function navigateToProcess() {
                const processListItem = page.locator('li').filter({
                    has: page.locator(`[data-testid="process-order-item-${order1Id}"]`),
                });
                await processListItem.waitFor({ timeout: 30000 });
                await processListItem.locator('[data-testid^="process-item-"]').click();
                await page.waitForSelector(
                    `[data-testid="order-node-${order1Id}"]`,
                    { timeout: 60000 }
                );
            }

            // ── Order 2 (subOrder: buyer → seller2, parent: order1) ────────
            await openSubOrderModal(page); // btn-add-suborder now visible on Active order1
            await fillSubOrderModal(page, SELLER2, '0.01', LOCATION, LOCATION);
            await approveAndSubmitSubOrderModal(2); // waits for 2 nodes internally

            const idsAfter2 = await getNodeIds(page);
            const order2Id = idsAfter2.find((id) => id !== order1Id)!;

            // ── Order 3 (subOrder: buyer → seller3, parent: order1) ────────
            // btn-add-suborder lives on the Orders tab; switch back from Graph.
            await switchToOrdersTab(page);
            // Use JS click to bypass pointer-event interception from the manifest form.
            await page.getByTestId(`btn-add-suborder-${order1Id}`).waitFor({ timeout: 15000 });
            await page.evaluate((tid) => {
                const btn = document.querySelector<HTMLButtonElement>(`[data-testid="${tid}"]`);
                btn?.click();
            }, `btn-add-suborder-${order1Id}`);
            await page.getByTestId('suborder-modal').waitFor({ timeout: 15000 });
            await fillSubOrderModal(page, SELLER3, '0.01', LOCATION, LOCATION);
            await approveAndSubmitSubOrderModal(3); // waits for 3 nodes internally

            const idsAfter3 = await getNodeIds(page);
            const order3Id = idsAfter3.find((id) => id !== order1Id && id !== order2Id)!;

            // ── Order 4 (subOrder: buyer → seller4, parents: order2 + order3) ──
            // All orders are Active at commit. Use order1's button.
            await switchToOrdersTab(page);
            await page.getByTestId(`btn-add-suborder-${order1Id}`).waitFor({ timeout: 15000 });
            await page.evaluate((tid) => {
                const btn = document.querySelector<HTMLButtonElement>(`[data-testid="${tid}"]`);
                btn?.click();
            }, `btn-add-suborder-${order1Id}`);
            await page.getByTestId('suborder-modal').waitFor({ timeout: 15000 });
            await page.getByTestId('suborder-input-parent-order-ids').fill(`${order2Id}, ${order3Id}`);
            await fillSubOrderModal(page, SELLER4, '0.01', LOCATION, LOCATION);
            await approveAndSubmitSubOrderModal(4); // waits for 4 nodes internally

            const allIds = await getNodeIds(page);
            expect(allIds.length).toBe(4);
            const order4Id = allIds.find((id) => ![order1Id, order2Id, order3Id].includes(id))!;
            expect(order4Id).toBeTruthy();

            // All 4 orders are Active immediately (dual-signed commits)
            for (const id of allIds) {
                await expect(page.getByTestId(`order-node-${id}`)).toHaveAttribute('data-order-state', 'active', { timeout: 15000 });
            }

            // ── Buyer resolves all 4 ────────────────────────────────────────
            await resolveVisibleProcess(page);

            for (const id of allIds) {
                await expect(page.getByTestId(`order-node-${id}`)).toHaveAttribute('data-order-state', 'resolved', { timeout: 15000 });
            }
        }
    );
});

// ── ProcessList filter controls ──────────────────────────────────────────────

test.describe('ProcessList — status filter controls (devnet)', () => {
    let describeSnapshot3: string;
    test.beforeAll(async () => { describeSnapshot3 = await evmSnapshot(); });
    test.afterAll(async () => { if (describeSnapshot3) await evmRevert(describeSnapshot3); });

    test(
        'filter buttons render; Active filter shows newly created process; Done filter hides it',
        async ({ page }) => {
            await gotoHome(page, { devnet: true });

            await fillCreateOrderForm(page, SELLER1, '1', LOCATION, LOCATION);
            await waitAndApproveIfNeeded(page);
            await submitFirstOrder(page);
            await waitForCreateConfirm(page);

            // ProcessList must appear once the wallet's process is tracked
            const processList = page.getByTestId('process-list');
            await expect(processList).toBeVisible({ timeout: 20000 });

            // Filter buttons must exist (no Pending state)
            await expect(page.getByTestId('process-filter-all')).toBeVisible();
            await expect(page.getByTestId('process-filter-active')).toBeVisible();
            await expect(page.getByTestId('process-filter-done')).toBeVisible();

            // ── Active filter ─────────────────────────────────────────────
            // The commit flow creates Active orders immediately.
            // "Active" filter should show the process.
            await page.getByTestId('process-filter-active').click();
            const firstActiveItem = page.locator('[data-testid^="process-item-"]').first();
            await expect(firstActiveItem).toBeVisible({ timeout: 10000 });

            // Capture the testid of the newly created process so we can assert
            // it is NOT visible under the Done filter.
            const newProcessTestId = await firstActiveItem.getAttribute('data-testid');

            // ── Done filter ───────────────────────────────────────────────
            // The newly created process has an Active order, so it must NOT
            // appear in the Done view.
            await page.getByTestId('process-filter-done').click();
            if (newProcessTestId) {
                await expect(page.getByTestId(newProcessTestId)).not.toBeVisible({ timeout: 5000 });
            }

            // ── All filter restores the full list ─────────────────────────
            await page.getByTestId('process-filter-all').click();
            await expect(page.locator('[data-testid^="process-item-"]').first()).toBeVisible({ timeout: 5000 });
        }
    );
});

// ── ProcessList — order sub-list (devnet) ─────────────────────────────────────

test.describe('ProcessList — order sub-list (devnet)', () => {
    let describeSnapshot4: string;
    test.beforeAll(async () => { describeSnapshot4 = await evmSnapshot(); });
    test.afterAll(async () => { if (describeSnapshot4) await evmRevert(describeSnapshot4); });

    test(
        'order appears in sub-list under process row after commitOrder',
        async ({ page }) => {
            await gotoHome(page, { devnet: true });

            await fillCreateOrderForm(page, SELLER1, '1', LOCATION, LOCATION);
            await waitAndApproveIfNeeded(page);
            await submitFirstOrder(page);
            await waitForCreateConfirm(page);

            // ProcessList must become visible once the wallet’s process is tracked
            const processList = page.getByTestId('process-list');
            await expect(processList).toBeVisible({ timeout: 20000 });

            // At least one process-order-item must appear in the sub-list
            const orderItem = processList.locator('[data-testid^="process-order-item-"]').first();
            await expect(orderItem).toBeVisible({ timeout: 15000 });

            // Sub-item must include the order hash and state label
            await expect(orderItem).toContainText('0x');
            await expect(orderItem).toContainText('Active');
        }
    );
});
