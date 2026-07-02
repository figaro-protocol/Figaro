/**
 * seed-assembly.devnet.spec.ts
 *
 * Open-world authoring SEED. Drives the current designer to author and PUBLISH
 * one PERSISTENT assembly, so the downstream suite has a bindable, orderable
 * assembly: `sellers-onboarding` binds the first anchored assembly, and a buyer
 * can order it. Runs in the `devnet-authoring` gate BEFORE sellers-onboarding
 * (alphabetical: "seed-" < "sellers-").
 *
 * ENSURE-EXISTS semantics: the seed's one job is that ≥1 anchored assembly
 * exists for the suite to bind. On a FRESH chain it authors + publishes (one
 * composed clause — figaro-geolocation, a single checkbox — so the content
 * slug differs from a bare blank composition); on a chain a prior run already
 * seeded, it verifies the anchored assembly renders on /assemblies and stops —
 * the slug is content-derived and the registry first-write-wins, so
 * re-publishing an identical composition can only revert.
 * Persistent by design — NO evm snapshot/revert; this IS the seed.
 *
 * Pure UI authoring: canvas → compose via the drawer → review → publish →
 * AssemblyRegistered on chain → visible on /assemblies. No hand-built agreement,
 * no restored scenario code — the real open-world publish path.
 *
 * Requires Anvil + ./scripts/deploy-local.sh + Kubo.
 */
import { test, expect } from './devnet-multi-test';
import { createPublicClient, defineChain, http, keccak256, parseAbi, toHex, type Hex } from 'viem';
import { readLocalDeploymentConfig } from './devnet-helpers';
import { ASSEMBLY_REGISTRY_ABI } from '@figaro/core';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});
const GEO_CLAUSE_KEY = 'figaro-geolocation';

test.describe('Seed assembly (devnet authoring gate)', () => {
    // Multi-route nav + IPFS pin + on-chain tx pushes this past 60s.
    test.setTimeout(180_000);

    test('author + publish one persistent assembly the suite can bind and order', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const assemblyRegistry = (process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY
            ?? config.assemblyRegistry) as Hex;

        // ── ENSURE-EXISTS, not publish-every-run. The seed's one job is that
        //    the downstream suite has ≥1 anchored, bindable assembly. The slug
        //    is content-derived and the registry is first-write-wins, so
        //    re-publishing the identical composition on a persistent devnet
        //    can only revert — if a prior run already seeded, verify the
        //    inventory renders it and stop. The full authoring path runs on
        //    every FRESH chain (each devup FORCE_REDEPLOY).
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const anchored = await publicClient.getContractEvents({
            address: assemblyRegistry,
            abi: ASSEMBLY_REGISTRY_ABI,
            eventName: 'AssemblyRegistered',
            fromBlock: 0n,
        });
        if (anchored.length > 0) {
            const existingSlug = anchored[0].args.slug as string;
            await page.goto('/assemblies?e2e=devnet', { waitUntil: 'domcontentloaded' });
            await expect(page.locator(`#assembly-${existingSlug}`),
                'a prior run already seeded — the anchored assembly renders on /assemblies',
            ).toBeVisible({ timeout: 30000 });
            return;
        }

        await page.addInitScript(() => {
            try {
                window.localStorage.removeItem('figaro:designer:current');
                window.localStorage.removeItem('figaro:designer:drafts');
            } catch { /* noop */ }
        });
        await page.goto('/builders/designer/new?fresh=1&e2e=devnet', { waitUntil: 'domcontentloaded' });
        await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
        await page.getByTestId('designer-saved-hint').waitFor({ timeout: 15000 });

        // ── Compose one clause (geo) so the composition is unique vs blank ──
        const rootNode = page.locator('[data-testid^="order-node-"]:not([data-testid$="-delete"])').first();
        await rootNode.waitFor({ state: 'visible', timeout: 10000 });
        await rootNode.click();
        await page.getByTestId('agreement-drawer').waitFor({ state: 'visible', timeout: 10000 });
        await page.getByTestId('drawer-tab-registry').click();
        await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });
        const geo = page.getByTestId(`drawer-registry-clause-${GEO_CLAUSE_KEY}`);
        await expect(geo, 'drawer surfaces the geo clause from the live registry').toHaveCount(1, { timeout: 20000 });
        await geo.check();

        // ── Editorial identity (name + summary + description are ALL mandatory
        //    for publish — publishBlockedReason gates on every one), then
        //    review + publish (persistent — NO revert) ──
        await page.getByTestId('designer-name-input').fill(`seed-${Date.now()}`);
        await page.getByTestId('designer-summary-input').fill('Seed assembly for the authoring gate.');
        await page.getByTestId('designer-description-input').fill('A persistent published assembly the downstream suite binds and orders; composes geo for a unique content slug.');
        await expect(page.getByTestId('designer-review')).toBeEnabled({ timeout: 5000 });
        await page.getByTestId('designer-review').click();

        // Review navigates to /view/<handle>?intent=publish and drops ?e2e=.
        await page.waitForURL(/\/builders\/designer\/view\/asm-/, { timeout: 15000 });
        const handle = page.url().match(/\/view\/(asm-[a-z0-9-]+)/)?.[1];
        expect(handle, 'review navigated to a draft handle').toBeTruthy();
        await page.goto(
            `/builders/designer/view/${handle}?intent=publish&e2e=devnet`,
            { waitUntil: 'domcontentloaded' },
        );

        const confirmBtn = page.getByTestId('review-confirm-publish');
        await confirmBtn.waitFor({ state: 'visible', timeout: 15000 });
        // Wait for ClientInit's devnet auto-connect (Connect Wallet disappears).
        await page.waitForFunction(
            () => !Array.from(document.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Connect Wallet'),
            null,
            { timeout: 30000 },
        );
        await confirmBtn.click();

        await page.getByTestId('assembly-publish-receipt').waitFor({ timeout: 60000 });
        const publishedSlug = (await page.getByTestId('receipt-slug').textContent())?.trim();
        expect(publishedSlug, 'receipt shows the content slug').toMatch(/^asm-/);

        // ── On-chain assertion — AssemblyRegistered, persistent (no revert) ──
        const slugHash = keccak256(toHex(publishedSlug as string));
        const events = await publicClient.getContractEvents({
            address: assemblyRegistry,
            abi: ASSEMBLY_REGISTRY_ABI,
            eventName: 'AssemblyRegistered',
            args: { slugHash },
            fromBlock: 0n,
        });
        expect(events.length).toBe(1);
        expect(events[0].args.slug).toBe(publishedSlug);

        // Visible on the public /assemblies inventory — discoverable + bindable.
        await page.goto('/assemblies?e2e=devnet', { waitUntil: 'domcontentloaded' });
        await expect(page.locator(`#assembly-${publishedSlug}`)).toBeVisible({ timeout: 30000 });
    });
});
