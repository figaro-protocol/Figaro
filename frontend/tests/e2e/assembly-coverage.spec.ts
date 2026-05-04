/**
 * assembly-coverage.spec.ts
 *
 * Smoke tests verifying that figaro-equipment-rental and figaro-freelance
 * are registered and inspectable via the builder-tier inspector at
 * `/builders/designer/view/[slug]`. Pre-2026-05 these tests targeted the
 * `/i/<slug>` assembly runtime's role switcher; that runtime was deleted
 * along with its role-switcher chrome. The reference assemblies are still
 * builder-tier assets — the inspector is now the canonical surface for
 * "is this assembly shipped + readable?".
 */
import { test, expect } from '@playwright/test';

test.describe('Equipment rental assembly is shipped (mock)', () => {
    test('renders in the designer inspector', async ({ page }) => {
        await page.goto('/builders/designer/view/figaro-equipment-rental?e2e=mock', { waitUntil: 'load' });
        await expect(page.locator('main')).toContainText(/Equipment/i, { timeout: 15000 });
    });
});

test.describe('Freelance assembly is shipped (mock)', () => {
    test('renders in the designer inspector', async ({ page }) => {
        await page.goto('/builders/designer/view/figaro-freelance?e2e=mock', { waitUntil: 'load' });
        await expect(page.locator('main')).toContainText(/Freelance/i, { timeout: 15000 });
    });
});
