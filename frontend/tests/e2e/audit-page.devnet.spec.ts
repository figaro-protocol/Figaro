/**
 * audit-page.devnet.spec.ts
 *
 * /audit/[processId] consolidates a process's financials + audit-bundle
 * PDF + hash verification onto one wallet-tier surface. The route is
 * the canonical post-resolve receipt destination — once the buyer
 * triggers resolveProcess, this page is what they (or any third party
 * given the processId) opens to inspect line items, balance-sheet
 * identity, and cash-flow log.
 *
 * No existing devnet test exercises this route. This spec seeds a
 * commit + resolve, navigates to /audit/<processId>, and asserts the
 * core financials surface renders against the real on-chain state.
 *
 * Requires: Anvil + ./deploy-local.sh
 */
import { test, expect } from '@playwright/test';
import {
    createRootOrder,
    ensureTokenApprovals,
    readLocalDeploymentConfig,
    resolveProcessOnChain,
} from './devnet-helpers';
import type { Hex } from 'viem';
import { ANVIL_KEYS } from '../anvilAccounts';

const BUYER_KEY = ANVIL_KEYS[0];
const SELLER_KEY = ANVIL_KEYS[1];


test.describe('/audit/[processId] (devnet)', () => {

    test('renders financials view for a resolved process — process id, line item, cash flow', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const coreAddress = (process.env.NEXT_PUBLIC_FIGARO_CORE
            ?? config.figaroCore) as Hex;
        const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS
            ?? config.tokenAddress) as Hex;

        await ensureTokenApprovals(coreAddress, tokenAddress, BUYER_KEY, SELLER_KEY);

        // ── Seed: commit a root order, then resolve it ──────────────────
        const { processId, orderHash } = await createRootOrder({
            buyerKey: BUYER_KEY, sellerKey: SELLER_KEY,
            coreAddress, tokenAddress, payment: 1_000000000000000000n,
        });
        await resolveProcessOnChain({
            processId, orderHashes: [orderHash],
            buyerKey: BUYER_KEY, coreAddress,
        });

        // ── Buyer opens the audit page ──────────────────────────────────
        // ?e2e=devnet drives ClientInit auto-connect with the default
        // buyer wallet (anvil[0]) — same wallet that resolved the
        // process. ProcessFinancialsView reads on-chain events; no
        // role-gating, but the page is wallet-tier per CLAUDE.md.
        await page.goto(`/audit/${processId}?e2e=devnet`, { waitUntil: 'domcontentloaded' });

        await page.getByTestId('audit-page').waitFor({ timeout: 30000 });

        // The financials view should mount with the seeded processId.
        const financialsView = page.getByTestId('financials-view');
        await expect(financialsView).toBeVisible({ timeout: 30000 });

        const processIdEl = page.getByTestId('financials-process-id');
        await expect(processIdEl).toHaveText(processId, { timeout: 15000 });

        // A single-currency process — there should be exactly one
        // financials-currency-<address> segment.
        const currencySegment = page.locator('[data-testid^="financials-currency-"]');
        await expect(currencySegment).toHaveCount(1, { timeout: 15000 });

        // One line item for the root order; testid embeds the orderId.
        const lineItem = page.getByTestId(`line-item-${orderHash}`);
        await expect(lineItem).toBeVisible({ timeout: 15000 });

        // Resolve emits ERC-20 transfers → cashflow section renders.
        await expect(page.getByTestId('financials-cashflow')).toBeVisible({ timeout: 15000 });

        // No empty state.
        await expect(page.getByTestId('financials-empty')).toHaveCount(0);
    });
});
