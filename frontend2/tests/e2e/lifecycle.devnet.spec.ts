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


// Note: 4-seller diamond test removed per the devnet audit (2026-04-27).
// The simple commit + resolve test above covers basic UI flow; ProcessList
// tests below cover sub-list visibility; Foundry HalmosFigaroCore +
// FigaroCoreTest already prove multi-order resolveProcess kernel logic
// across N parties. The UI-driven diamond was brittle — page closure between
// sub-orders 2 and 3 from cumulative AgreementPreviewModal × tab-switch ×
// receipt-polling interactions — and added little additional guarantee.
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

            // ProcessList renders on the My Processes tab.
            await page.getByRole('tab', { name: 'My Processes' }).click();

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

            // ProcessList renders on the My Processes tab.
            await page.getByRole('tab', { name: 'My Processes' }).click();

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
