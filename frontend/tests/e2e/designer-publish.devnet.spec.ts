/**
 * designer-publish.devnet.spec.ts
 *
 * Phase 3b of the e2e remediation plan: full publish flow from
 * canvas → review → on-chain registerAssembly.
 *
 * Investigation note (resolved): an earlier draft of this spec
 * imported `test` from `@playwright/test` directly, which DOESN'T
 * inject the multi-wallet EIP-1193 provider. That left
 * `window.ethereum === undefined` on every navigation, so
 * ClientInit's devnet auto-connect found no connector and the
 * review page persisted in "Connect Wallet" state. Importing from
 * `./devnet-multi-test` is the right fix — every working
 * `*.devnet.spec.ts` uses that fixture.
 *
 * Also noted (NOT addressed): the canvas's Publish button
 * (`router.push(/view/<slug>?intent=publish)` at
 * DesignerCanvas.tsx:434) drops any `?e2e=` query param.
 * Production-relevant if other query-param-driven modes get added;
 * test-mode-only impact today. Worked around by re-navigating to
 * `/view/<slug>?intent=publish&e2e=devnet` directly.
 *
 * Requires Anvil + ./deploy-local.sh + Kubo.
 */
import { test, expect } from './devnet-multi-test';
import {
    createPublicClient,
    defineChain,
    http,
    keccak256,
    parseAbi,
    toHex,
    type Hex,
} from 'viem';
import { evmRevert, evmSnapshot, readLocalDeploymentConfig } from './devnet-helpers';
import { ASSEMBLY_REGISTRY_ABI } from '@/lib/mechanisms/useAssemblyRegistry';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});



test.describe('Designer publish (devnet)', () => {

    // Multi-route nav + IPFS pin + on-chain tx pushes this past 60s.
    test.setTimeout(180_000);

    test('full publish round-trip — canvas → review → IPFS pin → AssemblyRegistered → visible on /assemblies', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const assemblyRegistry = (process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY
            ?? config.assemblyRegistry) as Hex;

        // The editorial name (free-form, hash-excluded). The published SLUG is
        // content-derived from the composition, NOT the name. This blank
        // composition hashes identically every run, so isolate the publish in
        // an evm snapshot — revert frees the slug for the sibling publish specs.
        const draftName = `pub-${Date.now()}`;
        const snapshotId = await evmSnapshot();
        try {
            await page.addInitScript(() => {
                try {
                    window.localStorage.removeItem('figaro:designer:current');
                    window.localStorage.removeItem('figaro:designer:drafts');
                } catch { /* noop */ }
            });
            await page.goto('/builders/designer/new?fresh=1&e2e=devnet', { waitUntil: 'domcontentloaded' });
            await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
            await page.getByTestId('designer-saved-hint').waitFor({ timeout: 15000 });

            await page.getByTestId('designer-name-input').fill(draftName);

            await expect(page.getByTestId('designer-review')).toBeEnabled({ timeout: 5000 });
            await page.getByTestId('designer-review').click();

            // Review navigates to /view/<random-handle>?intent=publish (and drops
            // the ?e2e= param). Capture the handle, re-goto with ?e2e=devnet.
            await page.waitForURL(/\/builders\/designer\/view\/asm-/, { timeout: 15000 });
            const handle = page.url().match(/\/view\/(asm-[a-z0-9-]+)/)?.[1];
            expect(handle, 'review navigated to a draft handle').toBeTruthy();
            await page.goto(
                `/builders/designer/view/${handle}?intent=publish&e2e=devnet`,
                { waitUntil: 'domcontentloaded' },
            );

            const confirmBtn = page.getByTestId('review-confirm-publish');
            await confirmBtn.waitFor({ state: 'visible', timeout: 15000 });
            // Wait for ClientInit's devnet auto-connect — the Connect
            // Wallet header button disappears once isConnected flips true.
            await page.waitForFunction(
                () => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    return !buttons.some((b) => b.textContent?.trim() === 'Connect Wallet');
                },
                null,
                { timeout: 30000 },
            );
            await confirmBtn.click();

            // Receipt appears once publish() resolves (IPFS pin +
            // registerAssembly tx receipt) — it carries the content-derived slug.
            await page.getByTestId('assembly-publish-receipt').waitFor({ timeout: 60000 });
            const publishedSlug = (await page.getByTestId('receipt-slug').textContent())?.trim();
            expect(publishedSlug, 'receipt shows the content slug').toMatch(/^asm-/);

            // On-chain assertion — AssemblyRegistered for the content-derived slug.
            const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
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
            // metadataURI is whatever the canvas pinned to IPFS — non-empty.
            expect(events[0].args.metadataURI).toMatch(/^ipfs:\/\/[A-Za-z0-9]+/);

            // ── Read-back: the freshly-published assembly is visible on the public
            //    /assemblies inventory (on-chain event → standalone indexer → render),
            //    i.e. discoverable + adoptable by any reader exactly as on mainnet.
            //    This closes the round-trip the authoring flow exists to produce:
            //    author → IPFS pin → AssemblyRegistered on chain → visible on /assemblies.
            await page.goto('/assemblies?e2e=devnet', { waitUntil: 'domcontentloaded' });
            await expect(page.locator(`#assembly-${publishedSlug}`)).toBeVisible({ timeout: 30000 });
        } finally {
            await evmRevert(snapshotId);
        }
    });
});
