/**
 * designer-agreement-drawer.devnet.spec.ts
 *
 * AgreementDrawer clause composition persists — and design time is
 * STRUCTURAL (ruled 2026-07-14). The drawer's registry tab lists every
 * clause the live ClauseRegistry holds (chain → IPFS); checking a clause
 * composes it onto the selected order, and the composition must survive the
 * save + reload round-trip — through the UI on both ends:
 *
 *   1. /builders/designer/new?fresh=1 — blank canvas, one root order.
 *   2. Open the drawer → registry tab → compose figaro-geolocation (awaited into
 *      existence: checkboxes render once the spec cache warms chain→IPFS).
 *   3. A clause with NO designer fills exposes NO field editors in the drawer
 *      — its fields are transaction particulars, authored by the buyer at
 *      checkout (the device affordance and precision clamp live there now;
 *      local-commerce and rate-pricing drive them). A clause declaring
 *      `block.design.fills` (figaro-consent) DOES expose editors for exactly
 *      those fields — the designer's tailoring affix.
 *   4. Save; discover the assigned draft handle from the hub's drafts list and
 *      reload via /builders/designer/edit?slug=<slug> — the geolocation checkbox is
 *      STILL CHECKED.
 *   5. Uncheck it, save, reload — STILL UNCHECKED. Both directions of a
 *      user-driven clause edit persist.
 *
 * Requires Anvil + ./scripts/deploy-local.sh + Kubo + the dev server.
 */
import { test, expect } from './devnet-multi-test';
import type { Page } from '@playwright/test';

const GEO_CLAUSE_KEY = 'figaro-geolocation';
const CONSENT_CLAUSE_KEY = 'figaro-consent';

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

/** Save the draft, landing back on the designer hub, and DISCOVER the slug
 *  the canvas assigned from the hub's drafts list (drafts carry a random
 *  `asm-draft-*` handle since the content-derived-slug migration — the UI is
 *  the only source of it; a name-derived slug is a retired model). */
async function saveDraft(page: Page): Promise<string> {
    await expect(page.getByTestId('designer-save')).toBeEnabled({ timeout: 5000 });
    await page.getByTestId('designer-save').click();
    // Save lands on the hub, preserving ?e2e=devnet in the query.
    await page.waitForURL(/\/builders\/designer(\?|$)/, { timeout: 15000 });
    const row = page.locator('[data-testid^="draft-row-"]').first();
    await row.waitFor({ state: 'visible', timeout: 15000 });
    const testId = await row.getAttribute('data-testid');
    const slug = testId?.replace(/^draft-row-/, '');
    expect(slug, 'the hub lists the saved draft').toBeTruthy();
    return slug as string;
}

/** Reopen the saved draft in the editor. */
async function reopenDraft(page: Page, slug: string) {
    await page.goto(`/builders/designer/edit?slug=${slug}&e2e=devnet`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
}

test.describe('Designer AgreementDrawer (devnet)', () => {
    test.setTimeout(180_000);

    test('toggling the geo clause persists through save and reload — both directions; editors gate on design.fills', async ({ page }) => {
        await page.goto('/builders/designer/new?fresh=1&e2e=devnet', { waitUntil: 'domcontentloaded' });
        await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
        await page.getByTestId('designer-saved-hint').waitFor({ timeout: 15000 });

        // ── Compose geo ON, save, reload — the composition survives ─────────
        const geoToggle = await openGeoToggle(page);
        await expect(geoToggle, 'geo is NOT default-composed on a fresh order').not.toBeChecked();
        await geoToggle.check();

        // ── Design time is STRUCTURAL: a GENERAL clause exposes NO field
        //    editors here — its geohashes are the buyer's, at checkout. ──
        await expect(
            page.getByTestId(`drawer-field-${GEO_CLAUSE_KEY}-origin`),
            'a general clause renders no design-time field editor (ruled 2026-07-14)',
        ).toHaveCount(0);
        await expect(
            page.getByTestId(`drawer-field-${GEO_CLAUSE_KEY}-destination`),
            'a general clause renders no design-time field editor (ruled 2026-07-14)',
        ).toHaveCount(0);

        // ── A clause declaring designer fills (consent — block.design.fills:
        //    ["documents"]) DOES render its editors: the affix repeater is the
        //    designer's act. ──
        const consentToggle = page.getByTestId(`drawer-registry-clause-${CONSENT_CLAUSE_KEY}`);
        await expect(consentToggle, 'drawer surfaces the consent clause').toHaveCount(1, { timeout: 20000 });
        await consentToggle.check();
        await expect(
            page.getByTestId(`drawer-field-${CONSENT_CLAUSE_KEY}-documents-add`),
            'a designer-fills clause renders its design-time editors (the tailoring affix)',
        ).toBeVisible({ timeout: 10000 });
        await consentToggle.uncheck();

        const slug = await saveDraft(page);

        await reopenDraft(page, slug);
        const geoAfterOn = await openGeoToggle(page);
        await expect(geoAfterOn, 'the composed geo clause survives save + reload').toBeChecked();

        // ── Toggle OFF, save, reload — the removal survives too ─────────────
        await geoAfterOn.uncheck();
        const slugAfterResave = await saveDraft(page);
        expect(slugAfterResave, 're-saving keeps the same draft handle').toBe(slug);

        await reopenDraft(page, slug);
        const geoAfterOff = await openGeoToggle(page);
        await expect(geoAfterOff, 'the removed geo clause stays removed after reload').not.toBeChecked();
    });
});
