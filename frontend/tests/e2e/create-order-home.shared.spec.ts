/**
 * create-order-home.shared.spec.ts — Shared order-creation tests.
 *
 * Runs in BOTH mock and devnet projects via the unified figaro-test fixture.
 * Tests here verify UI behavior that must be identical regardless of chain mode.
 */
import { test, expect, COUNTERPARTY } from './figaro-test';
import { gotoHome, fillCreateOrderForm } from './test-helpers';
import { evmSnapshot, evmRevert } from './devnet-helpers';

// ── Devnet chain isolation ───────────────────────────────────────────────────
let chainSnapshot: string | undefined;

test.beforeAll(async ({ }, testInfo) => {
    if (testInfo.project.name === 'devnet') {
        chainSnapshot = await evmSnapshot();
    }
});

test.afterAll(async ({ }, testInfo) => {
    if (testInfo.project.name === 'devnet' && chainSnapshot) {
        await evmRevert(chainSnapshot);
    }
});

test.describe('Create order — shared validation', () => {
    test.beforeEach(async ({ page, figaroMode }) => {
        await gotoHome(page, { mock: figaroMode === 'mock', devnet: figaroMode === 'devnet' });
    });

    test('bond preview shows correct amounts for 0.01 payment', async ({ page, figaroMode }) => {
        await fillCreateOrderForm(page, COUNTERPARTY[figaroMode], '0.01', 'u4pruydqqvj', 'u4pruydqqvj');
        const buyerBondText = await page.getByTestId('buyer-bond').innerText();
        const sellerBondText = await page.getByTestId('seller-bond').innerText();
        expect(buyerBondText).toContain('0.02');
        expect(sellerBondText).toContain('0.02');
    });

    test('missing origin/destination blocks submit', async ({ page, figaroMode }) => {
        await fillCreateOrderForm(page, COUNTERPARTY[figaroMode], '0.01');
        const submitBtn = page.getByTestId('btn-submit-order');
        if (await submitBtn.isEnabled()) {
            await submitBtn.click();
        }

        const originErr = page.getByText('Origin is required');
        const destErr = page.getByText('Destination is required');
        const combinedErr = page.getByText('Please fill in origin and destination');

        if (await submitBtn.isDisabled()) {
            await expect(page.getByTestId('order-submit-requirements')).toContainText('set origin');
            await expect(page.getByTestId('order-submit-requirements')).toContainText('set destination');
            return;
        }

        await expect(originErr.or(destErr).or(combinedErr).first()).toBeVisible({ timeout: 5000 });
    });
});
