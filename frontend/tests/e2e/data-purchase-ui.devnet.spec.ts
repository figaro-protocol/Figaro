/**
 * data-purchase-ui.devnet.spec.ts
 *
 * THE DATA MARKET, BOTH ENDS THROUGH THE UI (value legs). A member that both
 * flies aerial surveys and buys them monetizes the records those trades
 * co-produce, from BOTH postures, and it authors that offer the way any member
 * does — through the wizard, never a seeded document:
 *
 *   Sell through → binds the survey assembly (it sells surveys) and the
 *                  data-stream-subscription reference (how its data is
 *                  delivered), and offers the survey's flight-record data it
 *                  co-produces AS A SELLER.
 *   Buy through  → subscribes the survey assembly (it also buys surveys) and
 *                  offers the flight-record data it co-produces AS A BUYER.
 *   Catalog    → prices both offers as DATA-PRODUCT items, in one pass: the
 *                  step follows both assembly steps, so both offers are there
 *                  to price. The license terms are CATALOG-AUTHORED
 *                  (figaro-data-license declares checkout.catalogueFills, so
 *                  the fold — not the buyer's keyboard — carries
 *                  scope/access/redistribution into the agreement both sign).
 *
 * What the wizard published is then read OUT-OF-BAND (chain → IPFS), never
 * from the screen that claims to have written it.
 *
 * A data buyer then walks the ordinary UI end to end, once per posture:
 * /s/view (the records-offered section + the data-product badge) → cart →
 * checkout (the buyer picks the data-stream assembly; NO data-license fields
 * rendered; the folded scope is visible in the pre-sign preview) → sign +
 * relay → the data-selling member accepts on /orders → commit (bond deltas
 * asserted from chain) → the buyer resolves → net positions asserted from
 * chain. Depends on populate-test-data (clauses + reference assemblies
 * anchored).
 */
