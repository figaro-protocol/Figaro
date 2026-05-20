/**
 * published-list-ui.devnet.spec.ts
 *
 * Phase 5 item A8: the `PublishedList` surface on /builders/designer.
 * No devnet spec touched its two row actions before.
 *
 * The spec publishes a real assembly through the canvas (the only way
 * to get a genuinely valid manifest — `buildAssemblyManifest` derives
 * it from a live design snapshot, so hand-rolling the manifest JSON
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
import { evmRevert, evmSnapshot } from './devnet-helpers';

let outerSnapshot: string;
test.beforeAll(async () => { outerSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (outerSnapshot) await evmRevert(outerSnapshot); });

test.describe('PublishedList fork + inspect (devnet)', () => {
    let testSnapshot: string;
    test.beforeEach(async () => { testSnapshot = await evmSnapshot(); });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    // Canvas → review → IPFS pin → on-chain tx, then two more nav round
    // trips. Comfortably past the 60s default.
    test.setTimeout(180_000);

    test('publish an assembly, then Inspect and Fork it from PublishedList', async ({ page }) => {
        // ── Publish an assembly via the canvas ───────────────────────
        // Mirrors designer-publish.devnet.spec.ts: the canvas authors a
        // valid manifest and pins it; PublishedList then reads the
        // AssemblyRegistered event for the connected wallet.
        const draftName = `a8-${Date.now()}`;
        const slug = draftName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

        await page.goto('/builders/designer/new?fresh=1&e2e=devnet', { waitUntil: 'domcontentloaded' });
        await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
        await page.getByTestId('designer-saved-hint').waitFor({ timeout: 15000 });

        await page.getByTestId('designer-name-input').fill(draftName);
        await expect(page.getByTestId('designer-publish')).toBeEnabled({ timeout: 5000 });
        await page.getByTestId('designer-publish').click();

        // Canvas navigates to /view/<slug>?intent=publish but drops the
        // ?e2e= param (DesignerCanvas.tsx:434) — re-goto with it appended.
        await page.waitForURL(new RegExp(`/builders/designer/view/${slug}`), { timeout: 15000 });
        await page.goto(
            `/builders/designer/view/${slug}?intent=publish&e2e=devnet`,
            { waitUntil: 'domcontentloaded' },
        );

        const confirmBtn = page.getByTestId('review-confirm-publish');
        await confirmBtn.waitFor({ state: 'visible', timeout: 15000 });
        await page.waitForFunction(
            () => {
                const buttons = Array.from(document.querySelectorAll('button'));
                return !buttons.some((b) => b.textContent?.trim() === 'Connect Wallet');
            },
            null,
            { timeout: 30000 },
        );
        await confirmBtn.click();
        await expect(page.getByText(/Published\b/i).first()).toBeVisible({ timeout: 60000 });

        // ── The row appears on the designer index ────────────────────
        await page.goto('/builders/designer?e2e=devnet', { waitUntil: 'domcontentloaded' });
        await page.getByTestId(`published-row-${slug}`).waitFor({ timeout: 30000 });

        // Fork is disabled until the manifest fetch resolves
        // (`choice.state === "loaded"`). Waiting for it enabled proves
        // the IPFS-pinned manifest was fetched and parsed.
        await expect(page.getByTestId(`published-fork-${slug}`)).toBeEnabled({ timeout: 30000 });

        // ── Inspect → /builders/designer/view/<slug> ─────────────────
        await page.getByTestId(`published-inspect-${slug}`).click();
        await page.waitForURL(new RegExp(`/builders/designer/view/${slug}`), { timeout: 15000 });
        await expect(page.getByTestId('assembly-view-page')).toBeVisible({ timeout: 30000 });

        // ── Back to the index, Fork → /builders/designer/edit/<forkSlug> ──
        await page.goto('/builders/designer?e2e=devnet', { waitUntil: 'domcontentloaded' });
        await expect(page.getByTestId(`published-fork-${slug}`)).toBeEnabled({ timeout: 30000 });

        // forkPublishedAssembly() prompts for the new slug via
        // window.prompt — Playwright auto-dismisses dialogs unless
        // handled, which would cancel the fork. Accept with an explicit
        // slug so the fork proceeds deterministically.
        const forkSlug = `${slug}-fork-a8`;
        page.once('dialog', (dialog) => { void dialog.accept(forkSlug); });
        await page.getByTestId(`published-fork-${slug}`).click();

        await page.waitForURL(new RegExp(`/builders/designer/edit/${forkSlug}`), { timeout: 15000 });
        // The forked draft hydrated into an editable canvas — not just a
        // URL change.
        await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
    });
});
