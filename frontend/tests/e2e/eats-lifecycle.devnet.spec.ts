/**
 * eats-lifecycle.devnet.spec.ts
 *
 * Delivery lifecycle test exercised through the assembly route /i/local-commerce.
 * This is the Prototype2-native equivalent of the Eats repo's
 * delivery-3party.devnet.spec.ts — proving that the assembly runtime can
 * render and drive the same 3-party workflow (buyer → restaurant → driver)
 * without hand-coded Eats page shells.
 *
 * The test creates the delivery scenario on-chain via viem helpers,
 * then verifies the assembly UI correctly reflects state and allows
 * lifecycle interactions through module test IDs.
 *
 * Accounts:
 *   [0] BUYER      0xf39F…2266
 *   [1] RESTAURANT 0x7099…79C8
 *   [2] DRIVER     0x3C44…93BC
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

// ── Assembly route helpers ───────────────────────────────────────────────────

async function gotoAssemblyDevnet(page: import('@playwright/test').Page) {
    await page.goto('/i/local-commerce?e2e=devnet', { waitUntil: 'load' });
    // Wait for runtime-specific shell controls rather than the first page h1,
    // because the global header also renders an h1 before the assembly shell hydrates.
    await page.getByTestId('role-btn-buyer').waitFor({ timeout: 30000 });
}

async function switchToRole(page: import('@playwright/test').Page, role: string) {
    const roleButton = page.getByTestId(`role-btn-${role}`);
    if (await roleButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await roleButton.click();
        await page.waitForTimeout(500);
    }
}

/** Wait for a process summary card to appear, then click it to load the graph. */
async function selectProcessInAssembly(page: import('@playwright/test').Page, processId: string) {
    const card = page.getByTestId(`process-summary-${processId}`);
    await card.waitFor({ timeout: 60000 });
    await card.click();
    // Wait for the topology to render at least one order node
    await page.waitForFunction(
        () => document.querySelectorAll('[data-testid^="topo-node-"]').length > 0,
        null,
        { timeout: 30000 },
    );
}

/** Assembly-page version of resolveVisibleProcess (uses topo-node-* testids). */
async function resolveProcessInAssembly(page: import('@playwright/test').Page) {
    // executeTransactionCapability calls window.confirm before the resolve tx;
    // Playwright auto-dismisses unless we accept first.
    page.once('dialog', (dialog) => { dialog.accept().catch(() => {}); });

    const btn = page.getByTestId('btn-resolve-process');
    await btn.waitFor({ timeout: 10000 });
    await btn.click();
    await page.waitForFunction(
        () => {
            const nodes = Array.from(document.querySelectorAll('[data-testid^="topo-node-"]'));
            return nodes.length > 0 && nodes.every((node) => node.getAttribute('data-order-state') === 'resolved');
        },
        null,
        { timeout: 60000 },
    );
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

        // Navigate to assembly and verify both orders are still Active
        // (lifecycle signals are attestations, they don't change order state)
        await gotoAssemblyDevnet(page);

        await selectProcessInAssembly(page, scenario.processId);

        const foodId = scenario.foodOrderHash;
        const foodNode = page.getByTestId(`topo-node-${foodId}`);
        await expect(foodNode).toHaveAttribute('data-order-state', 'active', { timeout: 15000 });

        // Buyer resolves the whole process
        await resolveProcessInAssembly(page);

        await expect(foodNode).toHaveAttribute('data-order-state', 'resolved', { timeout: 30000 });
    });

    // Note: 'UI-driven delivery' single-order + diamond tests removed —
    // those lifecycle paths are covered by lifecycle.devnet.spec.ts which
    // exercises the same commit/resolve and 4-seller-diamond flows. The
    // assembly route's own UI is exercised by mock + viem-seeded tests in
    // this file.
});

test.describe('Auction module visibility (devnet)', () => {
    test.setTimeout(300_000);

    let testSnapshot: string;

    test.beforeEach(async () => {
        test.skip(
            !DUTCH_AUCTION || DUTCH_AUCTION.length !== 42,
            'NEXT_PUBLIC_DUTCH_AUCTION not set',
        );

        testSnapshot = await evmSnapshot();
    });

    test.afterEach(async () => {
        if (testSnapshot) await evmRevert(testSnapshot);
    });

    test('courier role surfaces the job-market module after seeding', async ({ page }) => {
        await seedDeliveryScenario();

        await gotoAssemblyDevnet(page);
        await switchToRole(page, 'courier');

        // The courier-view binds the job-market module — that is the courier-
        // facing surface for live auctions in this assembly. Verifying the
        // module renders proves role-scoped module selection is wired up
        // post-rename. (The auction card itself depends on DutchAuction event
        // indexing latency that's covered separately by mock specs.)
        const jobMarket = page.getByTestId('job-market-module');
        await expect(jobMarket).toBeVisible({ timeout: 30000 });
    });
});
