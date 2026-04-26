/**
 * eats-modules.spec.ts
 *
 * Mock-mode tests verifying the new mechanism modules render in the
 * assembly workspace at /i/figaro-eats. These tests don't require a
 * chain — they verify that the assembly parser resolves the mechanisms,
 * the module registry returns the correct components, and the UI shells
 * render their test IDs.
 */
import { test, expect } from '@playwright/test';
import { gotoAssemblyMock, switchToAssemblyRole } from './test-helpers';

test.describe('New mechanism modules render in assembly (mock)', () => {
    test('disclosure module renders when GHG mechanism is in assembly', async ({ page }) => {
        await gotoAssemblyMock(page);

        await switchToAssemblyRole(page, 'restaurant');

        // The disclosure module should be present in the DOM
        const module = page.getByTestId('disclosure-module');
        await expect(module).toBeVisible({ timeout: 15000 });

        await expect(module.getByText('GHG Disclosure', { exact: true })).toBeVisible();
    });

    test('rating module is absent from the reference assembly', async ({ page }) => {
        await gotoAssemblyMock(page);

        const module = page.getByTestId('rating-module');
        await expect(module).toHaveCount(0);
    });

    test('all modules coexist with existing modules', async ({ page }) => {
        await gotoAssemblyMock(page);

        await switchToAssemblyRole(page, 'restaurant');

        await expect(page.getByTestId('disclosure-module')).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('rating-module')).toHaveCount(0);
    });
});
