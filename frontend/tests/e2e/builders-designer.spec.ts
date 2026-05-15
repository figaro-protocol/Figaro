/**
 * builders-designer.spec.ts — browser-level coverage for the DAG editor.
 *
 *   /builders/designer/new            blank seed (1-node root)
 *   /builders/designer/edit/[slug]    fork seed (reference) or draft seed
 *                                     (localStorage); transitional /fork
 *                                     branch goes away in migration Phase 6.
 *   /builders/designer                landing page with DraftsList + Reference
 *
 * Golden paths only — drag-handle interactions for spawning sub-orders are
 * deferred (require complex drag-and-drop simulation). What's covered:
 *
 *   - /new renders the toolbar + a single root node.
 *   - /edit/<reference-slug> shows the fork badge.
 *   - The fulfilment-method picker on a sub-edge offers exactly the three
 *     `deliver:*` variants (NOT consume-onsite or pickup — sub-order edges
 *     under root-buyer-dominance can only be delivery semantics).
 *   - /edit/<unknown-slug> shows the draft-not-found UI.
 *   - DraftsList's Edit button routes to /edit/<slug>.
 */
import { test, expect } from '@playwright/test';

test.describe('/builders/designer/new — blank DAG seed (mock)', () => {
    test('renders 1-node root and toolbar controls', async ({ page }) => {
        await page.goto('/builders/designer/new?e2e=mock', { waitUntil: 'load' });

        await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 15000 });
        await expect(page.getByTestId('order-graph-card')).toBeVisible();
        await expect(page.getByTestId('designer-save')).toBeVisible();

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
        await expect(page.getByTestId('designer-reset')).toBeVisible();

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

test.describe('/builders/designer/edit/[slug] — saved draft (mock)', () => {
    // A "seeded draft renders the full canvas" test would need to also seed
    // the agreementStore (the per-order agreement bodies, keyed by hash) —
    // otherwise the lens overlays crash on the unresolved agreementHash.
    // Round-trip rendering is verified end-to-end by manual canvas use
    // (save → reload → edit). Here we only verify the route plumbing.

    test('shows draft-not-found UI for an unknown slug', async ({ page }) => {
        await page.goto('/builders/designer/edit/does-not-exist?e2e=mock', { waitUntil: 'load' });
        await page.getByTestId('designer-seed-error').waitFor({ timeout: 15000 });
        await expect(page.getByTestId('designer-seed-error')).toContainText('Draft "does-not-exist" not found');
    });
});

test.describe('/builders/designer — DraftsList Edit button (mock)', () => {
    test('Edit link routes to /builders/designer/edit/{slug}', async ({ page }) => {
        await page.addInitScript(() => {
            const slug = 'e2e-list-fixture';
            window.localStorage.setItem(
                'figaro:designer:drafts',
                JSON.stringify([
                    { slug, name: 'List fixture', updatedAt: Date.now(), orderCount: 1 },
                ]),
            );
            window.localStorage.setItem(
                `figaro:designer:drafts:${slug}`,
                JSON.stringify({
                    slug,
                    name: 'List fixture',
                    processId: '0x' + '33'.repeat(32),
                    nextOrderIndex: 1,
                    nextSellerIndex: 1,
                    orders: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                }),
            );
        });
        await page.goto('/builders/designer?e2e=mock', { waitUntil: 'load' });
        await page.getByTestId('drafts-list').waitFor({ timeout: 15000 });

        const editLink = page.getByTestId('draft-row-e2e-list-fixture').getByRole('link', { name: 'Edit' });
        await expect(editLink).toHaveAttribute('href', '/builders/designer/edit/e2e-list-fixture');
    });
});

