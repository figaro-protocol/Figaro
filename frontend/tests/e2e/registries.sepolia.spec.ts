/**
 * THE PUBLIC REGISTRIES, READ ONLY — the walletless half of the public
 * rehearsal. No key, no stake, no ETH: it discovers every registered clause,
 * registered agreement, anchored assembly, and registered member from the chain (chunked scans from
 * the deployment block — a public gateway caps one eth_getLogs) and holds the
 * registry explorer to it: exactly those rows, and every row's pinned content
 * RESOLVED through the site's gateway chain (a name, an article, a profile —
 * never an identity standing in for content the gateway has not served).
 * Runs against Sepolia with E2E_CHAIN=sepolia (the sepolia project) and
 * against the devnet without it (the same spec, the local node), so the
 * check itself is rehearsed before it is trusted on the public network. The
 * devnet CI lane runs it on the bare genesis `scripts/deploy-local.sh` leaves
 * (clauses, the reference assemblies' agreements, the reference assemblies;
 * no member), before any test population. Free to run any time — a nudge
 * lands, this says whether the site shows it.
 */
import { test, expect } from '@playwright/test';
import { createPublicClient, http } from 'viem';
import { AGREEMENT_REGISTRY_ABI, ASSEMBLY_REGISTRY_ABI, CLAUSE_REGISTRY_ABI, MEMBERS_REGISTRY_ABI, agreementKeyOf } from '@figaro-protocol/sdk';
import { deriveAssemblySlug } from '@/lib/shared/assembly';
import { E2E_CHAIN, LOCAL_ANVIL, RPC_URL, readLocalDeploymentConfig, readRegisteredAgreementDocument, scanContractEvents } from './devnet-helpers';

