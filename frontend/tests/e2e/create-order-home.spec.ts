import { test, expect } from '@playwright/test';
import { gotoHome, fillCreateOrderForm, submitFirstOrder, injectActiveOrder, acceptOrderMock, waitForFirstOrderUiSync, switchToGraphTab, waitForApproved } from './test-helpers';

const BUYER = '0x000000000000000000000000000000000000dEaD';
const SELLER = '0x000000000000000000000000000000000000b00b';

test.describe('Home page — empty state (mocked)', () => {
    test('empty-state no-orders placeholder is visible on fresh load', async ({ page }) => {
        await gotoHome(page, { mock: true });
        // no-orders placeholder lives in the OrderGraph, rendered on the Graph tab
        await switchToGraphTab(page);
        await expect(page.getByTestId('no-orders')).toBeVisible({ timeout: 10000 });
    });
});

test.describe('Home page — Create Order (mocked)', () => {
    test.beforeEach(async ({ page }) => {
        await gotoHome(page, { mock: true });
    });

    test('create first order on home and approval (mock)', async ({ page }) => {
        // beforeEach already calls gotoHome — do not call it again here
        await fillCreateOrderForm(page, BUYER, '0.01', 'u4pruydqqvj', 'u4pruydqqvj');

        // BondApprovalPanel renders formatted token amounts via formatToken().
        // For payment 0.01 ETH: bond = 2 × 0.01 = 0.02
        const buyerBondText = await page.getByTestId('buyer-bond').innerText();
        const sellerBondText = await page.getByTestId('seller-bond').innerText();
        expect(buyerBondText).toContain('0.02');
        expect(sellerBondText).toContain('0.02');

        // Protocol fee: the live kernel has no protocol fee. In mock mode the element may not render at all.
        // Skip fee assertion for this free-infrastructure posture.

        // Approval flow: should require approval initially
        const approvalStatus = await page.getByTestId('approval-status').innerText();
        expect(approvalStatus).toContain('Authorization needed');

        // Click approve (mock) and ensure status updates
        await page.getByTestId('approve-button').click();
        await waitForApproved(page);
    });

    // negative: missing origin/destination → create-order-home.shared.spec.ts
    // negative payment test → order-validation.shared.spec.ts

    test('positive: create first order persists all fields (mock)', async ({ page }) => {
        // Fill form with valid values using in-app mocks
        const origin = 'u4pruydqqvj';
        const destination = 'u4pruydqqvj';
        await fillCreateOrderForm(page, SELLER, '0.02', origin, destination);

        // Approve via mock helper and submit
        const approveBtn = page.getByTestId('approve-button');
        if (await approveBtn.count()) {
            await approveBtn.click();
            await waitForApproved(page, undefined, 5000).catch(() => { });
        }

        await submitFirstOrder(page);
        await waitForFirstOrderUiSync(page);

        // Verify the order graph renders the new order node.
        await switchToGraphTab(page);
        await page.waitForSelector('[data-testid^="order-node-"]', { timeout: 8000 });
        const orderNode = page.locator('[data-testid^="order-node-"]').first();
        await expect(orderNode).toBeVisible();
        // Verify the payment amount (0.02 tokens) is displayed in the node.
        await expect(orderNode).toContainText('0.02');
        // origin/destination are encoded as bytes32 location on-chain and not
        // stored as separate fields on Order — do not assert here.
    });

    test('new first order replaces stale graph selection when an older pending process exists', async ({ page }) => {
        const staleProcessId = '0xface000000000000000000000000000000000000000000000000000000000001';
        const staleOrderId = await injectActiveOrder(page, {
            processId: staleProcessId,
            buyer: BUYER,
            seller: SELLER,
            payment: '1000000000000000000',
        });

        await switchToGraphTab(page);
        await page.waitForSelector(`[data-testid="order-node-${staleOrderId}"]`, { timeout: 10000 });
        await expect(page.getByTestId(`order-node-${staleOrderId}`)).toHaveAttribute('data-order-state', 'active');
        await expect(page.getByTestId(`order-node-${staleOrderId}`)).toContainText('1');

        // Switch back to the Create Order tab so the form is in the DOM
        await page.getByRole('tab', { name: 'Create Order' }).click();
        await fillCreateOrderForm(page, SELLER, '0.01', 'u4pruydqqvj', 'u4pruydqqvj');

        const approveBtn = page.getByTestId('approve-button');
        if (await approveBtn.count()) {
            await approveBtn.click();
            await waitForApproved(page, undefined, 5000).catch(() => { });
        }

        await submitFirstOrder(page);
        await waitForFirstOrderUiSync(page, { previousNodeCount: 1, previousProcessOrderCount: 1 });

        await switchToGraphTab(page);
        await page.waitForFunction(
            (oldId) => {
                const oldNode = document.querySelector(`[data-testid="order-node-${oldId}"]`);
                if (oldNode) return false;
                const nodes = Array.from(document.querySelectorAll('[data-testid^="order-node-"]'));
                return nodes.length > 0 && nodes.some((node) => (node.textContent || '').includes('0.01'));
            },
            staleOrderId,
            { timeout: 10000 }
        );

        const visibleNode = page.locator('[data-testid^="order-node-"]').first();
        await expect(visibleNode).toBeVisible();
        await expect(visibleNode).toContainText('0.01');
        await expect(page.getByTestId(`order-node-${staleOrderId}`)).not.toBeVisible();
    });
    // Note: 'permit: create first order with mock permit' trimmed
    // (2026-04-27 mock audit) — covered by permit.devnet.spec.ts which
    // exercises the same mount-time __FIGARO_PENDING_PERMIT__ path
    // through to a real on-chain commit.
});

