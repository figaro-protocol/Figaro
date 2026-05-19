/**
 * delivery-lifecycle.devnet.spec.ts
 *
 * Delivery lifecycle test exercised through the consumer-facing per-order
 * page at `/orders/[processId]`. Pre-2026-05 these tests targeted the
 * `/i/local-commerce` assembly runtime (now deleted) and asserted on
 * `topo-node-*` testids inside the runtime's process graph; the runtime
 * was a builder/debug surface, not a buyer surface, so the tests were
 * pointing at the wrong layer. The on-chain logic (commit, attest,
 * resolve) is unchanged — only the page that drives the resolve is
 * different.
 *
 * The scenario uses three Anvil accounts in distinct participant
 * roles ("buyer", "restaurant", "driver"). These are scenario labels —
 * the kernel sees ordinary wallets and ordinary commits; nothing
 * about "restaurant" or "driver" is reified into the protocol.
 *
 * Accounts:
 *   [0] buyer-wallet      0xf39F…2266
 *   [1] restaurant-wallet 0x7099…79C8
 *   [2] driver-wallet     0x3C44…93BC
 *
 * Requires: Anvil running + all contracts deployed (core + mechanisms)
 *   NEXT_PUBLIC_DUTCH_AUCTION and NEXT_PUBLIC_ATTESTATION_COORDINATOR
 *   must be set in .env.local
 */
import { expect } from '@playwright/test';
import { test, ANVIL_ACCOUNTS, switchAccount } from './devnet-multi-test';
import {
    assertOrderActive,
    driverClaimJob,
    evmRevert,
    evmSnapshot,
    getNodeIds,
    readLocalDeploymentConfig,
    resolveVisibleProcess,
    seedDeliveryScenario,
    selectProcessForOrder,
    sendLifecycleSignal,
    restaurantPrepSignals,
    waitAndApproveIfNeeded,
    waitForCreateConfirm,
    waitForWalletReady,
} from './devnet-helpers';
import {
    gotoHome,
    fillCreateOrderForm,
    submitFirstOrder,
    openSubOrderModal,
    fillSubOrderModal,
    submitSubOrder,
} from './test-helpers';

const BUYER = ANVIL_ACCOUNTS[0];
const RESTAURANT = ANVIL_ACCOUNTS[1];
const DRIVER = ANVIL_ACCOUNTS[2];

const LOCATION = 'u4pruydqqvj';

// Read deployment addresses from .env.local (process.env is not populated in Playwright)
const deployConfig = readLocalDeploymentConfig();
const DUTCH_AUCTION = deployConfig.dutchAuction ?? '';
const ATTESTATION_COORDINATOR = deployConfig.attestationCoordinator ?? '';

// ── EVM snapshot/revert: isolate this file's on-chain state ──────────────────
// Without this, orders created here persist for subsequent test files and can
// cause UI pollution (extra processes in the sidebar, slower state polling).

let chainSnapshot: string;

test.beforeAll(async () => {
    chainSnapshot = await evmSnapshot();
});

test.afterAll(async () => {
    if (chainSnapshot) await evmRevert(chainSnapshot);
});

// ── Per-order page helpers ───────────────────────────────────────────────────

/**
 * Navigate to `/orders/<processId>?e2e=devnet` (the buyer's per-order
 * surface) and wait for the timeline view to render. Replaces the prior
 * `gotoAssemblyDevnet` + `selectProcessInAssembly` flow which involved
 * landing on the assembly runtime, finding the process summary card in
 * the sidebar, clicking it, and waiting for the process graph to render.
 */
async function gotoOrderDevnet(page: import('@playwright/test').Page, processId: string) {
    await page.goto(`/orders/${processId}?e2e=devnet`, { waitUntil: 'load' });
    await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
}

/**
 * Buyer confirms receipt via the consumer-facing `Confirm receipt` button
 * (which fires `resolveProcess` under the hood). Replaces the assembly-page
 * resolve flow that used the kernel-shaped `btn-resolve-process` capability
 * card. The timeline transitions to the green "Completed" state.
 */
