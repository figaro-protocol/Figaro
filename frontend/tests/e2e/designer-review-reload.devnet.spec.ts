// lint-allow-no-chain-facts: the design lives in the browser's storage until publish; this spec publishes nothing.
/**
 * designer-review-reload.devnet.spec.ts — the Review screen keeps the design
 * the canvas holds, on the client-side transition, through a reload, and
 * through the browser's back button to the canvas.
 *
 * The Review screen is the last reading a designer makes before an
 * irreversible anchor. It is asserted FIRST on the client-side transition the
 * Review button performs (`router.push`), before any `page.goto()` or reload
 * could hydrate it again from storage: what it states there is what the
 * canvas handed it. Then:
 *
 *   reload  the Review screen, loaded again from the draft the Review button
 *           saved, states the same orders, the same clauses on each, the same
 *           assembly-scoped term and the same composition hash.
 *   back    the browser's back button returns to the canvas
 *           (/assemblies/designer/new), which resumes the new design's
 *           autosave: the same orders, the same clauses, the same term, the
 *           same editorial identity and the same composition hash.
 *
 * The composition: a root order and a child order, a clause composed on each
 * in the drawer, one assembly-scoped term and the editorial identity. Every
 * clause key is located by name over the specs the chain registered.
 *
 * Requires Anvil + ./scripts/devup.sh (deploy + populate) + Kubo + :3100.
 */
import { test, expect } from './devnet-multi-test';
import type { Hex } from 'viem';
import type { Page } from '@playwright/test';
import { keyOf, primeRegisteredClauseSpecs } from './devnet-helpers';
import { composedClauseChip } from './probeAssembly';

let GEO_CLAUSE_KEY: Hex;
let SCHEDULE_CLAUSE_KEY: Hex;
let FORUM_CLAUSE_KEY: Hex;
test.beforeAll(async () => {
    await primeRegisteredClauseSpecs();
    GEO_CLAUSE_KEY = keyOf('figaro-geolocation');
    SCHEDULE_CLAUSE_KEY = keyOf('figaro-schedule');
    FORUM_CLAUSE_KEY = keyOf('figaro-arbitration-kleros');
});

/** Compose `clauseKey` on the order `orderId` through the drawer's registry
 *  tab. The canvas holds two orders, so the drawer shows its per-order tabs. */
async function composeOn(page: Page, orderId: string, clauseKey: Hex) {
    await page.locator(`[data-order-id="${orderId}"]`).first().click();
    await page.getByTestId('agreement-drawer').waitFor({ state: 'visible', timeout: 10000 });
    await page.getByTestId(`drawer-node-tab-${orderId}`).click();
    await page.getByTestId('drawer-tab-registry').click();
    await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });
    const box = page.getByTestId(`drawer-registry-clause-${clauseKey}`);
    await expect(box, `the drawer surfaces ${clauseKey}`).toHaveCount(1, { timeout: 20000 });
    await box.check();
}

