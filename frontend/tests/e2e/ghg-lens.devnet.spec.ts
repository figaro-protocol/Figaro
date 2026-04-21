import { test, expect } from './devnet-test';
import {
    evmRevert,
    evmSnapshot,
    seedClosedCompleteGhgDisclosureScenario,
    seedGhgDisclosureScenario,
    seedSupersededGhgDisclosureScenario,
} from './devnet-helpers';

async function openDevnetHome(page: import('@playwright/test').Page) {
    let lastNavigationError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            await page.goto('/workbench?e2e=devnet', {
                waitUntil: 'domcontentloaded',
                timeout: 60000,
            });
            lastNavigationError = undefined;
            break;
        } catch (error) {
            lastNavigationError = error;
            await page.waitForTimeout(2000);
        }
    }

    if (lastNavigationError) {
        throw lastNavigationError;
    }

    await page.getByTestId('create-order-heading').waitFor({ timeout: 15000 });
}

// ── EVM snapshot/revert: isolate this file's on-chain state ──────────────────
let chainSnapshot: string;
test.beforeAll(async () => { chainSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (chainSnapshot) await evmRevert(chainSnapshot); });

// GHG tests use AttestationCoordinator's event-sourced attestation model.
// Seeding emits Attestation events; UI reconstructs state from logs.
test.describe('Order graph GHG lens (devnet)', () => {
    test.setTimeout(120000);

    test('renders seeded attestation summary in the GHG anchor panel', async ({ page }) => {
        const seeded = await seedGhgDisclosureScenario();
        await openDevnetHome(page);
        await page.waitForFunction(
            () => typeof (window as typeof window & {
                __FIGARO_SET_VIEWED_PROCESS_ID__?: (id: string | null) => void;
            }).__FIGARO_SET_VIEWED_PROCESS_ID__ === 'function',
            null,
            { timeout: 60000 }
        );
        await page.evaluate((processId) => {
            const devnetWindow = window as typeof window & {
                __FIGARO_SET_VIEWED_PROCESS_ID__?: (id: string | null) => void;
            };
            devnetWindow.__FIGARO_SET_VIEWED_PROCESS_ID__?.(processId);
        }, seeded.processId);
        await expect(page.getByTestId(`order-node-${seeded.rootOrderHash}`)).toBeVisible({ timeout: 30000 });

        // GHG Anchor Panel: should show 1 attestation (supplier inventory)
        const anchorPanel = page.getByTestId('ghg-anchor-panel');
        await expect(anchorPanel).toContainText('GHG Schema Anchors');
        await expect(anchorPanel).toContainText('figaro-ghg-disclosure-v1');

        // Summary grid: 1 attestation, 0 commitments, 1 inventory
        await expect(anchorPanel).toContainText('1', { timeout: 15000 });
        await expect(anchorPanel).toContainText('attestations');
        await expect(anchorPanel).toContainText('inventories');

        // Recent attestation should show "Inventory" label
        await expect(anchorPanel).toContainText('Inventory');
        await expect(anchorPanel).toContainText(seeded.supplierOrderHash.slice(0, 10));
    });

    test('renders updated attestation after a supplier inventory is superseded', async ({ page }) => {
        const superseded = await seedSupersededGhgDisclosureScenario();
        await openDevnetHome(page);
        await page.waitForFunction(
            () => typeof (window as typeof window & {
                __FIGARO_SET_VIEWED_PROCESS_ID__?: (id: string | null) => void;
            }).__FIGARO_SET_VIEWED_PROCESS_ID__ === 'function',
            null,
            { timeout: 60000 }
        );
        await page.evaluate((processId) => {
            const devnetWindow = window as typeof window & {
                __FIGARO_SET_VIEWED_PROCESS_ID__?: (id: string | null) => void;
            };
            devnetWindow.__FIGARO_SET_VIEWED_PROCESS_ID__?.(processId);
        }, superseded.processId);
        await expect(page.getByTestId(`order-node-${superseded.supplierOrderHash}`)).toBeVisible({ timeout: 30000 });

        // Anchor panel: 2 attestations (initial + superseding inventory)
        const anchorPanel = page.getByTestId('ghg-anchor-panel');
        await expect(anchorPanel).toContainText('2', { timeout: 15000 });
        await expect(anchorPanel).toContainText('attestations');
        await expect(anchorPanel).toContainText('inventories');
    });

    test('renders complete attestation state when both commitment and inventory are submitted', async ({ page }) => {
        const complete = await seedClosedCompleteGhgDisclosureScenario();
        await openDevnetHome(page);
        await page.waitForFunction(
            () => typeof (window as typeof window & {
                __FIGARO_SET_VIEWED_PROCESS_ID__?: (id: string | null) => void;
            }).__FIGARO_SET_VIEWED_PROCESS_ID__ === 'function',
            null,
            { timeout: 60000 }
        );
        await page.evaluate((processId) => {
            const devnetWindow = window as typeof window & {
                __FIGARO_SET_VIEWED_PROCESS_ID__?: (id: string | null) => void;
            };
            devnetWindow.__FIGARO_SET_VIEWED_PROCESS_ID__?.(processId);
        }, complete.processId);
        await expect(page.getByTestId(`order-node-${complete.rootOrderHash}`)).toBeVisible({ timeout: 30000 });

        // Anchor panel: 2 attestations (1 commitment + 1 inventory), across 2 orders
        const anchorPanel = page.getByTestId('ghg-anchor-panel');
        await expect(anchorPanel).toContainText('2', { timeout: 15000 });
        await expect(anchorPanel).toContainText('attestations');
        await expect(anchorPanel).toContainText('commitments');
        await expect(anchorPanel).toContainText('inventories');

        // Total actual emissions should be visible
        await expect(anchorPanel).toContainText('Total actual emissions');
        await expect(anchorPanel).toContainText('CO2e');

        // Both Commitment and Inventory labels in recent attestations
        await expect(anchorPanel).toContainText('Commitment');
        await expect(anchorPanel).toContainText('Inventory');
    });
});