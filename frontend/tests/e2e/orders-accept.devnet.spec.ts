/**
 * orders-accept.devnet.spec.ts
 *
 * The inbox→orders→badge CONSOLIDATION, end to end. A buyer orders from a seller
 * bound to a published assembly and relays the commitment over the coordination
 * channel; the SELLER then sees it in the "Your turn" section on `/orders` (the
 * surface that replaced the separate inbox), accepts it THERE, and the order
 * commits on-chain and moves to "In progress". No inbox, no notification feed,
 * no toast — one actor-neutral orders surface carrying the action.
 *
 * Single page, two wallets (the multi-wallet fixture): buyer (anvil[0]) places +
 * relays; switch to the seller (anvil[13], "Wizard Test Bakery", bound to the
 * seed assembly by the authoring gate); the mock coordination channel
 * (localStorage-backed, same origin) replays the relayed commitment into the
 * seller's /orders, where `awaitsMyCounterSign` surfaces the "Your turn" card.
 *
 * Depends on the `devnet-authoring` gate (seed-assembly + sellers-onboarding):
 * the published assembly and the bound seller must already exist. Iterate with
 * `--no-deps` once the gate has seeded the chain.
 */
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import { createPublicClient, defineChain, http, parseAbi, type Hex } from 'viem';
import { calculateBonds } from '@figaro/core';
import { readLocalDeploymentConfig } from './devnet-helpers';
import { CORE_ABI } from '@/lib/core/contracts';
import type { Page } from '@playwright/test';

/** Wait for ClientInit's devnet auto-connect — the "Connect Wallet" header
 *  button disappears once the injected wallet connects. Without this the
 *  checkout shows "Connect wallet to order" and place-order is a no-op. */
async function waitForConnected(page: Page) {
    await page.waitForFunction(
        () => !Array.from(document.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Connect Wallet'),
        null,
        { timeout: 30000 },
    );
}

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});

// anvil[13] — the wizard-registered seller, bound to the seed assembly.
const SELLER = '0x1cbd3b2770909d4e10f157cabc84c7264073c9ec' as Hex;

const ERC20_ABI = parseAbi(['function balanceOf(address) view returns (uint256)']);
// anvil[0] — the fixture's default buyer.
const BUYER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Hex;

