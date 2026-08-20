/**
 * THE PUBLIC REGISTRIES, READ ONLY — the walletless half of the public
 * rehearsal. No key, no stake, no ETH: it discovers every registered clause,
 * anchored assembly, and registered member from the chain (chunked scans from
 * the deployment block — a public gateway caps one eth_getLogs) and holds the
 * registry explorer to it: exactly those rows, and every row's pinned content
 * RESOLVED through the site's gateway chain (a name, an article, a profile —
 * never an identity standing in for content the gateway has not served).
 * Runs against Sepolia with E2E_CHAIN=sepolia (the sepolia project) and
 * against the devnet without it (the same spec, the local node), so the
 * check itself is rehearsed before it is trusted on the public network.
 * Free to run any time — a nudge lands, this says whether the site shows it.
 */
import { test, expect } from '@playwright/test';
import { createPublicClient, http } from 'viem';
import { ASSEMBLY_REGISTRY_ABI, CLAUSE_REGISTRY_ABI, MEMBERS_REGISTRY_ABI } from '@figaro-protocol/sdk';
import { deriveAssemblySlug } from '@/lib/shared/assemblyTemplate';
import { E2E_CHAIN, LOCAL_ANVIL, RPC_URL, readLocalDeploymentConfig, scanContractEvents } from './devnet-helpers';

test.describe('PUBLIC REGISTRIES — the explorer shows exactly what the chain holds, content resolved', () => {
    test.setTimeout(E2E_CHAIN === 'sepolia' ? 600_000 : 300_000);
    // Public gateways: seconds through the dedicated gateway, minutes if a
    // fresh pin has to come through the fallback; the local node: instant.
    const RESOLVE_TIMEOUT = E2E_CHAIN === 'sepolia' ? 300_000 : 60_000;

    test('clauses, assemblies, members: row set == chain, every row resolved', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        // ── Truth: the three event streams, from the deployment block ──
        const clauseEvents = await scanContractEvents(publicClient, { address: config.clauseRegistry as `0x${string}`, abi: CLAUSE_REGISTRY_ABI, eventName: 'ClauseRegistered' });
        const clauseIds = new Set(clauseEvents.map((e) => String((e.args as { clauseId?: string }).clauseId ?? '')).filter(Boolean));
        const assemblyEvents = await scanContractEvents(publicClient, { address: config.assemblyRegistry as `0x${string}`, abi: ASSEMBLY_REGISTRY_ABI, eventName: 'AssemblyRegistered' });
        const slugs = new Set(assemblyEvents.map((e) => deriveAssemblySlug((e.args as { compositionHash: `0x${string}` }).compositionHash)));
        const memberEvents = await scanContractEvents(publicClient, { address: config.membersRegistry as `0x${string}`, abi: MEMBERS_REGISTRY_ABI, eventName: 'MemberRegistered' });
        const members = new Set(memberEvents.map((e) => String((e.args as { member?: string }).member ?? '').toLowerCase()).filter(Boolean));
        expect(clauseIds.size, 'the registry holds clauses').toBeGreaterThan(0);
        expect(slugs.size, 'the registry holds assemblies').toBeGreaterThan(0);
        expect(members.size, 'the registry holds members').toBeGreaterThan(0);

        // ── Clauses: the row set is the chain's; every spec resolved; every heading a real article ──
        await page.goto('/registries?family=clauses');
        const clauseRows = page.locator('li[id^="clause-"]');
        await expect.poll(async () => (await clauseRows.evaluateAll((els) => els.map((e) => e.id.replace(/^clause-/, '')))).sort(), { timeout: 60_000 })
            .toEqual([...clauseIds].sort());
        await expect(page.getByTestId('content-resolving')).toHaveCount(0, { timeout: RESOLVE_TIMEOUT });
        await expect(page.getByTestId('content-unavailable')).toHaveCount(0);
        const headings = await page.getByRole('heading', { level: 3 }).allTextContents();
        for (const h of headings) expect(h, 'a heading is an article, not a content state').not.toMatch(/content (not served|unavailable)/);
        await expect(page.getByTestId('registry-count')).toContainText(`${clauseIds.size} of ${clauseIds.size} clauses`);

        // ── Assemblies: every anchored composition, each named from its resolved template ──
        await page.goto('/registries?family=assemblies');
        const assemblyRows = page.locator('li[id^="assembly-"]');
        await expect.poll(async () => (await assemblyRows.evaluateAll((els) => els.map((e) => e.id.replace(/^assembly-/, '')))).sort(), { timeout: 60_000 })
            .toEqual([...slugs].sort());
        await expect(page.getByTestId('content-resolving')).toHaveCount(0, { timeout: RESOLVE_TIMEOUT });
        for (const slug of slugs) {
            const name = (await page.getByTestId(`assembly-view-${slug}`).textContent())?.trim();
            expect(name, `${slug} is named from its template, not by its slug`).not.toBe(slug);
        }

        // ── Members: every registered wallet, each profile resolved ──
        await page.goto('/registries?family=members');
        const memberRows = page.locator('li[data-testid^="member-row-"]');
        await expect.poll(async () => (await memberRows.evaluateAll((els) => els.map((e) => (e.getAttribute('data-testid') ?? '').replace(/^member-row-/, '')))).sort(), { timeout: 60_000 })
            .toEqual([...members].sort());
        await expect(page.getByTestId('content-resolving')).toHaveCount(0, { timeout: RESOLVE_TIMEOUT });
    });
});
