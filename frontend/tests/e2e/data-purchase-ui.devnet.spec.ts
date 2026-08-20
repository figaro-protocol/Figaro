/**
 * data-purchase-ui.devnet.spec.ts
 *
 * THE BUYER-SIDE DATA SALE, THROUGH THE UI (value legs). A member who bought
 * aerial surveys monetizes the records it co-produced AS A BUYER: its profile
 * subscribes the survey assembly, offers the flight-record data
 * (disclosurePolicy, posture "buyer"), binds the data-stream-subscription
 * reference for delivery, and prices the class as a catalogue DATA-PRODUCT
 * item whose license terms are CATALOGUE-AUTHORED (figaro-data-license
 * declares checkout.catalogueFills, so the fold — not the buyer's keyboard —
 * carries scope/access/redistribution into the agreement both parties sign).
 *
 * A data buyer then walks the ordinary UI end to end: /s/view (the
 * records-offered section + the data-product badge) → cart → checkout (NO
 * data-license fields rendered; the folded scope is visible in the pre-sign
 * preview) → sign + relay → the data seller accepts on /orders → commit
 * (bond deltas asserted from chain) → the buyer resolves → net settlement
 * asserted from chain. Depends on populate-test-data (clauses + reference
 * assemblies anchored).
 */
import { test, expect, gotoAsWallet, ANVIL_ACCOUNTS } from './devnet-multi-test';
import { createPublicClient, createWalletClient, http, parseAbi, parseEther, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { calculateBonds } from '@figaro-protocol/sdk';
import {
    discoverAnchoredAssemblies,
    referenceAssemblySlug,
    pinJSONToIPFS,
    readLocalDeploymentConfig,
    seedRegisteredMember,
    waitForConnected,
    LOCAL_ANVIL,
    RPC_URL,
} from './devnet-helpers';
import { ANVIL_KEYS } from '../anvilAccounts';
import { CORE_ABI } from '@/lib/kernel/contracts';

const ERC20_ABI = parseAbi(['function balanceOf(address) view returns (uint256)']);
// anvil[0] — the fixture's default buyer.
const DATA_BUYER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Hex;
// Dedicated data-seller wallet — an index no other spec registers.
const DATA_SELLER = ANVIL_ACCOUNTS[32] as Hex;

// The catalogue-authored license terms — the record owner's offer, written
// on the item, folded into the agreement at checkout.
const LICENSE = {
    licenseScope: 'Aerial-survey flight records, rolling stream',
    purpose: 'Route analytics',
    access: 'stream',
    redistribution: 'prohibited',
} as const;
const DATA_ITEM_ID = 'flight-records-stream';
// The SELLER-posture copy of the same deals — the member also sells the
// records it co-produced as the surveys' SELLER, as a one-time snapshot.
const LICENSE_SELLER = {
    licenseScope: 'Aerial-survey archive, one-time snapshot',
    access: 'snapshot',
    redistribution: 'prohibited',
} as const;
const DATA_ITEM_SELLER = 'survey-archive-snapshot';

/** Seed (idempotently re-assert) the data seller: subscribed to the survey
 *  assembly it BUYS through, offering the flight-record data it co-produced
 *  as a buyer, bound to the data-stream-subscription reference to deliver,
 *  and pricing the class as a data-product catalogue item. */
async function ensureDataSeller(token: Hex): Promise<{ recordClauseId: string }> {
    const anchored = await discoverAnchoredAssemblies();
    const surveySlug = referenceAssemblySlug('aerial-survey.json');
    const streamSlug = referenceAssemblySlug('data-stream-subscription.json');
    const survey = anchored.find((a) => a.slug === surveySlug);
    expect(survey, 'the aerial-survey reference is anchored — run populate-test-data').toBeTruthy();
    expect(anchored.some((a) => a.slug === streamSlug),
        'the data-stream-subscription reference is anchored — run populate-test-data').toBe(true);

    // The data sold: a clause of the SUBSCRIBED assembly — the survey's
    // flight-record leaf — co-produced by this wallet as the survey's BUYER.
    const recordClauseId = 'figaro-geolocation';
    expect(
        survey!.agreements.some((o) => Object.keys(o.clauses ?? {}).includes(recordClauseId)),
        'the survey composes the flight-record clause',
    ).toBe(true);
    const dataSold = {
        compositionHash: survey!.compositionHash,
        clauseId: recordClauseId,
        posture: 'buyer' as const,
    };
    const dataSoldSeller = {
        compositionHash: survey!.compositionHash,
        clauseId: recordClauseId,
        posture: 'seller' as const,
    };

    const { uri: catalogueURI } = await pinJSONToIPFS({
        subjectAddress: DATA_SELLER,
        version: '1.0.0',
        unitSystem: 'metric' as const,
        items: [{
            id: DATA_ITEM_ID,
            name: 'Flight records — live stream',
            description: 'The survey flight records this wallet co-produced as a buyer, licensed onward as a stream.',
            price: '2',
            category: 'data',
            available: true,
            dataSold,
            clauseValues: { 'figaro-data-license': { ...LICENSE } },
        }, {
            id: DATA_ITEM_SELLER,
            name: 'Survey archive — snapshot',
            description: 'The survey records this wallet co-produced as a seller, licensed as a one-time snapshot.',
            price: '3',
            category: 'data',
            available: true,
            dataSold: dataSoldSeller,
            clauseValues: { 'figaro-data-license': { ...LICENSE_SELLER } },
        }],
    });
    await seedRegisteredMember({
        walletKey: ANVIL_KEYS[32] as Hex,
        profile: {
            name: 'Skyline Data',
            description: 'Data seller — seeded by data-purchase-ui.devnet.spec.ts',
            catalogueURI,
            acceptedTokens: [{ address: token, symbol: 'MOCK', chainId: 31337 }],
            defaultTokenAddress: token,
            assemblyBindings: [{
                bindingId: 'data-stream-delivery',
                subjectAddress: DATA_SELLER,
                assemblySlug: streamSlug,
                counterpartyBindings: [],
            }],
            buyerAssemblies: [{ compositionHash: survey!.compositionHash }],
            disclosurePolicy: [{ ...dataSold, offered: true }, { ...dataSoldSeller, offered: true }],
        },
    });
    return { recordClauseId };
}

test.describe('Buyer-side data sale through the UI (devnet)', () => {
    test.setTimeout(420_000);

    test('both market sides sell: buyer-posture and seller-posture data are discovered, ordered, committed, and settled', async ({ page }) => {
        // Resolve raises a native window.confirm — auto-accept it.
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });
        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const token = config.tokenAddress as Hex;
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const balanceOf = (who: Hex) =>
            publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;

        const { recordClauseId } = await ensureDataSeller(token);

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
        await page.goto(`/s/view?seller=${DATA_SELLER}&e2e=devnet`, { waitUntil: 'domcontentloaded' });
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
            page.getByTestId(`catalogue-item-data-sold-${DATA_ITEM_ID}`),
            'the priced item carries its data-product badge',
        ).toBeVisible();

        // ── CART → CHECKOUT ──
        await page.getByTestId(`btn-add-${DATA_ITEM_ID}`).click();
        await page.getByTestId('btn-review-order').click();
        await page.getByTestId('checkout-view').waitFor({ timeout: 20000 });

        // The license terms are CATALOGUE-AUTHORED: checkout renders NO
        // data-license field for the buyer to type into.
        await expect(
            page.locator('[data-testid^="checkout-field-"][data-testid*="figaro-data-license"]'),
            'license terms are folded from the item, never typed by the buyer',
        ).toHaveCount(0);

        // The buyer's transaction particulars: a virtual deal, an access
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

        // ── THE BUYER RESOLVES; net settlement is the data sale ──
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
        await page.goto(`/s/view?seller=${DATA_SELLER}&e2e=devnet`, { waitUntil: 'domcontentloaded' });
        await page.getByTestId('member-detail-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        await expect(
            page.getByTestId(`disclosure-data-${recordClauseId}-seller`),
            'the seller-side data offer is listed',
        ).toBeVisible({ timeout: 30000 });
        await expect(
            page.getByTestId(`catalogue-item-data-sold-${DATA_ITEM_SELLER}`),
            'the seller-posture item carries its data marking',
        ).toBeVisible();
        const removeLeg1 = page.getByRole('button', { name: 'Remove one Flight records — live stream' });
        if (await removeLeg1.isVisible().catch(() => false)) {
            await removeLeg1.click();
        }
        await page.getByTestId(`btn-add-${DATA_ITEM_SELLER}`).click();
        await page.getByTestId('btn-review-order').click();
        await page.getByTestId('checkout-view').waitFor({ timeout: 20000 });
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