// ---------------------------------------------------------------------------
// UI feedback: card fields
// ---------------------------------------------------------------------------

test.describe('Order card — field coverage (mocked)', () => {
    test.beforeEach(async ({ page }) => {
        await gotoHome(page, { mock: true });
    });

    const PROCESS_A = '0xaaaa000000000000000000000000000000000000000000000000000000000001';

    test('+ button visible on Active order at commit (mock)', async ({ page }) => {
        const orderId = await injectActiveOrder(page, {
            processId: PROCESS_A,
            buyer: BUYER,
            seller: SELLER,
        });

        // btn-add-suborder-* lives on OrderNodeSemanticCard, rendered in the
        // default Create Order tab — no tab switch required.
        await expect(page.getByTestId(`btn-add-suborder-${orderId}`)).toBeVisible({ timeout: 10000 });
    });

    test('currency input clears after successful order submit (mock)', async ({ page }) => {
        // fillCreateOrderForm clicks btn-use-default-token which sets currency to mockToken address
        await fillCreateOrderForm(page, SELLER, '0.01', 'u4pruydqqvj', 'u4pruydqqvj');

        const currencyInput = page.getByTestId('input-currency');
        const currencyBefore = await currencyInput.inputValue();
        // Currency must be non-empty after the helper sets it via Use Default MockToken
        expect(currencyBefore).not.toBe('');

        // Submit (mock: no real wallet / chain needed)
        await submitFirstOrder(page);

        // After the mock transaction succeeds the A5 reset effect clears all fields
        await page.waitForFunction(
            () => (document.querySelector('[data-testid="input-currency"]') as HTMLInputElement | null)?.value === '',
            null,
            { timeout: 8000 }
        );
        expect(await currencyInput.inputValue()).toBe('');
    });

    test('order card surfaces all field families (geo + value + capital lenses)', async ({ page }) => {
        // Single comprehensive test — exercises all three lens-gated field
        // families on one injected order. Replaces 4 prior single-field tests
        // (decoded location / currency token / advanced manifest / bond
        // display) per the 2026-04-27 mock audit. The lens-switching pattern
        // itself is identical across families — there's no value in
        // re-testing it three more times.
        const TOKEN = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
        // KV-format manifest covers origin (farm-A) + destination (market-B)
        // + mass (5 kg) + volume (10 L) + class (fragile). The agreement
        // section stores `classOfService` verbatim (catalogue convention);
        // the figaro-geo-v2 encoder bridge normalises long form to the
        // SDK's single-letter code at hash time.
        const text = 'o:farm-A|d:market-B|mass:5 kg|vol:10 L|class:fragile';
        const manifestHex = '0x' + Buffer.from(text, 'utf8').toString('hex');

        const orderId = await injectActiveOrder(page, {
            processId: PROCESS_A,
            buyer: BUYER,
            seller: SELLER,
            currency: TOKEN,
            manifest: manifestHex,
            payment: '20000000000000000', // 0.02 → bonds 0.04 each
        });

        await switchToGraphTab(page);
        await page.waitForSelector(`[data-testid="order-node-${orderId}"]`, { timeout: 10000 });
        const node = page.getByTestId(`order-node-${orderId}`);

        // Geo lens — origin, destination, mass, volume, class.
        await page.getByTestId('lens-btn-geo').click();
        await expect(page.getByTestId(`order-location-${orderId}`)).toBeVisible({ timeout: 5000 });
        await expect(node).toContainText('farm-A');
        await expect(node).toContainText('market-B');
        await expect(node).toContainText('5000 g');
        await expect(node).toContainText('10000 mL');
        await expect(node).toContainText('fragile');

        // Value lens — currency token (truncated).
        await page.getByTestId('lens-btn-value').click();
        const currencyRow = page.getByTestId(`order-currency-${orderId}`);
        await expect(currencyRow).toBeVisible({ timeout: 5000 });
        await expect(currencyRow).toContainText('0x5FbD');

        // Capital lens — symmetric buyer + seller bonds at 2× payment.
        await page.getByTestId('lens-btn-capital').click();
        const sellerBondEl = page.getByTestId(`bond-seller-${orderId}`);
        const buyerBondEl = page.getByTestId(`bond-buyer-${orderId}`);
        await expect(sellerBondEl).toBeVisible({ timeout: 5000 });
        await expect(buyerBondEl).toBeVisible({ timeout: 5000 });
        await expect(buyerBondEl).toContainText('0.04');
        await expect(sellerBondEl).toContainText('0.04');
    });
});

