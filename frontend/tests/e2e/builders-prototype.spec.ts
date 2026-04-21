import { test, expect } from '@playwright/test';

// Institution list + eats shell rendering → builders-prototype.shared.spec.ts

test.describe('Builder prototype route — mock-only', () => {
    test('renders a second institution through the same prototype shell', async ({ page }) => {
        await page.goto('/builders/prototype/figaro-procurement?e2e=mock', { waitUntil: 'load' });

        await expect(page.getByText('Institution Shell Prototype')).toBeVisible({ timeout: 15000 });
        await expect(page.getByRole('heading', { name: 'Figaro Procurement' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Supplier' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Inspector' })).toBeVisible();
        await expect(page.getByText('/figaro-procurement')).toBeVisible();
        await expect(page.getByText('Visible mechanisms: core-orders')).toBeVisible();
        await expect(page.getByText('Visible modules: capability-rail, event-timeline, order-node, process-capital-summary, process-graph, role-switcher')).toBeVisible();
    });

    test('renders a disclosure-first institution with a narrower visible module surface', async ({ page }) => {
        await page.goto('/builders/prototype/figaro-disclosure-review?e2e=mock', { waitUntil: 'load' });

        await expect(page.getByText('Institution Shell Prototype')).toBeVisible({ timeout: 15000 });
        await expect(page.getByRole('heading', { name: 'Figaro Disclosure Review' })).toBeVisible();
        await expect(page.getByText('/figaro-disclosure-review')).toBeVisible();
        await expect(page.getByText('Visible mechanisms: core-orders')).toBeVisible();
        await expect(page.getByText('Visible modules: capability-rail, event-timeline, process-capital-summary')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Buyer' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Seller' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Reviewer' })).toHaveCount(0);
    });
});