/**
 * eats-modules.spec.ts
 *
 * Mock-mode test verifying the disclosure module renders when the GHG
 * mechanism is bound in the assembly. Component-level rendering is
 * covered by vitest; this test verifies the assembly parser → module
 * registry → UI shell pipeline at /i/local-commerce.
 *
 * Per the 2026-04-27 mock audit: the "rating module is absent" test
 * (testing for nothing) and the "all modules coexist" test (covered
 * implicitly when disclosure renders alongside the other modules) were
 * trimmed.
 */
import { test, expect } from '@playwright/test';
import { gotoAssemblyMock, switchToAssemblyRole } from './test-helpers';

test.describe('New mechanism modules render in assembly (mock)', () => {
    test('disclosure module renders when GHG mechanism is in assembly', async ({ page }) => {
        await gotoAssemblyMock(page);
        await switchToAssemblyRole(page, 'merchant');

        const module = page.getByTestId('disclosure-module');
        await expect(module).toBeVisible({ timeout: 15000 });
        await expect(module.getByText('GHG Disclosure', { exact: true })).toBeVisible();
    });
});
