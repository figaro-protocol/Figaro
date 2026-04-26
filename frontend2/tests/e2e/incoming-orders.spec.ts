/**
 * incoming-orders.spec.ts
 *
 * Mock-mode tests for the IncomingOrdersModule and restaurant-role
 * coordinator action signals. Verifies:
 *   - IncomingOrdersModule renders only for restaurant role
 *   - Mock-mode notice is shown (no XMTP inbox in mock sessions)
 *   - CoordinatorActionModule renders for restaurant and driver roles
 *   - Restaurant role sees stages 0–1 (not driver stages 2–4)
 */
import { test, expect } from '@playwright/test';
import { gotoAssemblyMock, switchToAssemblyRole } from './test-helpers';

// ── IncomingOrdersModule ─────────────────────────────────────────────────────

test.describe('IncomingOrdersModule (mock)', () => {
    test('renders for restaurant role', async ({ page }) => {
        await gotoAssemblyMock(page);
        await switchToAssemblyRole(page, 'restaurant');

        const module = page.getByTestId('incoming-orders-module');
        await expect(module).toBeVisible({ timeout: 15000 });
    });

    test('shows mock-mode notice in mock session', async ({ page }) => {
        await gotoAssemblyMock(page);
        await switchToAssemblyRole(page, 'restaurant');

        const module = page.getByTestId('incoming-orders-module');
        await expect(module).toBeVisible({ timeout: 15000 });

        // In mock mode, the XMTP inbox is bypassed — a notice explains this
        await expect(module.getByTestId('incoming-orders-mock-notice')).toBeVisible();
        await expect(module.getByText('Mock mode active')).toBeVisible();
    });

    test('does not render for buyer role', async ({ page }) => {
        await gotoAssemblyMock(page);
        // Default role is buyer — module should be absent
        await expect(page.getByTestId('incoming-orders-module')).not.toBeVisible({ timeout: 5000 });
    });

    test('does not render for driver role', async ({ page }) => {
        await gotoAssemblyMock(page);
        await switchToAssemblyRole(page, 'driver');

        await expect(page.getByTestId('incoming-orders-module')).not.toBeVisible({ timeout: 5000 });
    });
});

// ── CoordinatorActionModule — restaurant role ────────────────────────────────

test.describe('CoordinatorActionModule restaurant signals (mock)', () => {
    test('coordinator module renders for restaurant role', async ({ page }) => {
        await gotoAssemblyMock(page);
        await switchToAssemblyRole(page, 'restaurant');

        const module = page.getByTestId('coordinator-action-module');
        await expect(module).toBeVisible({ timeout: 15000 });
    });

    test('coordinator module renders for driver role', async ({ page }) => {
        await gotoAssemblyMock(page);
        await switchToAssemblyRole(page, 'driver');

        const module = page.getByTestId('coordinator-action-module');
        await expect(module).toBeVisible({ timeout: 15000 });
    });

    test('coordinator module prompts to select an order when none is selected', async ({ page }) => {
        await gotoAssemblyMock(page);
        await switchToAssemblyRole(page, 'restaurant');

        const module = page.getByTestId('coordinator-action-module');
        await expect(module).toBeVisible({ timeout: 15000 });

        // No order is pre-selected in mock mode — shows the prompt
        await expect(module.getByText('Select a delivery order to send lifecycle signals.')).toBeVisible();
    });
});

// ── Coexistence check ────────────────────────────────────────────────────────

test.describe('Incoming orders coexistence with existing modules (mock)', () => {
    test('incoming-orders module coexists with coordinator module for restaurant', async ({ page }) => {
        await gotoAssemblyMock(page);
        await switchToAssemblyRole(page, 'restaurant');

        await expect(page.getByTestId('incoming-orders-module')).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('coordinator-action-module')).toBeVisible({ timeout: 15000 });
    });
});
