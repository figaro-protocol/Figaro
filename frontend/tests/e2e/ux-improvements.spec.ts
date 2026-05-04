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
    test('Designer link targets the designer route', async ({ page }) => {
        await gotoRoute(page, '/builders');
        // Designer also appears in the footer; scope to main content.
        const link = page.locator('#main-content').getByRole('link', { name: 'Designer' });
        await expect(link).toBeVisible({ timeout: 10_000 });
        await expect(link).toHaveAttribute('href', '/builders/designer');
    });

    test('SDK schema encoders link targets the integrate route', async ({ page }) => {
        await gotoRoute(page, '/builders');
        const link = page.locator('#main-content').getByRole('link', { name: 'SDK schema encoders' });
        await expect(link).toBeVisible({ timeout: 10_000 });
        await expect(link).toHaveAttribute('href', '/integrate');
    });

    test('Schemas link targets the schemas route', async ({ page }) => {
        await gotoRoute(page, '/builders');
        const link = page.locator('#main-content').getByRole('link', { name: 'Schemas', exact: true });
        await expect(link).toBeVisible({ timeout: 10_000 });
        await expect(link).toHaveAttribute('href', '/schemas');
    });
});

test.describe('Route loading', () => {
    // Replaces the prior 'live assembly route loads assembly runtime shell'
    // smoke test, which targeted `/i/local-commerce` (deleted 2026-05). The
    // consumer entry points are `/discover` (operator catalogue) and the
    // per-merchant detail page; loading either is a meaningful "route
    // hydrates + key surface renders" check.

    test('discover route loads operator catalogue', async ({ page }) => {
        await gotoRoute(page, '/discover?e2e=mock');
        await expect(page.getByTestId('operator-card').first()).toBeVisible({ timeout: 15_000 });
    });

    test('legacy /i/<slug> redirects to /discover', async ({ page }) => {
        await gotoRoute(page, '/i/local-commerce?e2e=mock');
        await expect(page).toHaveURL(/\/discover/, { timeout: 10_000 });
    });
});


