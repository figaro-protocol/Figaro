import { Page } from '@playwright/test';
import { test, expect } from './devnet-multi-test';
import { evmRevert, evmSnapshot, seedUnreportedProcessScenario, seedGhgDisclosureScenario } from './devnet-helpers';
import { gotoHome, switchToGraphTab } from './test-helpers';

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

    // Note: 'unreported process shows empty workflow state' removed —
    // empty-state rendering is covered by mock + component tests; the
    // seeded-state test below is the on-chain-unique value.

    test('seeded process shows attestation data in workflow panel', async ({ page }) => {
        const seeded = await seedGhgDisclosureScenario();

        await gotoHome(page, { devnet: true });
        await selectProcess(page, seeded.processId);

        // order-node-* renders on the Graph tab; switch there to verify the
        // process loaded.
        await switchToGraphTab(page);
        await expect(page.getByTestId(`order-node-${seeded.rootOrderHash}`)).toBeVisible({ timeout: 30000 });

        // GHGWorkflowPanel renders on the Stats tab.
        await page.getByRole('tab', { name: 'Protocol' }).click();
        const workflow = page.getByTestId('ghg-workflow-panel');
        await expect(workflow).toContainText('GHG Disclosure Workflow', { timeout: 15000 });

        // Per-order drill-down: supplier order should be listed.
        await expect(workflow).toContainText('Orders with Attestations');
        await expect(workflow).toContainText(seeded.supplierOrderHash.slice(0, 14));
    });
});
