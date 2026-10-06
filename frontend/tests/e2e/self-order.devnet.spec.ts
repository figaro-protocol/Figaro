/**
 * self-order.devnet.spec.ts
 *
 * A wallet orders from its OWN listing and accepts its own order. The Core
 * ADMITS buyer == seller (DESIGN_DECISIONS entry 3), so the client must too:
 * the accepting role is the slot whose signature is still empty, never "buyer"
 * by address alone (`acceptOrder`, lib/checkout/orderCommitmentFlow.ts). The
 * walk: register a member → order from its own listing → relay → accept on
 * /orders → resolve. The chain facts (the OrderCommitted pair, the escrow, the
 * ProcessResolved, the wallet's balance) are read out-of-band with fresh chain
 * queries, never from the screen that wrote them.
 *
 * Wallet: anvil[33] — the one free index (equipment-hire's header lists 22, 23,
 * 24, 33; 22-24 are since taken). Every run replaces its profile on entry
 * (`seedRegisteredMember`), so a sibling self-seeder on 33 self-heals.
 *
 * Depends on populate-test-data (the pos reference anchored) and the Kubo
 * daemon. Iterate with `--no-deps` once the chain is anchored.
 */
import { test, expect, gotoAsWallet, ANVIL_ACCOUNTS } from './devnet-multi-test';
import { createPublicClient, createWalletClient, defineChain, http, parseAbi, parseEther, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { calculateBonds } from '@figaro-protocol/sdk';
import {
    discoverAnchoredAssemblies,
    referenceAssemblySlug,
    pinJSONToIPFS,
    readLocalDeploymentConfig,
    seedRegisteredMember,
    memberProfileBindings,
    waitForConnected,
} from './devnet-helpers';
import { ANVIL_KEYS } from '../anvilAccounts';
import { CORE_ABI } from '@/lib/kernel/contracts';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});
const ERC20_ABI = parseAbi(['function balanceOf(address) view returns (uint256)']);

/** One wallet in both slots: seller of its own listing and its own buyer. */
const SELF = ANVIL_ACCOUNTS[33] as Hex;

