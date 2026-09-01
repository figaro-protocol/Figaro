/**
 * designer-view.devnet.spec.ts
 *
 * Phase 5 A9: the read-only assembly inspector at
 * /assemblies/designer/view (`ViewAssemblyClient`). No devnet spec
 * covered the on-chain read-only resolution path before.
 *
 * `ViewAssemblyClient` resolves a slug from a localStorage draft first,
 * else from the chain (`AssemblyRegistered` event → IPFS assemblyTemplate), else
 * an error. This spec covers the on-chain branch and the not-found branch:
 *
 *   1. Publish an assembly via the canvas, then open /view/<slug> — it
 *      resolves from chain, the source badge reads "on-chain", and a
 *      published assembly offers Fork (not Edit).
 *   2. A slug that is neither a draft nor on-chain → the not-found error.
 *
 * Additive UI-tier coverage. Requires Anvil + ./deploy-local.sh + Kubo.
 */
import { test, expect } from './devnet-multi-test';
import { publishProbeAssembly } from './probeAssembly';
import { discoverAnchoredAssemblies } from './devnet-helpers';


test.describe('Assembly read-only inspector — /view?slug= (devnet)', () => {

    // The publish leg is canvas → review → IPFS pin → on-chain tx.
    test.setTimeout(180_000);

    test('publishes an assembly, then inspects it read-only at /view?slug=', async ({ page }) => {
        // Publish a per-run-unique assembly via the REAL canvas (the nonce lives
        // in the probe clause id, so the content-derived slug is fresh each run —
        // no snapshot/revert needed; devnet is a mainnet rehearsal).
        const { slug, name } = await publishProbeAssembly(page);

        // ── The publish actually anchored, read back out-of-band ─────
        const anchored = (await discoverAnchoredAssemblies()).some((t) => t.slug === slug);
        expect(anchored, 'the published probe assembly is anchored on AssemblyRegistry').toBe(true);

        // ── Inspect the published assembly read-only ─────────────────
        // The publish flow deleted the local draft, so /view/<slug> resolves from
        // chain. `just-published=1` rides out the AssemblyRegistered indexer race.
        await page.goto(
            `/assemblies/designer/view?slug=${slug}&just-published=1&e2e=devnet`,
            { waitUntil: 'domcontentloaded' },
        );

        await expect(page.getByTestId('assembly-view-page')).toBeVisible({ timeout: 30000 });
        // Resolved from chain (AssemblyRegistered → IPFS assemblyTemplate), not a draft.
        await expect(page.getByTestId('view-source-badge')).toContainText('on-chain', { timeout: 15000 });
        // The on-chain assemblyTemplate's editorial name rendered in the toolbar.
        await expect(page.getByTestId('view-toolbar')).toContainText(name);
        // Published assemblies offer Fork; drafts offer Edit.
        await expect(page.getByTestId('view-fork-button')).toBeVisible();
        await expect(page.getByTestId('view-edit-button')).toHaveCount(0);
    });

    test('a slug that is neither a draft nor on-chain shows the not-found error', async ({ page }) => {
        const missingSlug = `a9-missing-${Date.now()}`;

        await page.goto(
            `/assemblies/designer/view?slug=${missingSlug}&e2e=devnet`,
            { waitUntil: 'domcontentloaded' },
        );

        await expect(page.getByTestId('assembly-view-error')).toBeVisible({ timeout: 30000 });
        await expect(page.getByRole('heading', { name: 'Assembly not found' })).toBeVisible();
    });
});
