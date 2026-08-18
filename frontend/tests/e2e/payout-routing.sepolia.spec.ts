/**
 * PAYOUT ROUTING, LIVE — the third public-rehearsal spec: a settled seller
 * splits WHAT IT WAS PAID onward to its OWN EARMARKED accounts — the fiscal
 * remittance, the savings, the operating float — through the composed public
 * multisender (Disperse, `0xD152…2150` — the same canonical, ownerless
 * contract on Sepolia and mainnet; the devnet composes `MockDisperse`, its
 * interface mirror). The recipients are the seller's, never a counterparty:
 * the earmarks are sub-accounts DERIVED from the seller's own key (tax,
 * savings), the amounts a share of the payment (never the returned bond —
 * that was the seller's all along). This is a composition with a LIVE
 * external contract, so — the SP1-gateway lesson — it is proved by BEHAVIOUR
 * on the public chain, not by the mirror alone.
 *
 * Runs AFTER `live-order.sepolia.spec.ts` on the same chain: that spec leaves
 * the seller with a RESOLVED process (the smoke's buyer resolves), which is
 * where the routing panel renders (settled seller, on the order timeline).
 * Chain-aware like the smoke: `E2E_CHAIN=sepolia` is the public rehearsal;
 * unset, the same spec rehearses on the devnet.
 *
 * Through the real UI: /orders/view for the settled process → the payout
 * routing panel → two earmarked legs → execute (approve + ONE atomic
 * disperseToken). Chain facts asserted out-of-band: each recipient received
 * its leg exactly; the seller paid exactly the batch total; the multisender
 * retains nothing.
 */
import path from 'path';
import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createPublicClient, formatUnits, http, keccak256, parseUnits, stringToHex, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { CORE_ABI, ERC20_ABI } from '@/lib/kernel/contracts';
import { E2E_CHAIN, LOCAL_ANVIL, RPC_URL, readLocalDeploymentConfig, scanContractEvents, waitForConnected } from './devnet-helpers';
import { attachLocalSigner } from './local-signer';
import { gotoAsWallet } from './devnet-multi-test';
import { smokeKeys, smokeProfileDir } from './live-order-shared';

/** The seller's earmarked sub-account for one purpose — a key DERIVED from the
 *  seller's own key and a label, so the seller controls it and nothing leaves
 *  the seller's estate: the split is bookkeeping made on-chain. */
function earmark(sellerKey: Hex, purpose: string): Hex {
    return privateKeyToAccount(keccak256(stringToHex(`${sellerKey}:earmark:${purpose}`))).address;
}

const CANONICAL_DISPERSE = '0xD152f549545093347A162Dce210e7293f1452150' as Hex;