async function confirmReceiptAtOrder(page: import('@playwright/test').Page) {
    // /orders/<processId>'s `Confirm receipt` action fires TWO sequential
    // `window.confirm` dialogs: first from `handleConfirmReceipt` in
    // `OrderTimelineView.tsx`, then from `executeTransactionCapability`'s
    // own resolve-process guard (`executeTransactionCapability.ts:59`).
    // `page.once` only catches the first; a `page.on` handler accepts
    // both. The `/terminal` resolve path only has the second dialog,
    // which is why `resolveVisibleProcess` in devnet-helpers.ts can use
    // `page.once`.
    const acceptDialog = (dialog: import('@playwright/test').Dialog) => {
        dialog.accept().catch(() => {});
    };
    page.on('dialog', acceptDialog);

    try {
        const btn = page.getByTestId('btn-confirm-receipt');
        await btn.waitFor({ timeout: 30000 });
        await btn.click();

        // Wait for the status pill to flip from "In progress" / "Handed off" /
        // etc. to "Completed". The pill text is the canonical consumer signal;
        // OrderState transitions to Resolved drive it.
        await expect(page.getByTestId('order-status-pill')).toHaveText('Completed', { timeout: 60000 });
    } finally {
        page.off('dialog', acceptDialog);
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Delivery lifecycle via assembly (devnet)', () => {
    test.setTimeout(600_000);

    let testSnapshot: string;

    test.beforeEach(async () => {
        test.skip(
            !DUTCH_AUCTION || DUTCH_AUCTION.length !== 42,
            'NEXT_PUBLIC_DUTCH_AUCTION not set — deploy mechanisms first',
        );
        test.skip(
            !ATTESTATION_COORDINATOR || ATTESTATION_COORDINATOR.length !== 42,
            'NEXT_PUBLIC_ATTESTATION_COORDINATOR not set — deploy mechanisms first',
        );

        testSnapshot = await evmSnapshot();
    });

    test.afterEach(async () => {
        if (testSnapshot) await evmRevert(testSnapshot);
    });

    // Note: 'viem-seeded delivery: order nodes appear in assembly graph' was
    // removed — superset coverage is in the 'driver lifecycle signals complete
    // the flow' test below, which seeds the same scenario plus exercises the
    // attestation pipeline + resolve.

    test('viem-seeded delivery: driver lifecycle signals complete the flow', async ({ page }) => {
        const scenario = await seedDeliveryScenario();

        // Driver claims the auction job
        await driverClaimJob(scenario.deliveryOrderHash);

        // Restaurant sends prep signals via AttestationCoordinator
        await restaurantPrepSignals(scenario.foodOrderHash, scenario.deliveryOrderHash);

        // Driver sends lifecycle signals via AttestationCoordinator
        await sendLifecycleSignal('declareEnRoute', scenario.deliveryOrderHash);
        await sendLifecycleSignal('declarePickedUp', scenario.deliveryOrderHash);
        await sendLifecycleSignal('declareDelivered', scenario.deliveryOrderHash);

        // Buyer navigates to their per-order page and verifies the order is
        // still in progress before resolving (lifecycle signals are
        // attestations — they don't flip kernel order state on their own).
        await gotoOrderDevnet(page, scenario.processId);
        await expect(page.getByTestId('order-status-pill')).not.toHaveText('Completed', { timeout: 15000 });

        // Buyer confirms receipt → resolveProcess fires → status pill flips
        // to "Completed" once the receipt confirms.
        await confirmReceiptAtOrder(page);
    });

    // Note: 'UI-driven delivery' single-order + diamond tests removed —
    // those lifecycle paths are covered by lifecycle.devnet.spec.ts which
    // exercises the same commit/resolve and 4-seller-diamond flows. The
    // assembly route's own UI is exercised by mock + viem-seeded tests in
    // this file.
});

// Removed 2026-05: 'courier role surfaces the job-market module' test
// targeted the assembly-runtime role-switcher, which no longer exists. A
// courier-facing surface (e.g. /jobs or per-courier dashboard) is on the
// backlog; restore an equivalent test once that page lands.
