/**
 * incoming-orders.spec.ts
 *
 * Mock-mode tests for the IncomingOrdersModule + CoordinatorActionModule
 * role-gating in the assembly workspace at /i/local-commerce.
 *
 * Per the 2026-04-27 mock audit: 3 separate "does not render for X role"
 * negative tests collapsed into the role-gating assertions inside the
 * keep tests below; "coordinator prompts to select an order" trimmed
 * (small UI state already covered by component tests).
 */
import { test, expect } from '@playwright/test';
import { gotoAssemblyMock, switchToAssemblyRole } from './test-helpers';

test.describe('IncomingOrdersModule (mock)', () => {
    test('renders for merchant role with mock-mode notice; absent on buyer + courier', async ({ page }) => {
        await gotoAssemblyMock(page);

        // Default role is buyer — module is merchant-scoped, must be absent.
        await expect(page.getByTestId('incoming-orders-module')).not.toBeVisible({ timeout: 5000 });

        // Switch to merchant: module renders with mock-mode notice.
        await switchToAssemblyRole(page, 'merchant');
        const module = page.getByTestId('incoming-orders-module');
        await expect(module).toBeVisible({ timeout: 15000 });
        await expect(module.getByTestId('incoming-orders-mock-notice')).toBeVisible();
        await expect(module.getByText('Mock mode active')).toBeVisible();

        // Switch to courier: module disappears.
        await switchToAssemblyRole(page, 'courier');
        await expect(page.getByTestId('incoming-orders-module')).not.toBeVisible({ timeout: 5000 });
    });
});

test.describe('CoordinatorActionModule (mock)', () => {
    test('renders for both merchant and courier roles', async ({ page }) => {
        await gotoAssemblyMock(page);
        await switchToAssemblyRole(page, 'merchant');
        await expect(page.getByTestId('coordinator-action-module')).toBeVisible({ timeout: 15000 });

        await switchToAssemblyRole(page, 'courier');
        await expect(page.getByTestId('coordinator-action-module')).toBeVisible({ timeout: 15000 });
    });
});

test.describe('Incoming orders coexistence (mock)', () => {
    test('incoming-orders + coordinator both render for merchant', async ({ page }) => {
        await gotoAssemblyMock(page);
        await switchToAssemblyRole(page, 'merchant');

        await expect(page.getByTestId('incoming-orders-module')).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('coordinator-action-module')).toBeVisible({ timeout: 15000 });
    });
});
