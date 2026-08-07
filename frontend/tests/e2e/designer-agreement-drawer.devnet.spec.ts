/**
 * designer-agreement-drawer.devnet.spec.ts
 *
 * AgreementDrawer clause composition persists — and design time is
 * STRUCTURAL (ruled 2026-07-14). The drawer's registry tab lists every
 * clause the live ClauseRegistry holds (chain → IPFS); checking a clause
 * composes it onto the selected order, and the composition must survive the
 * save + reload round-trip — through the UI on both ends:
 *
 *   1. /assemblies/designer/new?fresh=1 — blank canvas, one root order.
 *   2. Open the drawer → registry tab → compose figaro-geolocation (awaited into
 *      existence: checkboxes render once the spec cache warms chain→IPFS).
 *   3. A clause with NO designer fills exposes NO field editors in the drawer
 *      — its fields are transaction particulars, authored by the buyer at
 *      checkout (the device affordance and precision clamp live there now;
 *      local-commerce and rate-pricing drive them). A clause declaring
 *      `block.design.fills` (figaro-consent) DOES expose editors for exactly
 *      those fields — the designer's tailoring affix.
 *   4. Save; discover the assigned draft handle from the hub's drafts list and
 *      reload via /assemblies/designer/edit?slug=<slug> — the geolocation checkbox is
 *      STILL CHECKED.
 *   5. Uncheck it, save, reload — STILL UNCHECKED. Both directions of a
 *      user-driven clause edit persist.
 *
 * A second test covers what a design fill's VALUE does to the composition:
 * the enum options render through the spec's own valueLabels (a labelled
 * choice, not a raw token), and changing the chosen value MOVES the canvas's
 * live composition identity — the designer sees that a regime variant is a
 * SIBLING assembly, not a setting on the one they are editing. Every enum
 * value is DISCOVERED from the rendered spec; nothing is hardcoded.
 *
 * Requires Anvil + ./scripts/deploy-local.sh + Kubo + the dev server.
 */
import { test, expect } from './devnet-multi-test';
import type { Page } from '@playwright/test';

const GEO_CLAUSE_KEY = 'figaro-geolocation';
const CONSENT_CLAUSE_KEY = 'figaro-consent';
// A clause naming a design fill whose field is an ENUM — the disclosure regime.
// The clause + field are named (as the other design-fill specs name theirs);
// the VALUES are read off the live spec the drawer rendered.
const REGIME_CLAUSE_KEY = 'figaro-data-terms';
const REGIME_FIELD = 'disclosure';

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
    await page.waitForURL(/\/assemblies\/designer(\?|$)/, { timeout: 15000 });
    const row = page.locator('[data-testid^="draft-row-"]').first();
    await row.waitFor({ state: 'visible', timeout: 15000 });
    const testId = await row.getAttribute('data-testid');
    const slug = testId?.replace(/^draft-row-/, '');
    expect(slug, 'the hub lists the saved draft').toBeTruthy();
    return slug as string;
}