test.describe('PUBLIC REGISTRIES — the explorer shows exactly what the chain holds, content resolved', () => {
    test.setTimeout(E2E_CHAIN === 'sepolia' ? 600_000 : 300_000);
    // Public gateways: seconds through the dedicated gateway, minutes if a
    // fresh pin has to come through the fallback; the local node: instant.
    const RESOLVE_TIMEOUT = E2E_CHAIN === 'sepolia' ? 300_000 : 60_000;

    test('clauses, agreements, assemblies, members: row set == chain, every row resolved', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        // ── Truth: the four event streams, from the deployment block ──
        const clauseEvents = await scanContractEvents(publicClient, { address: config.clauseRegistry as `0x${string}`, abi: CLAUSE_REGISTRY_ABI, eventName: 'ClauseRegistered' });
        const clauseKeys = new Set(clauseEvents.map((e) => String((e.args as { clauseKey?: string }).clauseKey ?? '').toLowerCase()).filter(Boolean));
        const agreementEvents = await scanContractEvents(publicClient, { address: config.agreementRegistry as `0x${string}`, abi: AGREEMENT_REGISTRY_ABI, eventName: 'AgreementRegistered' });
        const agreementKeys = new Set(agreementEvents.map((e) => String((e.args as { agreementKey?: string }).agreementKey ?? '').toLowerCase()).filter(Boolean));
        const assemblyEvents = await scanContractEvents(publicClient, { address: config.assemblyRegistry as `0x${string}`, abi: ASSEMBLY_REGISTRY_ABI, eventName: 'AssemblyRegistered' });
        const slugs = new Set(assemblyEvents.map((e) => deriveAssemblySlug((e.args as { compositionHash: `0x${string}` }).compositionHash)));
        // A registration whose stake is withdrawn keeps its binding readable (a
        // row in the explorer, never cleared), and nothing about its content is
        // asserted here — on the public network a withdrawn registration's
        // document may be keyed under another format than the one in force, so
        // it need not key to its registration and an assembly over it need not
        // hydrate.
        const withdrawnAgreements = new Set((await scanContractEvents(publicClient, { address: config.agreementRegistry as `0x${string}`, abi: AGREEMENT_REGISTRY_ABI, eventName: 'DepositWithdrawn' }))
            .map((e) => String((e.args as { agreementKey?: string }).agreementKey ?? '').toLowerCase()).filter(Boolean));
        const withdrawnSlugs = new Set((await scanContractEvents(publicClient, { address: config.assemblyRegistry as `0x${string}`, abi: ASSEMBLY_REGISTRY_ABI, eventName: 'DepositWithdrawn' }))
            .map((e) => deriveAssemblySlug((e.args as { compositionHash: `0x${string}` }).compositionHash)));
        const memberEvents = await scanContractEvents(publicClient, { address: config.membersRegistry as `0x${string}`, abi: MEMBERS_REGISTRY_ABI, eventName: 'MemberRegistered' });
        const members = new Set(memberEvents.map((e) => String((e.args as { member?: string }).member ?? '').toLowerCase()).filter(Boolean));
        expect(clauseKeys.size, 'the registry holds clauses').toBeGreaterThan(0);
        expect(agreementKeys.size, 'the registry holds agreements').toBeGreaterThan(0);
        expect(slugs.size, 'the registry holds assemblies').toBeGreaterThan(0);
        // The public network's genesis registers the founder's and the DAO's profiles; a bare devnet genesis registers none.
        if (E2E_CHAIN === 'sepolia') expect(members.size, 'the registry holds members').toBeGreaterThan(0);

        // ── Clauses: the row set is the chain's; every spec resolved; every heading a real article ──
        await page.goto('/registries?family=clauses');
        const clauseRows = page.locator('li[id^="clause-"]');
        await expect.poll(async () => (await clauseRows.evaluateAll((els) => els.map((e) => e.id.replace(/^clause-/, '').toLowerCase()))).sort(), { timeout: 60_000 })
            .toEqual([...clauseKeys].sort());
        await expect(page.getByTestId('content-resolving')).toHaveCount(0, { timeout: RESOLVE_TIMEOUT });
        await expect(page.getByTestId('content-unavailable')).toHaveCount(0);
        const headings = await page.getByRole('heading', { level: 3 }).allTextContents();
        for (const h of headings) expect(h, 'a heading is an article, not a content state').not.toMatch(/content (not served|unavailable)/);
        await expect(page.getByTestId('registry-count')).toContainText(`${clauseKeys.size} of ${clauseKeys.size} clauses`);

        // ── Agreements: each registration's pinned document, fetched through the
        //    gateway chain out of band, re-keys to the registry's key; the
        //    explorer shows exactly the chain's registrations, each with its key
        //    and its designer of record (the binding, read by key — a scan
        //    discovers, a state read decides). ──
        const agreementBindings = new Map<string, `0x${string}`>();
        for (const key of agreementKeys) {
            const read = await readRegisteredAgreementDocument(key as `0x${string}`);
            expect(read, `${key} is bound on the AgreementRegistry`).not.toBeNull();
            if (withdrawnAgreements.has(key)) continue; // withdrawn: the binding stands, its content is not held to the key
            expect(agreementKeyOf(read!.document).toLowerCase(), `the document pinned for ${key} keys to it`).toBe(key);
            agreementBindings.set(key, read!.binding.registeredBy);
        }
        await page.goto('/registries?family=agreements&stake=all');
        const agreementRows = page.locator('li[data-testid^="agreement-row-"]');
        await expect.poll(async () => (await agreementRows.evaluateAll((els) => els.map((e) => (e.getAttribute('data-testid') ?? '').replace(/^agreement-row-/, '')))).sort(), { timeout: 60_000 })
            .toEqual([...agreementKeys].sort());
        await expect(page.getByTestId('content-resolving')).toHaveCount(0, { timeout: RESOLVE_TIMEOUT });
        for (const [key, registeredBy] of agreementBindings) {
            const row = page.getByTestId(`agreement-row-${key}`);
            await expect(row.getByTestId(`agreement-key-${key}`)).toHaveText(new RegExp(key, 'i'));
            await expect(row, `${key} names its designer of record`).toContainText(new RegExp(registeredBy.slice(0, 6), 'i'));
        }

        // ── Assemblies: every anchored composition, each named from its resolved assembly ──
        // Every anchored composition, the withdrawn ones included: the row set is the chain's.
        await page.goto('/registries?family=assemblies&stake=all');
        const assemblyRows = page.locator('li[id^="assembly-"]');
        await expect.poll(async () => (await assemblyRows.evaluateAll((els) => els.map((e) => e.id.replace(/^assembly-/, '')))).sort(), { timeout: 60_000 })
            .toEqual([...slugs].sort());
        await expect(page.getByTestId('content-resolving')).toHaveCount(0, { timeout: RESOLVE_TIMEOUT });
        for (const slug of slugs) {
            if (withdrawnSlugs.has(slug)) continue; // withdrawn: the row stands, its assembly is not held to resolve
            const name = (await page.getByTestId(`assembly-view-${slug}`).textContent())?.trim();
            expect(name, `${slug} is named from its assembly, not by its slug`).not.toBe(slug);
        }

        // ── Members: every registered wallet, each profile resolved. The count
        //    line renders only once the registry read has finished, so it holds
        //    the explorer to the chain's set even where that set is empty (the
        //    devnet genesis registers no member). ──
        await page.goto('/registries?family=members');
        await expect(page.getByTestId('registry-count')).toContainText(`${members.size} of ${members.size} members`, { timeout: 60_000 });
        const memberRows = page.locator('li[data-testid^="member-row-"]');
        await expect.poll(async () => (await memberRows.evaluateAll((els) => els.map((e) => (e.getAttribute('data-testid') ?? '').replace(/^member-row-/, '')))).sort(), { timeout: 60_000 })
            .toEqual([...members].sort());
        await expect(page.getByTestId('content-resolving')).toHaveCount(0, { timeout: RESOLVE_TIMEOUT });
    });
});