test.describe('PAYOUT ROUTING — a settled seller routes receipts through the composed public multisender', () => {
    test.setTimeout(E2E_CHAIN === 'sepolia' ? 900_000 : 300_000);

    test('two earmarked legs, one atomic disperse — each leg lands exactly, the seller pays exactly the total', async ({}, testInfo) => {
        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const currency = config.tokenAddress as Hex;
        const multisender = (process.env.NEXT_PUBLIC_MULTISENDER || (E2E_CHAIN === 'sepolia' ? CANONICAL_DISPERSE : config.multisender)) as Hex;
        if (!core || !currency || !multisender) throw new Error(`deployment record incomplete for ${E2E_CHAIN}: core=${core} token=${currency} multisender=${multisender}`);
        const keys = smokeKeys();
        const seller = privateKeyToAccount(keys.seller);
        const buyer = privateKeyToAccount(keys.buyer);
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const balanceOf = (who: Hex) => publicClient.readContract({ address: currency, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;
        const decimals = await publicClient.readContract({ address: currency, abi: ERC20_ABI, functionName: 'decimals' }) as number;
        const symbol = await publicClient.readContract({ address: currency, abi: ERC20_ABI, functionName: 'symbol' }) as string;

        // The composed contract, by behaviour not by existence: its bytecode
        // carries the selector the panel calls (the canonical Disperse's).
        const code = await publicClient.getCode({ address: multisender });
        expect(code && code.length > 2, `a multisender is deployed at ${multisender}`).toBe(true);
        expect(code!.toLowerCase().includes('c73a2d60'), 'the multisender implements disperseToken(address,address[],uint256[])').toBe(true);

        // ── The settled process the smoke left behind ──
        const resolved = await scanContractEvents(publicClient, { address: core, abi: CORE_ABI, eventName: 'ProcessResolved', args: { buyer: buyer.address } });
        expect(resolved.length, `the smoke buyer ${buyer.address} must have resolved a process — run live-order.sepolia.spec.ts first on this chain`).toBeGreaterThan(0);
        const processId = (resolved[resolved.length - 1].args as { processId?: bigint }).processId!;

        // ── The legs: the seller's OWN earmarks, a share of the payment ──
        // The smoke's payment was ITEM_PRICE (one whole unit): 0.30 to the tax
        // earmark, 0.25 to the savings earmark; the rest stays as operating float.
        const recipients: [Hex, Hex] = [earmark(keys.seller, 'tax'), earmark(keys.seller, 'savings')];
        const legs = [parseUnits('0.3', decimals), parseUnits('0.25', decimals)] as const;
        const total = legs[0] + legs[1];
        // What the seller was PAID in this process — from the commit, not the
        // resolution (ProcessResolved carries no amounts).
        const committed = await scanContractEvents(publicClient, { address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: buyer.address } });
        const paid = committed.filter((e) => (e.args as { processId?: bigint }).processId === processId)
            .reduce((sum, e) => sum + ((e.args as { payment?: bigint }).payment ?? 0n), 0n);
        expect(paid > 0n, 'the process paid the seller something').toBe(true);
        expect(total <= paid, 'the split is a share of what was PAID, never the returned bond').toBe(true);
        const [sellerBefore, r0Before, r1Before, msBefore] = await Promise.all([balanceOf(seller.address), balanceOf(recipients[0]), balanceOf(recipients[1]), balanceOf(multisender)]);
        expect(sellerBefore >= total, `seller ${seller.address} holds ${formatUnits(sellerBefore, decimals)} ${symbol}; needs ${formatUnits(total, decimals)}`).toBe(true);
        testInfo.annotations.push({ type: 'legs', description: `process=${processId} multisender=${multisender} tax=${formatUnits(legs[0], decimals)} ${symbol} → ${recipients[0]}; savings=${formatUnits(legs[1], decimals)} ${symbol} → ${recipients[1]} (both the seller's own earmarks)` });

        const baseURL = testInfo.project.use.baseURL as string;
        const ctx: BrowserContext = await chromium.launchPersistentContext(smokeProfileDir(seller.address), { baseURL, args: ['--disk-cache-size=1'] });
        try {
            await attachLocalSigner(ctx, { accounts: [seller, buyer], chain: LOCAL_ANVIL, rpcUrl: RPC_URL, defaultAccount: seller.address });
            await ctx.addInitScript({ path: path.resolve(__dirname, './fixtures/inject-ethereum-multi.js') });
            const page: Page = ctx.pages()[0] ?? await ctx.newPage();
            page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });
            await page.goto('/', { waitUntil: 'domcontentloaded' });
            await page.evaluate(() => window.localStorage.clear());
            await gotoAsWallet(page, seller.address, `/orders/view?process=${processId}&e2e=devnet`);
            await waitForConnected(page);
            await page.getByTestId('order-timeline-view').waitFor({ timeout: 120_000 });
            const routing = page.getByTestId('payout-routing');
            await expect(routing, 'the routing surface derives for the settled seller').toBeVisible({ timeout: 120_000 });
            await page.getByTestId('payout-routing-recipient-0').fill(recipients[0]);
            await page.getByTestId('payout-routing-amount-0').fill('0.3');
            await page.getByTestId('payout-routing-add-leg').click();
            await page.getByTestId('payout-routing-recipient-1').fill(recipients[1]);
            await page.getByTestId('payout-routing-amount-1').fill('0.25');
            await page.getByTestId('payout-routing-execute').click();
            await expect(page.getByTestId('payout-routing-success'), 'the batch routes (approve + one atomic disperse)').toBeVisible({ timeout: 600_000 });

            // ── Chain facts ──
            const [sellerAfter, r0After, r1After, msAfter] = await Promise.all([balanceOf(seller.address), balanceOf(recipients[0]), balanceOf(recipients[1]), balanceOf(multisender)]);
            expect(r0After - r0Before, 'the tax earmark received its leg exactly').toBe(legs[0]);
            expect(r1After - r1Before, 'the savings earmark received its leg exactly').toBe(legs[1]);
            expect(sellerBefore - sellerAfter, 'the seller paid exactly the batch total').toBe(total);
            expect(msAfter, 'the multisender retains nothing').toBe(msBefore);
            testInfo.annotations.push({ type: 'chain', description: `routed ${formatUnits(total, decimals)} ${symbol} through ${multisender} on ${E2E_CHAIN}` });
        } finally {
            await ctx.close();
        }
    });
});
