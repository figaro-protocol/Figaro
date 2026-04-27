/**
 * ux-improvements.spec.ts
 *
 * Covers Figaro Protocol core page UI/UX:
 *
 *  1.  Builders page — links to registered assemblies + designer + SDK
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
// 1. Builders page — links to composition surfaces
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Builders page — composition links', () => {
    test('Registered assemblies link targets the assemblies route', async ({ page }) => {
        await gotoRoute(page, '/builders');
        const link = page.getByRole('link', { name: 'Registered assemblies' });
        await expect(link).toBeVisible({ timeout: 10_000 });
        await expect(link).toHaveAttribute('href', '/builders/assemblies');

        await gotoRoute(page, '/builders/assemblies?e2e=mock');
        await expect(page.getByRole('heading', { name: 'Browse Assemblies' })).toBeVisible({ timeout: 15_000 });
    });

    test('Designer link targets the designer route', async ({ page }) => {
        await gotoRoute(page, '/builders');
        // Designer also appears in the footer; scope to main content.
        const link = page.locator('#main-content').getByRole('link', { name: 'Designer' });
        await expect(link).toBeVisible({ timeout: 10_000 });
        await expect(link).toHaveAttribute('href', '/builders/designer');
    });

    test('SDK link targets the integrate route', async ({ page }) => {
        await gotoRoute(page, '/builders');
        const link = page.getByRole('link', { name: '@figaro/core (SDK)' });
        await expect(link).toBeVisible({ timeout: 10_000 });
        await expect(link).toHaveAttribute('href', '/integrate');
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


