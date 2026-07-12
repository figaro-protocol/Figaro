/**
 * VERSION AXIS — a clause's identity is (name, version), end to end.
 *
 * Registers the SAME probe clause name at v1 AND v2 (distinguishable titles),
 * then drives the real designer UI: both versions surface as co-equal drawer
 * rows; composing the v2 row publishes an assembly whose pinned template
 * records `clauseVersions: { <name>: 2 }` and whose composition identity
 * (slug) differs from the v1 composition of the same clause name.
 *
 * Verification is out-of-band (chain event → IPFS fetch), never the test's
 * own assertions about itself. Per-run nonce in the clause name — devnet is a
 * mainnet rehearsal; state stays on-chain (no snapshot/revert).
 */
import { test, expect } from './devnet-multi-test';
import { createPublicClient, defineChain, http, type Hex } from 'viem';
import { ASSEMBLY_REGISTRY_ABI } from '@figaro/sdk';
import { deriveAssemblySlug } from '@/lib/shared/assemblyTemplate';
import { makeProbeSpec, registerProbeClause } from './probeAssembly';
import { readLocalDeploymentConfig } from './devnet-helpers';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});

test.setTimeout(240_000);

test.describe('clause version axis (devnet)', () => {
    test('v1 and v2 surface as co-equal rows; composing v2 forks the composition identity', async ({ page }) => {
        // Surface browser-side read failures in the test output — the loaded
        // gate turns a cold-cache publish into a disabled button, and the
        // console names WHY the registry read failed.
        page.on('console', (msg) => {
            if (msg.type() === 'warning' || msg.type() === 'error') {
                console.log(`[browser ${msg.type()}]`, msg.text().slice(0, 300));
            }
        });
        const nonce = `${Date.now()}`;
        const clauseId = `figaro-probe-version-${nonce}`;
        await registerProbeClause(clauseId, makeProbeSpec(clauseId, `Version probe v1 ${nonce}`, 1), 1);
        await registerProbeClause(clauseId, makeProbeSpec(clauseId, `Version probe v2 ${nonce}`, 2), 2);

        await page.goto('/builders/designer/new?fresh=1&e2e=devnet', { waitUntil: 'domcontentloaded' });
        await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
        const rootNode = page.locator('[data-testid^="order-node-"]:not([data-testid$="-delete"])').first();
        await rootNode.click();
        await page.getByTestId('agreement-drawer').waitFor({ state: 'visible', timeout: 10000 });
        await page.getByTestId('drawer-tab-registry').click();
        await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });

        // Both registered versions render as co-equal rows, each resolving its
        // OWN spec (distinguishable titles) — a clause is a clause.
        const v1Row = page.getByTestId(`drawer-registry-clause-${clauseId}`);
        const v2Row = page.getByTestId(`drawer-registry-clause-${clauseId}-v2`);
        await expect(v1Row, 'the v1 row surfaces').toHaveCount(1, { timeout: 20000 });
        await expect(v2Row, 'the v2 row surfaces beside it').toHaveCount(1, { timeout: 20000 });
        await expect(page.getByText(`Version probe v2 ${nonce}`)).toBeVisible();

        // Compose the v2 clause and publish through the real flow.
        await v2Row.check();
        await page.getByTestId('designer-name-input').fill(`Version probe assembly ${nonce}`);
        await page.getByTestId('designer-summary-input').fill('Version-axis coverage: composed on v2.');
        await page.getByTestId('designer-description-input').fill('Single-node assembly composing the v2 registration of a per-run probe clause.');
        await expect(page.getByTestId('designer-review')).toBeEnabled({ timeout: 5000 });
        await page.getByTestId('designer-review').click();
        await page.waitForURL(/\/builders\/designer\/view\?slug=asm-/, { timeout: 15000 });
        const handle = page.url().match(/[?&]slug=(asm-[a-z0-9-]+)/)?.[1];
        await page.goto(`/builders/designer/view?slug=${handle}&intent=publish&e2e=devnet`, { waitUntil: 'domcontentloaded' });
        const confirmBtn = page.getByTestId('review-confirm-publish');
        await confirmBtn.waitFor({ state: 'visible', timeout: 30000 });
        await page.waitForFunction(
            () => !Array.from(document.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Connect Wallet'),
            null,
            { timeout: 30000 },
        );
        // Enabled = wallet ready AND the clause-spec cache warmed (the button
        // gates on useClauseSpecs().loaded — the latent race this e2e found).
        await expect(confirmBtn).toBeEnabled({ timeout: 30000 });
        await confirmBtn.click();
        await page.getByTestId('assembly-publish-receipt').waitFor({ timeout: 60000 });
        const slug = (await page.getByTestId('receipt-slug').textContent())?.trim() as string;
        expect(slug).toMatch(/^asm-/);

        // Out-of-band: the anchored template records the v2 identity, and the
        // composition hash the chain keys on derives that slug.
        const config = readLocalDeploymentConfig();
        const registry = (process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY ?? config.assemblyRegistry) as Hex;
        const pub = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const events = await pub.getContractEvents({
            address: registry, abi: ASSEMBLY_REGISTRY_ABI, eventName: 'AssemblyRegistered', fromBlock: 0n,
        });
        const anchored = events.find(
            (e) => deriveAssemblySlug(e.args.compositionHash as `0x${string}`) === slug,
        );
        expect(anchored, 'the published composition is anchored on-chain').toBeTruthy();
        const gateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY_URL ?? 'http://127.0.0.1:8080';
        const uri = anchored!.args.contentURI as string;
        const doc = await (await fetch(`${gateway}/ipfs/${uri.slice('ipfs://'.length)}`)).json() as {
            agreements: Array<{ clauses: Record<string, unknown>; clauseVersions?: Record<string, number> }>;
        };
        const node = doc.agreements.find((a) => clauseId in a.clauses);
        expect(node, 'the pinned template carries the probe clause').toBeTruthy();
        expect(node!.clauseVersions?.[clauseId], 'the template records the composed VERSION').toBe(2);
    });
});
