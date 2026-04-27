/**
 * ui-feedback.devnet.spec.ts
 *
 * Verifies UI state-feedback fixes against a live Anvil node:
 *   1. ConnectButton shows the wallet address when connected
 *   2. wallet-balance element updates automatically after an on-chain tx
 *
 * Run with:  npm run test:e2e:devnet
 */

import { test, expect } from './devnet-test';
import { evmRevert, evmSnapshot, waitAndApproveIfNeeded } from './devnet-helpers';
import { gotoHome, fillCreateOrderForm, submitFirstOrder, waitForFirstOrderUiSync } from './test-helpers';

const COUNTERPARTY = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'; // Anvil account[1]

// ── EVM snapshot/revert: isolate this file's on-chain state ──────────────────
let chainSnapshot: string;
test.beforeAll(async () => { chainSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (chainSnapshot) await evmRevert(chainSnapshot); });

test.describe('UI feedback — connect button & balances (devnet)', () => {
    test.beforeEach(async ({ page }) => {
        await gotoHome(page, { devnet: true });
    });

    // Note: 'header shows connected state' removed — connected/disconnected
    // header rendering is covered by mock route tests. The balance-auto-update
    // test below is the on-chain-unique value (wagmi reactivity to new blocks).

    // -----------------------------------------------------------------------
    // Fix #4: wallet-balance should update when a new block is mined
    // -----------------------------------------------------------------------
    test('wallet balance updates automatically after on-chain transaction (devnet)', async ({ page }) => {
        const balanceEl = page.getByTestId('wallet-balance');
        await expect(balanceEl).toBeVisible({ timeout: 10000 });

        // Capture the displayed balance before any tx
        const balanceBefore = await balanceEl.innerText();

        // Create an order — this mines a block and moves tokens into the contract.
        // Full flow: approve token spend → firstOrder tx.
        await fillCreateOrderForm(page, COUNTERPARTY, '1', 'u4pruydqqvj', 'u4pruydqqvj');

        await waitAndApproveIfNeeded(page);

        const previousNodeCount = await page.locator('[data-testid^="order-node-"]').count();
        const previousProcessOrderCount = await page.locator('[data-testid^="process-order-item-"]').count();
        await submitFirstOrder(page);
        await waitForFirstOrderUiSync(page, { previousNodeCount, previousProcessOrderCount });

        // useWatchBlockNumber fires on the new block; the balance element should change
        await page.waitForFunction(
            (before) => {
                const el = document.querySelector('[data-testid="wallet-balance"]');
                return el !== null && el.textContent !== null && el.textContent !== before;
            },
            balanceBefore,
            { timeout: 30000 }
        );

        const balanceAfter = await balanceEl.innerText();
        expect(balanceAfter).not.toBe(balanceBefore);
    });
});