test.describe('Orders consolidation — buyer orders → seller accepts on /orders (devnet)', () => {
    test.setTimeout(180_000);

    test('the "Your turn" accept flow on /orders commits the order', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const token = config.tokenAddress as Hex;
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const balanceOf = (who: Hex) =>
            publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;
        // `seller` is NOT indexed in OrderCommitted (the kernel hit the EVM 3-index
        // limit with orderHash/processId/buyer) — filter on the indexed `buyer`.
        const committedBefore = await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted',
            args: { buyer: BUYER }, fromBlock: 0n,
        });
        // Bond escrow baseline — the kernel pulls bonds in the payment token.
        const [buyerBefore, sellerBefore, coreBefore] = await Promise.all([
            balanceOf(BUYER), balanceOf(SELLER), balanceOf(core),
        ]);

        // ── Buyer (anvil[0], the fixture's DEFAULT) — add to cart → review → checkout ──
        // Plain goto auto-connects the default account via ClientInit (as
        // designer-publish does); gotoAsWallet's switch-to-default is a no-op that
        // leaves wagmi unconnected — reserve the switch for the non-default seller.
        await page.goto(`/s/${SELLER}?e2e=devnet`, { waitUntil: 'domcontentloaded' });
        await page.getByTestId('seller-detail-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const addBtn = page.locator('[data-testid^="btn-add-"]').first();
        await addBtn.waitFor({ state: 'visible', timeout: 20000 });
        await addBtn.click();
        await page.getByTestId('btn-review-order').click();

        // ── Checkout → place order (signs + relays the commitment) ──
        await page.getByTestId('checkout-view').waitFor({ timeout: 20000 });
        const place = page.getByTestId('btn-place-order');
        await place.waitFor({ state: 'visible', timeout: 20000 });
        // The label tells the truth: "Connect wallet to order" (not connected) /
        // "Select an option to order" (!orderReady) / "Place order" (ready). Assert
        // the ready state so a connect or method gap fails loudly, not as a no-op.
        await expect(place, 'buyer connected + order ready → "Place order"')
            .toHaveText(/Place order/, { timeout: 20000 });
        await place.click();
        // Share panel appears once SIGNED (commitStep = awaiting-counter) — but the
        // root commitment is NOT relayed until the buyer sends it. Click "Send via
        // XMTP" (mock channel in devnet → persisted to localStorage), so the seller's
        // /orders can replay it. (assemblyCheckout's auto-relay is sub-orders only.)
        await page.getByTestId('buyer-share-panel').waitFor({ timeout: 60000 });
        await page.getByTestId('send-commitment-xmtp').click();
        await expect(page.getByTestId('commitment-xmtp-status')).toBeVisible({ timeout: 30000 });

        // ── Switch to the seller (anvil[13]) → /orders "Your turn" ──
        await gotoAsWallet(page, SELLER, '/orders?e2e=devnet');
        await page.getByTestId('orders-list').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const yourTurn = page.getByTestId('order-your-turn-card').first();
        await yourTurn.waitFor({ state: 'visible', timeout: 30000 });

        // ── Accept on /orders → counter-sign + broadcast → commit ──
        await page.getByTestId('btn-accept-order').first().click();
        // Accept opens the agreement sign-preview ("Review before signing"). The
        // seller's counter-sign does NOT skipPreview (the buyer's checkout does), so
        // confirm it to proceed with counter-sign + broadcast (the on-chain commit).
        // Accept first approves the seller's bond ("Approving bond…"), THEN opens the
        // agreement sign-preview. Confirm it to counter-sign + broadcast (the commit).
        await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId('preview-confirm').click();
        // The committed order surfaces in the In-progress section of the same surface.
        await expect(
            page.locator('[data-testid^="order-row-"]').first(),
            'the accepted order shows In progress on /orders',
        ).toBeVisible({ timeout: 60000 });

        // ── On-chain truth: exactly one NEW OrderCommitted for this seller ──
        // The In-progress row can be a PRIOR run's order (re-runs accumulate), so the
        // UI passing doesn't mean THIS commit landed yet — poll the chain for a new
        // OrderCommitted for the buyer before reading it.
        const queryCommitted = () => publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted',
            args: { buyer: BUYER }, fromBlock: 0n,
        });
        await expect.poll(async () => (await queryCommitted()).length, {
            timeout: 60000, message: 'a new OrderCommitted lands on-chain for the buyer',
        }).toBe(committedBefore.length + 1);
        const committedAfter = await queryCommitted();
        const event = committedAfter[committedAfter.length - 1];
        expect(event.args.seller?.toLowerCase(), 'committed against the bound seller')
            .toBe(SELLER.toLowerCase());
        const receipt = await publicClient.getTransactionReceipt({ hash: event.transactionHash });
        expect(receipt.status, 'the commit transaction succeeded').toBe('success');
        // Surface the event + receipt as the proof artifact (not just a UI pass).
        test.info().annotations.push({
            type: 'OrderCommitted',
            description: `order=${event.args.orderHash} payment=${event.args.payment} cumulativeValue=${event.args.cumulativeValue} tx=${receipt.transactionHash} block=${receipt.blockNumber} gasUsed=${receipt.gasUsed}`,
        });

        // ── Funds actually moved (the real test): buyer↓ buyerBond, seller↓
        //    sellerBond, FigaroCore escrow↑ both. Exact deltas — gas is paid in ETH,
        //    so the payment-token deltas are the bonds only. ──
        const { buyerBond, sellerBond } = calculateBonds(event.args.cumulativeValue!, event.args.payment!);
        const [buyerAfter, sellerAfter, coreAfter] = await Promise.all([
            balanceOf(BUYER), balanceOf(SELLER), balanceOf(core),
        ]);
        expect(buyerBefore - buyerAfter, 'buyer balance decreased by the buyer bond').toBe(buyerBond);
        expect(sellerBefore - sellerAfter, 'seller balance decreased by the seller bond').toBe(sellerBond);
        expect(coreAfter - coreBefore, 'FigaroCore escrow increased by both bonds').toBe(buyerBond + sellerBond);
    });
});
