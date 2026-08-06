/**
 * checkout-assembly-choice.devnet.spec.ts
 *
 * MULTI-ASSEMBLY BUYER CHOICE — a seller bound to MORE THAN ONE published
 * assembly forces the buyer's checkout to disambiguate: the buyer's options
 * ARE the seller's bound assemblies (one option per binding, labelled by the
 * assembly's own name, keyed by slug — the mechanism is derived from binding
 * state, no taxonomy). The spec asserts the whole designed behavior:
 *
 *   - two bindings → the method dropdown renders (never the static line),
 *   - place-order REFUSES until the buyer picks,
 *   - the pick drives checkout → sign → relay → seller counter-sign → commit,
 *   - value legs: exact bond deltas from the chain (standing rule).
 *
 * Dedicated wallet anvil[14]: the wizard seller (anvil[13]) must stay
 * SINGLE-binding by scenario premise — a second binding on it would gate
 * every other spec's checkout behind this dropdown. The two bound assemblies
 * are ADOPTED from the live registry by SHAPE (the seeded single-order blank
 * + the seeded multi-order chain), never by slug or roster; the buyer picks
 * the single-order one, so the chain binding exists purely to force the
 * choice.
 *
 * Depends on populate-test-data (clauses + the two seed assemblies + the
 * MOCK token). Requires Anvil + ./scripts/deploy-local.sh + Kubo + the server.
 */
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import { createPublicClient, defineChain, http, parseAbi, type Hex } from 'viem';
import { calculateBonds, MEMBERS_REGISTRY_ABI } from '@figaro/sdk';
import { discoverAnchoredAssemblies, readLocalDeploymentConfig, waitForConnected } from './devnet-helpers';
import { CORE_ABI } from '@/lib/kernel/contracts';
import type { Page } from '@playwright/test';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});

// anvil[14] — this spec's own seller; no other spec registers or orders from it.
const SELLER = {
    address: '0xdF3e18d64BC6A983f673Ab319CCaE4f1a57C7097' as Hex,
    name: 'Choice Test Trattoria',
    specialty: 'test trattoria, two bound assemblies',
    geohash: '9q8yyk8z1',
    product: { name: 'Cacio e pepe', price: '1' },
};
// anvil[0] — the fixture's default buyer.
const BUYER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Hex;

const ERC20_ABI = parseAbi(['function balanceOf(address) view returns (uint256)']);

/** Walk the registration wizard as the seller's wallet, binding EXACTLY the
 *  given assemblies (clears any prior bindings first — update-mode repair). */
async function onboardViaWizard(page: Page, assemblySlugs: string[]) {
    await gotoAsWallet(page, SELLER.address, '/members');
    await page.waitForFunction(
        () => {
            const bodyText = document.body.textContent || '';
            if (bodyText.includes('Loading…')) return false;
            return bodyText.includes('Register as a seller.')
                || bodyText.includes('View public profile');
        },
        null,
        { timeout: 60_000 },
    );
    await page.goto('/members/identity', { waitUntil: 'domcontentloaded' });

    // Step 2 — Identity
    await expect(page.locator('#profile-name')).toBeVisible({ timeout: 30_000 });
    await page.locator('#profile-name').fill(SELLER.name);
    await page.locator('#profile-specialty').fill(SELLER.specialty);
    await page.locator('#profile-geohash').fill(SELLER.geohash);
    await page.getByRole('button', { name: /\+ MOCK$/ }).click();
    await page.locator('input[name="defaultTokenAddress"]').first().check();
    await page.getByRole('button', { name: /^Next/ }).click();
    await expect(page).toHaveURL(/\/members\/catalogue/);

    // Step 3 — Catalogue: one product
    await page.locator('[id^="item-"][id$="-name"]').first().fill(SELLER.product.name);
    await page.locator('[id^="item-"][id$="-price"]').first().fill(SELLER.product.price);
    await page.getByRole('button', { name: /^Next/ }).click();
    await expect(page).toHaveURL(/\/members\/assemblies/);

    // Step 4 — Assemblies: clear hydrated bindings, then bind BOTH target
    // assemblies. The multi-order chain binds WITHOUT counterparty
    // designation — undesignated sub-orders become buyer-assigned picks at
    // checkout, and this spec's buyer picks the single-order assembly anyway.
    const rows = page.locator('[data-testid^="seller-assembly-row-"]');
    await rows.first().waitFor({ state: 'visible', timeout: 30_000 });
    const checkedBoxes = page.locator('[data-testid^="seller-assembly-row-"] input[type="checkbox"]:checked');
    while (await checkedBoxes.count() > 0) {
        await checkedBoxes.first().uncheck();
    }
    for (const slug of assemblySlugs) {
        const row = page.getByTestId(`seller-assembly-row-${slug}`);
        await row.waitFor({ state: 'visible', timeout: 30_000 });
        await row.locator('input[type="checkbox"]').first().check();
    }
    await page.getByRole('button', { name: /^Next/ }).click();
    await expect(page).toHaveURL(/\/members\/agents/);

    // Step 5 — Agents: skip
    await page.getByRole('button', { name: /^Next/ }).click();
    await page.waitForURL(/\/members\/review/, { timeout: 30_000 });

    // Step 6 — Review + publish (pin catalogue + profile → register tx)
    await expect(page.getByText(SELLER.name)).toBeVisible();
    await page.getByTestId('review-confirm-publish').click();
    await expect(page.getByRole('heading', { name: /Registered\.|Profile updated/i }))
        .toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: /Continue to dashboard/ }).click();
    await page.waitForURL(/\/members$/, { timeout: 15_000 });
}

