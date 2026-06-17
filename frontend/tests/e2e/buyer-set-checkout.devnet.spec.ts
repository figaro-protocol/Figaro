/**
 * buyer-set-checkout.devnet.spec.ts
 *
 * Buyer-set delivery pricing, end to end through the UI. A courier's
 * catalogue may carry a buyer-set delivery item — one with no fixed price.
 * When the buyer selects it, SellerCataloguePicker surfaces a token-amount
 * input; the buyer names the delivery fee, and that figure is what the
 * courier order commits at.
 *
 *   1. A courier with a buyer-set "Name-your-price" delivery item is seeded
 *      (idempotent registration; the catalogue is this spec's own input data).
 *   2. Buyer picks the buyer-assigned delivery assembly, ENTERS that
 *      courier's address in the picker, selects the buyer-set item, and
 *      names the fee. Both orders relay; each seller counter-signs its own.
 *   3. The courier order's on-chain payment is the buyer-named figure —
 *      proof the price flowed from the input into the commitment.
 *   4. Buyer resolves; both orders settle atomically.
 *
 * Buyer-set is a pricing variant of the buyer's counterparty choice — the
 * picker is the surface that carries it, so it is exercised under
 * buyer-assigned coordination (seller-assigned auto-fills from the profile
 * and surfaces no picker).
 *
 * PERSISTED, like mainnet: no chain snapshot/revert.
 *
 * Prerequisite: scenario-local-commerce-buyer-assigned anchored + its
 * merchant onboarded, on this devnet.
 *
 * Requires Anvil + ./scripts/deploy-local.sh + Kubo + the dev server.
 */
import { test, expect, ANVIL_ACCOUNTS, gotoAsWallet } from './devnet-multi-test';
import { parseEther, type Hex } from 'viem';
import { CORE_ABI } from '@figaro/core';
import {
    CORE_PROCESS_VIEW_ABI,
    discoverSellerByAssembly,
    ensureTokenApprovalsByAddress,
    localPublicClient,
    acceptOrderInInboxUI,
    pinJSONToIPFS,
    placeBilateralOrderUI,
    readLocalDeploymentConfig,
    seedRegisteredSeller,
    walkClauseAttestations,
} from './devnet-helpers';
import { SCENARIO_SLUG } from './scenarioSlugs.mjs';
import { ANVIL_KEYS } from '../anvilAccounts';

const BUYER_ADDR = ANVIL_ACCOUNTS[0] as Hex;
// The buyer-set courier — this spec's own input data, at a wallet no
// scenario seller uses. anvil[2].
const COURIER_KEY = ANVIL_KEYS[2];
const COURIER_ADDR = ANVIL_ACCOUNTS[2] as Hex;
// The delivery fee the buyer names on the buyer-set courier item.
const BUYER_SET_DELIVERY_FEE = '0.0042';

async function seedBuyerSetCourier(tokenAddress: Hex): Promise<void> {
    const { uri: catalogueURI } = await pinJSONToIPFS({
        subjectAddress: COURIER_ADDR,
        version: '1.0.0',
        unitSystem: 'metric' as const,
        items: [{
            id: 'delivery-quote',
            name: 'Name-your-price delivery',
            description: 'Buyer names the fee',
            price: '0',
            pricingPolicy: 'buyer-set',
            category: 'delivery',
            available: true,
        }],
    });
    await seedRegisteredSeller({
        walletKey: COURIER_KEY,
        profile: {
            name: 'Quote Courier',
            description: 'Buyer-set delivery pricing — seeded by buyer-set-checkout.devnet.spec.ts',
            catalogueURI,
            acceptedTokens: [{ address: tokenAddress, symbol: 'MOCK', chainId: 31337 }],
            defaultTokenAddress: tokenAddress,
        },
    });
}

test.describe('Buyer-set delivery pricing (devnet)', () => {
    // Seed + commit (2 orders incl. the picker) + witnesses + resolve.
    test.setTimeout(420_000);

    test('buyer names the delivery fee on a buyer-set courier item; the courier order commits at that figure', async ({ page }) => {
        page.on('dialog', (dialog) => { dialog.accept().catch(() => {}); });

        const config = readLocalDeploymentConfig();
        const coreAddress = (process.env.NEXT_PUBLIC_FIGARO_CORE ?? config.figaroCore) as Hex;
        const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex;
        const publicClient = localPublicClient();

        // The buyer-assigned merchant (profile binds NO counterparty — the
        // buyer's choice fills the courier order), discovered from chain.
        const merchant = await discoverSellerByAssembly(SCENARIO_SLUG['local-commerce-buyer-assigned']);
        await seedBuyerSetCourier(tokenAddress);
        await ensureTokenApprovalsByAddress(coreAddress, tokenAddress, BUYER_ADDR, merchant.address, COURIER_ADDR);

        // ── 1. Buyer picks the buyer-set delivery item + names the fee ──
        await placeBilateralOrderUI(page, {
            seller: merchant.address,
            method: SCENARIO_SLUG['local-commerce-buyer-assigned'],
            buyerAssignedCourier: {
                address: COURIER_ADDR,
                buyerSetPrice: BUYER_SET_DELIVERY_FEE,
            },
        });
        const processId = await acceptOrderInInboxUI(page, merchant.address);
        await acceptOrderInInboxUI(page, COURIER_ADDR);

        // ── 2. Both orders commit ─────────────────────────────────────
        const committed = await publicClient.readContract({
            address: coreAddress, abi: CORE_PROCESS_VIEW_ABI, functionName: 'processes', args: [processId],
        });
        expect(committed[3]).toBe(2);

        // The courier order's payment is the buyer-named figure — proof the
        // buyer-set price flowed from the input into the commitment, rather
        // than a fixed catalogue price.
        const orders = await publicClient.getContractEvents({
            address: coreAddress, abi: CORE_ABI, eventName: 'OrderCommitted',
            args: { processId }, fromBlock: 0n,
        });
        expect(orders.length).toBe(2);
        const courierOrder = orders.find(
            (e) => (e.args.seller as string).toLowerCase() === COURIER_ADDR.toLowerCase(),
        );
        expect(courierOrder).toBeDefined();
        expect(courierOrder!.args.payment).toBe(parseEther(BUYER_SET_DELIVERY_FEE));

        // ── 3. Buyer co-witnesses proximity (both orders), then resolves ─
        await walkClauseAttestations(page, {
            wallet: BUYER_ADDR, processId, clicks: 2, who: 'buyer',
        });
        const resolveBtn = page.getByTestId('capability-execute-resolve-process');
        await resolveBtn.waitFor({ state: 'visible', timeout: 30000 });
        await resolveBtn.click();
        await expect(page.getByTestId('order-status-pill')).toHaveText(/Completed/i, { timeout: 90000 });

        const resolved = await publicClient.readContract({
            address: coreAddress, abi: CORE_PROCESS_VIEW_ABI, functionName: 'processes', args: [processId],
        });
        expect(Number(resolved[3])).toBe(0);

        // The buyer's order LIST surfaces the (multi-order, now resolved)
        // process (manual review 2026-06-12: /orders had zero e2e coverage).
        await gotoAsWallet(page, BUYER_ADDR, '/orders?e2e=devnet');
        await expect(page.getByTestId(`buyer-order-row-${processId}`)).toBeVisible({ timeout: 30000 });
    });
});
