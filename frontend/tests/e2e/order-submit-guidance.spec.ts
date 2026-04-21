import { test, expect } from '@playwright/test';
import { gotoHome } from './test-helpers';

test.describe('Order submit guidance', () => {
    test('disabled submit lists the missing setup requirements', async ({ page }) => {
        await gotoHome(page, { mock: true });

        await expect(page.getByTestId('btn-submit-order')).toBeDisabled();
        await expect(page.getByTestId('order-submit-requirements')).toContainText('enter counterparty address');
        await expect(page.getByTestId('order-submit-requirements')).toContainText('enter payment amount');
        await expect(page.getByTestId('order-submit-requirements')).toContainText('set origin');
        await expect(page.getByTestId('order-submit-requirements')).toContainText('set destination');
    });
});