// Wizard + IPFS pins + two sign gates + commit + event polls.
test.setTimeout(240_000);

test.describe('checkout assembly choice — two bindings force the buyer to pick (devnet)', () => {
    test('the buyer picks among the seller\'s bound assemblies and the order commits', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const token = config.tokenAddress as Hex;
        const membersRegistry = (process.env.NEXT_PUBLIC_MEMBERS_REGISTRY ?? config.membersRegistry) as Hex;
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const balanceOf = (who: Hex) =>
            publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;

        // The two bindings, adopted from the live registry by SHAPE: the
        // earliest single-order template + the earliest multi-order chain.
        const anchored = await discoverAnchoredAssemblies();
        const singleOrderSlug = anchored.find((a) => a.agreements.length === 1)?.slug;
        const multiOrderSlug = anchored.find((a) => a.agreements.length > 1)?.slug;
        expect(singleOrderSlug, 'a single-order assembly is anchored (run populate-test-data)').toBeTruthy();
        expect(multiOrderSlug, 'a multi-order assembly is anchored (run populate-test-data)').toBeTruthy();
        const targetSlugs = [singleOrderSlug!, multiOrderSlug!];

        // Mainnet semantics: register ONCE and persist. Walk the wizard only
        // when this wallet isn't registered yet or its bindings don't match
        // the scenario premise (exactly these two).
        const latestProfileURI = async (): Promise<string | undefined> => {
            const [registrations, updates] = await Promise.all([
                publicClient.getContractEvents({
                    address: membersRegistry, abi: MEMBERS_REGISTRY_ABI, eventName: 'MemberRegistered',
                    args: { member: SELLER.address }, fromBlock: 0n,
                }),
                publicClient.getContractEvents({
                    address: membersRegistry, abi: MEMBERS_REGISTRY_ABI, eventName: 'MemberProfileUpdated',
                    args: { member: SELLER.address }, fromBlock: 0n,
                }),
            ]);
            return [...registrations, ...updates]
                .sort((a, b) => Number(a.blockNumber - b.blockNumber))
                .at(-1)?.args.metadataURI as string | undefined;
        };
        const uriBefore = await latestProfileURI();
        let conformant = false;
        if (uriBefore) {
            const gateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY_URL ?? 'http://127.0.0.1:8080';
            const doc = await (await fetch(`${gateway}/ipfs/${uriBefore.slice('ipfs://'.length)}`)).json();
            const bound = ((doc.assemblyBindings ?? []) as Array<{ assemblySlug: string }>).map((b) => b.assemblySlug);
            conformant = bound.length === 2 && targetSlugs.every((s) => bound.includes(s));
        }
        const wizardRan = !uriBefore || !conformant;
        if (wizardRan) {
            await onboardViaWizard(page, targetSlugs);
        }

        // Chain baselines for the value legs + the commit event.
        const queryCommitted = () => publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted',
            args: { buyer: BUYER }, fromBlock: 0n,
        });
        const committedBefore = await queryCommitted();
        const [buyerBefore, sellerBefore, coreBefore] = await Promise.all([
            balanceOf(BUYER), balanceOf(SELLER.address), balanceOf(core),
        ]);

        // ── Buyer (anvil[0], the fixture's default) — cart → checkout ──
        // gotoAsWallet's init script PERSISTS across navigations, so after the
        // wizard every plain goto still mounts as the SELLER — the buyer flow
        // must register a later switch back to anvil[0] (attempt-1 of this
        // spec once placed the order as the seller wallet and the accept then
        // re-signed as "buyer", leaving sellerSig absent). On the skip path
        // there is no prior switch, and switch-to-default is the documented
        // no-op that leaves wagmi unconnected — plain goto is required there.
        if (wizardRan) {
            await gotoAsWallet(page, BUYER, `/s/view?seller=${SELLER.address}&e2e=devnet`);
        } else {
            await page.goto(`/s/view?seller=${SELLER.address}&e2e=devnet`, { waitUntil: 'domcontentloaded' });
        }
        await page.getByTestId('seller-detail-view').waitFor({ timeout: 30_000 });
        await waitForConnected(page);
        const addBtn = page.locator('[data-testid^="btn-add-"]').first();
        await addBtn.waitFor({ state: 'visible', timeout: 20_000 });
        await addBtn.click();
        await page.getByTestId('btn-review-order').click();
        await page.getByTestId('checkout-view').waitFor({ timeout: 20_000 });
        await waitForConnected(page);

        // ── THE SCENARIO: two bindings → the dropdown, never the static line ──
        const methodSelect = page.getByTestId('select-method');
        await methodSelect.waitFor({ state: 'visible', timeout: 30_000 });
        await expect(page.getByTestId('method-static'), 'two bindings must not render the single-option static line')
            .toHaveCount(0);
        await expect(page.getByTestId(`option-method-${singleOrderSlug}`)).toBeAttached();
        await expect(page.getByTestId(`option-method-${multiOrderSlug}`)).toBeAttached();

        // Place-order refuses until the buyer picks — the label tells the truth.
        const place = page.getByTestId('btn-place-order');
        await expect(place, 'no pick yet → checkout refuses to place')
            .toHaveText(/Select an option to order/, { timeout: 20_000 });

        // The buyer picks the single-order assembly; checkout becomes ready.
        await methodSelect.selectOption(singleOrderSlug!);
        await expect(place, 'pick made → "Place order"').toHaveText(/Place order/, { timeout: 20_000 });
        await place.click();

        // ── Sign through the shared gate, relay to the seller ──
        await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30_000 });
        await page.getByTestId('preview-confirm').click();
        await page.getByTestId('buyer-share-panel').waitFor({ timeout: 60_000 });
        await page.getByTestId('send-commitment-xmtp').click();
        await expect(page.getByTestId('commitment-xmtp-status')).toBeVisible({ timeout: 30_000 });

        // ── Seller (anvil[14]) → /orders "Your turn" → accept → commit ──
        await gotoAsWallet(page, SELLER.address, '/orders?e2e=devnet');
        await page.getByTestId('orders-list').waitFor({ timeout: 30_000 });
        await waitForConnected(page);
        await page.getByTestId('order-your-turn-card').first().waitFor({ state: 'visible', timeout: 30_000 });
        await page.getByTestId('btn-accept-order').first().click();
        await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30_000 });
        await page.getByTestId('preview-confirm').click();

        // ── On-chain truth: exactly one NEW OrderCommitted for the buyer ──
        await expect.poll(async () => (await queryCommitted()).length, {
            timeout: 60_000, message: 'a new OrderCommitted lands on-chain for the buyer',
        }).toBe(committedBefore.length + 1);
        const committedAfter = await queryCommitted();
        const event = committedAfter[committedAfter.length - 1];
        expect(event.args.seller?.toLowerCase(), 'committed against the two-binding seller')
            .toBe(SELLER.address.toLowerCase());
        const receipt = await publicClient.getTransactionReceipt({ hash: event.transactionHash });
        expect(receipt.status, 'the commit transaction succeeded').toBe('success');
        test.info().annotations.push({
            type: 'OrderCommitted',
            description: `order=${event.args.orderHash} payment=${event.args.payment} cumulativeValue=${event.args.cumulativeValue} tx=${receipt.transactionHash} block=${receipt.blockNumber} gasUsed=${receipt.gasUsed}`,
        });

        // ── Value legs (the real test): buyer↓ buyerBond, seller↓ sellerBond,
        //    FigaroCore escrow↑ both. Exact deltas — gas is ETH, so the
        //    payment-token deltas are the bonds only. ──
        const { buyerBond, sellerBond } = calculateBonds(event.args.cumulativeValue!, event.args.payment!);
        const [buyerAfter, sellerAfter, coreAfter] = await Promise.all([
            balanceOf(BUYER), balanceOf(SELLER.address), balanceOf(core),
        ]);
        expect(buyerBefore - buyerAfter, 'buyer balance decreased by the buyer bond').toBe(buyerBond);
        expect(sellerBefore - sellerAfter, 'seller balance decreased by the seller bond').toBe(sellerBond);
        expect(coreAfter - coreBefore, 'FigaroCore escrow increased by both bonds').toBe(buyerBond + sellerBond);
    });
});
