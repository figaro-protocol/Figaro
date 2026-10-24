/**
 * registries.devnet.spec.ts
 *
 * The registry explorer (`/registries`), the ONE search surface over the
 * protocol registries, on the populated devnet — what the shared walletless
 * spec does NOT hold. `registries.sepolia.spec.ts` (the `sepolia` project,
 * run on both chains) holds the row sets, the count lines and the resolved
 * content of all four families to the chain's event streams; this spec holds
 * the disclosures and the facets on top of those rows, each discovered from
 * chain (the network is the source of truth; nothing here is a hand-written
 * roster):
 *
 *   - a clause's pinned document AS STORED — the served bytes verbatim, their
 *     hash to the anchor on chain, and the permalink that opens it;
 *   - an agreement row's stake label and the stored-document verdict;
 *   - an assembly row's link to its detail route;
 *   - the "assemblies composing it" facet, holding its promise;
 *   - a deep link with a facet: the trail and the narrowed rows.
 *
 * Requires Anvil + ./deploy-local.sh + frontend/scripts/populate-test-data.mjs
 * (which anchors the reference assemblies and registers the seeded members).
 */
import { test, expect } from '@playwright/test';
import { keccak256 } from 'viem';
import { AGREEMENT_REGISTRY_ABI, ASSEMBLY_REGISTRY_ABI, CLAUSE_REGISTRY_ABI } from '@figaro-protocol/sdk';
import { deriveAssemblySlug } from '@/lib/shared/assembly';
import { discoverAnchoredAssemblies, localPublicClient, readAgreementBinding, readLocalDeploymentConfig, resolveIpfsURI } from './devnet-helpers';

