/**
 * swap-funded-checkout.devnet.spec.ts
 *
 * The swap-funded bond leg, end to end and UI on both ends: a buyer who does
 * NOT hold the process bond currency (drained as scenario pre-population)
 * funds their bond from another of the seller's accepted tokens. The checkout
 * surfaces the funding panel, the buyer authorizes Permit2 once, signs the
 * commitment AND the Permit2 witness (route-bound), and relays; the SELLER
 * accepts on /orders and the broadcast routes through
 * WitnessSwapAndCommitCoordinator.swapAndCommit — asserted by the commit
 * transaction's `to` — which pulls the buyer's input token, swaps it at the
 * mock venue, funds the buyer in-place, and calls the kernel.
 *
 * Money legs, from the chain (the standing rule): buyer input-token ↓
 * buyerBond (1:1 devnet rate), buyer bond-token NET 0 at commit (swap
 * proceeds exactly consumed by the kernel pull), seller ↓ sellerBond, escrow
 * ↑ both bonds, the coordinator retains NOTHING in either token. Then the
 * buyer resolves (buyer dominance) and the full-cycle nets land: seller
 * +payment, buyer bond-token +（buyerBond − payment), escrow at baseline.
 *
 * Depends on populate-test-data (clauses + seed assembly + sellers with the
 * permit token in acceptedTokens) and the devnet-authoring gate.
 */
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import { createWalletClient, http, parseAbi, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { calculateBonds } from '@figaro/sdk';
import { localPublicClient, readLocalDeploymentConfig, LOCAL_ANVIL, RPC_URL } from './devnet-helpers';
import { ANVIL_ACCOUNTS, ANVIL_KEYS } from '../anvilAccounts';
import { CORE_ABI } from '@/lib/kernel/contracts';
import type { Page } from '@playwright/test';

async function waitForConnected(page: Page) {
    await page.waitForFunction(
        () => !Array.from(document.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Connect Wallet'),
        null,
        { timeout: 30000 },
    );
}

const ERC20_ABI = parseAbi([
    'function balanceOf(address) view returns (uint256)',
    'function transfer(address, uint256) returns (bool)',
]);

// anvil[3] — this scenario's dedicated buyer (anvil[0] stays the fixture
// default with a full bond-token balance for the plain-funded specs).
const BUYER = ANVIL_ACCOUNTS[3] as Hex;
const BUYER_KEY = ANVIL_KEYS[3];
// anvil[13] — the wizard-registered seller, bound to the seed assembly.
const SELLER = '0x1cbd3b2770909d4e10f157cabc84c7264073c9ec' as Hex;
// anvil[4] — the drain sink (per-spec baselines make the extra balance inert).
const SINK = ANVIL_ACCOUNTS[4] as Hex;

test.describe('Swap-funded checkout — the buyer bonds from another accepted token (devnet)', () => {
    test.setTimeout(240_000);

    test('funding panel → witness-signed leg → seller accept routes through the coordinator', async ({ page }) => {
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });
        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const bondToken = config.tokenAddress as Hex;
        const inputToken = config.permitTokenAddress as Hex;
        const coordinator = config.witnessSwapAndCommitCoordinator as Hex;
        expect(coordinator, 'the coordinator is deployed (deploy-local.sh writes its address)').toBeTruthy();
        const publicClient = localPublicClient();
        const balanceOf = (token: Hex, who: Hex) =>
            publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;

        // ── Scenario pre-population (NOT the action under test): the buyer
        //    holds none of the bond currency — drain it to the sink. Idempotent
        //    across runs (drains whatever a prior cycle refunded). ──
        const stray = await balanceOf(bondToken, BUYER);
        if (stray > 0n) {
            const drainClient = createWalletClient({
                account: privateKeyToAccount(BUYER_KEY), chain: LOCAL_ANVIL, transport: http(RPC_URL),
            });
            const drainHash = await drainClient.writeContract({
                address: bondToken, abi: ERC20_ABI, functionName: 'transfer', args: [SINK, stray],
            });
            await publicClient.waitForTransactionReceipt({ hash: drainHash });
        }
        expect(await balanceOf(bondToken, BUYER), 'buyer starts with zero bond currency').toBe(0n);

        // ── Baselines, from the chain ──
        const queryCommitted = () => publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted',
            args: { buyer: BUYER }, fromBlock: 0n,
        });
        const committedBefore = await queryCommitted();
        const [buyerInputBefore, sellerBondBefore, coreBefore] = await Promise.all([
            balanceOf(inputToken, BUYER), balanceOf(bondToken, SELLER), balanceOf(bondToken, core),
        ]);

        // ── Buyer (anvil[3]) — browse → cart → checkout ──
        await gotoAsWallet(page, BUYER, `/s/view?seller=${SELLER}&e2e=devnet`);
        await page.getByTestId('seller-detail-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const addBtn = page.locator('[data-testid^="btn-add-"]').first();
        await addBtn.waitFor({ state: 'visible', timeout: 20000 });
        await addBtn.click();
        await page.getByTestId('btn-review-order').click();
        await page.getByTestId('checkout-view').waitFor({ timeout: 20000 });

        // ── The funding panel surfaces (insufficient bond currency + the
        //    seller accepts another token): pick the input token, authorize
        //    Permit2 once (the button disappears when the allowance lands). ──
        await page.getByTestId('swap-funding-panel').waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId(`funding-token-option-${inputToken.toLowerCase()}`).click();
        const authorize = page.getByTestId('funding-authorize');
        await authorize.waitFor({ state: 'visible', timeout: 15000 });
        await authorize.click();
        await authorize.waitFor({ state: 'hidden', timeout: 30000 });

        // ── Place order: bond-currency allowance approve auto-chains into the
        //    sign step; the agreement confirm gate is the SAME one the seller's
        //    accept uses; the witness sign rides the sign step (injected wallet). ──
        const place = page.getByTestId('btn-place-order');
        await expect(place, 'buyer connected + order ready → "Place order"')
            .toHaveText(/Place order/, { timeout: 20000 });
        await place.click();
        await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId('preview-confirm').click();
        await page.getByTestId('buyer-share-panel').waitFor({ timeout: 60000 });
        await page.getByTestId('send-commitment-xmtp').click();
        await expect(page.getByTestId('commitment-xmtp-status')).toBeVisible({ timeout: 30000 });

        // ── Seller (anvil[13]) — /orders "Your turn" → accept ──
        await gotoAsWallet(page, SELLER, '/orders?e2e=devnet');
        await page.getByTestId('orders-list').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        await page.getByTestId('order-your-turn-card').first().waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId('btn-accept-order').first().click();
        await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId('preview-confirm').click();

        // ── On-chain truth: one new OrderCommitted for THIS buyer, and the
        //    commit transaction went to the COORDINATOR — the funded payload
        //    routed through swapAndCommit, not the kernel's bare commit. ──
        await expect.poll(async () => (await queryCommitted()).length, {
            timeout: 60000, message: 'a new OrderCommitted lands on-chain for the funded buyer',
        }).toBe(committedBefore.length + 1);
        const committedAfter = await queryCommitted();
        const event = committedAfter[committedAfter.length - 1];
        const receipt = await publicClient.getTransactionReceipt({ hash: event.transactionHash });
        expect(receipt.status, 'the swap-and-commit transaction succeeded').toBe('success');
        expect(receipt.to?.toLowerCase(), 'the broadcast routed through WitnessSwapAndCommitCoordinator')
            .toBe(coordinator.toLowerCase());
        test.info().annotations.push({
            type: 'SwapAndCommit',
            description: `order=${event.args.orderHash} payment=${event.args.payment} tx=${receipt.transactionHash} to=${receipt.to} gasUsed=${receipt.gasUsed}`,
        });

        // ── Money legs at commit (devnet venue rate 1:1) ──
        const payment = event.args.payment!;
        const { buyerBond, sellerBond } = calculateBonds(event.args.cumulativeValue!, payment);
        const [buyerInputAfter, buyerBondAfter, sellerBondAfter, coreAfter, coordBond, coordInput] = await Promise.all([
            balanceOf(inputToken, BUYER), balanceOf(bondToken, BUYER),
            balanceOf(bondToken, SELLER), balanceOf(bondToken, core),
            balanceOf(bondToken, coordinator), balanceOf(inputToken, coordinator),
        ]);
        expect(buyerInputBefore - buyerInputAfter, 'buyer paid the bond from the INPUT token (1:1 quote)').toBe(buyerBond);
        expect(buyerBondAfter, 'swap proceeds were exactly consumed by the kernel pull').toBe(0n);
        expect(sellerBondBefore - sellerBondAfter, 'seller bonded from their own balance').toBe(sellerBond);
        expect(coreAfter - coreBefore, 'escrow holds both bonds').toBe(buyerBond + sellerBond);
        expect(coordBond, 'the coordinator retains no bond currency').toBe(0n);
        expect(coordInput, 'the coordinator retains no input token').toBe(0n);

        // ── UI reaction on the seller's /orders (no reload) ──
        const processId = event.args.processId!;
        await expect(page.getByTestId(`order-row-${processId}`), 'the accepted order appears on /orders')
            .toBeVisible({ timeout: 30000 });
        await expect(page.getByTestId(`order-status-${processId}`), 'the accepted order shows In progress')
            .toHaveText('In progress', { timeout: 15000 });

        // ── Buyer resolves (buyer dominance) — the funded process settles like
        //    any other: seller nets the payment, the buyer's bond returns in the
        //    BOND currency, escrow returns to baseline. ──
        const resolvedBefore = (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'ProcessResolved', args: { buyer: BUYER }, fromBlock: 0n,
        })).length;
        await gotoAsWallet(page, BUYER, `/orders/view?process=${processId}&e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const resolveBtn = page.getByTestId('capability-execute-resolve-process');
        await resolveBtn.waitFor({ state: 'visible', timeout: 30000 });
        await expect(resolveBtn, 'the buyer can resolve the active process').toBeEnabled({ timeout: 30000 });
        await resolveBtn.click();
        await expect.poll(async () => (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'ProcessResolved', args: { buyer: BUYER }, fromBlock: 0n,
        })).length, { timeout: 60000, message: 'ProcessResolved lands on-chain' }).toBe(resolvedBefore + 1);

        const [buyerInputFinal, buyerBondFinal, sellerBondFinal, coreFinal] = await Promise.all([
            balanceOf(inputToken, BUYER), balanceOf(bondToken, BUYER),
            balanceOf(bondToken, SELLER), balanceOf(bondToken, core),
        ]);
        expect(buyerInputBefore - buyerInputFinal, 'the buyer’s input-token spend stays the bond swap only').toBe(buyerBond);
        expect(buyerBondFinal, 'buyer bond returned minus the payment (bond currency)').toBe(buyerBond - payment);
        expect(sellerBondFinal - sellerBondBefore, 'seller net earned exactly the payment').toBe(payment);
        expect(coreFinal, 'FigaroCore escrow returned to its baseline').toBe(coreBefore);
    });
});
