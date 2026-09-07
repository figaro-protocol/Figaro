/**
 * A signed order survives navigation until it is sent.
 *
 * Beta r4: two buyers signed an order, navigated away before "Send via
 * XMTP", and found /orders empty — the signed payload lived only in the
 * share panel's state. Now the tab keeps it: /orders lists it under
 * "Signed, not yet sent", Send relays it from there, and the channel-derived
 * "Awaiting acceptance" row takes over.
 *
 * Seller: a populate seller (Kiosk Corner, anvil[5], bound to the point-of-
 * sale reference by populate) — nothing seeded here. Buyer: anvil[0].
 *
 * Requires Anvil + ./scripts/deploy-local.sh + populate-test-data + Kubo + :3100.
 */
// lint-allow-no-chain-facts: signing and relaying write nothing to the chain — the
// order is off-chain until the seller counter-signs and commits (covered by the
// checkout specs); the fact this spec is responsible for is the tab's copy of the
// signed payload and its hand-off to the channel, both read from the page.
import { test, expect } from './devnet-multi-test';
import { mnemonicToAccount } from 'viem/accounts';
import { waitForConnected } from './devnet-helpers';

const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';
const KIOSK = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 5 }).address;

test.describe('signed, not yet sent (devnet)', () => {
    test('the buyer finds the signed order on /orders after navigating away, and sends it from there', async ({ page }) => {
        // ── Buyer signs at checkout, then leaves before Send ──
        await page.goto(`/s/view?seller=${KIOSK}&e2e=devnet`, { waitUntil: 'domcontentloaded' });
        await page.getByTestId('member-detail-view').waitFor({ timeout: 30_000 });
        await waitForConnected(page);
        const addBtn = page.locator('[data-testid^="btn-add-"]').first();
        await addBtn.waitFor({ state: 'visible', timeout: 20_000 });
        await addBtn.click();
        await page.getByTestId('btn-review-order').click();
        await page.getByTestId('checkout-view').waitFor({ timeout: 20_000 });
        await waitForConnected(page);
        // The point-of-sale reference's particulars: the buyer collects at the
        // counter; the geolocation endpoints carry jurisdiction, typed.
        await page.locator('[data-testid^="checkout-field-"][data-testid$="-figaro-modalities-modality-pickup"]').first().check();
        await page.locator('[data-testid^="checkout-field-"][data-testid$="-figaro-geolocation-origin"]').first().fill('9q8yyk');
        await page.locator('[data-testid^="checkout-field-"][data-testid$="-figaro-geolocation-destination"]').first().fill('9q8yyk');
        const place = page.getByTestId('btn-place-order');
        await expect(place).toHaveText(/Place order/, { timeout: 30_000 });
        await place.click();
        await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30_000 });
        await page.getByTestId('preview-confirm').click();
        await page.getByTestId('buyer-share-panel').waitFor({ timeout: 60_000 });
        // Signed. Navigate away WITHOUT sending.

        // ── /orders shows the signed order, not the empty state ──
        await page.goto('/orders?e2e=devnet', { waitUntil: 'domcontentloaded' });
        await page.getByTestId('orders-list').waitFor({ timeout: 30_000 });
        await waitForConnected(page);
        const unsent = page.getByTestId('order-unsent-row');
        await expect(unsent.first(), 'the signed order is listed as not yet sent').toBeVisible({ timeout: 30_000 });
        await expect(page.getByTestId('orders-empty')).toHaveCount(0);
        await expect(unsent.first().getByTestId('order-unsent-status')).toHaveText('Signed, not yet sent');

        // ── Send from /orders: the tab's copy goes, the channel row takes over ──
        await unsent.first().getByTestId('btn-send-unsent').click();
        await expect(page.getByTestId('order-unsent-row'), 'the unsent row leaves once relayed').toHaveCount(0, { timeout: 30_000 });
        await expect(page.getByTestId('order-pending-row').first(), 'the relayed order awaits acceptance').toBeVisible({ timeout: 30_000 });
    });
});
