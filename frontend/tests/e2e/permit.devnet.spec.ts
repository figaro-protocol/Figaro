/**
 * permit.devnet.spec.ts — EIP-2612 permit-first approval flow tests.
 *
 * Verifies the full permit-first path against a real Anvil node:
 *  1. The "Sign Permit" button renders when the currency is EIP-2612 compliant.
 *  2. Off-chain signing (eth_signTypedData_v4 on the unlocked Anvil account)
 *     sets approval-status to "Approved ✓" without broadcasting a transaction.
 *  3. firstOrderWithPermit confirms on-chain using the signed permit calldata.
 *
 * Prerequisites:
 *   anvil running + `./deploy-local.sh` (deploys MockToken + MockPermitToken
 *   via `script/Deploy.s.sol` and writes addresses into `frontend/.env.local`).
 *
 * The address constant below falls back to the most recent local deployment
 * so the test can still run manually if `.env.local` is missing.
 */
import { expect } from '@playwright/test';
import { test, ANVIL_ACCOUNTS } from './devnet-multi-test';
import {
    evmRevert,
    evmSnapshot,
    waitForApproved,
} from './devnet-helpers';
import { waitForFirstOrderUiSync } from './test-helpers';
import { gotoHome } from './test-helpers';

// Run serially — shares the Anvil node (nonce conflicts on parallel execution).
test.describe.configure({ mode: 'serial' });

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * MockPermitToken address — read from NEXT_PUBLIC_PERMIT_TOKEN_ADDRESS
 * (populated from .env.local by the loader at the top of
 * playwright.config.ts). Falls back to the most-recently-deployed address
 * so the test can still run manually without a fresh deploy.
 * IMPORTANT: re-run `./deploy-local.sh` whenever the Anvil node is reset
 * (it re-writes .env.local from the new broadcast).
 */
const PERMIT_TOKEN = (process.env.NEXT_PUBLIC_PERMIT_TOKEN_ADDRESS ||
    '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512') as `0x${string}`;

/** Anvil account[0] — acts as buyer / proposer. */
const BUYER = ANVIL_ACCOUNTS[0];
/** Anvil account[1] — acts as seller / counterparty. */
const SELLER = ANVIL_ACCOUNTS[1];


// ── EVM snapshot/revert: isolate this file's on-chain state ──────────────────
let chainSnapshot: string;
test.beforeAll(async () => { chainSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (chainSnapshot) await evmRevert(chainSnapshot); });

const LOCATION = 'u4pruydqqvj';
const PERMIT_TOKEN_MINT_AMOUNT = '100000000000000000000'; // 100 tokens
const MIN_REQUIRED_PERMIT_BALANCE = '1000000000000000000'; // 1 token

// ── Helpers ──────────────────────────────────────────────────────────────────

async function ensurePermitTokenBalance(page: import('@playwright/test').Page): Promise<void> {
    await page.evaluate(
        async ({ tokenAddress, mintAmount, minBalance }) => {
            const provider = (window as any).ethereum;
            if (!provider?.request) throw new Error('window.ethereum is unavailable');

            const [account] = await provider.request({ method: 'eth_accounts' });
            if (!account) throw new Error('No active account available');

            const pad32 = (hexValue: string) => hexValue.replace(/^0x/, '').padStart(64, '0');
            const encodeBalanceOf = (addr: string) => `0x70a08231${pad32(addr.toLowerCase())}`;
            const encodeMint = (addr: string, amount: bigint) => `0x40c10f19${pad32(addr.toLowerCase())}${pad32(`0x${amount.toString(16)}`)}`;

            const currentBalanceHex = await provider.request({
                method: 'eth_call',
                params: [{ to: tokenAddress, data: encodeBalanceOf(account) }, 'latest'],
            });

            if (BigInt(currentBalanceHex) >= BigInt(minBalance)) return;

            const txHash = await provider.request({
                method: 'eth_sendTransaction',
                params: [{
                    from: account,
                    to: tokenAddress,
                    data: encodeMint(account, BigInt(mintAmount)),
                }],
            });

            for (let attempt = 0; attempt < 40; attempt += 1) {
                const receipt = await provider.request({
                    method: 'eth_getTransactionReceipt',
                    params: [txHash],
                });

                if (receipt?.status === '0x1') return;
                if (receipt?.status === '0x0') throw new Error('Permit token mint reverted');

                await new Promise((resolve) => setTimeout(resolve, 250));
            }

            throw new Error('Timed out waiting for permit token mint receipt');
        },
        {
            tokenAddress: PERMIT_TOKEN,
            mintAmount: PERMIT_TOKEN_MINT_AMOUNT,
            minBalance: MIN_REQUIRED_PERMIT_BALANCE,
        }
    );
}

