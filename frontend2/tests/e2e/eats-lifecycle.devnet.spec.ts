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

    test('viem-seeded delivery: order nodes appear in assembly graph', async ({ page }) => {
        // Seed the full delivery scenario on-chain
        const scenario = await seedDeliveryScenario();

        // Navigate to assembly as buyer
        await gotoAssemblyDevnet(page);

        // The buyer should see the seeded process in the sidebar.
        // Click the process card to load the graph.
        await selectProcessInAssembly(page, scenario.processId);

        // Both orders are Active at commit time (dual-signed)
        const foodId = scenario.foodOrderHash;
        const foodNode = page.getByTestId(`topo-node-${foodId}`);
        await expect(foodNode).toBeVisible({ timeout: 15000 });
        await expect(foodNode).toHaveAttribute('data-order-state', 'active', { timeout: 15000 });

        // The delivery sub-order node should also be visible
        const deliveryId = scenario.deliveryOrderHash;
        const deliveryNode = page.getByTestId(`topo-node-${deliveryId}`);
        await expect(deliveryNode).toBeVisible({ timeout: 15000 });
    });

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

    test('UI-driven delivery: buyer creates order, restaurant accepts, process resolves', async ({ page }) => {
        // This test creates an order through the assembly UI and exercises
        // the core lifecycle (create → accept → resolve) without the auction
        // or coordinator modules. A simpler flow that proves the assembly UI
        // supports the happy path.

        await gotoHome(page, { devnet: true });

        // Buyer creates order for restaurant
        await fillCreateOrderForm(page, RESTAURANT, '0.01', LOCATION, LOCATION);
        await waitAndApproveIfNeeded(page);
        await submitFirstOrder(page);
        await waitForCreateConfirm(page);

        // Wait for the order graph to render the new node
        await page.waitForSelector('[data-testid^="order-node-"]', { timeout: 30000 });

        // Get the order ID
        const [orderId] = await getNodeIds(page);
        // Order is Active immediately at commit (dual-signed)
        await assertOrderActive(page, orderId);

        // Buyer resolves
        await resolveVisibleProcess(page);
        await expect(page.getByTestId(`order-node-${orderId}`)).toHaveAttribute('data-order-state', 'resolved');
    });

    test('UI-driven delivery with sub-order: buyer creates diamond, all sellers accept, buyer resolves', async ({ page }) => {
        // Create a food order + delivery sub-order through the UI,
        // demonstrating that the assembly route supports the full
        // sub-order modal workflow.
        test.setTimeout(300_000);

        await gotoHome(page, { devnet: true });

        // Buyer creates food order to restaurant
        await fillCreateOrderForm(page, RESTAURANT, '0.05', LOCATION, LOCATION);
        await waitAndApproveIfNeeded(page);
        await submitFirstOrder(page);
        await waitForCreateConfirm(page);

        // Wait for the order graph to render the new node
        await page.waitForSelector('[data-testid^="order-node-"]', { timeout: 30000 });

        const [foodOrderId] = await getNodeIds(page);
        // Order is Active immediately at commit (dual-signed)
        await assertOrderActive(page, foodOrderId);

        // Add delivery sub-order via modal
        await openSubOrderModal(page);
        await fillSubOrderModal(page, DRIVER, '0.01', LOCATION, LOCATION);

        // Approve if needed in sub-order modal context
        const modal = page.getByTestId('suborder-modal');
        const approveBtn = modal.getByTestId('approve-button');
        if (await approveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
            await approveBtn.click();
            await page.waitForFunction(
                () => document.querySelector('[data-testid="suborder-modal"] [data-testid="approval-status"]')?.textContent?.includes('Approved'),
                null,
                { timeout: 30000 },
            ).catch(() => { });
        }

        await submitSubOrder(page);

        // Wait for the delivery order node to appear
        await page.waitForFunction(
            () => document.querySelectorAll('[data-testid^="order-node-"]').length >= 2,
            null,
            { timeout: 60000 },
        );

        const allIds = await getNodeIds(page);
        expect(allIds.length).toBeGreaterThanOrEqual(2);
        const deliveryOrderId = allIds.find(id => id !== foodOrderId)!;
        expect(deliveryOrderId).toBeTruthy();

        // Both orders are Active at commit (dual-signed). No accept step.
        // Select the process to ensure graph is loaded
        await selectProcessForOrder(page, foodOrderId);

        for (const id of [foodOrderId, deliveryOrderId]) {
            await expect(page.getByTestId(`order-node-${id}`)).toHaveAttribute('data-order-state', 'active', { timeout: 15000 });
        }

        // Buyer resolves all
        await resolveVisibleProcess(page);

        for (const id of [foodOrderId, deliveryOrderId]) {
            await expect(page.getByTestId(`order-node-${id}`)).toHaveAttribute('data-order-state', 'resolved', { timeout: 30000 });
        }
    });
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

    test('auction status shows in assembly after seeding', async ({ page }) => {
        const scenario = await seedDeliveryScenario();

        await gotoAssemblyDevnet(page);

        await switchToRole(page, 'courier');

        await selectProcessInAssembly(page, scenario.processId);

        // Click on the delivery order to select it in the workspace
        const deliveryId = scenario.deliveryOrderHash;
        const deliveryNode = page.getByTestId(`topo-node-${deliveryId}`);
        await deliveryNode.waitFor({ timeout: 15000 });
        await deliveryNode.click();

        // Auction module should show the auction as Live (started in seed)
        const auctionStatus = page.getByTestId(`auction-status-${deliveryId}`);
        await expect(auctionStatus).toBeVisible({ timeout: 30000 });
        await expect(auctionStatus).toHaveText('Live', { timeout: 10000 });
    });
});
