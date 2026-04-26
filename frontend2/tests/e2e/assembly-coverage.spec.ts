/**
 * assembly-coverage.spec.ts
 *
 * Mock-mode tests verifying that figaro-equipment-rental and figaro-freelance
 * assemblies load and render their role switcher in the assembly workspace.
 */
import { test, expect } from '@playwright/test';
import { gotoAssemblyMock, switchToAssemblyRole } from './test-helpers';

test.describe('Equipment rental assembly renders (mock)', () => {
    test('loads assembly workspace with buyer role', async ({ page }) => {
        await gotoAssemblyMock(page, 'figaro-equipment-rental');

        const buyerBtn = page.getByTestId('role-btn-buyer');
        await expect(buyerBtn).toBeVisible({ timeout: 15000 });
    });

    test('switches to seller (Equipment Owner) role', async ({ page }) => {
        await gotoAssemblyMock(page, 'figaro-equipment-rental');

        await switchToAssemblyRole(page, 'seller');
        const sellerBtn = page.getByTestId('role-btn-seller');
        await expect(sellerBtn).toBeVisible({ timeout: 15000 });
    });
});

test.describe('Freelance assembly renders (mock)', () => {
    test('loads assembly workspace with buyer role', async ({ page }) => {
        await gotoAssemblyMock(page, 'figaro-freelance');

        const buyerBtn = page.getByTestId('role-btn-buyer');
        await expect(buyerBtn).toBeVisible({ timeout: 15000 });
    });

    test('switches to seller (Freelancer) role', async ({ page }) => {
        await gotoAssemblyMock(page, 'figaro-freelance');

        await switchToAssemblyRole(page, 'seller');
        const sellerBtn = page.getByTestId('role-btn-seller');
        await expect(sellerBtn).toBeVisible({ timeout: 15000 });
    });
});
