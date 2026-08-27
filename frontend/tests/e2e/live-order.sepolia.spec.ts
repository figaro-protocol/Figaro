/**
 * live-order.sepolia.spec.ts — the transactional smoke of a PUBLIC deployment,
 * driven through the real UI.
 *
 * One trade, end to end, exactly as a stranger would do it on the live site:
 *   1. the seller registers through the onboarding WIZARD (identity, one
 *      catalogue item priced in the settlement token, binds the `pos`
 *      reference assembly, publishes — the app pins profile + catalogue,
 *      MembersRegistry.register lands with the stake);
 *   2. `/discover` lists the seller (the buyer's surface);
 *   3. the buyer orders the item on `/s/view` → checkout → signs → relays;
 *   4. the seller accepts on `/orders` (counter-sign + broadcast = the commit);
 *   5. the buyer resolves on `/orders/view` (buyer dominance);
 *   6. `/audit/view` renders the record.
 * Every step is asserted OUT-OF-BAND from the chain (MemberRegistered,
 * OrderCommitted, exact ERC-20 bond/payment deltas, ProcessResolved) — never
 * from the screen that claims to have written it.
 *
 * TWO NETWORKS, ONE SPEC (`E2E_CHAIN`, tests/e2e/devnet-helpers.ts):
 *   - devnet (default): the REHEARSAL — throwaway keys the node does not
 *     hold (so the local-key signer bridge is exercised, exactly as on a
 *     public chain), self-funded with anvil cheatcodes + the mock token.
 *   - sepolia: the public rehearsal — SMOKE_SELLER_KEY / SMOKE_BUYER_KEY
 *     must be FUNDED beforehand (ETH for gas + the registration stake, the
 *     settlement token for payment and bonds); the preflight names exactly
 *     what is missing and fails there, spending nothing.
 *
 * MAINTAINER-MANUAL (Playwright project `sepolia`): costs real testnet funds
 * and takes minutes of chain confirmations; never part of a suite run.
 */

import path from 'path';
import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createPublicClient, createWalletClient, formatUnits, http, parseAbi, parseUnits, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { calculateBonds, MEMBERS_REGISTRY_ABI } from '@figaro-protocol/sdk';
import { CORE_ABI, ERC20_ABI } from '@/lib/kernel/contracts';
import {
    E2E_CHAIN, LOCAL_ANVIL, RPC_URL, assertPinnedInIpfs, readLocalDeploymentConfig, referenceAssemblySlug, scanContractEvents, waitForConnected,
} from './devnet-helpers';
import { attachLocalSigner } from './local-signer';
import { gotoAsWallet } from './devnet-multi-test';
import { ITEM_PRICE, smokeKeys, smokeProfileDir } from './live-order-shared';
import { ANVIL_KEYS } from '../anvilAccounts';

