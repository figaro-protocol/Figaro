/**
 * eats-checkout.devnet.spec.ts
 *
 * Full cart → checkout → settlement flow through the eats assembly.
 * This is the end-to-end test that proves the consumer-facing surface
 * works from browse to settlement on a live Anvil chain.
 *
 * Flow:
 *   1. Browse restaurants → add item to cart
 *   2. Open cart → switch to pickup mode → place order
 *   3. Verify order appears on-chain (process in sidebar)
 *   4. Buyer resolves the process
 *   5. Verify settlement (order state → resolved)
 *
 * Accounts:
 *   [0] BUYER      0xf39F…2266 — default wallet, has 1M tokens from deploy
 *   [1] RESTAURANT  0x7099…79C8 — Bob's Pizza Palace address
 *
 * Requires: Anvil running + all contracts deployed (deploy-local.sh)
 */
import { expect } from '@playwright/test';
import { test } from './devnet-multi-test';
import {
    evmRevert,
    evmSnapshot,
    readLocalDeploymentConfig,
} from './devnet-helpers';

const deployConfig = readLocalDeploymentConfig();

// ── EVM snapshot/revert: isolate this file's on-chain state ──────────────────

let chainSnapshot: string;

test.beforeAll(async () => {
    chainSnapshot = await evmSnapshot();
});

test.afterAll(async () => {
    if (chainSnapshot) await evmRevert(chainSnapshot);
});

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Cart checkout to settlement (devnet)', () => {
    test.setTimeout(300_000);

    let testSnapshot: string;

    test.beforeEach(async () => {
        test.skip(
            !deployConfig.figaroCore || deployConfig.figaroCore.length !== 42,
            'NEXT_PUBLIC_FIGARO_CORE not set — deploy contracts first',
        );
        testSnapshot = await evmSnapshot();
    });

    test.afterEach(async () => {
        if (testSnapshot) await evmRevert(testSnapshot);
    });

    test('browse → add to cart → place order → resolve', async ({ page }) => {
        // Navigate to the eats assembly as buyer
        await page.goto('/i/local-commerce?e2e=devnet', { waitUntil: 'load' });
        await page.getByTestId('role-btn-buyer').waitFor({ timeout: 30000 });

        // ── 1. Browse restaurants ──────────────────────────────────────
        const discovery = page.getByTestId('seller-discovery-module');
        await expect(discovery).toBeVisible({ timeout: 15000 });

        // Open Bob's Pizza menu (first restaurant card)
        await discovery.getByTestId('restaurant-card').first().click();
        await expect(discovery.getByTestId('btn-back-to-restaurants')).toBeVisible({ timeout: 5000 });

        // ── 2. Add item to cart ────────────────────────────────────────
        await discovery.getByTestId('btn-add-pizza1').click();

        const fab = page.getByTestId('cart-fab');
        await expect(fab).toBeVisible();

        // ── 3. Open cart and place order ───────────────────────────────
        await fab.click();

        const panel = page.getByTestId('cart-panel');
        await expect(panel).toBeVisible({ timeout: 5000 });

        // Verify item is in cart
        await expect(panel.getByTestId('cart-item-pizza1')).toBeVisible();

        // Go to fulfillment options (default mode is delivery, no address set)
        await panel.getByTestId('btn-add-delivery-details').click();

        // Switch to pickup mode (avoids delivery address requirement)
        await panel.getByTestId('btn-mode-pickup').click();

        // Confirm pickup → returns to cart with "Place Order" visible
        await panel.getByTestId('btn-confirm-delivery').click();

        // Place the order — in devnet mode, signAndBroadcast handles both
        // parties' signatures via Anvil's unlocked accounts
        await panel.getByTestId('btn-place-order-cart').click({ timeout: 30000 });

        // Cart should close after successful immediate broadcast
        await page.waitForFunction(
            () => !document.querySelector('[data-testid="cart-panel"]'),
            null,
            { timeout: 60000 },
        );

        // ── 4. Verify process appears in sidebar ──────────────────────
        await page.waitForSelector('[data-testid^="process-summary-"]', { timeout: 60000 });

        // Click the process to load the topology graph
        const processCard = page.locator('[data-testid^="process-summary-"]').first();
        await processCard.click();

        // Wait for order node to render in the topology
        await page.waitForFunction(
            () => document.querySelectorAll('[data-testid^="topo-node-"]').length > 0,
            null,
            { timeout: 30000 },
        );

        // Verify the order is Active (dual-signed at commit)
        const orderNode = page.locator('[data-testid^="topo-node-"]').first();
        await expect(orderNode).toHaveAttribute('data-order-state', 'active', { timeout: 15000 });

        // ── 5. Resolve the process ────────────────────────────────────
        const resolveBtn = page.getByTestId('btn-resolve-process');
        await resolveBtn.waitFor({ timeout: 10000 });
        await resolveBtn.click();

        // ── 6. Verify settlement ──────────────────────────────────────
        await expect(orderNode).toHaveAttribute('data-order-state', 'resolved', { timeout: 60000 });
    });
});
