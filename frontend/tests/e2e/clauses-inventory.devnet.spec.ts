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
 * registers the reference clauses.
 *
 * Requires Anvil + ./deploy-local.sh (which registers the reference
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
        const liveIds = [...new Set(
            registered
                .map((e) => (e.args as { clauseId?: string }).clauseId)
                .filter((id): id is string => typeof id === 'string' && id.length > 0),
        )];
        expect(liveIds.length, 'the deploy registered clauses on-chain').toBeGreaterThan(0);

        await page.goto('/clauses');

        // The count line is ClauseInventory's resolved-state proof.
        await expect(page.getByText(new RegExp(`${liveIds.length} clauses are registered`))).toBeVisible({
            timeout: 15_000,
        });

        // EVERY on-chain clause renders a row — the expected set is DISCOVERED
        // from ClauseRegistered events, never a hand-written roster (a roster
        // rots on every clause rename and can't see novel registrations).
        // Row id pattern is `#clause-<clauseId>` per ClauseInventory.
        for (const clauseId of liveIds) {
            await expect(page.locator(`#clause-${clauseId}`),
                `on-chain clause "${clauseId}" renders in the inventory`).toBeVisible();
        }
    });
});
