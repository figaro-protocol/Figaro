/**
 * order-validation.shared.spec.ts — Shared order validation tests.
 *
 * Runs in BOTH mock and devnet projects via the unified figaro-test fixture.
 * Tests here verify UI behavior that must be identical regardless of chain mode.
 */
import { test, expect, COUNTERPARTY } from './figaro-test';
import { gotoHome, fillCreateOrderForm, fillWithRetry } from './test-helpers';
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

test.describe('Order validation (shared)', () => {
    test.beforeEach(async ({ page, figaroMode }) => {
        await gotoHome(page, { mock: figaroMode === 'mock', devnet: figaroMode === 'devnet' });
    });

    test('negative payment blocks submit', async ({ page, figaroMode }) => {
        await fillCreateOrderForm(page, COUNTERPARTY[figaroMode], '0.01', 'u4pruydqqvj', 'u4pruydqqvj');
        await fillWithRetry(page.getByTestId('input-payment'), '-0.01').catch(() => { });
        const submitBtn = page.getByTestId('btn-submit-order');
        await expect(submitBtn).toBeDisabled();
        await expect(page.getByText('Payment cannot be negative')).toBeVisible();
        const paymentVal = await page.getByTestId('input-payment').inputValue();
        expect(paymentVal).toBe('');
    });

    test('bond preview shows correct amounts for 0.01 payment', async ({ page, figaroMode }) => {
        await fillCreateOrderForm(page, COUNTERPARTY[figaroMode], '0.01', 'u4pruydqqvj', 'u4pruydqqvj');
        const buyerBondText = await page.getByTestId('buyer-bond').innerText();
        const sellerBondText = await page.getByTestId('seller-bond').innerText();
        expect(buyerBondText).toContain('0.02');
        expect(sellerBondText).toContain('0.02');
    });
});