/** Navigate to home, connect devnet wallet, and fill the order form with the
 *  permit token as currency. Does NOT click "Use Default MockToken". */
async function fillPermitOrderForm(page: import('@playwright/test').Page): Promise<void> {
    await gotoHome(page, { devnet: true });
    await ensurePermitTokenBalance(page);

    await page.getByTestId('input-counterparty').fill(SELLER);

    // Set currency to the EIP-2612 permit token directly (bypasses default token btn).
    const currencyInput = page.getByTestId('input-currency');
    await currencyInput.clear();
    await currencyInput.fill(PERMIT_TOKEN);

    await page.getByTestId('input-payment').fill('0.01');
    await page.getByTestId('manifest-input-origin').fill(LOCATION);
    await page.getByTestId('manifest-input-destination').fill(LOCATION);
}

/**
 * Wait for the approve button to settle into permit mode.
 *
 * For a non-permit token the button renders as `Authorize {amount}`; for a
 * permit (EIP-2612) token the button label collapses to just `Authorize`
 * (BondApprovalPanel — supportsPermit branch). The button initially renders
 * as the non-permit variant while the async `nonces()` RPC query is in-flight
 * (supportsPermit = false). Once the query resolves with a nonce value,
 * supportsPermit flips to true and the label changes. Wait for the specific
 * permit-mode label.
 */
async function waitForSignPermitButton(page: import('@playwright/test').Page): Promise<void> {
    await page.waitForFunction(
        () => {
            const text = document.querySelector('[data-testid="approve-button"]')?.textContent?.trim();
            // Permit mode: label is exactly "Authorize" (no amount appended).
            return text === 'Authorize';
        },
        null,
        { timeout: 20000 }
    );
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Permit-first approval flow (devnet)', () => {

    test('approval panel renders permit-mode button for an EIP-2612 token', async ({ page }) => {
        await fillPermitOrderForm(page);
        await waitForSignPermitButton(page);

        const btnText = await page.getByTestId('approve-button').innerText();
        // Permit mode: label is exactly "Authorize" (no amount appended).
        expect(btnText.trim()).toBe('Authorize');
    });

    test('clicking permit-mode "Authorize" approves without broadcasting a transaction', async ({ page }) => {
        await fillPermitOrderForm(page);
        await waitForSignPermitButton(page);
        await expect(page.getByTestId('approve-button')).toHaveText('Authorize');

        await page.getByTestId('approve-button').click();

        // Off-chain signing: no TX is sent, so the status flips to Approved
        // as soon as signTypedDataAsync resolves and state is updated.
        await waitForApproved(page);

        await expect(page.getByTestId('approval-status')).toContainText('Authorized');

        // Submit button should now be enabled (no further approval step needed).
        const submitBtn = page.getByTestId('btn-submit-order');
        await expect(submitBtn).toBeEnabled({ timeout: 5000 });
    });

    test('firstOrderWithPermit sends the order and confirms on-chain', async ({ page }) => {
        await fillPermitOrderForm(page);
        await waitForSignPermitButton(page);
        await page.getByTestId('approve-button').click();

        // Wait for approved status before submitting.
        await waitForApproved(page);

        // Submit — this calls commitOrder with permit (permit path).
        const submitBtn = page.getByTestId('btn-submit-order');
        await submitBtn.waitFor({ timeout: 10000 });
        const previousNodeCount = await page.locator('[data-testid^="order-node-"]').count();
        const previousProcessOrderCount = await page.locator('[data-testid^="process-order-item-"]').count();
        await submitBtn.click();

        // AgreementPreviewModal pre-sign gate (Web2 audit Priority-4 fix);
        // click Confirm & sign to proceed.
        const previewModal = page.getByTestId('agreement-preview-modal');
        try {
            await previewModal.waitFor({ state: 'visible', timeout: 5000 });
            await page.getByTestId('preview-confirm').click();
        } catch { /* Modal didn't appear within 5s */ }

        await waitForFirstOrderUiSync(page, { previousNodeCount, previousProcessOrderCount });

        // order-node-* renders on the Graph tab; switch to verify.
        await page.getByRole('tab', { name: 'Graph' }).click();
        await page.waitForSelector('[data-testid^="order-node-"]', { timeout: 30000 });
        const node = page.locator('[data-testid^="order-node-"]').first();
        await expect(node).toBeVisible();
        await expect(node).toContainText('0.01');
    });
});
