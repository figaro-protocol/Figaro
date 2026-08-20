/**
 * THE SWAP-FUNDED ON-RAMP, LIVE — the second public-rehearsal spec, the
 * smoke's sibling: a buyer who holds NONE of the process denomination funds
 * their bond from another token the seller accepts, through
 * `WitnessSwapAndCommitCoordinator` and the chain's real swap venue (Sepolia:
 * Uniswap SwapRouter02 + a real WETH/USDC pool; devnet: the mock venue).
 *
 * Runs AFTER `live-order.sepolia.spec.ts` on the same chain — that spec
 * registers the seller this one trades with (same keys, same persisted
 * browser profile). Chain-aware like the smoke: `E2E_CHAIN=sepolia` is the
 * public rehearsal; unset, the same spec rehearses on the devnet.
 *
 * What it does, all through the real UI except the scenario set-up:
 *   0. set-up (out-of-band, idempotent): the seller's profile ACCEPTS the
 *      funding token (edited through /members/edit/identity if not yet); the
 *      buyer holds none of the denomination (moved to the seller) and holds
 *      the funding token (Sepolia: ETH wrapped to WETH; devnet: minted).
 *   1. buyer: item → checkout → the on-ramp panel offers the funding token →
 *      authorize (Permit2) → Place order → the confirm shows the swap leg and
 *      its signed cap → share over the coordination channel;
 *   2. seller: /orders → accept → the coordinator swaps + commits atomically.
 * Chain facts asserted out-of-band: OrderCommitted for the buyer; the commit
 * went THROUGH the coordinator; the buyer's funding token fell by ≤ the cap
 * they signed and > 0; the kernel holds the bonds in the denomination; the
 * coordinator holds nothing afterwards.
 */
import path from 'path';
import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createPublicClient, createWalletClient, formatUnits, http, parseAbi, parseUnits, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { calculateBonds, MEMBERS_REGISTRY_ABI } from '@figaro-protocol/sdk';
import { CORE_ABI, ERC20_ABI } from '@/lib/kernel/contracts';
import { E2E_CHAIN, LOCAL_ANVIL, RPC_URL, readLocalDeploymentConfig, scanContractEvents, waitForConnected } from './devnet-helpers';
import { attachLocalSigner } from './local-signer';
import { gotoAsWallet } from './devnet-multi-test';
import { ITEM_PRICE, smokeKeys, smokeProfileDir } from './live-order-shared';
import { ANVIL_KEYS } from '../anvilAccounts';

const WETH9_ABI = parseAbi(['function deposit() payable', 'function WETH9() view returns (address)']);
const MINT_ABI = parseAbi(['function mint(address to, uint256 amount) external']);
const TRANSFER_ABI = parseAbi(['function transfer(address to, uint256 amount) returns (bool)']);

