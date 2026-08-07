/**
 * designer-drafts-delete.devnet.spec.ts
 *
 * Phase 3e of the e2e remediation plan: DraftsList delete. Two
 * pre-seeded drafts in localStorage, click `draft-delete-<slug>` on
 * one, assert removal from both the DOM and the localStorage index.
 *
 * The handleDelete fires `window.confirm(...)` first; the test
 * accepts the dialog so the delete proceeds.
 */
import { test, expect } from './devnet-multi-test';

test.describe('Designer DraftsList delete (devnet)', () => {
    test('clicking draft-delete-<slug> removes the row and the localStorage entry', async ({ page }) => {
        const keptSlug = 'devnet-keep';
        const doomedSlug = 'devnet-doomed';

        // Pre-seed two drafts: one we'll delete, one we'll keep.
        await page.addInitScript((slugs: { kept: string; doomed: string }) => {
            try {
                const now = Date.now();
                const index = [
                    { slug: slugs.kept, name: 'Keep this', updatedAt: now, orderCount: 1 },
                    { slug: slugs.doomed, name: 'Delete me', updatedAt: now - 1000, orderCount: 1 },
                ];
                window.localStorage.setItem('figaro:designer:drafts', JSON.stringify(index));
                for (const slug of [slugs.kept, slugs.doomed]) {
                    window.localStorage.setItem(
                        `figaro:designer:drafts:${slug}`,
                        JSON.stringify({
                            slug,
                            name: slug === slugs.kept ? 'Keep this' : 'Delete me',
                            processId: '0x' + 'ab'.repeat(32),
                            nextOrderIndex: 1,
                            nextSellerIndex: 1,
                            orders: [],
                            createdAt: now,
                            updatedAt: now,
                        }),
                    );
                }
            } catch { /* noop */ }
        }, { kept: keptSlug, doomed: doomedSlug });

        await page.goto('/assemblies/designer?e2e=devnet', { waitUntil: 'domcontentloaded' });
        await page.getByTestId('drafts-list').waitFor({ timeout: 15000 });

        // Both rows render.
        await expect(page.getByTestId(`draft-row-${keptSlug}`)).toBeVisible();
        await expect(page.getByTestId(`draft-row-${doomedSlug}`)).toBeVisible();

        // Delete triggers a window.confirm; accept it.
        page.on('dialog', (dialog) => { dialog.accept().catch(() => {}); });
        await page.getByTestId(`draft-delete-${doomedSlug}`).click();

        // The doomed row should be gone; the kept row should remain.
        await expect(page.getByTestId(`draft-row-${doomedSlug}`)).toHaveCount(0, { timeout: 5000 });
        await expect(page.getByTestId(`draft-row-${keptSlug}`)).toBeVisible();

        // localStorage assertions: index no longer references the
        // doomed slug; the per-slug snapshot is removed.
        const { indexHasDoomed, snapshotExists, indexHasKept } = await page.evaluate(
            ({ kept, doomed }) => {
                const rawIndex = window.localStorage.getItem('figaro:designer:drafts');
                const index = rawIndex ? JSON.parse(rawIndex) as Array<{ slug: string }> : [];
                return {
                    indexHasDoomed: index.some((e) => e.slug === doomed),
                    indexHasKept: index.some((e) => e.slug === kept),
                    snapshotExists: !!window.localStorage.getItem(`figaro:designer:drafts:${doomed}`),
                };
            },
            { kept: keptSlug, doomed: doomedSlug },
        );
        expect(indexHasDoomed).toBe(false);
        expect(snapshotExists).toBe(false);
        expect(indexHasKept).toBe(true);
    });
});