import type { Page } from '@playwright/test';
import { test, expect, gotoAsWallet, ANVIL_ACCOUNTS } from './devnet-multi-test';
import { createPublicClient, createWalletClient, http, parseAbi, parseEther, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { calculateBonds } from '@figaro-protocol/sdk';
import {
    discoverAnchoredAssemblies,
    latestMemberProfileURI,
    referenceAssemblySlug,
    readLocalDeploymentConfig,
    resolveIpfsURI,
    waitForConnected,
    LOCAL_ANVIL,
    RPC_URL,
} from './devnet-helpers';
import { ANVIL_KEYS } from '../anvilAccounts';
import { CORE_ABI } from '@/lib/kernel/contracts';

const ERC20_ABI = parseAbi(['function balanceOf(address) view returns (uint256)']);
// anvil[0] — the fixture's default buyer.
const DATA_BUYER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Hex;
// Dedicated wallet of the data-selling member — an index no other spec registers.
const DATA_SELLER = ANVIL_ACCOUNTS[32] as Hex;

// The member's own input data: its identity, and the two data products it
// prices. The license terms are the record owner's offer, written on the item
// and folded into the agreement at checkout.
const MEMBER = { name: 'Skyline Data', specialty: 'survey flights; survey records licensed onward', geohash: '9q8yyk8yu' } as const;
const RECORD_CLAUSE = 'figaro-geolocation';
const LICENSE_CLAUSE = 'figaro-data-license';
const LICENSE = {
    licenseScope: 'Aerial-survey flight records, rolling stream',
    purpose: 'Route analytics',
    access: 'stream',
    redistribution: 'prohibited',
} as const;
// The SELLER-posture copy of the same trades — the member also sells the
// records it co-produced as the surveys' SELLER, as a one-time snapshot.
const LICENSE_SELLER = {
    licenseScope: 'Aerial-survey archive, one-time snapshot',
    purpose: 'Archive study',
    access: 'snapshot',
    redistribution: 'prohibited',
} as const;
const PRODUCTS = [
    { posture: 'buyer', name: 'Flight records — live stream', price: '2', license: LICENSE,
      description: 'The survey flight records this wallet co-produced as a buyer, licensed onward as a stream.' },
    { posture: 'seller', name: 'Survey archive — snapshot', price: '3', license: LICENSE_SELLER,
      description: 'The survey records this wallet co-produced as a seller, licensed as a one-time snapshot.' },
] as const;

interface PublishedDataMember {
    bindings: string[];
    subscriptions: string[];
    offered: Array<{ compositionHash: string; clauseId: string; posture: string }>;
    items: Array<{ id: string; name: string; price: string; dataSold?: { compositionHash: string; clauseId: string; posture: string };
        clauseValues?: Record<string, Record<string, unknown>> }>;
}

/** The member's CURRENT published profile and catalog, read out-of-band:
 *  the latest registry event for the wallet → the pinned profile → the pinned
 *  catalog. Null when the wallet has published nothing. */
async function readPublishedDataMember(): Promise<PublishedDataMember | null> {
    const latest = await latestMemberProfileURI(DATA_SELLER);
    if (!latest) return null;
    const fetchPinned = async (uri: string) => (await fetch(resolveIpfsURI(uri))).json();
    const profile = await fetchPinned(latest);
    const catalog = profile.catalogURI ? await fetchPinned(profile.catalogURI) : { items: [] };
    return {
        bindings: ((profile.assemblyBindings ?? []) as Array<{ assemblySlug: string }>).map((b) => b.assemblySlug),
        subscriptions: ((profile.buyerAssemblies ?? []) as Array<{ compositionHash: string }>).map((s) => s.compositionHash),
        offered: ((profile.disclosurePolicy ?? []) as Array<{ compositionHash: string; clauseId: string; posture: string; offered: boolean }>)
            .filter((e) => e.offered),
        items: (catalog.items ?? []) as PublishedDataMember['items'],
    };
}

/** Whether a published profile is the one this spec's wizard walk writes:
 *  both assemblies bound, the survey subscribed, the flight-record data
 *  offered in both postures, and one priced data product per posture carrying
 *  its license terms. */
function isTheDataMember(p: PublishedDataMember | null, surveyHash: string, surveySlug: string, streamSlug: string): boolean {
    if (!p) return false;
    const offers = (posture: string) => p.offered.some((e) =>
        e.compositionHash === surveyHash && e.clauseId === RECORD_CLAUSE && e.posture === posture);
    const priced = (posture: string, scope: string) => p.items.some((i) =>
        i.dataSold?.compositionHash === surveyHash && i.dataSold.clauseId === RECORD_CLAUSE && i.dataSold.posture === posture
        && i.clauseValues?.[LICENSE_CLAUSE]?.licenseScope === scope);
    return p.bindings.length === 2 && p.bindings.includes(surveySlug) && p.bindings.includes(streamSlug)
        && p.subscriptions.includes(surveyHash)
        && offers('buyer') && offers('seller')
        && priced('buyer', LICENSE.licenseScope) && priced('seller', LICENSE_SELLER.licenseScope);
}

/** The member authors its whole offer through the wizard, as its own wallet. */
async function authorDataMemberThroughWizard(page: Page, surveyHash: string, surveySlug: string, streamSlug: string): Promise<void> {
    await gotoAsWallet(page, DATA_SELLER, '/members');
    await page.goto('/members/identity', { waitUntil: 'domcontentloaded' });

    // Identity
    await expect(page.locator('#profile-name')).toBeVisible({ timeout: 30000 });
    await page.locator('#profile-name').fill(MEMBER.name);
    await page.locator('#profile-specialty').fill(MEMBER.specialty);
    await page.locator('#profile-geohash').fill(MEMBER.geohash);
    // An update-mode walk hydrates the tokens the wallet already accepts; the
    // quick-add button is there only while MOCK is not yet in the set.
    const addMock = page.getByRole('button', { name: /\+ MOCK$/ });
    if (await addMock.isVisible().catch(() => false)) await addMock.click();
    await page.locator('input[name="defaultTokenAddress"]').first().check();
    await page.getByRole('button', { name: /^Next/ }).click();
    await expect(page).toHaveURL(/\/members\/assemblies/);

    // Sell through: bind EXACTLY the survey (the member sells surveys) and the
    // data-stream reference (how its data is delivered), then offer the data
    // the surveys co-produce as their seller.
    const sellRows = page.locator('[data-testid^="seller-assembly-row-"]');
    await sellRows.first().waitFor({ state: 'visible', timeout: 30000 });
    const checkedSell = page.locator('[data-testid^="seller-assembly-row-"] input[type="checkbox"]:checked');
    while ((await checkedSell.count()) > 0) await checkedSell.first().uncheck();
    for (const slug of [surveySlug, streamSlug]) {
        const row = page.getByTestId(`seller-assembly-row-${slug}`);
        await row.waitFor({ state: 'visible', timeout: 30000 });
        await row.locator('input[type="checkbox"]').first().check();
    }
    const sellerOffer = page.getByTestId(`disclosure-${surveySlug}-${RECORD_CLAUSE}-seller-offer`);
    await sellerOffer.waitFor({ state: 'visible', timeout: 30000 });
    if (!(await sellerOffer.isChecked())) await sellerOffer.check();
    await page.getByRole('button', { name: /^Next/ }).click();
    await expect(page).toHaveURL(/\/members\/buyer/);

    // Buy through: subscribe EXACTLY the survey (the member also buys them),
    // then offer the data those purchases co-produce as their buyer.
    const buyRows = page.locator('[data-testid^="buyer-assembly-row-"]');
    await buyRows.first().waitFor({ state: 'visible', timeout: 30000 });
    const checkedBuy = page.locator('[data-testid^="buyer-assembly-row-"] input[type="checkbox"]:checked');
    while ((await checkedBuy.count()) > 0) await checkedBuy.first().uncheck();
    await page.getByTestId(`buyer-assembly-row-${surveySlug}`).locator('input[type="checkbox"]').first().check();
    const buyerOffer = page.getByTestId(`disclosure-${surveySlug}-${RECORD_CLAUSE}-buyer-offer`);
    await buyerOffer.waitFor({ state: 'visible', timeout: 30000 });
    if (!(await buyerOffer.isChecked())) await buyerOffer.check();
    await page.getByRole('button', { name: /^Next/ }).click();
    await expect(page).toHaveURL(/\/members\/catalog/);

    // Catalog: one data product per posture. Both offers are already
    // declared, so each item's "Data for sale" names its offer here, in the
    // same pass; the license terms are authored on the item.
    const names = page.locator('[id^="item-"][id$="-name"]');
    await names.first().waitFor({ state: 'visible', timeout: 30000 });
    while ((await names.count()) < PRODUCTS.length) {
        await page.getByRole('button', { name: /\+ Add item/ }).click();
    }
    for (const [i, product] of PRODUCTS.entries()) {
        const prefix = ((await names.nth(i).getAttribute('id')) ?? '').replace(/-name$/, '');
        expect(prefix, 'the item row carries its id').toMatch(/^item-/);
        await page.locator(`[id="${prefix}-name"]`).fill(product.name);
        await page.locator(`[id="${prefix}-description"]`).fill(product.description);
        await page.locator(`[id="${prefix}-price"]`).fill(product.price);
        await page.locator(`[id="${prefix}-category"]`).fill('data');
        const dataSold = page.getByTestId(`${prefix}-data-sold`);
        await expect(dataSold, 'the offers declared on the two assembly steps are there to price').toBeVisible({ timeout: 30000 });
        await dataSold.selectOption(`${surveyHash}|${RECORD_CLAUSE}|${product.posture}`);
        const license = `${prefix}-clause-${LICENSE_CLAUSE}`;
        await page.getByTestId(`${license}-licenseScope`).fill(product.license.licenseScope);
        await page.getByTestId(`${license}-purpose`).fill(product.license.purpose);
        await page.getByTestId(`${license}-access-${product.license.access}`).check();
        await page.getByTestId(`${license}-redistribution-${product.license.redistribution}`).check();
    }
    await page.getByRole('button', { name: /^Next/ }).click();
    await expect(page).toHaveURL(/\/members\/agents/);
    await page.getByRole('button', { name: /^Next/ }).click();
    await expect(page).toHaveURL(/\/members\/endpoints/);
    await page.getByRole('button', { name: /^Next/ }).click();
    await page.waitForURL(/\/members\/review/, { timeout: 30000 });
    await page.getByTestId('review-confirm-publish').click();
    await expect(page.getByRole('heading', { name: /Registered\.|Profile updated/i })).toBeVisible({ timeout: 60000 });
}

/** The data-selling member, published as this spec needs it. A member
 *  registers once and persists: the wizard is walked only when the wallet's
 *  published profile is not already this one. Returns what the buyer's flow
 *  reads — the delivery assembly to pick and each product's item id — taken
 *  from the published catalog, never from the wizard's screen. */
async function ensureDataMember(page: Page): Promise<{ streamSlug: string; itemIds: Record<'buyer' | 'seller', string> }> {
    const anchored = await discoverAnchoredAssemblies();
    const surveySlug = referenceAssemblySlug('aerial-survey.json');
    const streamSlug = referenceAssemblySlug('data-stream-subscription.json');
    const survey = anchored.find((a) => a.slug === surveySlug);
    expect(survey, 'the aerial-survey reference is anchored — run populate-test-data').toBeTruthy();
    expect(anchored.some((a) => a.slug === streamSlug),
        'the data-stream-subscription reference is anchored — run populate-test-data').toBe(true);
    // The data sold: a clause of the survey assembly — its flight-record leaf.
    expect(
        survey!.agreements.some((o) => Object.keys(o.clauses ?? {}).includes(RECORD_CLAUSE)),
        'the survey composes the flight-record clause',
    ).toBe(true);
    const surveyHash = survey!.compositionHash;

    if (!isTheDataMember(await readPublishedDataMember(), surveyHash, surveySlug, streamSlug)) {
        await authorDataMemberThroughWizard(page, surveyHash, surveySlug, streamSlug);
    }

    // ── What the wizard published, read OUT-OF-BAND from chain → IPFS ──
    await expect.poll(
        async () => isTheDataMember(await readPublishedDataMember(), surveyHash, surveySlug, streamSlug),
        { timeout: 30000, message: 'the published profile binds both assemblies, subscribes the survey, offers the data in both postures, and prices one data product per posture with its license terms' },
    ).toBe(true);
    const published = (await readPublishedDataMember())!;
    const idOf = (posture: 'buyer' | 'seller') => published.items.find((i) =>
        i.dataSold?.compositionHash === surveyHash && i.dataSold.clauseId === RECORD_CLAUSE && i.dataSold.posture === posture)!.id;
    return { streamSlug, itemIds: { buyer: idOf('buyer'), seller: idOf('seller') } };
}

test.describe('Buyer-side data sale through the UI (devnet)', () => {
    test.setTimeout(600_000);

    test('both market sides sell: buyer-posture and seller-posture data are discovered, ordered, committed, and resolved', async ({ page }) => {
        // Resolve raises a native window.confirm — auto-accept it.
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });
        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const token = config.tokenAddress as Hex;
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const balanceOf = (who: Hex) =>
            publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;

        const { streamSlug, itemIds } = await ensureDataMember(page);
        const recordClauseId = RECORD_CLAUSE;

        // The data seller's bond funding (dedicated index past the mint range).
        {
            const minter = createWalletClient({ account: privateKeyToAccount(ANVIL_KEYS[0]), chain: LOCAL_ANVIL, transport: http(RPC_URL) });
            const h = await minter.writeContract({
                address: token, abi: parseAbi(['function mint(address to, uint256 amount) external']),
                functionName: 'mint', args: [DATA_SELLER, parseEther('1000')],
            });
            await publicClient.waitForTransactionReceipt({ hash: h });
        }

        const queryCommitted = () => publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted',
            args: { buyer: DATA_BUYER }, fromBlock: 0n,
        });
        const committedBefore = await queryCommitted();
        const [buyerBefore, sellerBefore, coreBefore] = await Promise.all([
            balanceOf(DATA_BUYER), balanceOf(DATA_SELLER), balanceOf(core),
        ]);

        // ── DISCOVERY: the records-offered section and the data-product badge ──
        await gotoAsWallet(page, DATA_BUYER, `/s/view?seller=${DATA_SELLER}&e2e=devnet`);
        await page.getByTestId('member-detail-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        await expect(
            page.getByTestId('seller-disclosure-policy'),
            'the data-for-sale section renders the declared offers',
        ).toBeVisible({ timeout: 30000 });
        await expect(
            page.getByTestId(`disclosure-data-${recordClauseId}-buyer`),
            'the buyer-side flight-record data is listed',
        ).toBeVisible();
        await expect(
            page.getByTestId(`catalog-item-data-sold-${itemIds.buyer}`),
            'the priced item carries its data-product badge',
        ).toBeVisible();

        // ── CART → CHECKOUT ──
        await page.getByTestId(`btn-add-${itemIds.buyer}`).click();
        await page.getByTestId('btn-review-order').click();
        await page.getByTestId('checkout-view').waitFor({ timeout: 20000 });
        // The member binds two assemblies, so the buyer picks: the data is
        // delivered under the data-stream assembly.
        await page.getByTestId('select-method').selectOption(streamSlug);

        // The license terms are CATALOG-AUTHORED: checkout renders NO
        // data-license field for the buyer to type into.
        await expect(
            page.locator('[data-testid^="checkout-field-"][data-testid*="figaro-data-license"]'),
            'license terms are folded from the item, never typed by the buyer',
        ).toHaveCount(0);

        // The buyer's transaction particulars: a virtual trade, an access
        // window, encrypted delivery of the access credential.
        await page.locator('[data-testid^="checkout-field-"][data-testid$="-figaro-modalities-modality-virtual"]').first().check();
        await page.locator('[data-testid^="checkout-field-"][data-testid$="-figaro-schedule-windowStart"]').first().fill('2026-09-01T09:00');
        await page.locator('[data-testid^="checkout-field-"][data-testid$="-figaro-schedule-windowEnd"]').first().fill('2026-10-01T09:00');
        await page.locator('[data-testid^="checkout-field-"][data-testid$="-figaro-content-handoff-contentHandoff-encrypted-transfer"]').first().check();

        const place = page.getByTestId('btn-place-order');
        await place.waitFor({ state: 'visible', timeout: 20000 });
        await expect(place, 'buyer connected + order ready → "Place order"')
            .toHaveText(/Place order/, { timeout: 20000 });
        await place.click();

        // The pre-sign preview shows the FOLDED license scope — the agreement
        // the buyer signs carries the record owner's terms.
        const preview = page.getByTestId('agreement-preview-modal');
        await preview.waitFor({ state: 'visible', timeout: 30000 });
        await expect(preview, 'the folded license scope is in the signed agreement')
            .toContainText(LICENSE.licenseScope);
        await page.getByTestId('preview-confirm').click();
        await page.getByTestId('buyer-share-panel').waitFor({ timeout: 60000 });
        await page.getByTestId('send-commitment-xmtp').click();
        await expect(page.getByTestId('commitment-xmtp-status')).toBeVisible({ timeout: 30000 });

        // ── THE DATA SELLER ACCEPTS on /orders ──
        await gotoAsWallet(page, DATA_SELLER, '/orders?e2e=devnet');
        await page.getByTestId('orders-list').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        await page.getByTestId('btn-accept-order').first().click();
        const sellerPreview = page.getByTestId('agreement-preview-modal');
        await sellerPreview.waitFor({ state: 'visible', timeout: 30000 });
        await expect(sellerPreview, 'the seller counter-signs the same folded terms')
            .toContainText(LICENSE.licenseScope);
        await page.getByTestId('preview-confirm').click();

        // ── CHAIN TRUTH: the commit and its bond deltas ──
        await expect.poll(async () => (await queryCommitted()).length, {
            timeout: 60000, message: 'a new OrderCommitted lands on-chain for the data buyer',
        }).toBe(committedBefore.length + 1);
        const committedAfter = await queryCommitted();
        const event = committedAfter[committedAfter.length - 1];
        expect(event.args.seller?.toLowerCase(), 'committed against the data seller')
            .toBe(DATA_SELLER.toLowerCase());
        const { buyerBond, sellerBond } = calculateBonds(event.args.cumulativeValue!, event.args.payment!);
        const [buyerMid, sellerMid, coreMid] = await Promise.all([
            balanceOf(DATA_BUYER), balanceOf(DATA_SELLER), balanceOf(core),
        ]);
        expect(buyerBefore - buyerMid, 'buyer locked the buyer bond').toBe(buyerBond);
        expect(sellerBefore - sellerMid, 'data seller locked the seller bond').toBe(sellerBond);
        expect(coreMid - coreBefore, 'escrow holds both bonds').toBe(buyerBond + sellerBond);

        // ── THE BUYER RESOLVES; net positions are the data sale ──
        const processId = event.args.processId!;
        const resolvedBefore = (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'ProcessResolved', args: { buyer: DATA_BUYER }, fromBlock: 0n,
        })).length;
        await gotoAsWallet(page, DATA_BUYER, `/orders/view?process=${processId}&e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const resolveBtn = page.getByTestId('capability-execute-resolve-process');
        await resolveBtn.waitFor({ state: 'visible', timeout: 30000 });
        await expect(resolveBtn).toBeEnabled({ timeout: 30000 });
        await resolveBtn.click();
        await expect.poll(async () => (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'ProcessResolved', args: { buyer: DATA_BUYER }, fromBlock: 0n,
        })).length, { timeout: 60000, message: 'ProcessResolved lands on-chain' }).toBe(resolvedBefore + 1);

        const payment = event.args.payment!;
        const [buyerFinal, sellerFinal, coreFinal] = await Promise.all([
            balanceOf(DATA_BUYER), balanceOf(DATA_SELLER), balanceOf(core),
        ]);
        expect(buyerBefore - buyerFinal, 'buyer net paid exactly the record price').toBe(payment);
        expect(sellerFinal - sellerBefore, 'the record owner net earned exactly the record price').toBe(payment);
        expect(coreFinal, 'escrow returned to baseline').toBe(coreBefore);

        // ═══ LEG 2 — the SELLER-posture copy through the SAME UI: both market
        // sides sell. Fresh balance baselines; the cart still carries leg 1's
        // item (checkout does not clear it), so remove it first. ═══
        await gotoAsWallet(page, DATA_BUYER, `/s/view?seller=${DATA_SELLER}&e2e=devnet`);
        await page.getByTestId('member-detail-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        await expect(
            page.getByTestId(`disclosure-data-${recordClauseId}-seller`),
            'the seller-side data offer is listed',
        ).toBeVisible({ timeout: 30000 });
        await expect(
            page.getByTestId(`catalog-item-data-sold-${itemIds.seller}`),
            'the seller-posture item carries its data marking',
        ).toBeVisible();
        const removeLeg1 = page.getByRole('button', { name: 'Remove one Flight records — live stream' });
        if (await removeLeg1.isVisible().catch(() => false)) {
            await removeLeg1.click();
        }
        await page.getByTestId(`btn-add-${itemIds.seller}`).click();
        await page.getByTestId('btn-review-order').click();
        await page.getByTestId('checkout-view').waitFor({ timeout: 20000 });
        // The member binds two assemblies, so the buyer picks: the data is
        // delivered under the data-stream assembly.
        await page.getByTestId('select-method').selectOption(streamSlug);
        await expect(
            page.locator('[data-testid^="checkout-field-"][data-testid*="figaro-data-license"]'),
            'seller-posture license terms are folded from the item too',
        ).toHaveCount(0);
        await page.locator('[data-testid^="checkout-field-"][data-testid$="-figaro-modalities-modality-virtual"]').first().check();
        await page.locator('[data-testid^="checkout-field-"][data-testid$="-figaro-schedule-windowStart"]').first().fill('2026-09-01T09:00');
        await page.locator('[data-testid^="checkout-field-"][data-testid$="-figaro-schedule-windowEnd"]').first().fill('2026-10-01T09:00');
        await page.locator('[data-testid^="checkout-field-"][data-testid$="-figaro-content-handoff-contentHandoff-encrypted-transfer"]').first().check();
        const place2 = page.getByTestId('btn-place-order');
        await expect(place2).toHaveText(/Place order/, { timeout: 20000 });
        await place2.click();
        const preview2 = page.getByTestId('agreement-preview-modal');
        await preview2.waitFor({ state: 'visible', timeout: 30000 });
        await expect(preview2, 'the seller-posture folded scope is in the agreement')
            .toContainText(LICENSE_SELLER.licenseScope);
        await page.getByTestId('preview-confirm').click();
        await page.getByTestId('buyer-share-panel').waitFor({ timeout: 60000 });
        await page.getByTestId('send-commitment-xmtp').click();
        await expect(page.getByTestId('commitment-xmtp-status')).toBeVisible({ timeout: 30000 });

        await gotoAsWallet(page, DATA_SELLER, '/orders?e2e=devnet');
        await page.getByTestId('orders-list').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        await page.getByTestId('btn-accept-order').first().click();
        const sellerPreview2 = page.getByTestId('agreement-preview-modal');
        await sellerPreview2.waitFor({ state: 'visible', timeout: 30000 });
        await expect(sellerPreview2).toContainText(LICENSE_SELLER.licenseScope);
        await page.getByTestId('preview-confirm').click();

        await expect.poll(async () => (await queryCommitted()).length, {
            timeout: 60000, message: 'the second OrderCommitted lands on-chain',
        }).toBe(committedBefore.length + 2);
        const afterLeg2 = await queryCommitted();
        const event2 = afterLeg2[afterLeg2.length - 1];
        expect(event2.args.seller?.toLowerCase()).toBe(DATA_SELLER.toLowerCase());
        const processId2 = event2.args.processId!;
        const resolved2Before = (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'ProcessResolved', args: { buyer: DATA_BUYER }, fromBlock: 0n,
        })).length;
        await gotoAsWallet(page, DATA_BUYER, `/orders/view?process=${processId2}&e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const resolveBtn2 = page.getByTestId('capability-execute-resolve-process');
        await resolveBtn2.waitFor({ state: 'visible', timeout: 30000 });
        await expect(resolveBtn2).toBeEnabled({ timeout: 30000 });
        await resolveBtn2.click();
        await expect.poll(async () => (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'ProcessResolved', args: { buyer: DATA_BUYER }, fromBlock: 0n,
        })).length, { timeout: 60000, message: 'the second ProcessResolved lands on-chain' }).toBe(resolved2Before + 1);

        const payment2 = event2.args.payment!;
        const [buyerEnd, sellerEnd, coreEnd] = await Promise.all([
            balanceOf(DATA_BUYER), balanceOf(DATA_SELLER), balanceOf(core),
        ]);
        expect(buyerFinal - buyerEnd, 'buyer net paid exactly the seller-posture record price').toBe(payment2);
        expect(sellerEnd - sellerFinal, 'the record owner net earned it — both market sides sell').toBe(payment2);
        expect(coreEnd, 'escrow returned to baseline again').toBe(coreFinal);
    });
});
