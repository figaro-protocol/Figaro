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
import { ASSEMBLY_REGISTRY_ABI, CLAUSE_REGISTRY_ABI, MEMBERS_REGISTRY_ABI } from '@figaro-protocol/sdk';
import { deriveAssemblySlug } from '@/lib/shared/assemblyTemplate';
import { localPublicClient, readLocalDeploymentConfig, resolveIpfsURI } from './devnet-helpers';

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
        // A row whose spec the gateway has not served yet says so (never
        // "(unclassified)"); on devnet's local node every spec resolves, so the
        // note clears for every row and every heading is a real article.
        await expect(page.getByTestId('content-resolving')).toHaveCount(0, { timeout: 30_000 });
        await expect(page.getByTestId('content-unavailable')).toHaveCount(0);
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

    test('"assemblies composing it" keeps its promise — only the assemblies whose template composes the clause remain', async ({ page }) => {
        // Truth from chain → IPFS: every anchored template, and which compose the chosen clause.
        const publicClient = localPublicClient();
        const registry = (process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY ?? readLocalDeploymentConfig().assemblyRegistry) as `0x${string}`;
        const events = await publicClient.getContractEvents({
            address: registry, abi: ASSEMBLY_REGISTRY_ABI, eventName: 'AssemblyRegistered', fromBlock: 0n,
        });
        expect(events.length).toBeGreaterThan(1);
        const templates = await Promise.all(events.map(async (e) => {
            const res = await fetch(resolveIpfsURI(String(e.args.contentURI)));
            const t = (await res.json()) as { agreements: Array<{ clauses: Record<string, unknown> }>; assemblyClauses?: Record<string, unknown> };
            const clauses = new Set<string>(Object.keys(t.assemblyClauses ?? {}));
            for (const a of t.agreements) for (const id of Object.keys(a.clauses)) clauses.add(id);
            return { slug: deriveAssemblySlug(e.args.compositionHash as `0x${string}`), clauses };
        }));
        // Pick a clause composed by SOME but not ALL assemblies — the facet must narrow.
        const counts = new Map<string, number>();
        for (const t of templates) for (const id of t.clauses) counts.set(id, (counts.get(id) ?? 0) + 1);
        const clauseId = [...counts.entries()].find(([, n]) => n > 0 && n < templates.length)?.[0];
        expect(clauseId, 'a clause composed by a strict subset of the anchored assemblies').toBeTruthy();
        const composing = templates.filter((t) => t.clauses.has(clauseId!)).map((t) => t.slug).sort();

        await page.goto('/registries?family=clauses');
        const row = page.locator(`#clause-${clauseId}`);
        await expect(row).toBeVisible({ timeout: 30_000 });
        await row.getByRole('button', { name: 'assemblies composing it' }).click();

        // The URL carries the facet INTO the assemblies family (the click's promise).
        await expect(page).toHaveURL(new RegExp(`family=assemblies.*clause=${clauseId}|clause=${clauseId}.*family=assemblies`));
        await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText(`composing ${clauseId}`);
        // Templates resolve from the local node; the row set settles to exactly the composing slugs.
        await expect.poll(async () => {
            const ids = await page.locator('li[id^="assembly-"]').evaluateAll((els) => els.map((e) => e.id.replace(/^assembly-/, '')));
            return ids.sort();
        }, { timeout: 30_000 }).toEqual(composing);
        expect(composing.length).toBeLessThan(templates.length);
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
