/**
 * designer-agreement-drawer.devnet.spec.ts
 *
 * AgreementDrawer clause composition persists. The drawer's registry tab
 * lists every clause the live ClauseRegistry holds (chain → IPFS); checking
 * a clause composes it onto the selected order, and the composition must
 * survive the save + reload round-trip — through the UI on both ends:
 *
 *   1. /builders/designer/new?fresh=1 — blank canvas, one root order.
 *   2. Open the drawer → registry tab → compose figaro-geolocation (awaited into
 *      existence: checkboxes render once the spec cache warms chain→IPFS).
 *   3. The clause's REQUIRED geohash fields render as design-time inputs with
 *      the format-declared affordance (`format: "geohash"` → the registered
 *      device-location picker — the open format axis): the origin fills from
 *      the DEVICE location (Playwright-set coordinates → encoded geohash),
 *      the destination is typed by hand (typing stays first-class).
 *   4. Save; discover the assigned draft handle from the hub's drafts list and
 *      reload via /builders/designer/edit/<slug> — the geolocation checkbox is
 *      STILL CHECKED and both composed VALUES survived.
 *   5. Uncheck it, save, reload — STILL UNCHECKED. Both directions of a
 *      user-driven clause edit persist.
 *
 * Requires Anvil + ./scripts/deploy-local.sh + Kubo + the dev server.
 */
import { test, expect } from './devnet-multi-test';
import type { Page } from '@playwright/test';
import { encodeGeohash } from '@figaro/core/extensions';
import { PUBLIC_GEOHASH_MAX_PRECISION } from '@/lib/shared/geohash';

const GEO_CLAUSE_KEY = 'figaro-geolocation';

// The coordinates Playwright feeds the browser's Geolocation API — the
// device-location affordance must encode exactly this cell, at the
// public-surface precision cap (the field lands in a pinned agreement).
const DEVICE_LAT = 37.7749;
const DEVICE_LON = -122.4194;
const DEVICE_GEOHASH = encodeGeohash(DEVICE_LAT, DEVICE_LON, PUBLIC_GEOHASH_MAX_PRECISION);

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
    await page.goto(`/builders/designer/edit/${slug}?e2e=devnet`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
}

test.describe('Designer AgreementDrawer (devnet)', () => {
    test.setTimeout(180_000);

    test('toggling the geo clause persists through save and reload — both directions', async ({ page }) => {
        // The device-location affordance reads the browser's Geolocation API —
        // grant it and pin the coordinates the test asserts against.
        await page.context().grantPermissions(['geolocation']);
        await page.context().setGeolocation({ latitude: DEVICE_LAT, longitude: DEVICE_LON });

        await page.goto('/builders/designer/new?fresh=1&e2e=devnet', { waitUntil: 'domcontentloaded' });
        await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
        await page.getByTestId('designer-saved-hint').waitFor({ timeout: 15000 });

        // ── Compose geo ON, save, reload — the composition survives ─────────
        const geoToggle = await openGeoToggle(page);
        await expect(geoToggle, 'geo is NOT default-composed on a fresh order').not.toBeChecked();
        await geoToggle.check();

        // ── The clause's REQUIRED geohash fields render as design-time inputs
        //    with the format-declared affordance (the open format axis:
        //    format:"geohash" → the registered device-location picker; no
        //    clause is named in the dispatch). Fill the origin from the
        //    DEVICE, type the destination by hand. ──
        const origin = page.getByTestId(`drawer-field-${GEO_CLAUSE_KEY}-originGeohash`);
        await origin.waitFor({ state: 'visible', timeout: 10000 });
        await page.getByTestId(`drawer-field-${GEO_CLAUSE_KEY}-originGeohash-device`).click();
        await expect(origin, "the device affordance encodes the browser's location into the field")
            .toHaveValue(DEVICE_GEOHASH, { timeout: 10000 });
        const destination = page.getByTestId(`drawer-field-${GEO_CLAUSE_KEY}-destinationGeohash`);
        await destination.fill('9q8yyk8yu');

        const slug = await saveDraft(page);

        await reopenDraft(page, slug);
        const geoAfterOn = await openGeoToggle(page);
        await expect(geoAfterOn, 'the composed geo clause survives save + reload').toBeChecked();
        // The composed VALUES survive too — both fill paths.
        await expect(
            page.getByTestId(`drawer-field-${GEO_CLAUSE_KEY}-originGeohash`),
            'the device-filled origin survives save + reload',
        ).toHaveValue(DEVICE_GEOHASH, { timeout: 10000 });
        await expect(
            page.getByTestId(`drawer-field-${GEO_CLAUSE_KEY}-destinationGeohash`),
            'the typed destination survives save + reload',
        ).toHaveValue('9q8yyk8yu', { timeout: 10000 });

        // ── Toggle OFF, save, reload — the removal survives too ─────────────
        await geoAfterOn.uncheck();
        const slugAfterResave = await saveDraft(page);
        expect(slugAfterResave, 're-saving keeps the same draft handle').toBe(slug);

        await reopenDraft(page, slug);
        const geoAfterOff = await openGeoToggle(page);
        await expect(geoAfterOff, 'the removed geo clause stays removed after reload').not.toBeChecked();
    });
});
