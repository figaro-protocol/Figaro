/**
 * spectator-view.devnet.spec.ts
 *
 * Phase 1b of the e2e remediation plan: covers the spectator branch
 * of OrderTimelineView — when the connected wallet is neither
 * `rootOrder.buyer` nor `rootOrder.seller`, the role-discriminator
 * (`OrderTimelineView.tsx:357`) resolves to "spectator" and the page
 * renders a read-only header + no action buttons.
 *
 * The buyer + seller branches are exercised by lifecycle.devnet,
 * delivery-lifecycle.devnet, audit-page.devnet, and the Phase 1a
 * seller-timeline test. This is the third role.
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
} from './devnet-helpers';
import type { Hex } from 'viem';
import { ANVIL_KEYS } from '../anvilAccounts';

const BUYER_KEY = ANVIL_KEYS[0];
const SELLER_KEY = ANVIL_KEYS[1];
// Spectator: anvil[3], neither buyer nor seller on the seeded order.
const SPECTATOR_ADDR = ANVIL_ACCOUNTS[3];

let outerSnapshot: string;
test.beforeAll(async () => { outerSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (outerSnapshot) await evmRevert(outerSnapshot); });

test.describe('OrderTimelineView spectator role (devnet)', () => {
    let testSnapshot: string;
    test.beforeEach(async () => { testSnapshot = await evmSnapshot(); });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    test('wallet not party to the order sees the read-only header + no action buttons', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const coreAddress = (process.env.NEXT_PUBLIC_FIGARO_CORE ?? config.figaroCore) as Hex;
        const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex;

        await ensureTokenApprovals(coreAddress, tokenAddress, BUYER_KEY, SELLER_KEY);

        const { processId } = await createRootOrder({
            buyerKey: BUYER_KEY,
            sellerKey: SELLER_KEY,
            coreAddress,
            tokenAddress,
            payment: 1_000000000000000000n,
        });

        // Connect as anvil[3] — third-party wallet, not on the order.
        await gotoAsWallet(page, SPECTATOR_ADDR, `/orders/${processId}?e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });

        // Spectator branch header — OrderTimelineView.tsx:438.
        await expect(page.getByTestId('order-timeline-view')).toContainText(
            /Read-only — your wallet is neither buyer nor seller on this order/,
        );

        // Spectator "Status" copy — OrderTimelineView.tsx:500-504.
        await expect(page.getByTestId('order-timeline-view')).toContainText(
            /You are not party to this order\. Open the audit page for the public record\./,
        );

        // None of the role-bound action buttons render for a spectator.
        await expect(page.getByTestId('btn-confirm-receipt')).toHaveCount(0);
        await expect(page.locator('[data-testid^="btn-merchant-next-"]')).toHaveCount(0);

        // The buyer "You are the buyer" + seller "You are the seller"
        // strings must NOT appear in the header.
        await expect(page.getByTestId('order-timeline-view')).not.toContainText(/You are the buyer/);
        await expect(page.getByTestId('order-timeline-view')).not.toContainText(/You are the seller/);
    });
});