/** Reopen the saved draft in the editor. */
async function reopenDraft(page: Page, slug: string) {
    await page.goto(`/assemblies/designer/edit?slug=${slug}&e2e=devnet`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
}

test.describe('Designer AgreementDrawer (devnet)', () => {
    test.setTimeout(180_000);

    test('toggling the geo clause persists through save and reload — both directions; editors gate on design.fills', async ({ page }) => {
        await page.goto('/assemblies/designer/new?fresh=1&e2e=devnet', { waitUntil: 'domcontentloaded' });
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

    test('an enum design fill renders its spec labels, and changing its value moves the composition identity', async ({ page }) => {
        await page.goto('/assemblies/designer/new?fresh=1&e2e=devnet', { waitUntil: 'domcontentloaded' });
        await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });

        // The canvas states its composition identity as soon as there is a
        // composition to identify — derived from the same walk publish anchors.
        const hashReadout = page.getByTestId('designer-composition-hash');
        await expect(hashReadout).toBeVisible({ timeout: 30000 });
        const before = await hashReadout.getAttribute('title');
        expect(before, 'the identity readout carries the full composition hash').toMatch(/^0x[0-9a-f]{64}$/);

        // Compose the regime clause on the root order.
        const rootNode = page.locator('[data-testid^="order-node-"]:not([data-testid$="-delete"])').first();
        await rootNode.waitFor({ state: 'visible', timeout: 10000 });
        await rootNode.click();
        await page.getByTestId('agreement-drawer').waitFor({ state: 'visible', timeout: 10000 });
        await page.getByTestId('drawer-tab-registry').click();
        const regimeToggle = page.getByTestId(`drawer-registry-clause-${REGIME_CLAUSE_KEY}`);
        await expect(regimeToggle, 'the drawer surfaces the regime clause').toHaveCount(1, { timeout: 20000 });
        await regimeToggle.check();

        // The design fill renders as a LABELLED choice. Its options — and their
        // raw tokens — come off the live spec: each radio's testid carries the
        // token, and the option's label span titles it.
        const group = page.getByTestId(`drawer-field-${REGIME_CLAUSE_KEY}-${REGIME_FIELD}-group`);
        await expect(group, 'the enum design fill renders a choice').toBeVisible({ timeout: 10000 });
        const radios = group.locator('input[type="radio"]');
        const optionCount = await radios.count();
        expect(optionCount, 'the regime offers a choice').toBeGreaterThan(1);

        const tokens: string[] = [];
        let humanized = 0;
        for (let i = 0; i < optionCount; i++) {
            const testId = await radios.nth(i).getAttribute('data-testid');
            const token = testId!.replace(`drawer-field-${REGIME_CLAUSE_KEY}-${REGIME_FIELD}-`, '');
            tokens.push(token);
            // The DISPLAY is the spec's valueLabels; the raw token survives as
            // the tooltip (and as the committed value).
            const option = group.locator(`label:has([data-testid="${testId}"]) span[title="${token}"]`);
            await expect(option, `${token} labels through the spec`).toHaveCount(1);
            const shown = (await option.innerText()).trim();
            expect(shown.length, `${token} renders some display text`).toBeGreaterThan(0);
            if (shown !== token) humanized++;
        }
        // At least one option reads as prose rather than its wire token — the
        // spec's labels are actually applied, not just declared. (A spec MAY
        // label a value with its own token, so this is a set-level assertion,
        // not per-option.)
        expect(humanized, 'the spec valueLabels reach the designer').toBeGreaterThan(0);

        // Pick the first regime — the identity moves off the fill-less baseline.
        await page.getByTestId(`drawer-field-${REGIME_CLAUSE_KEY}-${REGIME_FIELD}-${tokens[0]}`).check();
        await expect(hashReadout).not.toHaveAttribute('title', before!, { timeout: 10000 });
        const first = await hashReadout.getAttribute('title');

        // Pick a DIFFERENT regime — same clauses, same topology, one changed
        // design fill: a different composition hash, i.e. a sibling assembly.
        await page.getByTestId(`drawer-field-${REGIME_CLAUSE_KEY}-${REGIME_FIELD}-${tokens[1]}`).check();
        await expect(
            hashReadout,
            'flipping a design fill is a DIFFERENT assembly, visibly — not a silent mutation of the same one',
        ).not.toHaveAttribute('title', first!, { timeout: 10000 });

        // Editorial prose is excluded from the composition subset — renaming
        // must leave the identity exactly where it is.
        const afterRegime = await hashReadout.getAttribute('title');
        await page.getByTestId('designer-name-input').fill('A completely different name');
        await expect(page.getByTestId('designer-name-input')).toHaveValue('A completely different name');
        await expect(
            hashReadout,
            'editorial prose is hash-excluded — renaming never forks identity',
        ).toHaveAttribute('title', afterRegime!);
    });
});
