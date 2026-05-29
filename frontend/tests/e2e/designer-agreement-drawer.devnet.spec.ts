/**
 * designer-agreement-drawer.devnet.spec.ts
 *
 * Phase 3c of the e2e remediation plan: AgreementDrawer clause
 * configuration. The audit identified zero coverage of the
 * drawer's clause-toggle interactions — open drawer, expand
 * article, toggle inclusion, save, reload, verify persistence.
 *
 * This spec walks the simplest article (logistics → Geo) end-to-end:
 *   1. /builders/designer/new?fresh=1 — wait for canvas hydration.
 *   2. Click the root order node → drawer opens.
 *   3. Click drawer-tab-logistics → logistics section renders.
 *   4. Click drawer-include-figaro-geo-v2 → toggle on.
 *   5. Fill name + click Save.
 *   6. Verify the saved snapshot in localStorage has the Geo
 *      section in the root order's agreement.
 *   7. Reload the page via /edit/<slug> and verify the toggle
 *      survives — proves the save+load round-trip works.
 *
 * Geo is chosen for simplicity (binary inclusion toggle, no required
 * fields at the drawer level). Phases 3d/3e cover other articles.
 */
import { test, expect } from './devnet-multi-test';

const GEO_CLAUSE_KEY = 'figaro-geo-v2';
const DRAFT_NAME = 'devnet-drawer-geo';

test.describe('Designer AgreementDrawer (devnet)', () => {
    test.setTimeout(120_000);

    test('toggling Geo clause on persists through save and reload', async ({ page }) => {
        const expectedSlug = DRAFT_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

        await page.addInitScript(() => {
            try {
                window.localStorage.removeItem('figaro:designer:current');
                window.localStorage.removeItem('figaro:designer:drafts');
            } catch { /* noop */ }
        });
        await page.goto('/builders/designer/new?fresh=1&e2e=devnet', { waitUntil: 'domcontentloaded' });
        await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
        await page.getByTestId('designer-saved-hint').waitFor({ timeout: 15000 });

        // Click the root order node to open the drawer for it. The
        // blank seed creates exactly one order, so a wildcard match
        // is unambiguous.
        const rootNode = page.locator('[data-testid^="order-node-"]:not([data-testid$="-delete"])').first();
        await rootNode.waitFor({ state: 'visible', timeout: 10000 });
        await rootNode.click();

        const drawer = page.getByTestId('agreement-drawer');
        await drawer.waitFor({ state: 'visible', timeout: 10000 });

        // Open the logistics section, then toggle Geo on.
        await page.getByTestId('drawer-tab-logistics').click();
        await page.getByTestId('drawer-section-logistics').waitFor({ state: 'visible', timeout: 5000 });

        // The Geo article is default-included on a fresh root order
        // (the blank seed always carries it because every order needs
        // an origin/destination). Toggle it OFF to prove the inverse
        // state survives the save+reload round-trip. The test value
        // is "user-driven clause edits persist", which a flip-off
        // exercises just as well as a flip-on.
        const geoToggle = page.getByTestId(`drawer-include-${GEO_CLAUSE_KEY}`);
        await expect(geoToggle).toBeChecked();
        await geoToggle.uncheck();
        await expect(geoToggle).not.toBeChecked();

        // Fill name and save. The Save button is disabled until name
        // is valid (>= 3 alphanum chars).
        await page.getByTestId('designer-name-input').fill(DRAFT_NAME);
        await expect(page.getByTestId('designer-save')).toBeEnabled({ timeout: 5000 });
        await page.getByTestId('designer-save').click();
        await page.waitForURL(/\/builders\/designer$/, { timeout: 15000 });

        // Snapshot assertion: the saved JSON must NOT carry a Geo
        // section under the root order's agreement (we just toggled
        // it off).
        const { hasGeo, sectionCount } = await page.evaluate(
            ({ slug, geoKey }: { slug: string; geoKey: string }) => {
                const raw = window.localStorage.getItem(`figaro:designer:drafts:${slug}`);
                if (!raw) return { hasGeo: false, sectionCount: 0 };
                const snap = JSON.parse(raw) as {
                    orders: Array<{ agreement?: { sections?: Array<{ clause: string }> } }>;
                };
                const root = snap.orders?.[0];
                const sections = root?.agreement?.sections ?? [];
                return {
                    hasGeo: sections.some((s) => s.clause === geoKey),
                    sectionCount: sections.length,
                };
            },
            { slug: expectedSlug, geoKey: GEO_CLAUSE_KEY },
        );
        expect(hasGeo, `expected NO Geo section in saved snapshot (sections: ${sectionCount})`).toBe(false);

        // Reload via /edit/<slug>. The canvas hydrates from the saved
        // draft; the Geo toggle should still be checked.
        await page.goto(`/builders/designer/edit/${expectedSlug}?e2e=devnet`, { waitUntil: 'domcontentloaded' });
        await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
        await page.getByTestId('designer-saved-hint').waitFor({ timeout: 15000 });

        const rootNodeAfter = page.locator('[data-testid^="order-node-"]:not([data-testid$="-delete"])').first();
        await rootNodeAfter.click();
        await page.getByTestId('agreement-drawer').waitFor({ state: 'visible', timeout: 10000 });
        await page.getByTestId('drawer-tab-logistics').click();
        await page.getByTestId('drawer-section-logistics').waitFor({ state: 'visible', timeout: 5000 });
        await expect(page.getByTestId(`drawer-include-${GEO_CLAUSE_KEY}`)).not.toBeChecked({ timeout: 5000 });
    });
});
