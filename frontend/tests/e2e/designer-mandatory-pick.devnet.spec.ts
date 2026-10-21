/**
 * designer-mandatory-pick.devnet.spec.ts
 *
 * The drawer's mandatory article lists REGISTERED AGREEMENTS, not clauses:
 * every live `AgreementRegistry` registration whose clauses are all
 * mandatory-article, whoever registered it. The designer picks one for each
 * order in the assembly's list; nothing is preselected and nothing folds on
 * its own. The pick's clauses merge into each agreement the designer
 * composes, and publishing needs a pick for every order.
 *
 *   1. The article is discovered from chain → IPFS (`discoverMandatoryAgreements`):
 *      the seeded registration, the mandatory clauses alone.
 *   2. A fresh two-order canvas composes a per-run probe clause on the
 *      sub-order (a unique composition, so the publish anchors).
 *   3. The drawer's mandatory article lists the seeded registration,
 *      unchecked; no mandatory clause is offered as a checkbox of its own.
 *   4. With no pick, the canvas closes Review and names why; a draft saved
 *      without a pick is refused on the review screen too.
 *   5. Picked on every order, the assembly publishes; read back out of band
 *      (AssemblyRegistry → IPFS, each agreement from AgreementRegistry →
 *      IPFS, verified against its key), every agreement carries every clause
 *      of the pick, beside the probe clause the designer composed.
 *
 * Requires Anvil + ./scripts/deploy-local.sh + Kubo + populate-test-data.
 */
import { test, expect } from './devnet-multi-test';
import type { Page } from '@playwright/test';
import type { Hex } from 'viem';
import {
    discoverAnchoredAssemblies,
    discoverMandatoryAgreements,
    pickMandatoryForEveryOrder,
    publishOrAdoptReviewed,
} from './devnet-helpers';
import { makeProbeSpec, registerProbeClause } from './probeAssembly';

/** Save the draft, landing on the designer hub, and read the handle the
 *  canvas assigned from the hub's drafts list. */
async function saveDraft(page: Page): Promise<string> {
    await expect(page.getByTestId('designer-save')).toBeEnabled({ timeout: 5000 });
    await page.getByTestId('designer-save').click();
    await page.waitForURL(/\/assemblies\/designer\/?(\?|$)/, { timeout: 15000 });
    const row = page.locator('[data-testid^="draft-row-"]').first();
    await row.waitFor({ state: 'visible', timeout: 15000 });
    const slug = (await row.getAttribute('data-testid'))?.replace(/^draft-row-/, '');
    expect(slug, 'the hub lists the saved draft').toBeTruthy();
    return slug!;
}

