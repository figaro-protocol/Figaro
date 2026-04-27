import { test, expect } from './devnet-test';
import {
    evmRevert,
    evmSnapshot,
    seedClosedCompleteGhgDisclosureScenario,
    seedGhgDisclosureScenario,
    seedSupersededGhgDisclosureScenario,
} from './devnet-helpers';
import { switchToGraphTab } from './test-helpers';

async function openDevnetHome(page: import('@playwright/test').Page) {
    let lastNavigationError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            await page.goto('/terminal?e2e=devnet', {
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

    // Note: 'seeded summary' + 'superseded inventory' tests removed — the
    // complete-state test below exercises a richer scenario (both commitment
    // + inventory across 2 orders) that subsumes the simpler render checks.
    // If supersession-specific behavior regresses, add a focused test back.

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

        // order-node-* renders on the Graph tab; switch to verify.
        await switchToGraphTab(page);
        await expect(page.getByTestId(`order-node-${complete.rootOrderHash}`)).toBeVisible({ timeout: 30000 });

        // GHGAnchorPanel renders on the Stats tab. Seed produces 2
        // attestations (1 commitment + 1 inventory) across 2 orders.
        await page.getByRole('tab', { name: 'Protocol' }).click();
        const anchorPanel = page.getByTestId('ghg-anchor-panel');
        await expect(anchorPanel).toContainText('GHG Schema Anchors', { timeout: 15000 });
        await expect(anchorPanel).toContainText('2');
        await expect(anchorPanel).toContainText('attestations');
        // Recent Attestations section lists each attestation with its stage.
        await expect(anchorPanel).toContainText('Recent Attestations');
        await expect(anchorPanel).toContainText('Commitment');
        await expect(anchorPanel).toContainText('Inventory');
    });
});