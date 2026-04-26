/**
 * analytical-modules.spec.ts
 *
 * Mock-mode tests verifying the event-timeline and process-capital-summary
 * modules render in the assembly workspace at /i/figaro-eats.
 * These modules show a fallback placeholder when no process is selected,
 * and populate with data once a process exists. We verify the empty-state
 * render here (same pattern as eats-modules.spec.ts).
 */
import { test, expect } from '@playwright/test';
import { gotoAssemblyMock, switchToAssemblyRole } from './test-helpers';

test.describe('Analytical modules render in assembly (mock)', () => {
    test('event-timeline module renders with fallback text', async ({ page }) => {
        await gotoAssemblyMock(page);

        const module = page.getByTestId('event-timeline-module');
        await expect(module).toBeVisible({ timeout: 15000 });

        // Should show "Order Timeline" header
        await expect(module.getByText('Order Timeline')).toBeVisible();

        // Fallback text when no process selected
        await expect(module.getByText('Select an order group from the sidebar to view its timeline.')).toBeVisible();
    });

    test('process-capital-summary module renders with fallback text', async ({ page }) => {
        await gotoAssemblyMock(page);

        const module = page.getByTestId('process-capital-module');
        await expect(module).toBeVisible({ timeout: 15000 });

        // Should show "Capital Summary" header
        await expect(module.getByText('Capital Summary')).toBeVisible();

        // Fallback text when no process selected
        await expect(module.getByText('Select a process from the sidebar to view capital flows.')).toBeVisible();
    });

    test('both analytical modules coexist with existing modules', async ({ page }) => {
        await gotoAssemblyMock(page);

        // Analytical modules visible
        await expect(page.getByTestId('event-timeline-module')).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('process-capital-module')).toBeVisible({ timeout: 15000 });

        // Existing modules still visible
        await expect(page.getByTestId('seller-discovery-module')).toBeVisible({ timeout: 15000 });

        // Disclosure remains role-scoped — restaurant should expose it.
        await switchToAssemblyRole(page, 'restaurant');
        await expect(page.getByTestId('disclosure-module')).toBeVisible({ timeout: 15000 });
    });

    test('timeline module has correct test ID and header', async ({ page }) => {
        await gotoAssemblyMock(page);

        const module = page.getByTestId('event-timeline-module');
        await expect(module).toBeVisible({ timeout: 15000 });

        // Verify the heading renders with uppercase tracking
        const header = module.locator('p').first();
        await expect(header).toContainText('Order Timeline');
    });

    test('capital summary module has correct test ID and header', async ({ page }) => {
        await gotoAssemblyMock(page);

        const module = page.getByTestId('process-capital-module');
        await expect(module).toBeVisible({ timeout: 15000 });

        // Verify the heading renders
        const header = module.locator('p').first();
        await expect(header).toContainText('Capital Summary');
    });
});
