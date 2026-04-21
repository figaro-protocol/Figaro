import { Page } from '@playwright/test';
import { test, expect } from './devnet-multi-test';
import { evmRevert, evmSnapshot, seedUnreportedProcessScenario, seedGhgDisclosureScenario } from './devnet-helpers';
import { gotoHome } from './test-helpers';

async function selectProcess(page: Page, processId: string) {
    await page.waitForFunction(
        () => typeof (window as typeof window & {
            __FIGARO_SET_VIEWED_PROCESS_ID__?: (id: string | null) => void;
        }).__FIGARO_SET_VIEWED_PROCESS_ID__ === 'function',
        null,
        { timeout: 60000 }
    );

    await page.evaluate((nextProcessId: string) => {
        const devnetWindow = window as typeof window & {
            __FIGARO_SET_VIEWED_PROCESS_ID__?: (id: string | null) => void;
        };
        devnetWindow.__FIGARO_SET_VIEWED_PROCESS_ID__?.(nextProcessId);
    }, processId);
}

// ── EVM snapshot/revert: isolate this file's on-chain state ──────────────────
let chainSnapshot: string;
test.beforeAll(async () => { chainSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (chainSnapshot) await evmRevert(chainSnapshot); });

// GHG workflow uses AttestationCoordinator attestations.
// The workflow panel shows per-order attestation detail with commitment submit and actual emissions input.
test.describe('GHG workflow panel (devnet)', () => {
    test.setTimeout(240000);

    test('unreported process shows empty workflow state', async ({ page }) => {
        const seeded = await seedUnreportedProcessScenario();

        await gotoHome(page, { devnet: true });
        await selectProcess(page, seeded.processId);
        await expect(page.getByTestId(`order-node-${seeded.rootOrderHash}`)).toBeVisible({ timeout: 30000 });

        // Workflow panel should show zero-state dashboard
        const workflow = page.getByTestId('ghg-workflow-panel');
        await expect(workflow).toContainText('GHG Disclosure Workflow');
        await expect(workflow).toContainText(/0\s*total/, { timeout: 15000 });
    });

    test('seeded process shows attestation data in workflow panel', async ({ page }) => {
        const seeded = await seedGhgDisclosureScenario();

        await gotoHome(page, { devnet: true });
        await selectProcess(page, seeded.processId);
        await expect(page.getByTestId(`order-node-${seeded.rootOrderHash}`)).toBeVisible({ timeout: 30000 });

        // Workflow panel should show the seeded attestation summary
        const workflow = page.getByTestId('ghg-workflow-panel');
        await expect(workflow).toContainText('GHG Disclosure Workflow');

        // Summary grid: 1 attestation (supplier inventory)
        await expect(workflow).toContainText('total', { timeout: 15000 });
        await expect(workflow).toContainText('inventories');

        // Total emissions should show the seeded grams
        await expect(workflow).toContainText('Total emissions inventory');
        await expect(workflow).toContainText('CO2e');

        // Per-order drill-down: supplier order should be listed
        await expect(workflow).toContainText('Orders with Attestations');
        await expect(workflow).toContainText(seeded.supplierOrderHash.slice(0, 14));
    });
});
