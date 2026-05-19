/**
 * designer-save-draft.devnet.spec.ts
 *
 * Phase 3a of the e2e remediation plan: the designer canvas had
 * ZERO end-to-end devnet coverage. The mock spec
 * (builders-designer.spec.ts) covered render assertions only; the
 * actual user-facing operations (save, publish, edit, delete) were
 * untested.
 *
 * What this exercises:
 *   - Navigate to /builders/designer/new?fresh=1 (blank seed).
 *   - Wait for designer-canvas-toolbar to mount.
 *   - Fill `designer-name-input` with a 3+ alphanumeric-char name
 *     (`MIN_NAME_LENGTH` constraint per buildSnapshot).
 *   - Click `designer-save` → handleSaveDraft → saveNamedDraft to
 *     localStorage → router.push('/builders/designer').
 *   - Assert: URL is /builders/designer; the localStorage entry
 *     `figaro:designer:drafts:<slug>` exists with the saved
 *     snapshot; the DraftsList surfaces a `draft-row-<slug>` for
 *     the new draft.
 *
 * No on-chain interaction; this is the localStorage write half of
 * the save/publish loop. Phase 3b covers publish (IPFS + chain).
 */
import { test, expect } from '@playwright/test';

const DRAFT_NAME = 'devnet-save-test';

test.describe('Designer save-draft (devnet)', () => {
    test('save button persists draft to localStorage and redirects to drafts list', async ({ page }) => {
        // Clear any prior autosave session so the canvas mounts with
        // an actual blank state. Without this, `?fresh=1`'s mount-time
        // `loadCurrentSession()` (DesignerCanvas.tsx:181) restores
        // whatever was autosaved last — including overwriting the test's
        // setName with an empty string and leaving the Save button
        // permanently disabled.
        await page.addInitScript(() => {
            try {
                window.localStorage.removeItem('figaro:designer:current');
                window.localStorage.removeItem('figaro:designer:drafts');
            } catch { /* noop */ }
        });

        await page.goto('/builders/designer/new?fresh=1&e2e=devnet', { waitUntil: 'domcontentloaded' });
        await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });

        // Fill the name and wait for React state to propagate. The
        // canvas autosaves on every keystroke; the Save button reads
        // `nameValid` from the React `name` state, which trails the
        // DOM value by one microtask after `fill`. Re-fill once if
        // the button doesn't enable on the first attempt — covers a
        // race where the canvas's mount-time `setName("")` after
        // session-restore clobbers the first fill.
        const input = page.getByTestId('designer-name-input');
        const saveBtn = page.getByTestId('designer-save');
        // Wait for the canvas to finish hydration before touching the
        // input. The mount-time useEffect (DesignerCanvas.tsx:159)
        // runs setName(...) and would clobber our fill if we beat it
        // to the DOM. The `designer-saved-hint` testid renders only
        // after the FIRST autosave fires, which only fires once
        // hydrated=true — so its appearance is the canonical "ready
        // for input" signal.
        await page.getByTestId('designer-saved-hint').waitFor({ timeout: 15000 });
        await input.fill(DRAFT_NAME);
        await expect(input).toHaveValue(DRAFT_NAME, { timeout: 5000 });
        await expect(saveBtn).toBeEnabled({ timeout: 5000 });

        // Save → router.push to /builders/designer.
        await page.getByTestId('designer-save').click();
        await page.waitForURL(/\/builders\/designer$/, { timeout: 15000 });

        // localStorage assertion: the draft index lists the new slug,
        // and the per-slug snapshot key holds JSON with the right name.
        const { indexHasSlug, snapshotJson } = await page.evaluate((name: string) => {
            const rawIndex = window.localStorage.getItem('figaro:designer:drafts');
            const index = rawIndex ? JSON.parse(rawIndex) as Array<{ slug: string; name: string }> : [];
            const match = index.find((e) => e.name === name);
            const slug = match?.slug;
            const snapshotRaw = slug ? window.localStorage.getItem(`figaro:designer:drafts:${slug}`) : null;
            return {
                indexHasSlug: !!slug,
                snapshotJson: snapshotRaw,
            };
        }, DRAFT_NAME);

        expect(indexHasSlug).toBe(true);
        expect(snapshotJson).toBeTruthy();
        const snapshot = JSON.parse(snapshotJson!) as { name: string; orders: unknown[] };
        expect(snapshot.name).toBe(DRAFT_NAME);
        // Blank seed = exactly one root order.
        expect(Array.isArray(snapshot.orders)).toBe(true);
        expect(snapshot.orders.length).toBe(1);

        // DraftsList surfaces the new draft via draft-row-<slug>.
        // Derive slug deterministically from the name (URL-safe
        // lowercase alphanumerics+hyphens).
        const expectedSlug = DRAFT_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        await expect(page.getByTestId(`draft-row-${expectedSlug}`)).toBeVisible({ timeout: 10000 });
    });
});
