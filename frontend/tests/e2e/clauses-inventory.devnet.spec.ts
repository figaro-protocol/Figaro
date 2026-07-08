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
        // Read the live registered-clause set from ClauseRegistered events (the
        // network is the source of truth; the set grows when specs register novel
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

        // Smoke, not an exact-count reconciliation. The page reads ClauseRegistered
        // → IPFS live and SURFACES a subset of the raw events: it DE-SURFACES
        // withdrawn clauses (K4 staked-intent — a withdrawn deposit hides the
        // clause) and resolves specs ASYNCHRONOUSLY. So the raw event count
        // (`liveIds`) over-counts what renders on any shared/non-fresh chain — an
        // exact-count assertion is what made this spec brittle. Instead: prove the
        // event read resolved, and that every surfaced row is a real registration.
        // Wait for the FIRST clause row to render — this alone proves the event read
        // resolved (not stuck on "Reading the registry…") and clauses surfaced (not the
        // empty state). Rows are `<li id="clause-<clauseId>">`. (Waiting on the count-line
        // TEXT instead races: static prose matches before the async rows arrive.)
        const rows = page.locator('li[id^="clause-"]');
        await rows.first().waitFor({ state: 'visible', timeout: 30_000 });

        // Every surfaced row is a real on-chain registration — the set is DISCOVERED
        // from ClauseRegistered events (never a hand-written roster), and the page
        // shows nothing the chain does not hold.
        const onChain = new Set(liveIds);
        const renderedIds = await rows.evaluateAll((els) => els.map((e) => e.id.replace(/^clause-/, '')));
        expect(renderedIds.length, 'the registered clauses render as rows, grouped by article').toBeGreaterThan(0);
        for (const id of renderedIds) {
            expect(onChain.has(id), `surfaced clause "${id}" is registered on-chain`).toBe(true);
        }
    });
});
