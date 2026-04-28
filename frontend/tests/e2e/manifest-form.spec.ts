/**
 * manifest-form.spec.ts — stable browser-level coverage for the terminal
 * ManifestForm and the sub-order modal form.
 *
 * Validation timing now lives in component tests plus order-submit-guidance.spec.ts.
 * This file stays focused on route-integrated behavior that should remain stable
 * under the disabled-submit UX model.
 */

import { test, expect } from '@playwright/test';
import {
    clickByTestId,
    gotoHome,
    fillCreateOrderForm,
    fillWithRetry,
} from './test-helpers';

const BUYER = '0x000000000000000000000000000000000000dEaD';

test.describe('ManifestForm — terminal route behavior', () => {
    test.beforeEach(async ({ page }) => {
        await gotoHome(page, { mock: true });
    });

    test('advanced section is collapsed by default', async ({ page }) => {
        await expect(page.getByTestId('manifest-input-mass')).toHaveCount(0);
        await expect(page.getByTestId('manifest-input-fulfilment')).toHaveCount(0);
    });

    test('advanced toggle reveals physical and agreement fields', async ({ page }) => {
        await fillCreateOrderForm(page, BUYER, '0.01', 'farm-A', 'market-B');
        await clickByTestId(page, 'manifest-toggle-advanced');

        await expect(page.getByTestId('manifest-input-mass')).toBeVisible({ timeout: 5000 });
        await expect(page.getByTestId('manifest-input-volume')).toBeVisible();
        await expect(page.getByTestId('manifest-input-class')).toBeVisible();
        await expect(page.getByTestId('manifest-input-fulfilment')).toBeVisible();
        await expect(page.getByTestId('manifest-input-handoff')).toBeVisible();
        await expect(page.getByTestId('manifest-input-ghg-standard')).toBeVisible();
        await expect(page.getByTestId('manifest-input-ghg-scope')).toBeVisible();
    });

    test('encoded preview is hidden when empty and appears after required fields are filled', async ({ page }) => {
        const form = page.getByTestId('manifest-form');
        await expect(form.getByTestId('manifest-encoded-preview')).toHaveCount(0);

        await fillCreateOrderForm(page, BUYER, '0.01', 'farm-A', 'market-B');

        await expect(form.getByTestId('manifest-encoded-preview')).toBeVisible({ timeout: 5000 });
        await expect(form.getByTestId('manifest-encoded-preview')).toContainText(/^0x/i);
    });

    test('advanced field edits update the encoded preview', async ({ page }) => {
        await fillCreateOrderForm(page, BUYER, '0.01', 'farm-A', 'market-B');
        const preview = page.getByTestId('manifest-encoded-preview');
        await expect(preview).toBeVisible({ timeout: 5000 });
        const previewBefore = await preview.innerText();

        await clickByTestId(page, 'manifest-toggle-advanced');
        await fillWithRetry(page.getByTestId('manifest-input-mass'), '5 kg');
        const previewAfterMass = await preview.innerText();
        expect(previewAfterMass).not.toBe(previewBefore);

        await page.getByTestId('manifest-input-fulfilment').selectOption('deliver:dutch-auction');
        await page.getByTestId('manifest-input-handoff').selectOption('meet-at-door');
        const previewAfterTerms = await preview.innerText();
        expect(previewAfterTerms).not.toBe(previewAfterMass);
    });
});