test.describe('A wallet orders from its own listing (buyer == seller, devnet)', () => {
    test.setTimeout(240_000);

    test('order → accept → resolve, every fact read back from chain', async ({ page }) => {
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });
        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const token = config.tokenAddress as Hex;
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const balanceOf = (who: Hex) =>
            publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;

        // ── Register the member, bound to the pos reference (identity by slug,
        //    never a clause-shape heuristic — as orders-accept does).
        const slug = referenceAssemblySlug('pos.json');
        expect(
            (await discoverAnchoredAssemblies()).some((a) => a.slug === slug),
            'the pos reference (assemblies/pos.json) is anchored — run populate-test-data',
        ).toBe(true);
        const { uri: catalogueURI } = await pinJSONToIPFS({
            subjectAddress: SELF,
            version: '1.0.0',
            unitSystem: 'metric' as const,
            items: [{
                id: 'self-counter-sale',
                name: 'Own counter sale',
                description: 'One item, ordered from the wallet that sells it.',
                price: '1',
                category: 'retail',
                image: '🧾',
                available: true,
            }],
        });
        await seedRegisteredMember({
            walletKey: ANVIL_KEYS[33] as Hex,
            profile: {
                name: 'Self Order Counter',
                description: 'Seeded by self-order.devnet.spec.ts — orders from itself.',
                catalogueURI,
                acceptedTokens: [{ address: token, symbol: 'MOCK', chainId: 31337 }],
                defaultTokenAddress: token,
                assemblyBindings: [{
                    bindingId: 'self-order',
                    subjectAddress: SELF,
                    assemblySlug: slug,
                    counterpartyBindings: [],
                }],
            },
        });
        await expect.poll(async () =>
            (await memberProfileBindings(SELF)).some((b) => b.assemblySlug === slug), {
            timeout: 60_000, message: "the member's pinned profile carries the pos binding",
        }).toBe(true);

        // Index 33 is past Deploy.s.sol's mint range (0..19): mint the bonds' float.
        {
            const minter = createWalletClient({ account: privateKeyToAccount(ANVIL_KEYS[0]), chain: LOCAL_ANVIL, transport: http(RPC_URL) });
            const h = await minter.writeContract({
                address: token, abi: parseAbi(['function mint(address to, uint256 amount) external']),
                functionName: 'mint', args: [SELF, parseEther('1000')],
            });
            await publicClient.waitForTransactionReceipt({ hash: h });
        }

        const committedBefore = (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: SELF }, fromBlock: 0n,
        })).length;
        const [selfBefore, coreBefore] = await Promise.all([balanceOf(SELF), balanceOf(core)]);

        // ── Order from its own listing (pattern 16: gotoAsWallet switches the
        //    wallet persistently — SELF stays the connected wallet throughout).
        await gotoAsWallet(page, SELF, `/s/view?seller=${SELF}&e2e=devnet`);
        await page.getByTestId('member-detail-view').waitFor({ timeout: 30_000 });
        await waitForConnected(page);
        const addBtn = page.locator('[data-testid^="btn-add-"]').first();
        await addBtn.waitFor({ state: 'visible', timeout: 20_000 });
        await addBtn.click();
        await page.getByTestId('btn-review-order').click();

        await page.getByTestId('checkout-view').waitFor({ timeout: 20_000 });
        await page.locator('[data-testid^="checkout-field-"][data-testid$="-figaro-modalities-modality-consume-onsite"]').first().check();
        await page.locator('[data-testid^="checkout-field-"][data-testid$="-figaro-geolocation-origin"]').first().fill('9q8yyk');
        await page.locator('[data-testid^="checkout-field-"][data-testid$="-figaro-geolocation-destination"]').first().fill('9q8yyk');
        const place = page.getByTestId('btn-place-order');
        await expect(place, 'connected + ready → "Place order"').toHaveText(/Place order/, { timeout: 20_000 });
        await place.click();
        await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30_000 });
        await page.getByTestId('preview-confirm').click();
        await page.getByTestId('buyer-share-panel').waitFor({ timeout: 60_000 });
        await page.getByTestId('send-commitment-xmtp').click();
        await expect(page.getByTestId('commitment-xmtp-status')).toBeVisible({ timeout: 30_000 });

        // ── Accept the order on /orders — the same wallet holds the seller slot.
        await page.goto('/orders?e2e=devnet', { waitUntil: 'domcontentloaded' });
        await page.getByTestId('orders-list').waitFor({ timeout: 30_000 });
        await waitForConnected(page);
        await page.getByTestId('order-your-turn-card').first().waitFor({ state: 'visible', timeout: 30_000 });
        await page.getByTestId('btn-accept-order').first().click();
        await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30_000 });
        await page.getByTestId('preview-confirm').click();

        // ── Chain facts, fresh queries: one new OrderCommitted, buyer == seller.
        const queryCommitted = () => publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: SELF }, fromBlock: 0n,
        });
        await expect.poll(async () => (await queryCommitted()).length, {
            timeout: 60_000, message: 'a new OrderCommitted lands on-chain for the wallet',
        }).toBe(committedBefore + 1);
        const event = (await queryCommitted()).at(-1)!;
        expect(event.args.seller?.toLowerCase(), 'the same wallet is the seller').toBe(SELF.toLowerCase());
        expect(event.args.buyer?.toLowerCase(), 'the same wallet is the buyer').toBe(SELF.toLowerCase());
        expect((await publicClient.getTransactionReceipt({ hash: event.transactionHash })).status).toBe('success');

        // Both bonds leave the one wallet and sit in the escrow.
        const { buyerBond, sellerBond } = calculateBonds(event.args.cumulativeValue!, event.args.payment!);
        const [selfActive, coreActive] = await Promise.all([balanceOf(SELF), balanceOf(core)]);
        expect(selfBefore - selfActive, 'the wallet funds BOTH bonds').toBe(buyerBond + sellerBond);
        expect(coreActive - coreBefore, 'FigaroCore escrow holds both bonds').toBe(buyerBond + sellerBond);

        // ── Resolve (the wallet is the buyer).
        const processId = event.args.processId!;
        const queryResolved = () => publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'ProcessResolved', args: { buyer: SELF }, fromBlock: 0n,
        });
        const resolvedBefore = (await queryResolved()).length;
        await page.goto(`/orders/view?process=${processId}&e2e=devnet`, { waitUntil: 'domcontentloaded' });
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30_000 });
        await waitForConnected(page);
        const resolveBtn = page.getByTestId('capability-execute-resolve-process');
        await resolveBtn.waitFor({ state: 'visible', timeout: 30_000 });
        await expect(resolveBtn).toBeEnabled({ timeout: 30_000 });
        await resolveBtn.click();
        await expect.poll(async () => (await queryResolved()).length, {
            timeout: 60_000, message: 'ProcessResolved lands on-chain',
        }).toBe(resolvedBefore + 1);

        // Paying itself nets zero: every bond refunded, the escrow back to baseline.
        const [selfFinal, coreFinal] = await Promise.all([balanceOf(SELF), balanceOf(core)]);
        expect(selfFinal, 'buyer == seller: the wallet is whole after resolution').toBe(selfBefore);
        expect(coreFinal, 'FigaroCore escrow returned to its baseline').toBe(coreBefore);
    });
});