test.describe('Registry explorer (devnet) — the disclosures and facets over the chain\'s rows', () => {
    test('a clause shows the pinned document AS STORED, and its bytes hash to the anchor on chain', async ({ page }) => {
        // The lawyer's ask: the page describes a clause in the spec's own
        // words but never showed the document those words came from. The
        // disclosure shows the served bytes verbatim and the digest beside
        // them; this holds BOTH to the chain, out of band.
        const publicClient = localPublicClient();
        const registry = (process.env.NEXT_PUBLIC_CLAUSE_REGISTRY ?? readLocalDeploymentConfig().clauseRegistry) as `0x${string}`;
        const registered = await publicClient.getContractEvents({
            address: registry, abi: CLAUSE_REGISTRY_ABI, eventName: 'ClauseRegistered', fromBlock: 0n,
        });
        expect(registered.length, 'the deploy registered clauses on-chain').toBeGreaterThan(0);

        // DISCOVERED, never named: the most recent registration whose pinned
        // document this gateway actually serves.
        let subject: { clauseKey: `0x${string}`; contentURI: string; bytes: Uint8Array; text: string } | null = null;
        for (const event of [...registered].reverse()) {
            const args = event.args as { clauseKey?: `0x${string}`; contentURI?: string };
            if (!args.clauseKey || !args.contentURI) continue;
            const response = await fetch(resolveIpfsURI(args.contentURI));
            if (!response.ok) continue;
            const bytes = new Uint8Array(await response.arrayBuffer());
            subject = {
                clauseKey: args.clauseKey.toLowerCase() as `0x${string}`,
                contentURI: args.contentURI,
                bytes,
                text: new TextDecoder().decode(bytes),
            };
            break;
        }
        expect(subject, 'at least one registered clause spec is served by this gateway').not.toBeNull();
        const found = subject!;

        // The key IS the anchor: the registry holds a live registration under
        // it, and the served bytes hash to it — exactly as served, nothing
        // re-canonicalized.
        expect(await publicClient.readContract({
            address: registry, abi: CLAUSE_REGISTRY_ABI, functionName: 'registered', args: [found.clauseKey],
        }), 'the event key is a live registration').toBe(true);
        expect(keccak256(found.bytes).toLowerCase(), 'the pinned bytes hash to the clause key out-of-band')
            .toBe(found.clauseKey);
        const spec = JSON.parse(found.text) as { clauseId: string; version: number };

        await page.goto('/registries?family=clauses');
        const row = page.locator(`li#clause-${found.clauseKey}`);
        await expect(row).toBeVisible({ timeout: 30_000 });
        // The row's identity is the key; its spec's own name and version label it.
        await expect(row).toContainText(found.clauseKey);
        await expect(row).toContainText(`${spec.clauseId} v${spec.version}`);

        // The disclosure reads nothing until it is opened.
        await expect(page.getByTestId(`stored-json-clause-${found.clauseKey}`)).toHaveCount(0);
        await row.getByTestId(`stored-toggle-clause-${found.clauseKey}`).click();

        const shown = page.getByTestId(`stored-json-clause-${found.clauseKey}`);
        await expect(shown, 'the pinned document renders').toBeVisible({ timeout: 30_000 });
        // VERBATIM: the screen carries the same bytes the gateway served.
        expect(await shown.innerText(), 'the document renders as stored, byte for byte').toBe(found.text);
        // The hash beside it is the chain's, and the recomputation agrees.
        await expect(page.getByTestId(`stored-hash-clause-${found.clauseKey}`)).toHaveText(new RegExp(found.clauseKey, 'i'));
        await expect(page.getByTestId(`stored-verdict-clause-${found.clauseKey}`)).toContainText('reproduces the anchor');
        await expect(page.getByTestId(`stored-panel-clause-${found.clauseKey}`)).toContainText('keccak256');

        // THE PERMALINK: the row's own URL lands on it and opens the document
        // without a click — what a reader who typed /clauses/<key> was after.
        await expect(row.getByTestId(`permalink-clause-${found.clauseKey}`)).toHaveAttribute('href', `#clause-${found.clauseKey}`);
        await page.goto(`/registries?family=clauses#clause-${found.clauseKey}`, { waitUntil: 'domcontentloaded' });
        await expect(page.getByTestId(`stored-json-clause-${found.clauseKey}`), 'the permalink opens the stored document').toBeVisible({ timeout: 30_000 });
    });

    test('an agreement row names its stake as the registry binds it, and its stored document reproduces the key', async ({ page }) => {
        const publicClient = localPublicClient();
        const registry = (process.env.NEXT_PUBLIC_AGREEMENT_REGISTRY ?? readLocalDeploymentConfig().agreementRegistry) as `0x${string}`;
        const events = await publicClient.getContractEvents({
            address: registry, abi: AGREEMENT_REGISTRY_ABI, eventName: 'AgreementRegistered', fromBlock: 0n,
        });
        expect(events.length, 'no registered agreements on this devnet — run populate-test-data first').toBeGreaterThan(0);
        const agreementHash = (events[events.length - 1].args.agreementHash as `0x${string}`).toLowerCase();
        // CHAIN FACT, read by key: the binding names its stake.
        const binding = await readAgreementBinding(agreementHash as `0x${string}`);
        expect(binding, 'the registry binds the key').not.toBeNull();

        await page.goto('/registries?family=agreements&stake=all');
        const row = page.getByTestId(`agreement-row-${agreementHash}`);
        await expect(row).toBeVisible({ timeout: 30_000 });
        await expect(row.getByTestId(`agreement-stake-${agreementHash}`))
            .toHaveText(binding!.stakeWithdrawn ? '(stake withdrawn)' : '(live stake)');
        // The pinned document, read back and checked against the key.
        await row.getByTestId(`stored-toggle-agreement-${agreementHash}`).click();
        await expect(row.getByTestId(`stored-verdict-agreement-${agreementHash}`)).toContainText(/reproduces the anchor/i, { timeout: 30_000 });
    });

    test('an assembly row links to its detail route', async ({ page }) => {
        const publicClient = localPublicClient();
        const registry = (process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY ?? readLocalDeploymentConfig().assemblyRegistry) as `0x${string}`;
        const events = await publicClient.getContractEvents({
            address: registry, abi: ASSEMBLY_REGISTRY_ABI, eventName: 'AssemblyRegistered', fromBlock: 0n,
        });
        expect(events.length, 'no anchored assemblies on this devnet — run populate-test-data first').toBeGreaterThan(0);
        const slug = deriveAssemblySlug(events[events.length - 1].args.assemblyHash as `0x${string}`);

        await page.goto('/registries?family=assemblies');
        const row = page.locator(`#assembly-${slug}`);
        await expect(row).toBeVisible({ timeout: 30_000 });
        await expect(row.getByTestId(`assembly-view-${slug}`)).toHaveAttribute('href', /\/assemblies\/designer\/view\/?\?slug=/);
    });

    test('"assemblies composing it" keeps its promise — only the assemblies whose assembly composes the clause remain', async ({ page }) => {
        // Truth from chain → IPFS: every anchored assembly, and which compose the chosen clause.
        // Each assembly hydrated: its agreements' agreements read by key
        // from AgreementRegistry → IPFS and verified.
        const discovered = await discoverAnchoredAssemblies();
        expect(discovered.length).toBeGreaterThan(1);
        const assemblies = discovered.map((d) => {
            const clauses = new Set<string>(Object.keys(d.hydrated.assembly.assemblyClauses ?? {}));
            for (const a of d.agreements) for (const id of Object.keys(a.clauses)) clauses.add(id);
            return { slug: d.slug, clauses };
        });
        // Pick a clause composed by SOME but not ALL assemblies — the facet must narrow.
        const counts = new Map<string, number>();
        for (const t of assemblies) for (const id of t.clauses) counts.set(id, (counts.get(id) ?? 0) + 1);
        const clauseKey = [...counts.entries()].find(([, n]) => n > 0 && n < assemblies.length)?.[0];
        expect(clauseKey, 'a clause composed by a strict subset of the anchored assemblies').toBeTruthy();
        const composing = assemblies.filter((t) => t.clauses.has(clauseKey!)).map((t) => t.slug).sort();

        await page.goto('/registries?family=clauses');
        const row = page.locator(`#clause-${clauseKey}`);
        await expect(row).toBeVisible({ timeout: 30_000 });
        await row.getByRole('button', { name: 'assemblies composing it' }).click();

        // The URL carries the facet INTO the assemblies family (the click's promise).
        await expect(page).toHaveURL(new RegExp(`family=assemblies.*clause=${clauseKey}|clause=${clauseKey}.*family=assemblies`));
        await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText(`composing ${clauseKey}`);
        // Assemblies resolve from the local node; the row set resolves to exactly the composing slugs.
        await expect.poll(async () => {
            const ids = await page.locator('li[id^="assembly-"]').evaluateAll((els) => els.map((e) => e.id.replace(/^assembly-/, '')));
            return ids.sort();
        }, { timeout: 30_000 }).toEqual(composing);
        expect(composing.length).toBeLessThan(assemblies.length);
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