test.describe('SWAP-FUNDED ORDER — the on-ramp through the real venue, traded through the real UI', () => {
    test.setTimeout(E2E_CHAIN === 'sepolia' ? 1_500_000 : 420_000);

    test('buyer holds none of the denomination → funds the bond from another accepted token → the coordinator swaps and commits', async ({}, testInfo) => {
        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const currency = config.tokenAddress as Hex;                       // the process denomination (Sepolia: USDC)
        const coordinator = config.witnessSwapAndCommitCoordinator as Hex;
        const router = config.swapRouter as Hex;
        const membersRegistry = config.membersRegistry as Hex;
        if (!core || !currency || !coordinator || !router || !membersRegistry) {
            throw new Error(`deployment record incomplete for ${E2E_CHAIN}: core=${core} token=${currency} coordinator=${coordinator} router=${router}`);
        }
        const keys = smokeKeys();
        const seller = privateKeyToAccount(keys.seller);
        const buyer = privateKeyToAccount(keys.buyer);
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const walletFor = (key: Hex) => createWalletClient({ account: privateKeyToAccount(key), chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const balanceOf = (token: Hex, who: Hex) => publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;

        // The funding token: on a public chain the venue's own wrapped ETH
        // (read from SwapRouter02 — a fact of the router, not a constant);
        // on the devnet the second mock token.
        const fundingToken: Hex = E2E_CHAIN === 'sepolia'
            ? await publicClient.readContract({ address: router, abi: WETH9_ABI, functionName: 'WETH9' })
            : (config.permitTokenAddress as Hex);
        const [decimals, symbol, fundingSymbol] = await Promise.all([
            publicClient.readContract({ address: currency, abi: ERC20_ABI, functionName: 'decimals' }) as Promise<number>,
            publicClient.readContract({ address: currency, abi: ERC20_ABI, functionName: 'symbol' }) as Promise<string>,
            publicClient.readContract({ address: fundingToken, abi: ERC20_ABI, functionName: 'symbol' }) as Promise<string>,
        ]);
        const price = parseUnits(ITEM_PRICE, decimals);
        const { buyerBond, sellerBond } = calculateBonds(price, price);

        // ── Preflight: the seller the smoke registered ──
        const alreadyRegistered = await publicClient.readContract({ address: membersRegistry, abi: MEMBERS_REGISTRY_ABI, functionName: 'registered', args: [seller.address] }) as boolean;
        expect(alreadyRegistered, `the smoke seller ${seller.address} must be registered — run live-order.sepolia.spec.ts first on this chain`).toBe(true);
        const gateway = (process.env.NEXT_PUBLIC_IPFS_GATEWAY_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, '');
        const latestProfile = async () => {
            const [reg, upd] = await Promise.all([
                scanContractEvents(publicClient, { address: membersRegistry, abi: MEMBERS_REGISTRY_ABI, eventName: 'MemberRegistered', args: { member: seller.address } }),
                scanContractEvents(publicClient, { address: membersRegistry, abi: MEMBERS_REGISTRY_ABI, eventName: 'MemberProfileUpdated', args: { member: seller.address } }),
            ]);
            const all = [...reg, ...upd].sort((a, b) => Number(a.blockNumber - b.blockNumber));
            const uri = String((all[all.length - 1]?.args as { metadataURI?: string })?.metadataURI ?? '');
            const doc = uri.startsWith('ipfs://')
                ? await fetch(`${gateway}/ipfs/${uri.slice('ipfs://'.length)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { acceptedTokens?: Array<{ address: string }> } | null
                : null;
            return { uri, doc, updates: upd.length };
        };

        // ── Scenario set-up (NOT the action under test) ──
        // Devnet self-funds ETH; Sepolia wallets are the maintainer's, preflighted below.
        if (E2E_CHAIN === 'devnet') {
            const setBalance = async (who: Hex, wei: bigint) => {
                await fetch(RPC_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'anvil_setBalance', params: [who, `0x${wei.toString(16)}`] }) });
            };
            await setBalance(seller.address, parseUnits('1', 18));
            await setBalance(buyer.address, parseUnits('1', 18));
        }
        // The buyer must hold NONE of the denomination worth a bond, or the
        // on-ramp is never offered: move it to the seller (real tokens, real
        // moves — on Sepolia the seller simply ends up with more USDC).
        const buyerCurrency = await balanceOf(currency, buyer.address);
        if (buyerCurrency >= buyerBond) {
            const h = await walletFor(keys.buyer).writeContract({ address: currency, abi: TRANSFER_ABI, functionName: 'transfer', args: [seller.address, buyerCurrency] });
            await publicClient.waitForTransactionReceipt({ hash: h });
        }
        // The buyer must hold the funding token: Sepolia wraps 0.0005 ETH (a
        // few USDC worth on the testnet pools); devnet mints the mock.
        const fundingFloor = E2E_CHAIN === 'sepolia' ? parseUnits('0.0005', 18) : parseUnits('10', 18);
        if (await balanceOf(fundingToken, buyer.address) < fundingFloor) {
            if (E2E_CHAIN === 'sepolia') {
                const h = await walletFor(keys.buyer).writeContract({ address: fundingToken, abi: WETH9_ABI, functionName: 'deposit', value: fundingFloor });
                await publicClient.waitForTransactionReceipt({ hash: h });
            } else {
                const minter = createWalletClient({ account: privateKeyToAccount(ANVIL_KEYS[0]), chain: LOCAL_ANVIL, transport: http(RPC_URL) });
                const h = await minter.writeContract({ address: fundingToken, abi: MINT_ABI, functionName: 'mint', args: [buyer.address, fundingFloor] });
                await publicClient.waitForTransactionReceipt({ hash: h });
            }
        }
        // The seller must hold their own bond in the denomination (direct leg).
        const [sellerEth, buyerEth, sellerCurrency, buyerFunding] = await Promise.all([
            publicClient.getBalance({ address: seller.address }), publicClient.getBalance({ address: buyer.address }),
            balanceOf(currency, seller.address), balanceOf(fundingToken, buyer.address),
        ]);
        const gaps: string[] = [];
        if (sellerEth < parseUnits('0.005', 18)) gaps.push(`seller ${seller.address}: needs 0.005 ETH for gas (has ${formatUnits(sellerEth, 18)})`);
        if (buyerEth < parseUnits('0.003', 18)) gaps.push(`buyer ${buyer.address}: needs 0.003 ETH for gas (has ${formatUnits(buyerEth, 18)})`);
        if (sellerCurrency < sellerBond) gaps.push(`seller ${seller.address}: needs ${formatUnits(sellerBond, decimals)} ${symbol} (has ${formatUnits(sellerCurrency, decimals)})`);
        if (buyerFunding < fundingFloor) gaps.push(`buyer ${buyer.address}: needs ${formatUnits(fundingFloor, 18)} ${fundingSymbol} (has ${formatUnits(buyerFunding, 18)})`);
        expect(gaps, `fund the wallets first:\n${gaps.join('\n')}`).toEqual([]);
        testInfo.annotations.push({ type: 'wallets', description: `seller=${seller.address} buyer=${buyer.address} denomination=${symbol} funding=${fundingSymbol} chain=${E2E_CHAIN}` });

        // ── Browser: the injected wallet + the local-key signer bridge ──
        const baseURL = testInfo.project.use.baseURL as string;
        const ctx: BrowserContext = await chromium.launchPersistentContext(smokeProfileDir(seller.address), { baseURL, args: ['--disk-cache-size=1'] });
        try {
            await attachLocalSigner(ctx, { accounts: [seller, buyer], chain: LOCAL_ANVIL, rpcUrl: RPC_URL, defaultAccount: buyer.address });
            await ctx.addInitScript({ path: path.resolve(__dirname, './fixtures/inject-ethereum-multi.js') });
            const page: Page = ctx.pages()[0] ?? await ctx.newPage();
            page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });
            await page.goto('/', { waitUntil: 'domcontentloaded' });
            await page.evaluate(() => window.localStorage.clear());
            const switchTo = async (address: Hex, url: string) => { await gotoAsWallet(page, address, url); await waitForConnected(page); };

            // ═══ 0. SELLER — accept the funding token (idempotent) ═══════════
            const before = await latestProfile();
            const accepts = (before.doc?.acceptedTokens ?? []).some((t) => t.address.toLowerCase() === fundingToken.toLowerCase());
            if (accepts) {
                testInfo.annotations.push({ type: 'seller-profile', description: `already accepts ${fundingSymbol} (idempotent rerun)` });
            } else {
                await switchTo(seller.address, '/members/edit/identity?e2e=devnet');
                await expect(page.locator('#profile-name')).not.toHaveValue('', { timeout: 120_000 });
                await page.getByRole('button', { name: '+ Add token' }).click();
                await page.locator('input[placeholder="0x… token address"]').last().fill(fundingToken);
                await expect(page.getByText(fundingSymbol, { exact: false }).last(), 'the funding token symbol resolved from chain').toBeVisible({ timeout: 60_000 });
                await page.getByRole('button', { name: 'Save changes' }).click();
                await expect.poll(async () => (await latestProfile()).updates, { timeout: 300_000, intervals: [5_000], message: 'MemberProfileUpdated lands' }).toBe(before.updates + 1);
                await expect.poll(async () => {
                    const { doc } = await latestProfile();
                    return (doc?.acceptedTokens ?? []).some((t) => t.address.toLowerCase() === fundingToken.toLowerCase());
                }, { timeout: 300_000, intervals: [5_000], message: 'the served profile lists the funding token' }).toBe(true);
            }

            // ═══ 1. BUYER — checkout with the on-ramp ═════════════════════════
            const buyerFundingBefore = await balanceOf(fundingToken, buyer.address);
            const coreCurrencyBefore = await balanceOf(currency, core);
            const committedBefore = (await scanContractEvents(publicClient, { address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: buyer.address } })).length;

            await switchTo(buyer.address, `/s/view?seller=${seller.address}&e2e=devnet`);
            await page.getByTestId('member-detail-view').waitFor({ timeout: 120_000 });
            const addBtn = page.locator('[data-testid^="btn-add-"]').first();
            await addBtn.waitFor({ state: 'visible', timeout: 60_000 });
            await addBtn.click();
            await page.getByTestId('btn-review-order').click();
            await page.getByTestId('checkout-view').waitFor({ timeout: 60_000 });
            // The pos assembly's buyer-authored fields, as the smoke fills them
            // (the fields are the clauses' declared inputs, rendered from the spec).
            await page.locator('[data-testid^="checkout-field-"][data-testid$="-figaro-modalities-modality-consume-onsite"]').first().check();
            await page.locator('[data-testid^="checkout-field-"][data-testid$="-figaro-geolocation-origin"]').first().fill('9q8yyk');
            await page.locator('[data-testid^="checkout-field-"][data-testid$="-figaro-geolocation-destination"]').first().fill('9q8yyk');
            // The on-ramp: the seller accepts the funding token, the buyer lacks
            // the denomination — the panel offers it. Pick it, authorize Permit2.
            const option = page.getByTestId(`funding-token-option-${fundingToken.toLowerCase()}`);
            await option.waitFor({ state: 'visible', timeout: 120_000 });
            await option.click();
            // Permit2 authorization for the funding token — decided from CHAIN
            // state, not from whether the button happens to be rendered yet (it
            // stays hidden while the allowance is still being read).
            const permit2 = config.permit2 as Hex;
            const allowance = () => publicClient.readContract({ address: fundingToken, abi: ERC20_ABI, functionName: 'allowance', args: [buyer.address, permit2] }) as Promise<bigint>;
            if (await allowance() < buyerFundingBefore) {
                const authorize = page.getByTestId('funding-authorize');
                await authorize.waitFor({ state: 'visible', timeout: 120_000 });
                await authorize.click();
                await expect.poll(allowance, { timeout: 300_000, intervals: [3_000], message: 'the Permit2 allowance for the funding token lands' }).toBeGreaterThanOrEqual(buyerFundingBefore);
                await authorize.waitFor({ state: 'hidden', timeout: 120_000 });
            }
            const place = page.getByTestId('btn-place-order');
            await expect(place).toHaveText(/Place order/, { timeout: 60_000 });
            await place.click();
            await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 120_000 });
            await expect(page.getByTestId('preview-swap'), 'the swap-funded bond is surfaced in the confirm').toBeVisible();
            const shownCap = (await page.getByTestId('preview-swap-max-input').textContent())?.trim() ?? '';
            expect(shownCap, 'the signed cap is shown').not.toBe('');
            testInfo.annotations.push({ type: 'swap-cap', description: `maxInput shown: ${shownCap}` });
            await page.getByTestId('preview-confirm').click();
            await page.getByTestId('buyer-share-panel').waitFor({ timeout: 300_000 });
            await page.getByTestId('send-commitment-xmtp').click();
            await expect(page.getByTestId('commitment-xmtp-status')).toBeVisible({ timeout: 120_000 });

            // ═══ 2. SELLER — accept: the coordinator swaps + commits ══════════
            await switchTo(seller.address, '/orders?e2e=devnet');
            await page.getByTestId('orders-list').waitFor({ timeout: 60_000 });
            await page.getByTestId('order-your-turn-card').first().waitFor({ state: 'visible', timeout: 300_000 });
            await page.getByTestId('btn-accept-order').first().click();
            await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 120_000 });
            await page.getByTestId('preview-confirm').click();

            // ── Chain facts ──
            await expect.poll(async () => (await scanContractEvents(publicClient, { address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: buyer.address } })).length,
                { timeout: 600_000, intervals: [5_000], message: 'OrderCommitted lands on-chain' }).toBe(committedBefore + 1);
            const events = await scanContractEvents(publicClient, { address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: buyer.address } });
            const event = events[events.length - 1];
            const receipt = await publicClient.getTransactionReceipt({ hash: event.transactionHash });
            const tx = await publicClient.getTransaction({ hash: event.transactionHash });
            expect(receipt.status).toBe('success');
            expect(tx.to?.toLowerCase(), 'the commit went THROUGH the coordinator (swapAndCommit), not straight to the kernel').toBe(coordinator.toLowerCase());
            expect(event.args.payment).toBe(price);
            const [buyerFundingAfter, coreCurrencyAfter, coordCurrency, coordFunding] = await Promise.all([
                balanceOf(fundingToken, buyer.address), balanceOf(currency, core), balanceOf(currency, coordinator), balanceOf(fundingToken, coordinator),
            ]);
            const spent = buyerFundingBefore - buyerFundingAfter;
            expect(spent > 0n, `the buyer paid for the bond in ${fundingSymbol}`).toBe(true);
            expect(spent <= buyerFundingBefore, 'never more than they held').toBe(true);
            expect(coreCurrencyAfter - coreCurrencyBefore, 'the kernel holds both bonds in the denomination').toBe(buyerBond + sellerBond);
            expect(coordCurrency, 'the coordinator retains no denomination').toBe(0n);
            expect(coordFunding, 'the coordinator retains no funding token').toBe(0n);
            testInfo.annotations.push({ type: 'chain', description: `commit ${event.transactionHash} via coordinator; buyer spent ${formatUnits(spent, 18)} ${fundingSymbol} for a ${formatUnits(buyerBond, decimals)} ${symbol} bond` });
        } finally {
            await ctx.close();
        }
    });
});
