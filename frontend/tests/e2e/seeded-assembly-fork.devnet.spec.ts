/**
 * seeded-assembly-fork.devnet.spec.ts
 *
 * View + fork a SEEDED assembly through /builders/designer/view/[slug].
 *
 * The seeded assemblies (`direct-sale`, `local-commerce`) are authored by
 * anvil[0], the seed script's author wallet. `PublishedList` on
 * /builders/designer is author-scoped — `usePublishedAssemblies(address)`
 * filters `AssemblyRegistered` by the indexed `author` topic — so it
 * surfaces a seeded assembly only to anvil[0]. Every other wallet reaches
 * a seeded assembly through /view/[slug], whose on-chain lookup filters by
 * `slugHash` alone, with no author topic.
 *
 * That makes the /view page's own Fork button (`view-fork-button` ->
 * `ViewAssemblyClient.handleFork`) the fork path for seeded data — and the
 * one fork action no other spec clicks: published-list-ui.devnet covers
 * the `PublishedList` Fork; designer-view.devnet only asserts the /view
 * Fork button is visible.
 *
 * This spec opens the seeded `direct-sale`, clicks Fork, accepts the slug
 * prompt, and asserts the fork hydrated into an editable canvas at
 * /builders/designer/edit/<forkSlug>. Forking writes a localStorage draft
 * only — no on-chain tx — so the spec is snapshot-clean.
 *
 * Requires Anvil + ./deploy-local.sh + Kubo + a seeded devnet
 * (frontend/scripts/seed-devnet.mjs registers `direct-sale`).
 */
import { test, expect } from './devnet-multi-test';
import { evmRevert, evmSnapshot } from './devnet-helpers';

// The seed registers this slug from scripts/fixtures/direct-sale.manifest.json.
const SEEDED_SLUG = 'direct-sale';
const SEEDED_NAME = 'Direct Sale';

let outerSnapshot: string;
test.beforeAll(async () => { outerSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (outerSnapshot) await evmRevert(outerSnapshot); });

test.describe('Fork a seeded assembly from /view/[slug] (devnet)', () => {
    let testSnapshot: string;
    test.beforeEach(async () => { testSnapshot = await evmSnapshot(); });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    // On-chain resolve + IPFS manifest fetch + fork hydration + nav.
    test.setTimeout(180_000);

    test('views the seeded direct-sale assembly and forks it into an editable draft', async ({ page }) => {
        // ── View the seeded assembly read-only ───────────────────────
        // /view resolves `direct-sale` from the chain: AssemblyRegistered
        // by slugHash (no author filter) -> IPFS manifest. A fresh browser
        // context carries no `direct-sale` localStorage draft, so the
        // on-chain branch is taken.
        await page.goto(
            `/builders/designer/view/${SEEDED_SLUG}?e2e=devnet`,
            { waitUntil: 'domcontentloaded' },
        );

        await expect(page.getByTestId('assembly-view-page')).toBeVisible({ timeout: 30000 });
        // Resolved from chain (not a draft), and it is the seeded assembly.
        await expect(page.getByTestId('view-source-badge')).toContainText('on-chain', { timeout: 15000 });
        await expect(page.getByTestId('view-toolbar')).toContainText(SEEDED_NAME);

        // A seeded assembly is authored by another wallet -> Fork, not Edit.
        await expect(page.getByTestId('view-fork-button')).toBeVisible();
        await expect(page.getByTestId('view-edit-button')).toHaveCount(0);

        // ── Fork it ──────────────────────────────────────────────────
        // forkPublishedAssembly() prompts for the new slug via
        // window.prompt; Playwright auto-dismisses dialogs unless handled,
        // which would cancel the fork. Accept with an explicit unique slug
        // so the fork proceeds deterministically.
        const forkSlug = `direct-sale-fork-${Date.now()}`;
        page.once('dialog', (dialog) => { void dialog.accept(forkSlug); });
        await page.getByTestId('view-fork-button').click();

        // handleFork saves the localStorage draft, then routes to the
        // edit canvas for the new slug.
        await page.waitForURL(new RegExp(`/builders/designer/edit/${forkSlug}`), { timeout: 15000 });

        // The fork hydrated into an editable canvas — not just a URL change.
        // direct-sale is the one-node scenario, so manifestToDraft carried
        // the manifest's single root order through.
        await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
        const orderNodes = page.locator('[data-testid^="order-node-"]:not([data-testid$="-delete"])');
        await expect(orderNodes).toHaveCount(1, { timeout: 10000 });
    });
});
