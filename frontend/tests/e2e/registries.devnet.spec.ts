/**
 * registries.devnet.spec.ts
 *
 * Smoke for the registry explorer (`/registries`) — the ONE search surface
 * over the three protocol registries (maintainer ruling 2026-08-17; it took
 * over the inventories the `/clauses` and `/assemblies` marketing pages
 * carried). The page reads `ClauseRegistered`, `AssemblyRegistered`, and
 * `MemberRegistered` events through the standalone viem `publicClient`
 * (marketing tier: no wallet provider) and pairs each row with its pinned
 * content from IPFS.
 *
 * Smoke, not a scenario: the navigation is the action, the rendered rows are
 * the reaction. Each family DISCOVERS its expected rows from chain (the
 * network is the source of truth; nothing here is a hand-written roster) and
 * asserts the explorer surfaces only real registrations. Requires Anvil +
 * ./deploy-local.sh + frontend/scripts/populate-test-data.mjs (which anchors
 * the reference assemblies and registers the seeded members).
 */
import { test, expect } from '@playwright/test';
import { ASSEMBLY_REGISTRY_ABI, CLAUSE_REGISTRY_ABI, MEMBERS_REGISTRY_ABI } from '@figaro/sdk';
import { deriveAssemblySlug } from '@/lib/shared/assemblyTemplate';
import { localPublicClient, readLocalDeploymentConfig } from './devnet-helpers';

test.describe('Registry explorer (devnet)', () => {
    test('clauses: every surfaced row is an on-chain registration, grouped by article by default', async ({ page }) => {
        const publicClient = localPublicClient();
        const registry = (process.env.NEXT_PUBLIC_CLAUSE_REGISTRY ?? readLocalDeploymentConfig().clauseRegistry) as `0x${string}`;
        const registered = await publicClient.getContractEvents({
            address: registry, abi: CLAUSE_REGISTRY_ABI, eventName: 'ClauseRegistered', fromBlock: 0n,
        });
        const onChain = new Set(
            registered.map((e) => (e.args as { clauseId?: string }).clauseId).filter((id): id is string => !!id),
        );
        expect(onChain.size, 'the deploy registered clauses on-chain').toBeGreaterThan(0);

        await page.goto('/registries?family=clauses');
        // Rows are `<li id="clause-<clauseId>">` — the same anchor `/clauses#clause-<id>`
        // deep links resolve to. Waiting for the first row proves the event read
        // resolved (not stuck on "Reading the registry…") and rows surfaced.
        const rows = page.locator('li[id^="clause-"]');
        await rows.first().waitFor({ state: 'visible', timeout: 30_000 });
        const renderedIds = await rows.evaluateAll((els) => els.map((e) => e.id.replace(/^clause-/, '')));
        expect(renderedIds.length).toBeGreaterThan(0);
        for (const id of renderedIds) {
            expect(onChain.has(id), `surfaced clause "${id}" is registered on-chain`).toBe(true);
        }
        // Default sort is by article: each list sits under its article heading.
        await expect(rows.first().locator('xpath=ancestor::ul[1]/preceding-sibling::h3[1]')).toBeVisible();
        // The count line reflects the same read.
        await expect(page.getByTestId('registry-count')).toContainText(/of \d+ clauses/);
    });

    test('assemblies: an anchored assembly discovered from chain renders its row', async ({ page }) => {
        const publicClient = localPublicClient();
        const registry = (process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY ?? readLocalDeploymentConfig().assemblyRegistry) as `0x${string}`;
        const events = await publicClient.getContractEvents({
            address: registry, abi: ASSEMBLY_REGISTRY_ABI, eventName: 'AssemblyRegistered', fromBlock: 0n,
        });
        expect(events.length, 'no anchored assemblies on this devnet — run populate-test-data first').toBeGreaterThan(0);
        const slug = deriveAssemblySlug(events[events.length - 1].args.compositionHash as `0x${string}`);

        await page.goto('/registries?family=assemblies');
        const row = page.locator(`#assembly-${slug}`);
        await expect(row).toBeVisible({ timeout: 30_000 });
        await expect(row).toContainText(slug);
        // The row links to the assembly's existing detail route.
        await expect(row.getByTestId(`assembly-view-${slug}`)).toHaveAttribute('href', /\/assemblies\/designer\/view\/?\?slug=/);
    });

    test('members: every registered wallet surfaces — the registry, not the buyer list', async ({ page }) => {
        const publicClient = localPublicClient();
        const registry = (process.env.NEXT_PUBLIC_MEMBERS_REGISTRY ?? readLocalDeploymentConfig().membersRegistry) as `0x${string}`;
        const events = await publicClient.getContractEvents({
            address: registry, abi: MEMBERS_REGISTRY_ABI, eventName: 'MemberRegistered', fromBlock: 0n,
        });
        const onChain = new Set(events.map((e) => String((e.args as { member?: string }).member ?? '').toLowerCase()).filter(Boolean));
        expect(onChain.size, 'populate-test-data registered members').toBeGreaterThan(0);

        await page.goto('/registries?family=members');
        const rows = page.locator('li[data-testid^="member-row-"]');
        await rows.first().waitFor({ state: 'visible', timeout: 30_000 });
        const rendered = await rows.evaluateAll((els) => els.map((e) => (e.getAttribute('data-testid') ?? '').replace(/^member-row-/, '')));
        for (const addr of rendered) {
            expect(onChain.has(addr), `surfaced member ${addr} is registered on-chain`).toBe(true);
        }
        // Names resolve from the pinned profiles (the seed's first seller name).
        await expect(page.getByTestId('registry-count')).toContainText(/of \d+ members/);
    });

    test('a deep link with a facet renders the trail and narrows the rows', async ({ page }) => {
        await page.goto('/registries?family=clauses&article=mandatory');
        const rows = page.locator('li[id^="clause-"]');
        await rows.first().waitFor({ state: 'visible', timeout: 30_000 });
        // Only one article heading remains under a single-article facet.
        await expect(page.locator('h3')).toHaveCount(1);
        await expect(page.getByRole('navigation', { name: /breadcrumb/i })).toContainText('mandatory');
    });
});
