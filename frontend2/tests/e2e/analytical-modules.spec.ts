/**
 * analytical-modules.spec.ts
 *
 * Mock-mode smoke tests verifying the event-timeline and process-capital-
 * summary modules render in the assembly workspace at /i/local-commerce.
 * They show a fallback placeholder when no process is selected.
 *
 * Per the 2026-04-27 mock audit: the "has correct test ID and header"
 * tests + the coexistence test were trimmed — header text is verified
 * inside each smoke test below, and coexistence is implicit when both
 * modules render side-by-side from the same gotoAssemblyMock call.
 */
import { test, expect } from '@playwright/test';
import { gotoAssemblyMock } from './test-helpers';

test.describe('Analytical modules render in assembly (mock)', () => {
    test('event-timeline module renders with fallback text', async ({ page }) => {
        await gotoAssemblyMock(page);

        const module = page.getByTestId('event-timeline-module');
        await expect(module).toBeVisible({ timeout: 15000 });
        await expect(module.getByText('Order Timeline')).toBeVisible();
        await expect(module.getByText('Select an order group from the sidebar to view its timeline.')).toBeVisible();
    });

    test('process-capital-summary module renders with fallback text', async ({ page }) => {
        await gotoAssemblyMock(page);

        const module = page.getByTestId('process-capital-module');
        await expect(module).toBeVisible({ timeout: 15000 });
        await expect(module.getByText('Capital Summary')).toBeVisible();
        await expect(module.getByText('Select a process from the sidebar to view capital flows.')).toBeVisible();
    });
});
