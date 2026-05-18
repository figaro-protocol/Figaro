/**
 * discover.spec.ts
 *
 * Mock-mode tests for /discover — the operator catalogue (browse + filter).
 *
 * Prior fixture-dependent coverage (operator cards visible, /m/<addr> menu
 * renders, add-to-cart, place-order wallet gate) targeted the V4
 * runtime-identity fixtures which were retired in Stage C-narrow
 * (2026-05). Without on-chain registered operators, mock mode correctly
 * surfaces the "no operators registered yet" CTA. The wallet-connected
 * end-to-end checkout flow is covered in delivery-lifecycle.devnet.spec.ts.
 *
 * This file keeps a single pipe-end test that verifies /discover hydrates
 * and surfaces the canonical empty-state. Component contracts (filter
 * chrome, cart store mutations) are covered by vitest.
 */
import { test, expect } from '@playwright/test';

test.describe('Operator discovery (mock)', () => {
    test('renders the empty-state CTA when no operators are registered', async ({ page }) => {
        await page.goto('/discover?e2e=mock', { waitUntil: 'load' });
        await expect(page.getByTestId('discover-empty-cta')).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('discover-empty-cta')).toHaveAttribute('href', '/operators');
    });
});
