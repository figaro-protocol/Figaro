/**
 * designer-assist.devnet.spec.ts
 *
 * COMPOSITION-ASSIST — the canvas's hand-off surface to the designer's own
 * agent (punch-list block 9). The world is the public ecosystem seam
 * (`figaro-assembly-designer` runs in the USER's runtime, for the user's
 * wallet); the canvas's job is the round-trip assembly template: export the current
 * draft as the canonical AssemblyTemplate JSON, and import a template back
 * onto the live canvas as ordinary unsaved state.
 *
 * This spec proves the round-trip through the UI on both ends: compose a
 * two-order draft with a clause selection, export it from the assist panel,
 * reset the canvas blank, paste the exported template back, and watch the
 * composition — nodes, clause selection, editorial name — return. The
 * exported JSON stands in for the agent leg: the template IS the interface,
 * so a round-tripped export exercises exactly what an agent-composed
 * template exercises.
 */
import { test, expect } from './devnet-multi-test';

const PROCESS_CLAUSE = 'figaro-merchant-process';

test.describe('COMPOSITION-ASSIST — export the draft, import a template, composing stays the designer\'s act (devnet)', () => {
    test.setTimeout(180_000);

    test('a composed draft round-trips through the assist panel', async ({ page }) => {
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });
        await page.addInitScript(() => {
            try {
                window.localStorage.removeItem('figaro:designer:current');
                window.localStorage.removeItem('figaro:designer:drafts');
            } catch { /* noop */ }
        });

        // ── COMPOSE: root + one sub-order; select a clause on the sub. ──
        await page.goto('/assemblies/designer/new?fresh=1&e2e=devnet', { waitUntil: 'domcontentloaded' });
        await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
        await page.getByTestId('designer-saved-hint').waitFor({ timeout: 15000 });

        const orderNodes = page.locator('[data-testid^="order-node-"]:not([data-testid$="-delete"])');
        await expect(orderNodes).toHaveCount(1, { timeout: 10000 });
        const rootTestId = await orderNodes.first().getAttribute('data-testid');
        const rootId = rootTestId!.replace('order-node-', '');

        await orderNodes.first().click();
        await page.getByTestId('agreement-drawer').waitFor({ state: 'visible', timeout: 10000 });
        await page.getByTestId(`btn-add-suborder-${rootId}`).click();
        await expect(orderNodes).toHaveCount(2, { timeout: 10000 });
        const nodeIds = await orderNodes.evaluateAll((els) =>
            els.map((el) => el.getAttribute('data-testid')!.replace('order-node-', '')));
        const subId = nodeIds.find((id) => id !== rootId)!;

        await page.getByTestId(`drawer-node-tab-${subId}`).click();
        await page.getByTestId('drawer-tab-registry').click();
        await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });
        await page.getByTestId(`drawer-registry-clause-${PROCESS_CLAUSE}`).check();

        await page.getByTestId('designer-name-input').fill('Assist round trip');

        // ── EXPORT: the assist panel serializes the live draft. ──
        await page.getByTestId('designer-assist-open').click();
        await page.getByTestId('designer-assist-panel').waitFor({ state: 'visible', timeout: 10000 });
        const exported = await page.getByTestId('designer-assist-template').inputValue();
        const template = JSON.parse(exported) as {
            name?: string;
            agreements: Array<{ id: string; clauses: Record<string, unknown> }>;
        };
        expect(template.name, 'the editorial name rides the template').toBe('Assist round trip');
        expect(template.agreements, 'one agreement per drawn order').toHaveLength(2);
        expect(
            template.agreements.some((a) => PROCESS_CLAUSE in a.clauses),
            'the drawer selection lands in the exported composition',
        ).toBe(true);

        // Close the panel, then RESET the canvas to blank — the import must
        // rebuild the composition from the template alone.
        await page.keyboard.press('Escape');
        await page.getByTestId('designer-reset').click();
        await expect(orderNodes).toHaveCount(1, { timeout: 10000 });
        await expect(page.getByTestId('designer-name-input')).toHaveValue('');

        // ── IMPORT: paste the exported template back (the agent-leg stand-in). ──
        await page.getByTestId('designer-assist-open').click();
        await page.getByTestId('designer-assist-panel').waitFor({ state: 'visible', timeout: 10000 });
        await page.getByTestId('designer-assist-import-input').fill(exported);
        await page.getByTestId('designer-assist-import').click();

        // The panel closes; the composition is back on the canvas.
        await expect(page.getByTestId('designer-assist-panel')).toHaveCount(0, { timeout: 10000 });
        await expect(orderNodes, 'both orders return from the template').toHaveCount(2, { timeout: 10000 });
        await expect(page.getByTestId('designer-name-input')).toHaveValue('Assist round trip');

        // The clause selection survived: the non-root node's registry tab
        // shows the process clause checked.
        const importedIds = await orderNodes.evaluateAll((els) =>
            els.map((el) => el.getAttribute('data-testid')!.replace('order-node-', '')));
        await orderNodes.first().click();
        await page.getByTestId('agreement-drawer').waitFor({ state: 'visible', timeout: 10000 });
        let found = false;
        for (const id of importedIds) {
            await page.getByTestId(`drawer-node-tab-${id}`).click();
            await page.getByTestId('drawer-tab-registry').click();
            await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });
            if (await page.getByTestId(`drawer-registry-clause-${PROCESS_CLAUSE}`).isChecked()) {
                found = true;
                break;
            }
        }
        expect(found, 'the imported composition carries the clause selection').toBe(true);
    });
});
