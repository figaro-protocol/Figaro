/**
 * audit-page-seller.devnet.spec.ts
 *
 * Phase 1c of the e2e remediation plan: covers the seller-side
 * navigation of `/audit/[processId]`. The existing
 * `audit-page.devnet.spec.ts` exercises the buyer's path; this spec
 * verifies the audit page is role-agnostic — ProcessFinancialsView
 * reads from on-chain events with no role gating, so the seller should
 * see the same financials as the buyer.
 *
 * Confirming role-agnosticism matters because:
 *  - The buyer-only test alone leaves the seller's UX silent; if a
 *    future change accidentally added role-gating, only the buyer
 *    test would catch it on the buyer's branch.
 *  - The audit page is a load-bearing surface for the seller's own
 *    record-keeping (their copy of the receipt, balance-sheet impact
 *    of orders they fulfilled) — silently breaking it would be bad.
 *
 * Requires Anvil + ./deploy-local.sh.
 */
import { test, expect, ANVIL_ACCOUNTS, gotoAsWallet } from './devnet-multi-test';
import {
    createRootOrder,
    ensureTokenApprovals,
    evmRevert,
    evmSnapshot,
    readLocalDeploymentConfig,
    resolveProcessOnChain,
} from './devnet-helpers';
import type { Hex } from 'viem';
import { ANVIL_KEYS } from '../anvilAccounts';

const BUYER_KEY = ANVIL_KEYS[0];
const SELLER_KEY = ANVIL_KEYS[1];
const SELLER_ADDR = ANVIL_ACCOUNTS[1];

let outerSnapshot: string;
test.beforeAll(async () => { outerSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (outerSnapshot) await evmRevert(outerSnapshot); });

test.describe('/audit/[processId] seller view (devnet)', () => {
    let testSnapshot: string;
    test.beforeEach(async () => { testSnapshot = await evmSnapshot(); });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    test('seller sees the same financials view as the buyer for a resolved process', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const coreAddress = (process.env.NEXT_PUBLIC_FIGARO_CORE
            ?? config.figaroCore) as Hex;
        const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS
            ?? config.tokenAddress) as Hex;

        await ensureTokenApprovals(coreAddress, tokenAddress, BUYER_KEY, SELLER_KEY);

        const { processId, orderHash } = await createRootOrder({
            buyerKey: BUYER_KEY, sellerKey: SELLER_KEY,
            coreAddress, tokenAddress, payment: 1_000000000000000000n,
        });
        await resolveProcessOnChain({
            processId, orderHashes: [orderHash],
            buyerKey: BUYER_KEY, coreAddress,
        });

        // Navigate AS the seller. Same assertions as the buyer-side
        // G5 spec — if any of them diverge in behavior between
        // roles, that's a role-gating regression worth catching.
        await gotoAsWallet(page, SELLER_ADDR, `/audit/${processId}?e2e=devnet`);

        await page.getByTestId('audit-page').waitFor({ timeout: 30000 });

        const financialsView = page.getByTestId('financials-view');
        await expect(financialsView).toBeVisible({ timeout: 30000 });

        const processIdEl = page.getByTestId('financials-process-id');
        await expect(processIdEl).toHaveText(processId, { timeout: 15000 });

        const currencySegment = page.locator('[data-testid^="financials-currency-"]');
        await expect(currencySegment).toHaveCount(1, { timeout: 15000 });

        const lineItem = page.getByTestId(`line-item-${orderHash}`);
        await expect(lineItem).toBeVisible({ timeout: 15000 });

        await expect(page.getByTestId('financials-cashflow')).toBeVisible({ timeout: 15000 });

        await expect(page.getByTestId('financials-empty')).toHaveCount(0);
    });
});
