/**
 * designer-save-draft.devnet.spec.ts
 *
 * The designer canvas → Save → localStorage write half of the save/publish
 * loop (publish itself is `designer-publish` + the scenario specs). Two
 * orthogonal identifiers: Save assigns a stable local draft HANDLE
 * (`asm-draft-<random>`) and keys the draft by it (the published slug is
 * content-derived later, at publish); the EDITORIAL name (R2) is the designer's
 * own words, persisted alongside but never part of the handle or the slug. This
 * asserts both round-trip into localStorage and surface in the drafts list.
 *
 * What this exercises:
 *   - Navigate to /assemblies/designer/new?fresh=1 (blank seed = one root order).
 *   - Wait for the canvas to hydrate (`designer-saved-hint` = first autosave).
 *   - Type an editorial name into `designer-name-input`.
 *   - Click `designer-save` — enabled whenever the canvas holds ≥1 order
 *     (`canPublish`), no name gate (the name is optional) → handleSaveDraft →
 *     saveNamedDraft → /assemblies/designer.
 *   - Assert: the drafts index holds the auto-assigned handle; the per-handle
 *     snapshot persists the editorial name + the blank composition; DraftsList
 *     shows `draft-row-<handle>` carrying the name.
 *
 * No on-chain interaction, but the clause-spec cache still warms chain→IPFS for
 * the canvas to mount, so this lives in the devnet project.
 */
import { test, expect } from '@playwright/test';

test.describe('Designer save-draft (devnet)', () => {
    test('save persists the editorial name + auto-assigned handle to localStorage, and lists it', async ({ page }) => {
        const draftName = `Saved Draft ${Date.now()}`;
        // Start from an empty local store so the saved index holds exactly the
        // draft this test creates (clearing prior state, never seeding).
        await page.addInitScript(() => {
            try {
                window.localStorage.removeItem('figaro:designer:current');
                window.localStorage.removeItem('figaro:designer:drafts');
            } catch { /* noop */ }
        });

        await page.goto('/assemblies/designer/new?fresh=1&e2e=devnet', { waitUntil: 'domcontentloaded' });
        await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });

        // The canvas autosaves once hydrated; `designer-saved-hint` renders only
        // after that first autosave fires, so it is the canonical "ready"
        // signal. Save is gated by composition alone (`canPublish`) — the
        // editorial name (R2) is optional — and the blank seed already carries
        // one root order, so the button is enabled as soon as the canvas mounts.
        await page.getByTestId('designer-saved-hint').waitFor({ timeout: 15000 });

        // Finding 9: a blank node shows the "no terms yet" prompt — the per-node
        // derived-summary surface renders (its composed-clause branch is asserted
        // in scenario-direct-sale, which composes four clauses on its node).
        await expect(
            page.locator('[data-testid^="node-clauses-empty-"]').first(),
            'a blank node prompts the designer to compose its terms',
        ).toBeVisible({ timeout: 10000 });

        // The editorial name (R2) — free-form, optional, persisted with the draft
        // but never folded into the handle or the content slug.
        await page.getByTestId('designer-name-input').fill(draftName);

        const saveBtn = page.getByTestId('designer-save');
        await expect(saveBtn).toBeEnabled({ timeout: 5000 });

        await saveBtn.click();
        // handleSaveDraft preserves the ?e2e= flag, so the redirect carries a query.
        await page.waitForURL(/\/builders\/designer(\?|$)/, { timeout: 15000 });

        // localStorage: exactly the one draft we saved, keyed by an
        // auto-assigned `asm-draft-<random>` handle (no derived-from-name slug).
        const { slug, snapshotJson } = await page.evaluate(() => {
            const rawIndex = window.localStorage.getItem('figaro:designer:drafts');
            const index = rawIndex ? JSON.parse(rawIndex) as Array<{ slug: string; name: string }> : [];
            const only = index.length === 1 ? index[0].slug : undefined;
            const snapshotRaw = only ? window.localStorage.getItem(`figaro:designer:drafts:${only}`) : null;
            return { slug: only, snapshotJson: snapshotRaw };
        });

        expect(slug, 'exactly one draft saved, under an auto-assigned handle').toMatch(/^asm-draft-[0-9a-f]{8}$/);
        expect(snapshotJson).toBeTruthy();
        const snapshot = JSON.parse(snapshotJson!) as { slug: string; name: string; orders: unknown[] };
        // The handle keys the draft; the editorial name persists independently.
        expect(snapshot.slug).toBe(slug);
        expect(snapshot.name).toBe(draftName);
        // Blank seed = exactly one root order.
        expect(Array.isArray(snapshot.orders)).toBe(true);
        expect(snapshot.orders.length).toBe(1);

        // DraftsList surfaces the new draft by its handle, labelled with the name.
        const row = page.getByTestId(`draft-row-${slug}`);
        await expect(row).toBeVisible({ timeout: 10000 });
        await expect(row).toContainText(draftName);
    });
});
