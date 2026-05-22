/**
 * schemas-inventory.devnet.spec.ts
 *
 * Smoke for the marketing `/schemas` inventory. The page reads
 * `SchemaRegistry.SchemaRegistered` events through the standalone viem
 * `publicClient` and pairs each on-chain hash with its bundled content
 * (`schemaCategories.ts`) by `keccak256(schemaId)`. Render passes
 * through `SchemaInventory` (a client component embedded in the server
 * page).
 *
 * Smoke, not a scenario: the navigation is the action, the rendered
 * inventory is the reaction. The failure mode it catches is the
 * marketing-tier event read breaking — either stuck on
 * "Reading the registry…" or rendering an empty state on a deploy that
 * registers all 17 reference schemas.
 *
 * Requires Anvil + ./deploy-local.sh (which registers the 17 reference
 * schemas via `Deploy.s.sol`).
 */
import { test, expect } from '@playwright/test';

test.describe('Schemas marketing inventory (devnet)', () => {
    test('renders the on-chain registered schema set, grouped by family', async ({ page }) => {
        await page.goto('/schemas');

        // The count line is SchemaInventory's resolved-state proof.
        // Deploy.s.sol registers all 17 reference schemas, so liveKnown=17.
        await expect(page.getByText(/17 schemas are registered/)).toBeVisible({
            timeout: 15_000,
        });

        // A handful of specific row ids confirm the inventory rendered
        // actual entries from the on-chain set, not just the header line.
        // Row id pattern is `#schema-<schemaId>` per SchemaInventory.
        await expect(page.locator('#schema-figaro-commerce-v1')).toBeVisible();
        await expect(page.locator('#schema-figaro-fulfilment-v2')).toBeVisible();
        await expect(page.locator('#schema-figaro-jurisdiction-v1')).toBeVisible();
        await expect(page.locator('#schema-figaro-topology-v1')).toBeVisible();
    });
});