test.describe('Designer Review keeps the design — client-side, reload, back (devnet)', () => {
    test.setTimeout(180_000);

    test('the Review screen states the canvas composition before any navigation, after a reload, and the back button returns the same design to the canvas', async ({ page }) => {
        await page.goto('/assemblies/designer/new?fresh=1&e2e=devnet', { waitUntil: 'domcontentloaded' });
        await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
        await page.getByTestId('designer-saved-hint').waitFor({ timeout: 15000 });

        // ── COMPOSE: a root and a child, a clause on each, one assembly term,
        //    the editorial identity. ──
        const orderNodes = page.locator('[data-testid^="order-node-"]:not([data-testid$="-delete"])');
        await expect(orderNodes).toHaveCount(1, { timeout: 10000 });
        const idsOf = () => orderNodes.evaluateAll((els) =>
            els.map((el) => el.getAttribute('data-testid')!.replace('order-node-', '')));
        const [rootId] = await idsOf();
        await page.getByTestId(`btn-add-suborder-${rootId}`).click();
        await expect(orderNodes).toHaveCount(2, { timeout: 10000 });
        const childId = (await idsOf()).find((id) => id !== rootId)!;
        await composeOn(page, rootId, GEO_CLAUSE_KEY);
        await composeOn(page, childId, SCHEDULE_CLAUSE_KEY);
        const forumToggle = page.getByTestId(`assembly-terms-clause-${FORUM_CLAUSE_KEY}`);
        await expect(forumToggle, 'the assembly-terms panel surfaces the forum clause').toHaveCount(1, { timeout: 20000 });
        await forumToggle.check();

        const name = `Review keeps the design ${Date.now()}`;
        const summary = 'A root and a child order, each with its own term.';
        const description = 'Two orders, a clause on each, one dispute forum for the whole design.';
        await page.getByTestId('designer-name-input').fill(name);
        await page.getByTestId('designer-summary-input').fill(summary);
        await page.getByTestId('designer-description-input').fill(description);

        // What the canvas states before Review: a chip per composed clause on
        // its own order, and one composition hash.
        await expect(composedClauseChip(page, GEO_CLAUSE_KEY, rootId), 'the canvas states the root\'s clause').toHaveCount(1, { timeout: 10000 });
        await expect(composedClauseChip(page, SCHEDULE_CLAUSE_KEY, childId), 'the canvas states the child\'s clause').toHaveCount(1, { timeout: 10000 });
        const hash = page.getByTestId('designer-assembly-hash');
        await expect(hash).toHaveAttribute('title', /^0x[0-9a-f]{64}$/, { timeout: 30000 });
        const canvasHash = (await hash.getAttribute('title'))!;

        /** The composition the Review screen states, read against the canvas. */
        const expectReviewStatesTheDesign = async (when: string) => {
            await expect(page.getByTestId('view-source-badge'), `${when}: the review screen`).toContainText('review', { timeout: 30000 });
            await expect(
                page.locator('[data-testid^="node-clauses-empty-"]'),
                `${when}: no order reads as termless`,
            ).toHaveCount(0, { timeout: 30000 });
            await expect(composedClauseChip(page, GEO_CLAUSE_KEY, rootId), `${when}: the root's clause, on the root`).toHaveCount(1, { timeout: 30000 });
            await expect(composedClauseChip(page, SCHEDULE_CLAUSE_KEY, childId), `${when}: the child's clause, on the child`).toHaveCount(1, { timeout: 30000 });
            await expect(
                page.getByTestId('view-assembly-terms').getByTestId(`assembly-terms-clause-${FORUM_CLAUSE_KEY}`),
                `${when}: the assembly-scoped term`,
            ).toBeChecked({ timeout: 30000 });
            await expect(page.getByTestId('view-summary'), `${when}: the summary`).toHaveText(summary);
            await expect(page.getByTestId('designer-assembly-hash'), `${when}: the composition hash the canvas showed`)
                .toHaveAttribute('title', canvasHash, { timeout: 30000 });
        };

        // ── REVIEW: the client-side transition, asserted before any goto. ──
        await expect(page.getByTestId('designer-review')).toBeEnabled({ timeout: 5000 });
        await page.getByTestId('designer-review').click();
        await page.waitForURL(/\/assemblies\/designer\/view\/?\?slug=asm-/, { timeout: 15000 });
        const handle = new URL(page.url()).searchParams.get('slug');
        expect(handle, 'the review names the draft it reads').toMatch(/^asm-/);
        await expectReviewStatesTheDesign('on the client-side transition');

        // ── RELOAD: the Review screen loads again from the saved draft. ──
        await page.reload({ waitUntil: 'domcontentloaded' });
        expect(new URL(page.url()).searchParams.get('slug'), 'the reload stays on the same draft').toBe(handle);
        await expectReviewStatesTheDesign('after a reload');

        // ── BACK: the browser's back button returns the design to the canvas. ──
        await page.goBack({ waitUntil: 'domcontentloaded' });
        await expect(page).toHaveURL(/\/assemblies\/designer\/new\/?(\?|$)/);
        await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
        await page.getByTestId('designer-saved-hint').waitFor({ timeout: 15000 });
        await expect(orderNodes, 'after the back button: both orders').toHaveCount(2, { timeout: 10000 });
        expect((await idsOf()).sort(), 'after the back button: the same orders').toEqual([rootId, childId].sort());
        await expect(composedClauseChip(page, GEO_CLAUSE_KEY, rootId), 'after the back button: the root\'s clause').toHaveCount(1, { timeout: 30000 });
        await expect(composedClauseChip(page, SCHEDULE_CLAUSE_KEY, childId), 'after the back button: the child\'s clause').toHaveCount(1, { timeout: 30000 });
        await expect(page.getByTestId(`assembly-terms-clause-${FORUM_CLAUSE_KEY}`), 'after the back button: the assembly term')
            .toBeChecked({ timeout: 30000 });
        await expect(page.getByTestId('designer-name-input'), 'after the back button: the name').toHaveValue(name);
        await expect(page.getByTestId('designer-summary-input'), 'after the back button: the summary').toHaveValue(summary);
        await expect(page.getByTestId('designer-description-input'), 'after the back button: the description').toHaveValue(description);
        await expect(page.getByTestId('designer-assembly-hash'), 'after the back button: the same composition hash')
            .toHaveAttribute('title', canvasHash, { timeout: 30000 });
    });
});
