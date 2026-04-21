import { expect } from '@playwright/test';
import { test, ANVIL_ACCOUNTS, openAsAccount } from './devnet-multi-test';
import { evmRevert, evmSnapshot, waitAndApproveIfNeeded } from './devnet-helpers';
import { ensureWalletHasMockTokens, fillCreateOrderForm, submitFirstOrder, waitForDevnetWalletReady } from './test-helpers';

const BUYER = ANVIL_ACCOUNTS[0];
const SELLER = ANVIL_ACCOUNTS[1];
const LOCATION = 'u4pruydqqvj';
const SHARE_MODE = 'devnet-share';

let chainSnapshot: string;

test.beforeAll(async () => {
    chainSnapshot = await evmSnapshot();
});

test.afterAll(async () => {
    if (chainSnapshot) await evmRevert(chainSnapshot);
});

async function gotoWorkbenchShare(page: import('@playwright/test').Page) {
    await page.goto(`/workbench?e2e=${SHARE_MODE}`, { waitUntil: 'load' });
    await page.getByTestId('create-order-heading').waitFor({ timeout: 15000 });
    await waitForDevnetWalletReady(page);
    await ensureWalletHasMockTokens(page);
}

async function gotoSignShare(page: import('@playwright/test').Page) {
    await page.goto(`/sign?e2e=${SHARE_MODE}`, { waitUntil: 'load' });
    await page.getByTestId('input-commitment-payload').waitFor({ timeout: 15000 });
    await page.waitForFunction(
        () => !document.body.textContent?.includes('Connect Wallet'),
        null,
        { timeout: 30000 },
    );
}

test.describe('Commitment sharing flow (devnet)', () => {
    test.setTimeout(600_000);

    test('buyer shares a commitment and seller counter-signs it on /sign before on-chain submission', async ({ page, context }) => {
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);

        await gotoWorkbenchShare(page);

        const startingNodeCount = await page.locator('[data-testid^="order-node-"]').count();

        await fillCreateOrderForm(page, SELLER, '0.01', LOCATION, LOCATION);
        await waitAndApproveIfNeeded(page);
        await submitFirstOrder(page);

        const sharePanel = page.getByText(/collect their signature/i);
        await expect(sharePanel).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('copy-commitment-link')).toBeVisible();
        await expect(page.getByTestId('broadcast-commitment')).toHaveCount(0);

        await page.getByTestId('copy-commitment-link').click();
        await expect(page.getByTestId('copy-commitment-link')).toHaveText('Copied!');

        const serializedPayload = await page.evaluate(async () => navigator.clipboard.readText());
        expect(serializedPayload).toBeTruthy();

        const parsedPayload = JSON.parse(serializedPayload!);
        expect(parsedPayload.commitment.buyer.toLowerCase()).toBe(BUYER.toLowerCase());
        expect(parsedPayload.commitment.seller.toLowerCase()).toBe(SELLER.toLowerCase());
        expect(parsedPayload.buyerSig).toBeTruthy();
        expect(parsedPayload.sellerSig).toBeUndefined();

        const sellerPage = await openAsAccount(context, SELLER);
        await gotoSignShare(sellerPage);

        await sellerPage.getByTestId('input-commitment-payload').fill(serializedPayload!);
        await sellerPage.getByTestId('btn-parse-payload').click();

        await expect(sellerPage.getByText('Buyer: Signed')).toBeVisible({ timeout: 10000 });
        await expect(sellerPage.getByText('Seller: Pending')).toBeVisible({ timeout: 10000 });

        const approveToken = sellerPage.getByRole('button', { name: 'Approve Token', exact: true });
        const counterSignButton = sellerPage.getByTestId('btn-counter-sign');

        await Promise.race([
            approveToken.waitFor({ state: 'visible', timeout: 30000 }),
            counterSignButton.waitFor({ state: 'visible', timeout: 30000 }),
        ]);

        if (await approveToken.isVisible().catch(() => false)) {
            await approveToken.click();
        }

        await counterSignButton.waitFor({ state: 'visible', timeout: 60000 });
        await counterSignButton.click();

        await expect(sellerPage.getByText('Commitment submitted on-chain.')).toBeVisible({ timeout: 60000 });

        await page.reload({ waitUntil: 'load' });
        await page.getByTestId('create-order-heading').waitFor({ timeout: 15000 });
        await page.waitForFunction(
            (previousCount) => document.querySelectorAll('[data-testid^="order-node-"]').length > previousCount,
            startingNodeCount,
            { timeout: 60000 },
        );

        const newNode = page.locator('[data-testid^="order-node-"]').last();
        await expect(newNode).toContainText('0.01');
        await expect(newNode).toHaveAttribute('data-order-state', 'active');

        await sellerPage.close();
    });

    test('buyer sends a commitment over the XMTP mock channel and seller inbox hydrates /sign automatically', async ({ page, context }) => {
        await gotoWorkbenchShare(page);

        const startingNodeCount = await page.locator('[data-testid^="order-node-"]').count();

        const sellerPage = await openAsAccount(context, SELLER);
        await gotoSignShare(sellerPage);
        await expect(sellerPage.getByTestId('xmtp-commitment-inbox-status')).toContainText('Listening for incoming commitment payloads over XMTP', { timeout: 15000 });

        await fillCreateOrderForm(page, SELLER, '0.01', LOCATION, LOCATION);
        await waitAndApproveIfNeeded(page);
        await submitFirstOrder(page);

        await expect(page.getByTestId('send-commitment-xmtp')).toBeVisible({ timeout: 15000 });
        await page.getByTestId('send-commitment-xmtp').click();

        await expect(page.getByTestId('commitment-xmtp-status')).toContainText('Commitment payload sent over XMTP', { timeout: 15000 });
        await expect(sellerPage.getByText('Received via XMTP secure channel.')).toBeVisible({ timeout: 15000 });
        await expect(sellerPage.getByText('Buyer: Signed')).toBeVisible({ timeout: 10000 });
        await expect(sellerPage.getByText('Seller: Pending')).toBeVisible({ timeout: 10000 });

        const approveToken = sellerPage.getByRole('button', { name: 'Approve Token', exact: true });
        const counterSignButton = sellerPage.getByTestId('btn-counter-sign');

        await Promise.race([
            approveToken.waitFor({ state: 'visible', timeout: 30000 }),
            counterSignButton.waitFor({ state: 'visible', timeout: 30000 }),
        ]);

        if (await approveToken.isVisible().catch(() => false)) {
            await approveToken.click();
        }

        await counterSignButton.waitFor({ state: 'visible', timeout: 60000 });
        await counterSignButton.click();

        await expect(sellerPage.getByText('Commitment submitted on-chain.')).toBeVisible({ timeout: 60000 });

        await page.reload({ waitUntil: 'load' });
        await page.getByTestId('create-order-heading').waitFor({ timeout: 15000 });
        await page.waitForFunction(
            (previousCount) => document.querySelectorAll('[data-testid^="order-node-"]').length > previousCount,
            startingNodeCount,
            { timeout: 60000 },
        );

        const newNode = page.locator('[data-testid^="order-node-"]').last();
        await expect(newNode).toContainText('0.01');
        await expect(newNode).toHaveAttribute('data-order-state', 'active');

        await sellerPage.close();
    });
});