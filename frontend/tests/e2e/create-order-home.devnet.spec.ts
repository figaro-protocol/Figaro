// Import the custom test instance that injects window.ethereum before page load
import { test, expect } from './devnet-test';
import { evmRevert, evmSnapshot, waitAndApproveIfNeeded } from './devnet-helpers';
import { gotoHome, fillCreateOrderForm, submitFirstOrder, waitForFirstOrderUiSync } from './test-helpers';

// Use Anvil's pre-funded account[0] as both buyer and counterparty in tests
// that only need one address. For tests requiring two distinct parties, pair
// with a second funded account.
const COUNTERPARTY = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'; // Anvil account[1]

// ── EVM snapshot/revert: isolate this file's on-chain state ──────────────────
let chainSnapshot: string;
test.beforeAll(async () => { chainSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (chainSnapshot) await evmRevert(chainSnapshot); });

test.describe('Home page — Create Order (devnet)', () => {
    test.beforeEach(async ({ page }) => {
        // Devnet mode: window.ethereum is injected by the devnet-test fixture,
        // ClientInit auto-connects via ?e2e=devnet, submit button becomes enabled.
        await gotoHome(page, { devnet: true });
    });

    test('create first order on home and approval (devnet)', async ({ page }) => {
        // Create first order (include origin/destination)
        await fillCreateOrderForm(page, COUNTERPARTY, '0.01', 'u4pruydqqvj', 'u4pruydqqvj');

        // Live kernel: no protocol fee — bonds are the only capital commitment.

        // Verify bond preview UI shows expected buyer/seller bond for first order
        // formatToken(20000000000000000n, 18) = "0.02" (2× the 0.01 payment)
        const buyerBondText = await page.getByTestId('buyer-bond').innerText();
        const sellerBondText = await page.getByTestId('seller-bond').innerText();
        expect(buyerBondText).toContain('0.02');
        expect(sellerBondText).toContain('0.02');

        // Approval UI may require an automated signer; attempt click and wait
        await waitAndApproveIfNeeded(page);

        // Submit first order and wait for on-chain confirmation
        const previousNodeCount = await page.locator('[data-testid^="order-node-"]').count();
        const previousProcessOrderCount = await page.locator('[data-testid^="process-order-item-"]').count();
        await submitFirstOrder(page);
        await waitForFirstOrderUiSync(page, { previousNodeCount, previousProcessOrderCount });

        // Addresses are baked into build-time env (singleton contract, no factory).
        // Verify the UI reflects the new order via the graph instead.
        // UI: ensure the OrderGraph renders the order via event-based state
        await page.waitForSelector('[data-testid="order-graph-card"]', { timeout: 30000 });
        await page.waitForSelector('[data-testid^="order-node-"]', { timeout: 30000 });
        const orderNode = page.locator('[data-testid^="order-node-"]').first();
        await expect(orderNode).toBeVisible();
        // Verify the payment amount (0.01 tokens) is displayed in the node
        await expect(orderNode).toContainText('0.01');
        // origin/destination are encoded as bytes32 location on-chain; not stored separately in frontend model
    });

    // negative: missing origin/destination → create-order-home.shared.spec.ts
    // negative payment test → order-validation.shared.spec.ts
});
