/**
 * clauses-inventory.devnet.spec.ts
 *
 * Smoke for the marketing `/clauses` inventory. The page reads
 * `ClauseRegistry.ClauseRegistered` events through the standalone viem
 * `publicClient` and pairs each on-chain hash with its bundled content
 * (`clauseCategories.ts`) by `keccak256(clauseId)`. Render passes
 * through `ClauseInventory` (a client component embedded in the server
 * page).
 *
 * Smoke, not a scenario: the navigation is the action, the rendered
 * inventory is the reaction. The failure mode it catches is the
 * marketing-tier event read breaking — either stuck on
 * "Reading the registry…" or rendering an empty state on a deploy that
 * registers all 17 reference clauses.
 *
 * Requires Anvil + ./deploy-local.sh (which registers the 17 reference
 * clauses via `Deploy.s.sol`).
 */
import { test, expect } from '@playwright/test';

test.describe('Clauses marketing inventory (devnet)', () => {
    test('renders the on-chain registered clause set, grouped by family', async ({ page }) => {
        await page.goto('/clauses');

        // The count line is ClauseInventory's resolved-state proof.
        // Deploy.s.sol registers all 18 reference clauses, so liveKnown=18.
        await expect(page.getByText(/18 clauses are registered/)).toBeVisible({
            timeout: 15_000,
        });

        // A handful of specific row ids confirm the inventory rendered
        // actual entries from the on-chain set, not just the header line.
        // Row id pattern is `#clause-<clauseId>` per ClauseInventory.
        await expect(page.locator('#clause-figaro-commerce-v1')).toBeVisible();
        await expect(page.locator('#clause-figaro-fulfilment-v2')).toBeVisible();
        await expect(page.locator('#clause-figaro-arbitration-kleros-v1')).toBeVisible();
        await expect(page.locator('#clause-figaro-applicable-law-v1')).toBeVisible();
        await expect(page.locator('#clause-figaro-topology-v1')).toBeVisible();
    });
});
