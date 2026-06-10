/**
 * designer-agreement-drawer.devnet.spec.ts
 *
 * AgreementDrawer clause composition persists. The drawer's registry tab
 * lists every clause the live ClauseRegistry holds (chain → IPFS); checking
 * a clause composes it onto the selected order, and the composition must
 * survive the save + reload round-trip — through the UI on both ends:
 *
 *   1. /builders/designer/new?fresh=1 — blank canvas, one root order.
 *   2. Open the drawer → registry tab → compose figaro-geo-v2 (awaited into
 *      existence: checkboxes render once the spec cache warms chain→IPFS).
 *   3. Name + Save; reload via /builders/designer/edit/<slug> — the geo
 *      checkbox is STILL CHECKED.
 *   4. Uncheck it, save, reload — STILL UNCHECKED. Both directions of a
 *      user-driven clause edit persist.
 *
 * Geo is chosen for simplicity: a category-2 graph-data clause with no
 * drawer-level required fields — a single checkbox.
 *
 * Requires Anvil + ./scripts/deploy-local.sh + Kubo + the dev server.
 */
import { test, expect } from './devnet-multi-test';
import type { Page } from '@playwright/test';

const GEO_CLAUSE_KEY = 'figaro-geo-v2';
const DRAFT_NAME = 'devnet-drawer-geo';

/** Open the (sole) root order's drawer on its registry tab and return the
 *  geo checkbox, awaited into existence (chain→IPFS spec warm). */
async function openGeoToggle(page: Page) {
    const rootNode = page.locator('[data-testid^="order-node-"]:not([data-testid$="-delete"])').first();
    await rootNode.waitFor({ state: 'visible', timeout: 10000 });
    await rootNode.click();
    await page.getByTestId('agreement-drawer').waitFor({ state: 'visible', timeout: 10000 });
    await page.getByTestId('drawer-tab-registry').click();
    await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });
    const box = page.getByTestId(`drawer-registry-clause-${GEO_CLAUSE_KEY}`);
    await expect(box, 'drawer surfaces the geo clause').toHaveCount(1, { timeout: 20000 });
    return box;
}

/** Name + Save the draft, landing back on the designer hub. */
async function saveDraft(page: Page) {
    await page.getByTestId('designer-name-input').fill(DRAFT_NAME);
    await expect(page.getByTestId('designer-save')).toBeEnabled({ timeout: 5000 });
    await page.getByTestId('designer-save').click();
    // Save lands on the hub, preserving ?e2e=devnet in the query.
    await page.waitForURL(/\/builders\/designer(\?|$)/, { timeout: 15000 });
}

/** Reopen the saved draft in the editor. */
async function reopenDraft(page: Page, slug: string) {
    await page.goto(`/builders/designer/edit/${slug}?e2e=devnet`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
}

test.describe('Designer AgreementDrawer (devnet)', () => {
    test.setTimeout(180_000);

    test('toggling the geo clause persists through save and reload — both directions', async ({ page }) => {
        const slug = DRAFT_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

        await page.goto('/builders/designer/new?fresh=1&e2e=devnet', { waitUntil: 'domcontentloaded' });
        await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
        await page.getByTestId('designer-saved-hint').waitFor({ timeout: 15000 });

        // ── Compose geo ON, save, reload — the composition survives ─────────
        const geoToggle = await openGeoToggle(page);
        await expect(geoToggle, 'geo is NOT default-composed on a fresh order').not.toBeChecked();
        await geoToggle.check();
        await saveDraft(page);

        await reopenDraft(page, slug);
        const geoAfterOn = await openGeoToggle(page);
        await expect(geoAfterOn, 'the composed geo clause survives save + reload').toBeChecked();

        // ── Toggle OFF, save, reload — the removal survives too ─────────────
        await geoAfterOn.uncheck();
        await saveDraft(page);

        await reopenDraft(page, slug);
        const geoAfterOff = await openGeoToggle(page);
        await expect(geoAfterOff, 'the removed geo clause stays removed after reload').not.toBeChecked();
    });
});
