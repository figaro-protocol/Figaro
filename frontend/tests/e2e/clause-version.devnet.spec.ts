/**
 * LOOKALIKE — a clause is its pinned bytes; its name and version are labels.
 *
 * Registers a probe clause, then a LOOKALIKE: a spec carrying the SAME
 * `clauseId`, `version` and title, differing only in its description — so
 * different bytes, so a different key. Drives the real designer UI: both
 * registrations surface as two drawer rows under two keys, each labeled by
 * its spec's own title and version (the labels a reader cannot tell apart —
 * the key is the identity); composing the lookalike's row publishes an
 * assembly whose pinned assembly is keyed by the LOOKALIKE's key and never
 * names the original's.
 *
 * Verification is out-of-band (registry reads, chain event → IPFS fetch),
 * never the test's own assertions about itself. Per-run nonce in the clause
 * name — devnet is a mainnet rehearsal; state stays on-chain (no
 * snapshot/revert) — and the name is this spec's own, so no other spec's
 * `keyOf` ever sees two specs carrying it.
 */
import { test, expect } from './devnet-multi-test';
import { createPublicClient, defineChain, http, type Hex } from 'viem';
import { CLAUSE_REGISTRY_ABI } from '@figaro-protocol/sdk';
import { makeProbeSpec, registerProbeClause } from './probeAssembly';
import { discoverAnchoredAssemblies, readAgreementBinding, readLocalDeploymentConfig, publishOrAdoptReviewed, pickMandatoryForEveryOrder } from './devnet-helpers';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});

test.setTimeout(240_000);

test.describe('clause lookalike (devnet)', () => {
    test('a lookalike of a registered clause is a second clause under its own key; composing it keys the assembly by it', async ({ page }) => {
        // Surface browser-side read failures in the test output — the loaded
        // gate turns a cold-cache publish into a disabled button, and the
        // console names WHY the registry read failed.
        page.on('console', (msg) => {
            if (msg.type() === 'warning' || msg.type() === 'error') {
                console.log(`[browser ${msg.type()}]`, msg.text().slice(0, 300));
            }
        });
        const nonce = `${Date.now()}`;
        const clauseId = `figaro-probe-lookalike-${nonce}`;
        const title = `Lookalike probe ${nonce}`;
        const original = makeProbeSpec(clauseId, title);
        const lookalike = { ...original, description: `${original.description} (a lookalike: same name, same version, different bytes)` };
        expect(lookalike.clauseId, 'the lookalike carries the same name').toBe(original.clauseId);
        expect(lookalike.version, 'and the same version').toBe(original.version);
        const originalKey = await registerProbeClause(original);
        const lookalikeKey = await registerProbeClause(lookalike);
        expect(lookalikeKey, 'different bytes are a different key').not.toBe(originalKey);

        // Out-of-band: the registry holds BOTH, each under its own key — first
        // write wins on a key, and the lookalike took nothing from the original.
        const config = readLocalDeploymentConfig();
        const pub = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const clauseRegistry = (process.env.NEXT_PUBLIC_CLAUSE_REGISTRY ?? config.clauseRegistry) as Hex;
        for (const key of [originalKey, lookalikeKey]) {
            expect(await pub.readContract({
                address: clauseRegistry, abi: CLAUSE_REGISTRY_ABI, functionName: 'registered', args: [key],
            }), `${key} is a live registration`).toBe(true);
        }

        await page.goto('/assemblies/designer/new?fresh=1&e2e=devnet', { waitUntil: 'domcontentloaded' });
        await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
        const rootNode = page.locator('[data-testid^="order-node-"]:not([data-testid$="-delete"])').first();
        await rootNode.click();
        await page.getByTestId('agreement-drawer').waitFor({ state: 'visible', timeout: 10000 });
        await page.getByTestId('drawer-tab-registry').click();
        await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });

        // Two registrations, two rows — each under its own key, each labeled
        // by its OWN spec's title and version (identical labels: the key is
        // what tells them apart, and the row carries it).
        const originalBox = page.getByTestId(`drawer-registry-clause-${originalKey}`);
        const lookalikeBox = page.getByTestId(`drawer-registry-clause-${lookalikeKey}`);
        await expect(originalBox, 'the original row surfaces').toHaveCount(1, { timeout: 20000 });
        await expect(lookalikeBox, 'the lookalike row surfaces beside it').toHaveCount(1, { timeout: 20000 });
        for (const key of [originalKey, lookalikeKey]) {
            const row = page.locator('label', { has: page.getByTestId(`drawer-registry-clause-${key}`) });
            await expect(row, 'the row is labeled by its spec title').toContainText(title);
            await expect(row, 'and its spec version').toContainText(`v${original.version}`);
            await expect(row.locator(`[title="${key}"]`), 'and carries its own key').toHaveCount(1);
        }

        // Compose the LOOKALIKE and publish through the real flow.
        await lookalikeBox.check();
        await expect(originalBox, 'composing the lookalike leaves the original unselected').not.toBeChecked();
        await page.getByTestId('designer-name-input').fill(`Lookalike probe assembly ${nonce}`);
        await page.getByTestId('designer-summary-input').fill('Lookalike coverage: composed on the lookalike registration.');
        await page.getByTestId('designer-description-input').fill('Single-node assembly composing a lookalike of a per-run probe clause.');
        await pickMandatoryForEveryOrder(page);
        await expect(page.getByTestId('designer-review')).toBeEnabled({ timeout: 5000 });
        await page.getByTestId('designer-review').click();
        await page.waitForURL(/\/assemblies\/designer\/view\/?\?slug=asm-/, { timeout: 15000 });
        const handle = page.url().match(/[?&]slug=(asm-[a-z0-9-]+)/)?.[1];
        const slug = await publishOrAdoptReviewed(page, handle!);

        // Out-of-band: the anchored assembly's agreement binds a registered
        // agreement keyed by the lookalike's key, and the composition hash
        // the chain keys on derives that slug.
        const anchored = (await discoverAnchoredAssemblies()).find((a) => a.slug === slug);
        expect(anchored, 'the published composition is anchored on-chain, its agreements registered').toBeTruthy();
        for (const entry of anchored!.agreements) {
            expect(await readAgreementBinding(entry.agreementHash), `agreement ${entry.id} binds a registered agreement`).not.toBeNull();
        }
        const composedKeys = anchored!.agreements.flatMap((a) => Object.keys(a.clauses).map((k) => k.toLowerCase()));
        expect(composedKeys, 'the pinned assembly is keyed by the lookalike').toContain(lookalikeKey.toLowerCase());
        expect(composedKeys, 'and never names the original').not.toContain(originalKey.toLowerCase());
    });
});