test.describe('Designer mandatory article (devnet)', () => {
    test.setTimeout(240_000);

    test('the article lists registered agreements; no pick refuses publish; a pick merges its clauses into every agreement', async ({ page }) => {
        // ── 1. What the article lists, from the chain ───────────────────────
        const listed = await discoverMandatoryAgreements();
        expect(listed.length, 'the chain holds a registration whose clauses are all mandatory-article').toBeGreaterThan(0);
        const seeded = listed[0];
        const pickClauses = Object.keys(seeded.document.clauses).map((k) => k.toLowerCase());
        expect(pickClauses.length).toBeGreaterThan(0);

        // ── 2. A unique two-order composition ───────────────────────────────
        const nonce = `${Date.now()}`;
        const probeKey = await registerProbeClause(makeProbeSpec(`figaro-probe-mandatory-${nonce}`, `Mandatory pick probe ${nonce}`));
        await page.goto('/assemblies/designer/new?fresh=1&e2e=devnet', { waitUntil: 'domcontentloaded' });
        await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
        await page.getByTestId('designer-saved-hint').waitFor({ timeout: 15000 });
        const orderNodes = page.locator('[data-testid^="order-node-"]:not([data-testid$="-delete"])');
        await expect(orderNodes).toHaveCount(1, { timeout: 10000 });
        const rootId = (await orderNodes.first().getAttribute('data-testid'))!.replace('order-node-', '');
        await orderNodes.first().click();
        await page.getByTestId('agreement-drawer').waitFor({ state: 'visible', timeout: 10000 });
        await page.getByTestId(`btn-add-suborder-${rootId}`).click();
        await expect(orderNodes).toHaveCount(2, { timeout: 10000 });
        const subId = (await orderNodes.evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')!.replace('order-node-', ''))))
            .find((id) => id !== rootId)!;

        // ── 3. The article on the drawer ────────────────────────────────────
        await page.getByTestId(`drawer-node-tab-${subId}`).click();
        await page.getByTestId('drawer-tab-registry').click();
        const article = page.getByTestId('drawer-mandatory-article');
        const seededRow = page.getByTestId(`drawer-mandatory-agreement-${seeded.agreementHash}`);
        await expect(seededRow, 'the article lists the seeded registration').toBeVisible({ timeout: 30000 });
        await expect(article.locator('input[type="radio"]'), 'one row per registration the chain lists').toHaveCount(listed.length);
        for (const radio of await article.locator('input[type="radio"]').all()) {
            await expect(radio, 'nothing is preselected').not.toBeChecked();
        }
        for (const clauseKey of pickClauses) {
            await expect(
                page.getByTestId(`drawer-registry-clause-${clauseKey as Hex}`),
                'no mandatory clause is offered as a checkbox of its own',
            ).toHaveCount(0);
        }
        const probe = page.getByTestId(`drawer-registry-clause-${probeKey}`);
        await expect(probe, 'the drawer surfaces the probe clause').toHaveCount(1, { timeout: 20000 });
        await probe.check();

        // ── 4. No pick: publishing is refused, on the canvas and the review ──
        await page.getByTestId('designer-name-input').fill(`Mandatory pick ${nonce}`);
        await page.getByTestId('designer-summary-input').fill('Two orders, each picking the mandatory clauses.');
        await page.getByTestId('designer-description-input').fill('The designer picks a registered agreement in the mandatory article for every order.');
        const review = page.getByTestId('designer-review');
        await expect(review, 'Review stays closed until every order has a pick').toBeDisabled();
        await expect(review).toHaveAttribute('title', /mandatory article for every order/);
        const handle = await saveDraft(page);
        await page.goto(`/assemblies/designer/view?slug=${handle}&intent=publish&e2e=devnet`, { waitUntil: 'domcontentloaded' });
        await expect(page.getByTestId('review-composition-error'), 'the review names the missing pick')
            .toContainText('has no registered agreement picked in the mandatory article', { timeout: 30000 });
        await expect(page.getByTestId('review-confirm-publish'), 'publish is refused').toBeDisabled();

        // ── 5. Pick on every order, publish, read back out of band ──────────
        await page.goto(`/assemblies/designer/edit?slug=${handle}&e2e=devnet`, { waitUntil: 'domcontentloaded' });
        await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
        await pickMandatoryForEveryOrder(page, seeded.agreementHash);
        await expect(review).toBeEnabled({ timeout: 10000 });
        await review.click();
        await page.waitForURL(/\/assemblies\/designer\/view\/?\?slug=asm-/, { timeout: 15000 });
        const reviewHandle = page.url().match(/[?&]slug=(asm-[a-z0-9-]+)/)?.[1];
        const slug = await publishOrAdoptReviewed(page, reviewHandle!, async () => {
            for (const clauseKey of pickClauses) {
                await expect(page.getByTestId(`review-mandatory-${clauseKey}`), 'the review lists each mandatory clause by key').toHaveCount(1);
            }
        });

        const anchored = (await discoverAnchoredAssemblies()).find((a) => a.slug === slug);
        expect(anchored, 'the published assembly is anchored and every agreement reads from AgreementRegistry → IPFS').toBeTruthy();
        expect(anchored!.agreements).toHaveLength(2);
        for (const entry of anchored!.agreements) {
            const carried = Object.keys(entry.clauses).map((k) => k.toLowerCase());
            for (const clauseKey of pickClauses) {
                expect(carried, `${entry.id} carries ${clauseKey}, merged from the pick`).toContain(clauseKey);
            }
        }
        const sub = anchored!.agreements.find((e) => Object.keys(e.clauses).some((k) => k.toLowerCase() === probeKey.toLowerCase()));
        expect(sub, 'the composed probe clause sits beside the pick\'s clauses').toBeTruthy();
    });
});