test.describe('LIVE ORDER — a public deployment traded through the real UI', () => {
    test.setTimeout(E2E_CHAIN === 'sepolia' ? 1_500_000 : 420_000);

    test('seller registers via the wizard → buyer orders → seller accepts → buyer resolves → audit', async ({}, testInfo) => {
        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const token = config.tokenAddress as Hex;
        const membersRegistry = config.membersRegistry as Hex;
        if (!core || !token || !membersRegistry) {
            throw new Error(`deployment record incomplete for ${E2E_CHAIN}: core=${core} token=${token} members=${membersRegistry}`);
        }
        const keys = smokeKeys();
        const seller = privateKeyToAccount(keys.seller);
        const buyer = privateKeyToAccount(keys.buyer);
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const decimals = Number(await publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'decimals' }));
        const symbol = String(await publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'symbol' }));
        const balanceOf = (who: Hex) =>
            publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;
        const price = parseUnits(ITEM_PRICE, decimals);
        const { buyerBond, sellerBond } = calculateBonds(price, price);
        const stake = await publicClient.readContract({ address: membersRegistry, abi: MEMBERS_REGISTRY_ABI, functionName: 'registrationDeposit' }) as bigint;
        const alreadyRegistered = await publicClient.readContract({ address: membersRegistry, abi: MEMBERS_REGISTRY_ABI, functionName: 'registered', args: [seller.address] }) as boolean;

        // ── Funding: devnet self-funds; Sepolia PREFLIGHTS and names the gaps ──
        const need = {
            sellerEth: (alreadyRegistered ? 0n : stake) + parseUnits('0.01', 18),
            buyerEth: parseUnits('0.01', 18),
            sellerToken: sellerBond,
            buyerToken: price + buyerBond,
        };
        if (E2E_CHAIN === 'devnet') {
            const setBalance = async (who: Hex, wei: bigint) => {
                await fetch(RPC_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'anvil_setBalance', params: [who, `0x${wei.toString(16)}`] }) });
            };
            await setBalance(seller.address, parseUnits('1', 18));
            await setBalance(buyer.address, parseUnits('1', 18));
            const minter = createWalletClient({ account: privateKeyToAccount(ANVIL_KEYS[0]), chain: LOCAL_ANVIL, transport: http(RPC_URL) });
            for (const [who, amount] of [[seller.address, need.sellerToken * 10n], [buyer.address, need.buyerToken * 10n]] as const) {
                const h = await minter.writeContract({ address: token, abi: parseAbi(['function mint(address to, uint256 amount) external']), functionName: 'mint', args: [who, amount] });
                await publicClient.waitForTransactionReceipt({ hash: h });
            }
        }
        const [sellerEth, buyerEth, sellerTok, buyerTok] = await Promise.all([
            publicClient.getBalance({ address: seller.address }), publicClient.getBalance({ address: buyer.address }),
            balanceOf(seller.address), balanceOf(buyer.address),
        ]);
        const gaps: string[] = [];
        if (sellerEth < need.sellerEth) gaps.push(`seller ${seller.address}: needs ${formatUnits(need.sellerEth, 18)} ETH (has ${formatUnits(sellerEth, 18)})`);
        if (buyerEth < need.buyerEth) gaps.push(`buyer ${buyer.address}: needs ${formatUnits(need.buyerEth, 18)} ETH (has ${formatUnits(buyerEth, 18)})`);
        if (sellerTok < need.sellerToken) gaps.push(`seller ${seller.address}: needs ${formatUnits(need.sellerToken, decimals)} ${symbol} (has ${formatUnits(sellerTok, decimals)})`);
        if (buyerTok < need.buyerToken) gaps.push(`buyer ${buyer.address}: needs ${formatUnits(need.buyerToken, decimals)} ${symbol} (has ${formatUnits(buyerTok, decimals)})`);
        expect(gaps, `fund the smoke wallets first:\n${gaps.join('\n')}`).toEqual([]);
        testInfo.annotations.push({ type: 'wallets', description: `seller=${seller.address} buyer=${buyer.address} token=${token} (${symbol}, ${decimals} dp) chain=${E2E_CHAIN}` });

        // ── Browser: the injected wallet + the local-key signer bridge ──
        const baseURL = testInfo.project.use.baseURL as string;
        const ctx: BrowserContext = await chromium.launchPersistentContext(
            smokeProfileDir(seller.address),
            { baseURL, args: ['--disk-cache-size=1'] },
        );
        try {
            await attachLocalSigner(ctx, { accounts: [seller, buyer], chain: LOCAL_ANVIL, rpcUrl: RPC_URL, defaultAccount: buyer.address });
            await ctx.addInitScript({ path: path.resolve(__dirname, './fixtures/inject-ethereum-multi.js') });
            const page: Page = ctx.pages()[0] ?? await ctx.newPage();
            page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });
            await page.goto('/', { waitUntil: 'domcontentloaded' });
            await page.evaluate(() => window.localStorage.clear());
            // The switch rides an init script (gotoAsWallet), so it survives
            // every navigation — a post-load switch is undone by the next load.
            const switchTo = async (address: Hex, url: string) => {
                await gotoAsWallet(page, address, url);
                await waitForConnected(page);
            };

            // ═══ 1. SELLER — the wizard ═══════════════════════════════════════
            const posSlug = referenceAssemblySlug('pos.json');
            const sellerName = `Smoke counter ${seller.address.slice(2, 8)}`;
            const gateway = (process.env.NEXT_PUBLIC_IPFS_GATEWAY_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, '');
            const latestUri = async () => {
                const [reg, upd] = await Promise.all([
                    scanContractEvents(publicClient, { address: membersRegistry, abi: MEMBERS_REGISTRY_ABI, eventName: 'MemberRegistered', args: { member: seller.address } }),
                    scanContractEvents(publicClient, { address: membersRegistry, abi: MEMBERS_REGISTRY_ABI, eventName: 'MemberProfileUpdated', args: { member: seller.address } }),
                ]);
                const all = [...reg, ...upd].sort((a, b) => Number(a.blockNumber - b.blockNumber));
                return String((all[all.length - 1]?.args as { metadataURI?: string })?.metadataURI ?? '');
            };
            // Idempotent on a persisted network: a rerun must NOT walk the
            // wizard again — every publish mints a fresh catalogue item id, so
            // "the same" profile re-pins under a new CID and the pointer moves
            // to content the public gateway has not propagated yet (the member
            // vanishes from /discover until it does). Skip when the chain
            // already shows this seller registered AND its served profile
            // binds `pos`.
            let alreadyBound = false;
            if (alreadyRegistered) {
                const uri = await latestUri();
                const doc = uri.startsWith('ipfs://')
                    ? await fetch(`${gateway}/ipfs/${uri.slice('ipfs://'.length)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { name?: string; assemblyBindings?: Array<{ assemblySlug?: string }> } | null
                    : null;
                alreadyBound = !!doc && doc.name === sellerName && (doc.assemblyBindings ?? []).some((b) => b.assemblySlug === posSlug);
            }
            if (alreadyBound) {
                testInfo.annotations.push({ type: 'wizard', description: 'skipped — seller already registered and bound to pos (idempotent rerun)' });
            } else {
            await switchTo(seller.address, '/members/identity?e2e=devnet');
            await expect(page.locator('#profile-name')).toBeVisible({ timeout: 60_000 });
            await page.locator('#profile-name').fill(sellerName);
            await page.locator('#profile-specialty').fill('point-of-sale smoke');
            await page.locator('#profile-geohash').fill('9q8yyk');
            // Accepted token: the settlement token — via the picker where the
            // chain offers one (devnet mock), else the manual address row.
            const picker = page.getByRole('button', { name: new RegExp(`\\+ ${symbol}$`) });
            if (await picker.isVisible().catch(() => false)) {
                await picker.click();
            } else {
                await page.locator('input[placeholder="0x… token address"]').first().fill(token);
                await expect(page.locator('input[name="defaultTokenAddress"]').first(), 'the token symbol resolved from chain').toBeVisible({ timeout: 60_000 });
            }
            await page.locator('input[name="defaultTokenAddress"]').first().check();
            await page.getByRole('button', { name: /^Next/ }).click();
            await expect(page).toHaveURL(/\/members\/catalogue/);
            await page.locator('[id^="item-"][id$="-name"]').first().fill('Smoke espresso');
            await page.locator('[id^="item-"][id$="-price"]').first().fill(ITEM_PRICE);
            await page.getByRole('button', { name: /^Next/ }).click();
            await expect(page).toHaveURL(/\/members\/assemblies/);
            const rows = page.locator('[data-testid^="seller-assembly-row-"]');
            await rows.first().waitFor({ state: 'visible', timeout: 120_000 });
            const checked = page.locator('[data-testid^="seller-assembly-row-"] input[type="checkbox"]:checked');
            while (await checked.count() > 0) await checked.first().uncheck();
            const posRow = page.getByTestId(`seller-assembly-row-${posSlug}`);
            await posRow.waitFor({ state: 'visible', timeout: 120_000 });
            await posRow.locator('input[type="checkbox"]').first().check();
            const offer = page.locator(`[data-testid^="disclosure-${posSlug}-"][data-testid$="-seller-offer"]`).first();
            await offer.waitFor({ state: 'visible', timeout: 60_000 });
            if (!(await offer.isChecked())) await offer.check();
            await page.getByRole('button', { name: /^Next/ }).click();
            await expect(page).toHaveURL(/\/members\/buyer/);
            await page.getByRole('button', { name: /^Next/ }).click();
            await expect(page).toHaveURL(/\/members\/agents/);
            await page.getByRole('button', { name: /^Next/ }).click();
            await expect(page).toHaveURL(/\/members\/endpoints/);
            await page.getByRole('button', { name: /^Next/ }).click();
            await page.waitForURL(/\/members\/review/, { timeout: 60_000 });
            await expect(page.getByText(sellerName)).toBeVisible();
            await page.getByTestId('review-confirm-publish').click();
            await expect(page.getByRole('heading', { name: /Registered\.|Profile updated/i })).toBeVisible({ timeout: 300_000 });
            }
            // Chain fact: registered, stake held, profile URI on the registry.
            expect(await publicClient.readContract({ address: membersRegistry, abi: MEMBERS_REGISTRY_ABI, functionName: 'registered', args: [seller.address] }), 'MembersRegistry.registered(seller)').toBe(true);
            // The profile the app pinned must be READABLE where the site reads
            // it (the public gateway) — on a public network that is minutes of
            // propagation after the pin; the out-of-band proof is the gateway
            // serving the URI the chain points at.
            const profileUri = await latestUri();
            expect(profileUri.startsWith('ipfs://'), 'the registry points at a pinned profile').toBe(true);
            await assertPinnedInIpfs(profileUri.slice('ipfs://'.length));
            // …and the catalogue the profile points at (a second pinned
            // document — the seller page's item list reads it).
            const profileDoc = await (await fetch(`${gateway}/ipfs/${profileUri.slice('ipfs://'.length)}`)).json() as { catalogueURI?: string };
            expect(String(profileDoc.catalogueURI ?? '').startsWith('ipfs://'), 'the profile points at a pinned catalogue').toBe(true);
            await assertPinnedInIpfs(String(profileDoc.catalogueURI).slice('ipfs://'.length));

            // ═══ 2. DISCOVER — the buyer's surface lists the seller ═══════════
            // Poll with reloads: a profile read that 504'd before propagation
            // is not cached, so the next load picks it up.
            await switchTo(buyer.address, '/discover?e2e=devnet');
            await expect.poll(async () => {
                if (await page.getByText(sellerName).first().isVisible().catch(() => false)) return true;
                await page.reload({ waitUntil: 'domcontentloaded' });
                await page.waitForTimeout(10_000);
                return page.getByText(sellerName).first().isVisible().catch(() => false);
            }, { timeout: E2E_CHAIN === 'sepolia' ? 420_000 : 60_000, intervals: [1_000], message: 'the seller surfaces on /discover' }).toBe(true);

            // ═══ 3. BUYER — order → checkout → sign → relay ═══════════════════
            const committedBefore = (await scanContractEvents(publicClient, { address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: buyer.address } })).length;
            const [buyerT0, sellerT0, coreT0] = await Promise.all([balanceOf(buyer.address), balanceOf(seller.address), balanceOf(core)]);
            await switchTo(buyer.address, `/s/view?seller=${seller.address}&e2e=devnet`);
            await page.getByTestId('member-detail-view').waitFor({ timeout: 120_000 });
            const addBtn = page.locator('[data-testid^="btn-add-"]').first();
            // The catalogue may still be settling on the gateway for the
            // browser's own read — reload until the item renders.
            await expect.poll(async () => {
                if (await addBtn.isVisible().catch(() => false)) return true;
                await page.reload({ waitUntil: 'domcontentloaded' });
                await page.getByTestId('member-detail-view').waitFor({ timeout: 60_000 }).catch(() => {});
                await page.waitForTimeout(8_000);
                return addBtn.isVisible().catch(() => false);
            }, { timeout: E2E_CHAIN === 'sepolia' ? 300_000 : 60_000, intervals: [1_000], message: 'the catalogue item renders on the seller page' }).toBe(true);
            await addBtn.click();
            await page.getByTestId('btn-review-order').click();
            await page.getByTestId('checkout-view').waitFor({ timeout: 60_000 });
            await page.locator('[data-testid^="checkout-field-"][data-testid$="-figaro-modalities-modality-consume-onsite"]').first().check();
            await page.locator('[data-testid^="checkout-field-"][data-testid$="-figaro-geolocation-origin"]').first().fill('9q8yyk');
            await page.locator('[data-testid^="checkout-field-"][data-testid$="-figaro-geolocation-destination"]').first().fill('9q8yyk');
            const place = page.getByTestId('btn-place-order');
            await expect(place, 'buyer connected + order ready → "Place order"').toHaveText(/Place order/, { timeout: 60_000 });
            await place.click();
            await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 60_000 });
            await page.getByTestId('preview-confirm').click();
            await page.getByTestId('buyer-share-panel').waitFor({ timeout: 300_000 });
            await page.getByTestId('send-commitment-xmtp').click();
            await expect(page.getByTestId('commitment-xmtp-status')).toBeVisible({ timeout: 60_000 });

            // ═══ 4. SELLER — accept on /orders = counter-sign + commit ════════
            await switchTo(seller.address, '/orders?e2e=devnet');
            await page.getByTestId('orders-list').waitFor({ timeout: 60_000 });
            await page.getByTestId('order-your-turn-card').first().waitFor({ state: 'visible', timeout: 120_000 });
            await page.getByTestId('btn-accept-order').first().click();
            await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 120_000 });
            await page.getByTestId('preview-confirm').click();
            const queryCommitted = () => scanContractEvents(publicClient, { address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: buyer.address } });
            await expect.poll(async () => (await queryCommitted()).length, { timeout: 600_000, intervals: [5_000], message: 'OrderCommitted lands on-chain' }).toBe(committedBefore + 1);
            const all = await queryCommitted();
            const event = all[all.length - 1];
            const processId = event.args.processId!;
            expect(event.args.seller?.toLowerCase(), 'committed against the wizard seller').toBe(seller.address.toLowerCase());
            const receipt = await publicClient.getTransactionReceipt({ hash: event.transactionHash });
            expect(receipt.status).toBe('success');
            testInfo.annotations.push({ type: 'OrderCommitted', description: `process=${processId} order=${event.args.orderHash} payment=${event.args.payment} tx=${receipt.transactionHash} block=${receipt.blockNumber}` });
            const [buyerT1, sellerT1, coreT1] = await Promise.all([balanceOf(buyer.address), balanceOf(seller.address), balanceOf(core)]);
            const bonds = calculateBonds(event.args.cumulativeValue!, event.args.payment!);
            expect(buyerT0 - buyerT1, 'buyer locked exactly the buyer bond').toBe(bonds.buyerBond);
            expect(sellerT0 - sellerT1, 'seller locked exactly the seller bond').toBe(bonds.sellerBond);
            expect(coreT1 - coreT0, 'FigaroCore escrow holds both bonds').toBe(bonds.buyerBond + bonds.sellerBond);
            await expect(page.getByTestId(`order-status-${processId}`), 'the order shows In progress').toHaveText('In progress', { timeout: 60_000 });

            // ═══ 5. BUYER — resolve (buyer dominance) ═════════════════════════
            const resolvedBefore = (await scanContractEvents(publicClient, { address: core, abi: CORE_ABI, eventName: 'ProcessResolved', args: { buyer: buyer.address } })).length;
            await switchTo(buyer.address, `/orders/view?process=${processId}&e2e=devnet`);
            await page.getByTestId('order-timeline-view').waitFor({ timeout: 120_000 });
            const resolveBtn = page.getByTestId('capability-execute-resolve-process');
            await expect(resolveBtn, 'the buyer can resolve').toBeEnabled({ timeout: 120_000 });
            await resolveBtn.click();
            await expect.poll(async () => (await scanContractEvents(publicClient, { address: core, abi: CORE_ABI, eventName: 'ProcessResolved', args: { buyer: buyer.address } })).length, { timeout: 600_000, intervals: [5_000], message: 'ProcessResolved lands on-chain' }).toBe(resolvedBefore + 1);
            const [buyerT2, sellerT2, coreT2] = await Promise.all([balanceOf(buyer.address), balanceOf(seller.address), balanceOf(core)]);
            expect(buyerT0 - buyerT2, 'buyer net paid exactly the payment').toBe(event.args.payment!);
            expect(sellerT2 - sellerT0, 'seller net earned exactly the payment').toBe(event.args.payment!);
            expect(coreT2, 'escrow back to baseline').toBe(coreT0);

            // ═══ 6. AUDIT — the record renders ════════════════════════════════
            await page.goto(`/audit/view?process=${processId}&e2e=devnet`, { waitUntil: 'domcontentloaded' });
            await page.getByTestId('audit-page').waitFor({ timeout: 120_000 });
            await expect(page.getByTestId('financials-view'), 'the audit package renders').toBeVisible({ timeout: 120_000 });
            await expect(page.locator('[data-testid="document-lines-financial-statements-process"] tbody tr').first(), 'the on-chain events surface in the cash-flow log').toBeVisible({ timeout: 120_000 });
            testInfo.annotations.push({ type: 'settled', description: `process ${processId} resolved; buyer −${formatUnits(event.args.payment!, decimals)} ${symbol}, seller +${formatUnits(event.args.payment!, decimals)} ${symbol}` });
        } finally {
            await ctx.close();
        }
    });
});
