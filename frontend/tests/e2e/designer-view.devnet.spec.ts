/**
 * designer-view.devnet.spec.ts
 *
 * Phase 5 A9: the read-only assembly inspector at
 * /builders/designer/view/[slug] (`ViewAssemblyClient`). No devnet spec
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
import { evmRevert, evmSnapshot } from './devnet-helpers';


test.describe('Assembly read-only inspector — /view/[slug] (devnet)', () => {

    // The publish leg is canvas → review → IPFS pin → on-chain tx.
    test.setTimeout(180_000);

    test('publishes an assembly, then inspects it read-only at /view/[slug]', async ({ page }) => {
        const draftName = `a9-${Date.now()}`;
        const slug = draftName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

        // ── Publish via the canvas (the designer-publish flow) ───────
        await page.goto('/builders/designer/new?fresh=1&e2e=devnet', { waitUntil: 'domcontentloaded' });
        await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
        await page.getByTestId('designer-saved-hint').waitFor({ timeout: 15000 });

        await page.getByTestId('designer-name-input').fill(draftName);
        await expect(page.getByTestId('designer-review')).toBeEnabled({ timeout: 5000 });
        await page.getByTestId('designer-review').click();

        await page.waitForURL(new RegExp(`/builders/designer/view/${slug}`), { timeout: 15000 });
        await page.goto(
            `/builders/designer/view/${slug}?intent=publish&e2e=devnet`,
            { waitUntil: 'domcontentloaded' },
        );

        const confirmBtn = page.getByTestId('review-confirm-publish');
        // The review route cold-compiles on first hit — 30s headroom so a
        // loaded machine doesn't race the compile.
        await confirmBtn.waitFor({ state: 'visible', timeout: 30000 });
        await page.waitForFunction(
            () => !Array.from(document.querySelectorAll('button'))
                .some((b) => b.textContent?.trim() === 'Connect Wallet'),
            null,
            { timeout: 30000 },
        );
        await confirmBtn.click();
        await page.getByTestId('assembly-publish-receipt').waitFor({ timeout: 60000 });

        // ── Inspect the published assembly read-only ─────────────────
        // The publish flow deleted the local draft, so /view/<slug>
        // resolves from chain. `just-published=1` rides out the
        // AssemblyRegistered indexer race.
        await page.goto(
            `/builders/designer/view/${slug}?just-published=1&e2e=devnet`,
            { waitUntil: 'domcontentloaded' },
        );

        await expect(page.getByTestId('assembly-view-page')).toBeVisible({ timeout: 30000 });
        // Resolved from chain (AssemblyRegistered → IPFS assemblyTemplate), not a draft.
        await expect(page.getByTestId('view-source-badge')).toContainText('on-chain', { timeout: 15000 });
        // The on-chain assemblyTemplate's name rendered in the toolbar.
        await expect(page.getByTestId('view-toolbar')).toContainText(draftName);
        // Published assemblies offer Fork; drafts offer Edit.
        await expect(page.getByTestId('view-fork-button')).toBeVisible();
        await expect(page.getByTestId('view-edit-button')).toHaveCount(0);
    });

    test('a slug that is neither a draft nor on-chain shows the not-found error', async ({ page }) => {
        const missingSlug = `a9-missing-${Date.now()}`;

        await page.goto(
            `/builders/designer/view/${missingSlug}?e2e=devnet`,
            { waitUntil: 'domcontentloaded' },
        );

        await expect(page.getByTestId('assembly-view-error')).toBeVisible({ timeout: 30000 });
        await expect(page.getByRole('heading', { name: 'Assembly not found' })).toBeVisible();
    });
});
