/**
 * ux-improvements.spec.ts
 *
 * Covers Figaro Protocol core page UI/UX:
 *
 *  1.  Builders page #templates section exists
 *  2.  Route posture chrome — in-page banners for terminal and builder routes
 *
 * All tests use the mock project (no wallet / no chain required).
 */

import { test, expect } from './figaro-test';

async function gotoRoute(page: import('@playwright/test').Page, href: string) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            await page.goto(href, { waitUntil: 'domcontentloaded' });
            return;
        } catch (error) {
            const isRetryableAbort = error instanceof Error && error.message.includes('ERR_ABORTED');

            if (!isRetryableAbort || attempt === 2) {
                throw error;
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Builders page — #templates anchor
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Builders page — template anchor', () => {
    test('Browse Reference Assemblies link targets the assemblies route', async ({ page }) => {
        await gotoRoute(page, '/builders');
        const link = page.getByRole('link', { name: 'Browse Reference Assemblies' });
        await expect(link).toBeVisible({ timeout: 10_000 });
        const text = await link.textContent();
        expect(text?.trim().toLowerCase()).toContain('assemblies');
        await expect(link).toHaveAttribute('href', '/builders/assemblies');

        await gotoRoute(page, '/builders/assemblies?e2e=mock');
        await expect(page.getByRole('heading', { name: 'Browse Assemblies' })).toBeVisible({ timeout: 15_000 });
    });

    test('#sdk section exists for Level 2', async ({ page }) => {
        await gotoRoute(page, '/builders');
        await expect(page.locator('#sdk')).toBeAttached({ timeout: 10_000 });
    });

    test('#contracts section exists for Level 3', async ({ page }) => {
        await gotoRoute(page, '/builders');
        await expect(page.locator('#contracts')).toBeAttached({ timeout: 10_000 });
    });
});

test.describe('Route loading', () => {
    test('terminal route loads', async ({ page }) => {
        await gotoRoute(page, '/terminal?e2e=mock');
        await expect(page).toHaveURL(/terminal/);
    });

    test('builders route loads', async ({ page }) => {
        await gotoRoute(page, '/builders?e2e=mock');
        await expect(page).toHaveURL(/builders/);
    });

    test('live assembly routes load assembly runtime', async ({ page }) => {
        await gotoRoute(page, '/i/local-commerce?e2e=mock');
        await expect(page.getByTestId('assembly-runtime')).toBeVisible({ timeout: 15_000 });
    });
});


