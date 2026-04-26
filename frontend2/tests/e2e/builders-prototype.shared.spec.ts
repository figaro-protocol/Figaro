/**
 * builders-prototype.shared.spec.ts — Shared builder prototype rendering tests.
 *
 * Runs in BOTH mock and devnet projects via the unified figaro-test fixture.
 * Validates assembly rendering is identical across chain modes.
 */
import { test, expect } from './figaro-test';

test.describe('Builder prototype — shared rendering', () => {
    test('lists multiple registered prototype assemblies', async ({ page, figaroMode }) => {
        const qs = figaroMode === 'mock' ? '?e2e=mock' : '?e2e=devnet';
        await page.goto(`/builders/prototype${qs}`, { waitUntil: 'load' });

        await expect(page.getByRole('heading', { name: 'Multi-Assembly Builder Prototype' })).toBeVisible({ timeout: 15000 });
        await expect(page.getByRole('heading', { name: 'Figaro Eats', level: 2 })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Figaro Procurement', level: 2 })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Figaro Disclosure Review', level: 2 })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Open Prototype' }).first()).toBeVisible();
    });

    test('renders figaro-eats assembly shell with the buyer-scoped derived surface', async ({ page, figaroMode }) => {
        const qs = figaroMode === 'mock' ? '?e2e=mock' : '?e2e=devnet';
        await page.goto(`/builders/prototype/figaro-eats${qs}`, { waitUntil: 'load' });

        await expect(page.getByText('Assembly Prototype')).toBeVisible({ timeout: 15000 });
        await expect(page.getByRole('heading', { name: 'Figaro Eats' })).toBeVisible();
        await expect(page.getByText('Derived Assembly Snapshot')).toBeVisible();

        await expect(page.getByRole('button', { name: 'Buyer' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Restaurant' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Driver' })).toBeVisible();

        await expect(page.getByText('Available networks:')).toBeVisible();
        await expect(page.getByText('Capability source:')).toBeVisible();
        await expect(page.getByText('Visible mechanisms: core-orders, delivery-coordinator')).toBeVisible();
        await expect(page.getByText(/Visible modules: .*seller-discovery/)).toBeVisible();
        await expect(page.getByText(/Visible modules: .*handoff-details/)).toBeVisible();
    });
});
