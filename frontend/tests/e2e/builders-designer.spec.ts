/**
 * builders-designer.spec.ts — browser-level coverage for the DAG editor's
 * three routes (mock).
 *
 *   /builders/designer/new            blank seed (1-node root)
 *   /builders/designer/edit/[slug]    fork seed via assemblyToSyntheticOrders
 *   /builders/designer/view/[slug]    read-only DAG of the same seed
 *
 * Golden paths only — drag-handle interactions for spawning sub-orders are
 * deferred (require complex drag-and-drop simulation). What's covered:
 *
 *   - Each route renders its expected toolbar + canvas + node count.
 *   - /edit shows the fork badge and the sub-order edge pill.
 *   - The fulfilment-method picker on a sub-edge offers exactly the three
 *     `deliver:*` variants (NOT consume-onsite or pickup — sub-order edges
 *     under root-buyer-dominance can only be delivery semantics).
 *   - /view is read-only (no save-draft button), and "Fork to edit" routes
 *     to the editable view.
 */
import { test, expect } from '@playwright/test';

test.describe('/builders/designer/new — blank DAG seed (mock)', () => {
    test('renders 1-node root and toolbar controls', async ({ page }) => {
        await page.goto('/builders/designer/new?e2e=mock', { waitUntil: 'load' });

        await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 15000 });
        await expect(page.getByTestId('order-graph-card')).toBeVisible();
        await expect(page.getByTestId('designer-save-draft')).toBeVisible();

        // A blank seed produces a single root order node — count via the
        // `order-node-*` testid prefix.
        const nodes = page.locator('[data-testid^="order-node-"]').filter({
            hasNot: page.locator('[data-testid$="-delete"]'),
        });
        await expect(nodes).toHaveCount(1);

        // No sub-orders yet → no edge pills.
        await expect(page.locator('[data-testid^="mechanism-pill-"]')).toHaveCount(0);
    });
});

test.describe('/builders/designer/edit/[slug] — forked DAG seed (mock)', () => {
    test('renders 2-node fork of local-commerce with auction edge pill', async ({ page }) => {
        await page.goto('/builders/designer/edit/local-commerce?e2e=mock', { waitUntil: 'load' });

        await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 15000 });
        await expect(page.getByTestId('designer-fork-badge')).toContainText('Forked from Figaro Local Commerce');
        await expect(page.getByTestId('designer-reset-seed')).toBeVisible();

        // Local commerce → 1 root + 1 sub = 2 nodes.
        const nodes = page.locator('[data-testid^="order-node-"]').filter({
            hasNot: page.locator('[data-testid$="-delete"]'),
        });
        await expect(nodes).toHaveCount(2);

        // Sub-order edge has a fulfilment pill.
        const pills = page.locator('[data-testid^="mechanism-pill-"]');
        await expect(pills).toHaveCount(1);
    });

    test('sub-order fulfilment picker offers only deliver:* variants', async ({ page }) => {
        // Schema fix verification: under root-buyer-dominance, sub-order
        // edges should never offer consume-onsite or pickup — those imply
        // a one-node graph (no sub-order needed).
        await page.goto('/builders/designer/edit/local-commerce?e2e=mock', { waitUntil: 'load' });
        await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 15000 });

        const pill = page.locator('[data-testid^="mechanism-pill-"]').first();
        await pill.click();

        const popover = page.locator('[data-testid^="mechanism-popover-"]').first();
        await expect(popover).toBeVisible();

        // Exactly three options, each a deliver:* variant.
        const options = popover.locator('[data-testid^="mechanism-option-"]');
        await expect(options).toHaveCount(3);
        await expect(popover.locator('[data-testid$="-deliver:buyer-assigned"]')).toBeVisible();
        await expect(popover.locator('[data-testid$="-deliver:seller-assigned"]')).toBeVisible();
        await expect(popover.locator('[data-testid$="-deliver:dutch-auction"]')).toBeVisible();

        // Forbidden: 1-node-graph methods.
        await expect(popover.locator('[data-testid$="-consume-onsite"]')).toHaveCount(0);
        await expect(popover.locator('[data-testid$="-pickup"]')).toHaveCount(0);
    });
});

test.describe('/builders/designer/view/[slug] — read-only DAG (mock)', () => {
    test('renders read-only canvas + Fork-to-edit affordance', async ({ page }) => {
        await page.goto('/builders/designer/view/local-commerce?e2e=mock', { waitUntil: 'load' });

        await page.getByTestId('assembly-view-page').waitFor({ timeout: 15000 });
        await expect(page.getByTestId('view-toolbar')).toBeVisible();
        await expect(page.getByTestId('order-graph-card')).toBeVisible();

        // Read-only: no save / reset toolbar buttons.
        await expect(page.getByTestId('designer-save-draft')).toHaveCount(0);
        await expect(page.getByTestId('designer-reset-seed')).toHaveCount(0);

        // Same seed shape as /edit — 2 nodes for local-commerce.
        const nodes = page.locator('[data-testid^="order-node-"]').filter({
            hasNot: page.locator('[data-testid$="-delete"]'),
        });
        await expect(nodes).toHaveCount(2);

        // "Fork to edit" routes to the editable canvas.
        const fork = page.getByRole('link', { name: /Fork to edit/i });
        await expect(fork).toHaveAttribute('href', '/builders/designer/edit/local-commerce');
    });
});
