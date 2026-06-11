/**
 * clauses-inventory.devnet.spec.ts
 *
 * Smoke for the marketing `/clauses` inventory. The page reads
 * `ClauseRegistry.ClauseRegistered` events through the standalone viem
 * `publicClient` and pairs each on-chain hash with its bundled content
 * (`clauseSpecSource.ts`, grouped by article) by `keccak256(clauseId)`.
 * Render passes through `ClauseInventory` (a client component embedded in
 * the server page).
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
import { CLAUSE_REGISTRY_ABI } from '@figaro/core';
import { localPublicClient, readLocalDeploymentConfig } from './devnet-helpers';

test.describe('Clauses marketing inventory (devnet)', () => {
    test('renders the on-chain registered clause set, grouped by article', async ({ page }) => {
        // The page must show EXACTLY what the chain holds — read the live
        // registered-clause count from ClauseRegistered events (the network is
        // the source of truth; the count grows when specs register novel
        // clauses, so a hardcoded figure is wrong on any non-fresh chain).
        const publicClient = localPublicClient();
        const registry = (process.env.NEXT_PUBLIC_CLAUSE_REGISTRY
            ?? readLocalDeploymentConfig().clauseRegistry) as `0x${string}`;
        const registered = await publicClient.getContractEvents({
            address: registry, abi: CLAUSE_REGISTRY_ABI, eventName: 'ClauseRegistered', fromBlock: 0n,
        });
        const liveCount = new Set(registered.map((e) => (e.args as { clauseId?: string }).clauseId)).size;

        await page.goto('/clauses');

        // The count line is ClauseInventory's resolved-state proof.
        await expect(page.getByText(new RegExp(`${liveCount} clauses are registered`))).toBeVisible({
            timeout: 15_000,
        });

        // A handful of specific row ids confirm the inventory rendered
        // actual entries from the on-chain set, not just the header line.
        // Row id pattern is `#clause-<clauseId>` per ClauseInventory.
        await expect(page.locator('#clause-figaro-commerce-v1')).toBeVisible();
        await expect(page.locator('#clause-figaro-modalities-v1')).toBeVisible();
        await expect(page.locator('#clause-figaro-coordination-v1')).toBeVisible();
        await expect(page.locator('#clause-figaro-arbitration-kleros-v1')).toBeVisible();
        await expect(page.locator('#clause-figaro-applicable-law-v1')).toBeVisible();
        await expect(page.locator('#clause-figaro-topology-v1')).toBeVisible();
    });
});
