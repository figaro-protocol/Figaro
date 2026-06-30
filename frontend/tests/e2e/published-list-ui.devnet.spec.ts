/**
 * published-list-ui.devnet.spec.ts
 *
 * Phase 5 item A8: the `PublishedList` surface on /builders/designer.
 * No devnet spec touched its two row actions before.
 *
 * The spec publishes a real assembly through the canvas (the only way
 * to get a genuinely valid assemblyTemplate — publish derives it from a
 * live design snapshot, so hand-rolling the assemblyTemplate JSON
 * would test fork/inspect against a shape the designer never emits),
 * then exercises both `PublishedList` controls:
 *
 *   - Inspect (`published-inspect-<slug>`) → /builders/designer/view/<slug>
 *   - Fork    (`published-fork-<slug>`)    → /builders/designer/edit/<forkSlug>
 *
 * Additive UI-tier coverage — the contract path is already covered by
 * assembly-registry.devnet.spec.ts; the publish flow by
 * designer-publish.devnet.spec.ts.
 *
 * Requires Anvil + ./deploy-local.sh + Kubo.
 */
import { test, expect } from './devnet-multi-test';
import { publishProbeAssembly } from './probeAssembly';


test.describe('PublishedList fork + inspect (devnet)', () => {

    // Canvas → review → IPFS pin → on-chain tx, then two more nav round
    // trips. Comfortably past the 60s default.
    test.setTimeout(180_000);

    test('publish an assembly, then Inspect and Fork it from PublishedList', async ({ page }) => {
        // Publish a per-run-unique assembly via the REAL canvas — the nonce in the
        // probe clause id gives a fresh content-derived slug each run, so no
        // snapshot/revert (devnet is a mainnet rehearsal). PublishedList then reads
        // the AssemblyRegistered event for the connected wallet.
        const { slug } = await publishProbeAssembly(page);

        // ── The row appears on the designer index ────────────────────
        await page.goto('/builders/designer?e2e=devnet', { waitUntil: 'domcontentloaded' });
        await page.getByTestId(`published-row-${slug}`).waitFor({ timeout: 30000 });

        // Fork is disabled until the assemblyTemplate fetch resolves
        // (`choice.state === "loaded"`). Waiting for it enabled proves
        // the IPFS-pinned assemblyTemplate was fetched and parsed.
        await expect(page.getByTestId(`published-fork-${slug}`)).toBeEnabled({ timeout: 30000 });

        // ── Inspect → /builders/designer/view/<slug> ─────────────────
        await page.getByTestId(`published-inspect-${slug}`).click();
        await page.waitForURL(new RegExp(`/builders/designer/view/${slug}`), { timeout: 15000 });
        await expect(page.getByTestId('assembly-view-page')).toBeVisible({ timeout: 30000 });

        // ── Back to the index, Fork → /builders/designer/edit/<forkSlug> ──
        await page.goto('/builders/designer?e2e=devnet', { waitUntil: 'domcontentloaded' });
        await expect(page.getByTestId(`published-fork-${slug}`)).toBeEnabled({ timeout: 30000 });

        // forkPublishedAssembly() prompts for the new slug via window.prompt —
        // Playwright auto-dismisses dialogs unless handled, which would cancel the
        // fork. Accept with an explicit slug so the fork proceeds deterministically.
        const forkSlug = `${slug}-fork-a8`;
        page.once('dialog', (dialog) => { void dialog.accept(forkSlug); });
        await page.getByTestId(`published-fork-${slug}`).click();

        await page.waitForURL(new RegExp(`/builders/designer/edit/${forkSlug}`), { timeout: 15000 });
        // The forked draft hydrated into an editable canvas — not just a URL change.
        await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
    });
});
