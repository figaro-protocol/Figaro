/**
 * swap-funded-checkout.devnet.spec.ts
 *
 * THE PAYMENT TOKEN, end to end and UI on both ends. The buyer picks the
 * denomination from the seller's accepted array; the pick IS the process
 * denomination — the commitment records it, both 2× bonds and the payment
 * move in it, and the seller is paid in it. The seller (the wizard seller,
 * anvil[13]) prices its catalog in its default (MOCK) only. What every pass
 * asserts from the chain are the invariants: one process in one
 * denomination, the buyer's bond twice the payment, the seller's twice the
 * cumulative value, and the payment the amount both parties signed. How a
 * party comes to hold the denomination is its own act: the funding leg
 * through WitnessSwapAndCommitCoordinator is one way, and the venue's swap
 * leg it leaves is an edge between two denominations in the value-flow graph
 * (`projectValueFlow`, `@figaro-protocol/sdk/derive`), read from the chain.
 *
 *  1. THE PICK IS THE DEFAULT — the buyer pays in MOCK, holds it, nothing is
 *     translated: the committed payment is the listed price read from IPFS,
 *     the commit goes direct to FigaroCore, the bonds are 2× in MOCK.
 *  2. THE BUYER'S FUNDING LEG — the buyer picks MPMT and holds none; the
 *     checkout translates the listed price into MPMT, the buyer signs it and
 *     funds its bond from MOCK through the coordinator; the swap leg
 *     MOCK → MPMT is an edge in the value-flow graph.
 *  3. THE SELLER'S FUNDING LEG — the buyer pays in MPMT; the seller
 *     countersigns at /sign, reading the amount beside its listed price, and
 *     funds its bond from MOCK; the same edge appears.
 *  4. THE TRANSLATION — the buyer picks MPMT at a non-unit venue rate (3:7,
 *     restored after): the checkout shows the translation with its source,
 *     the buyer signs it, the seller countersigns at /sign beside its listed
 *     price, the chain carries that amount and 2× bonds in MPMT, resolution
 *     pays the seller in MPMT, and the MOCK catalog price on IPFS is
 *     untouched.
 *
 * Depends on populate-test-data and the devnet-authoring gate (the wizard
 * seller accepting both devnet tokens).
 */
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import { createWalletClient, http, parseAbi, parseUnits, type Hex, type TransactionReceipt } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
    calculateBonds,
    parseOrderCommittedLogs,
    parseOrderResolvedLogs,
    parseProcessResolvedLogs,
} from '@figaro-protocol/sdk';
import { projectResolutionGraph, projectValueFlow, readFundingLegs, type SwapLeg, type VenueEvent } from '@figaro-protocol/sdk/derive';
import {
    authorizeFundingToken,
    latestMemberProfileURI,
    localPublicClient,
    readLocalDeploymentConfig,
    resolveIpfsURI,
    LOCAL_ANVIL,
    RPC_URL,
} from './devnet-helpers';
import { formatToken } from '@/lib/shared/utils';
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

const VENUE_ABI = parseAbi([
    'function rateNumerator() view returns (uint256)',
    'function rateDenominator() view returns (uint256)',
    'function setRate(uint256 numerator, uint256 denominator)',
]);

const ERC20_ABI = parseAbi([
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
    'function balanceOf(address) view returns (uint256)',
    'function transfer(address, uint256) returns (bool)',
    'function mint(address, uint256)',
]);

// anvil[3] — this scenario's dedicated buyer (anvil[0] stays the fixture
// default for the plain specs).
const BUYER = ANVIL_ACCOUNTS[3] as Hex;
const BUYER_KEY = ANVIL_KEYS[3];
// anvil[13] — the wizard-registered seller, bound to the seed assembly.
const SELLER = '0x1cbd3b2770909d4e10f157cabc84c7264073c9ec' as Hex;
// anvil[4] — the drain sink (per-spec baselines make the extra balance inert).
const SINK = ANVIL_ACCOUNTS[4] as Hex;

test.describe('THE PAYMENT TOKEN — the pick is the denomination; the invariants hold in it (devnet)', () => {
    test.setTimeout(300_000);

    const config = readLocalDeploymentConfig();
    const core = config.figaroCore as Hex;
    const defaultToken = config.tokenAddress as Hex;      // MOCK — the seller's default, its catalog's only token
    const pickedToken = config.permitTokenAddress as Hex; // MPMT — the other accepted token
    const coordinator = config.witnessSwapAndCommitCoordinator as Hex;
    const venue = config.swapRouter as Hex;
    const publicClient = localPublicClient();
    const balanceOf = (token: Hex, who: Hex) =>
        publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;
    const walletFor = (key: Hex) => createWalletClient({
        account: privateKeyToAccount(key), chain: LOCAL_ANVIL, transport: http(RPC_URL),
    });

    /** Scenario pre-population (NOT the action under test): set the buyer's
     *  balance of `token` — drain to the sink, then mint back up to `floor`.
     *  Idempotent across runs. */
    async function setBuyerBalance(token: Hex, floor: bigint) {
        const held = await balanceOf(token, BUYER);
        const wallet = walletFor(BUYER_KEY);
        if (held > floor) {
            const hash = await wallet.writeContract({
                address: token, abi: ERC20_ABI, functionName: 'transfer', args: [SINK, held - floor],
            });
            await publicClient.waitForTransactionReceipt({ hash });
        } else if (held < floor) {
            const hash = await wallet.writeContract({
                address: token, abi: ERC20_ABI, functionName: 'mint', args: [BUYER, floor - held],
            });
            await publicClient.waitForTransactionReceipt({ hash });
        }
    }

    const queryCommitted = () => publicClient.getContractEvents({
        address: core, abi: CORE_ABI, eventName: 'OrderCommitted',
        args: { buyer: BUYER }, fromBlock: 0n,
    });
    type CommittedLog = Awaited<ReturnType<typeof queryCommitted>>[number];

    /** Scenario pre-population (NOT the action under test): the devnet
     *  venue's one linear rate (amountOut = amountIn·num/den). */
    async function setVenueRate(num: bigint, den: bigint) {
        const hash = await walletFor(BUYER_KEY).writeContract({
            address: venue, abi: VENUE_ABI, functionName: 'setRate', args: [num, den],
        });
        await publicClient.waitForTransactionReceipt({ hash });
    }

    /** The seller's listed price for one item, read out-of-band from its
     *  pinned catalog (chain events → IPFS): the decimal string, and the
     *  amount in the default token's own units. */
    async function pinnedCatalogPrice(itemId: string): Promise<{ price: string; amount: bigint }> {
        const profileURI = await latestMemberProfileURI(SELLER);
        expect(profileURI, 'the seller has a pinned profile').toBeTruthy();
        const profile = await (await fetch(resolveIpfsURI(profileURI!))).json() as { catalogURI?: string };
        expect(profile.catalogURI, 'the seller has a pinned catalog').toBeTruthy();
        const catalog = await (await fetch(resolveIpfsURI(profile.catalogURI!))).json() as {
            items?: Array<{ id: string; price: string }>;
        };
        const item = catalog.items?.find((i) => i.id === itemId);
        expect(item, `the pinned catalog lists ${itemId}`).toBeTruthy();
        const decimals = await publicClient.readContract({ address: defaultToken, abi: ERC20_ABI, functionName: 'decimals' });
        return { price: item!.price, amount: parseUnits(item!.price, decimals) };
    }

    /** Buyer leg: browse → cart → checkout → pick the payment token by its
     *  symbol. Leaves the page on the checkout with the pick applied; returns
     *  the catalog item id it put in the cart (quantity 1). */
    async function buyerPicksPayment(page: Page, symbol: 'MOCK' | 'MPMT'): Promise<string> {
        await gotoAsWallet(page, BUYER, `/s/view?seller=${SELLER}&e2e=devnet`);
        await page.getByTestId('member-detail-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const addBtn = page.locator('[data-testid^="btn-add-"]').first();
        await addBtn.waitFor({ state: 'visible', timeout: 20000 });
        const itemId = (await addBtn.getAttribute('data-testid'))!.slice('btn-add-'.length);
        await addBtn.click();
        await page.getByTestId('btn-review-order').click();
        await page.getByTestId('checkout-view').waitFor({ timeout: 20000 });
        await page.getByTestId('payment-token-picker').waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId(`payment-token-${symbol}`).check();
        return itemId;
    }

    /** The translation of the cart line's listed price into the pick: the
     *  venue quote shown, and the amount in the field the buyer signs. */
    async function readTranslation(page: Page, itemId: string): Promise<{ quote: string; signed: string }> {
        const key = `line:${itemId}`;
        await expect(page.getByTestId(`payment-translation-quote-${key}`), 'the venue quote of the listed price renders')
            .toBeVisible({ timeout: 30000 });
        const quote = (await page.getByTestId(`payment-translation-quote-${key}`).innerText()).trim();
        const signed = (await page.getByTestId(`payment-translation-amount-${key}`).inputValue()).trim();
        return { quote, signed };
    }

    /** Place the order and relay it over the channel. `expectSwap` asserts the
     *  confirm modal's funding-leg section (the Permit2 leg's maxInput) is
     *  surfaced before the approval; when false, that section is absent. */
    async function placeAndShare(page: Page, { expectSwap = false }: { expectSwap?: boolean } = {}) {
        const place = page.getByTestId('btn-place-order');
        await expect(place, 'buyer connected + order ready → "Place order"')
            .toHaveText(/Place order/, { timeout: 20000 });
        await place.click();
        await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
        if (expectSwap) {
            await expect(page.getByTestId('preview-swap'), 'the funding leg is surfaced in the confirm').toBeVisible();
            await expect(page.getByTestId('preview-swap-max-input'), 'the authorized maxInput is shown').not.toBeEmpty();
        } else {
            await expect(page.getByTestId('preview-swap'), 'no funding leg ⇒ no swap section').toHaveCount(0);
        }
        await page.getByTestId('preview-confirm').click();
        await page.getByTestId('buyer-share-panel').waitFor({ timeout: 60000 });
        await page.getByTestId('send-commitment-xmtp').click();
        await expect(page.getByTestId('commitment-xmtp-status')).toBeVisible({ timeout: 30000 });
    }

    /** The seller accepts on /orders (its countersignature, no funding leg). */
    async function sellerAcceptsOnOrders(page: Page) {
        await gotoAsWallet(page, SELLER, '/orders?e2e=devnet');
        await page.getByTestId('orders-list').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        await page.getByTestId('order-your-turn-card').first().waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId('btn-accept-order').first().click();
        await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId('preview-confirm').click();
    }

    /** The seller opens /sign; the channel delivers the buyer-signed payload.
     *  Asserts the listed price is read beside the amount it is asked to
     *  sign, then authorizes the bond when the allowance is short. */
    async function sellerReviewsAtSign(page: Page, itemId: string, listedPrice: string, signedAmount: string) {
        await gotoAsWallet(page, SELLER, '/sign?e2e=devnet');
        await waitForConnected(page);
        await page.getByTestId('agreement-review').waitFor({ state: 'visible', timeout: 60000 });
        await expect(page.getByTestId('sign-listed-prices'), 'the seller reads its listed price beside the amount')
            .toBeVisible({ timeout: 60000 });
        await expect(page.getByTestId(`sign-listed-price-listed-${itemId}`), 'its listed price, read from its catalog')
            .toHaveText(listedPrice);
        await expect(page.getByTestId(`sign-listed-price-signed-${itemId}`), 'the amount the buyer signed')
            .toHaveText(signedAmount);
        const counterSign = page.getByTestId('btn-counter-sign');
        const approveBond = page.getByRole('button', { name: /Authorize Payment/ });
        await expect(counterSign.or(approveBond), 'either the authorize step or the counter-sign renders')
            .toBeVisible({ timeout: 60000 });
        if (await approveBond.isVisible()) {
            await approveBond.click();
        }
        return counterSign;
    }

    /** The commit that landed for THIS buyer, its receipt, and its value
     *  figures. */
    async function committedEvent(before: number) {
        await expect.poll(async () => (await queryCommitted()).length, {
            timeout: 60000, message: 'a new OrderCommitted lands on-chain',
        }).toBe(before + 1);
        const events = await queryCommitted();
        const event = events[events.length - 1];
        const receipt = await publicClient.getTransactionReceipt({ hash: event.transactionHash });
        expect(receipt.status, 'the commit transaction succeeded').toBe('success');
        const payment = event.args.payment!;
        const bonds = calculateBonds(event.args.cumulativeValue!, payment);
        return { event, receipt, payment, ...bonds };
    }

    /** The value-flow graph read from the chain: FigaroCore's own events
     *  folded into the resolution graph, and the funding leg in one commit
     *  transaction read from its receipt by the SDK's `readFundingLegs` —
     *  `party` is the commitment's party whose bond the leg funded. */
    async function valueFlowWithLeg(receipt: TransactionReceipt, event: CommittedLog, party: Hex) {
        const [committed, resolved, processResolved] = await Promise.all([
            publicClient.getContractEvents({ address: core, abi: CORE_ABI, eventName: 'OrderCommitted', fromBlock: 0n }),
            publicClient.getContractEvents({ address: core, abi: CORE_ABI, eventName: 'OrderResolved', fromBlock: 0n }),
            publicClient.getContractEvents({ address: core, abi: CORE_ABI, eventName: 'ProcessResolved', fromBlock: 0n }),
        ]);
        type SdkLogs = Parameters<typeof parseOrderCommittedLogs>[0];
        const resolution = projectResolutionGraph({
            orderCommitted: parseOrderCommittedLogs(committed as unknown as SdkLogs),
            orderResolved: parseOrderResolvedLogs(resolved as unknown as SdkLogs),
            processResolved: parseProcessResolvedLogs(processResolved as unknown as SdkLogs),
        });
        const legs = readFundingLegs(receipt.logs, {
            buyer: event.args.buyer!, seller: event.args.seller!, currency: event.args.currency!,
        }, coordinator);
        expect(legs, 'one funding leg in the commit transaction').toHaveLength(1);
        const [leg] = legs;
        expect(leg.venue.toLowerCase(), 'the venue is the router the coordinator holds').toBe(venue.toLowerCase());
        expect(leg.payload.party.toLowerCase(), 'the leg funded the party that swapped').toBe(party.toLowerCase());
        expect(leg.transactionHash).toBe(receipt.transactionHash);
        return { graph: projectValueFlow(resolution, legs, []), leg: leg as VenueEvent<SwapLeg> };
    }

    /** The swap leg is an edge between two denominations in the graph, and
     *  the denomination it yields is a node carrying this process. */
    function expectLegEdge(graph: ReturnType<typeof projectValueFlow>, leg: VenueEvent<SwapLeg>) {
        const edge = graph.edges.find((e) => e.basis === 'composition-derived');
        expect(edge, 'the swap leg is a composition-derived edge').toBeTruthy();
        if (edge?.basis !== 'composition-derived') return;
        expect(edge.tokenIn.toLowerCase(), 'the edge leaves the funding token').toBe(defaultToken.toLowerCase());
        expect(edge.tokenOut.toLowerCase(), 'the edge enters the denomination').toBe(pickedToken.toLowerCase());
        expect(edge.volumeIn).toBe(leg.payload.amountIn);
        expect(edge.volumeOut).toBe(leg.payload.amountOut);
        const denominations = graph.nodes.map((n) => n.token.toLowerCase());
        expect(denominations, 'both ends of the edge are nodes').toEqual(
            expect.arrayContaining([defaultToken.toLowerCase(), pickedToken.toLowerCase()]),
        );
        expect(graph.nodes.find((n) => n.token.toLowerCase() === pickedToken.toLowerCase())?.processCount,
            'the denomination carries processes on the chain').toBeGreaterThan(0);
    }

    async function resolveAsBuyer(page: Page, processId: Hex) {
        const resolvedBefore = (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'ProcessResolved', args: { buyer: BUYER }, fromBlock: 0n,
        })).length;
        await gotoAsWallet(page, BUYER, `/orders/view?process=${processId}&e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const resolveBtn = page.getByTestId('capability-execute-resolve-process');
        await resolveBtn.waitFor({ state: 'visible', timeout: 30000 });
        await expect(resolveBtn).toBeEnabled({ timeout: 30000 });
        await resolveBtn.click();
        await expect.poll(async () => (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'ProcessResolved', args: { buyer: BUYER }, fromBlock: 0n,
        })).length, { timeout: 60000, message: 'ProcessResolved lands on-chain' }).toBe(resolvedBefore + 1);
    }

    test('the pick is the default — nothing is translated; the payment is the listed price and the bonds are 2× in it', async ({ page }) => {
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });
        await setBuyerBalance(defaultToken, 1_000n * 10n ** 18n);
        const committedBefore = (await queryCommitted()).length;
        const [buyerBefore, sellerBefore, coreBefore] = await Promise.all([
            balanceOf(defaultToken, BUYER), balanceOf(defaultToken, SELLER), balanceOf(defaultToken, core),
        ]);

        const itemId = await buyerPicksPayment(page, 'MOCK');
        await expect(page.getByTestId('payment-translation'), 'the pick is the listed token — nothing to translate')
            .toHaveCount(0);
        await placeAndShare(page);
        await sellerAcceptsOnOrders(page);

        const { event, receipt, payment, buyerBond, sellerBond } = await committedEvent(committedBefore);
        expect(receipt.to?.toLowerCase(), 'no funding leg → the commit goes direct to FigaroCore').toBe(core.toLowerCase());
        expect((event.args.currency as string).toLowerCase(), 'the denomination is the pick').toBe(defaultToken.toLowerCase());
        const listed = await pinnedCatalogPrice(itemId);
        expect(payment, 'the committed payment is the listed price, read from IPFS').toBe(listed.amount);
        expect(buyerBond, 'the buyer bonds twice the payment').toBe(2n * payment);
        expect(sellerBond, 'the seller bonds twice the cumulative value').toBe(2n * event.args.cumulativeValue!);

        const [buyerAfter, sellerAfter, coreAfter] = await Promise.all([
            balanceOf(defaultToken, BUYER), balanceOf(defaultToken, SELLER), balanceOf(defaultToken, core),
        ]);
        expect(buyerBefore - buyerAfter, 'the buyer locked its bond in the denomination').toBe(buyerBond);
        expect(sellerBefore - sellerAfter, 'the seller locked its bond in the denomination').toBe(sellerBond);
        expect(coreAfter - coreBefore, 'the Core holds both bonds in the denomination').toBe(buyerBond + sellerBond);
    });

    test('the buyer\'s funding leg — the order in MPMT, the bond funded from MOCK through the coordinator', async ({ page }) => {
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });
        await setBuyerBalance(pickedToken, 0n);
        await setBuyerBalance(defaultToken, 1_000n * 10n ** 18n);
        const committedBefore = (await queryCommitted()).length;
        const [buyerDefaultBefore, corePickedBefore] = await Promise.all([
            balanceOf(defaultToken, BUYER), balanceOf(pickedToken, core),
        ]);

        const itemId = await buyerPicksPayment(page, 'MPMT');
        const { signed } = await readTranslation(page, itemId);

        // The buyer holds no MPMT: its funding leg, from MOCK.
        await page.getByTestId('swap-funding-panel').waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId(`funding-token-option-${defaultToken.toLowerCase()}`).click();
        await authorizeFundingToken(page);
        await placeAndShare(page, { expectSwap: true });
        await sellerAcceptsOnOrders(page);

        const { event, receipt, payment, buyerBond, sellerBond } = await committedEvent(committedBefore);
        expect(receipt.to?.toLowerCase(), 'the funding leg routed through WitnessSwapAndCommitCoordinator')
            .toBe(coordinator.toLowerCase());
        // The invariants, in the denomination.
        expect((event.args.currency as string).toLowerCase(), 'the denomination is the pick').toBe(pickedToken.toLowerCase());
        expect(formatToken(payment, 18), 'the payment is the amount the buyer signed').toBe(signed);
        expect(buyerBond, 'the buyer bonds twice the payment').toBe(2n * payment);
        expect(sellerBond, 'the seller bonds twice the cumulative value').toBe(2n * event.args.cumulativeValue!);

        const [buyerDefaultAfter, buyerPickedAfter, corePickedAfter, coordPicked, coordDefault] = await Promise.all([
            balanceOf(defaultToken, BUYER), balanceOf(pickedToken, BUYER),
            balanceOf(pickedToken, core), balanceOf(pickedToken, coordinator), balanceOf(defaultToken, coordinator),
        ]);
        expect(buyerPickedAfter, 'the swap proceeds were exactly the bond the Core pulled').toBe(0n);
        expect(corePickedAfter - corePickedBefore, 'the Core holds both bonds in the denomination').toBe(buyerBond + sellerBond);
        expect(coordPicked, 'the coordinator retains no MPMT').toBe(0n);
        expect(coordDefault, 'the coordinator retains no MOCK').toBe(0n);

        // The swap leg, read from the chain, is an edge MOCK → MPMT.
        const { graph, leg } = await valueFlowWithLeg(receipt, event, BUYER);
        expect(leg.payload.amountOut, 'the leg yielded the buyer\'s bond').toBe(buyerBond);
        expect(leg.payload.amountIn, 'the leg spent what the buyer\'s MOCK balance lost')
            .toBe(buyerDefaultBefore - buyerDefaultAfter);
        expectLegEdge(graph, leg);
    });

    test('the seller\'s funding leg — the seller countersigns at /sign and funds its bond from MOCK', async ({ page }) => {
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });
        await setBuyerBalance(pickedToken, 1_000n * 10n ** 18n);
        const committedBefore = (await queryCommitted()).length;
        const [sellerDefaultBefore, sellerPickedBefore, corePickedBefore] = await Promise.all([
            balanceOf(defaultToken, SELLER), balanceOf(pickedToken, SELLER), balanceOf(pickedToken, core),
        ]);

        const itemId = await buyerPicksPayment(page, 'MPMT');
        const { signed } = await readTranslation(page, itemId);
        await placeAndShare(page);

        const listed = await pinnedCatalogPrice(itemId);
        const counterSign = await sellerReviewsAtSign(page, itemId, listed.price, signed);
        // The seller's funding leg: collapsed by default (the seller holds
        // MPMT and still bonds from MOCK); the toggle discloses the panel.
        await page.getByTestId('seller-funding-toggle').click();
        await page.getByTestId('swap-funding-panel').waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId(`funding-token-option-${defaultToken.toLowerCase()}`).click();
        await authorizeFundingToken(page);
        await expect(counterSign, 'the counter-sign waits for the funding authorization').toBeEnabled({ timeout: 60000 });
        await counterSign.click();
        await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
        await expect(page.getByTestId('preview-swap'), 'the funding leg is surfaced in the seller confirm').toBeVisible();
        await expect(page.getByTestId('preview-swap-max-input'), 'the authorized maxInput is shown').not.toBeEmpty();
        await page.getByTestId('preview-confirm').click();

        const { event, receipt, payment, buyerBond, sellerBond } = await committedEvent(committedBefore);
        expect(receipt.to?.toLowerCase(), 'the seller-funded accept routed through WitnessSwapAndCommitCoordinator')
            .toBe(coordinator.toLowerCase());
        expect((event.args.currency as string).toLowerCase(), 'the denomination is the pick').toBe(pickedToken.toLowerCase());
        expect(formatToken(payment, 18), 'the payment is the amount both parties signed').toBe(signed);
        expect(buyerBond, 'the buyer bonds twice the payment').toBe(2n * payment);
        expect(sellerBond, 'the seller bonds twice the cumulative value').toBe(2n * event.args.cumulativeValue!);

        const [sellerDefaultAfter, sellerPickedAfter, corePickedAfter] = await Promise.all([
            balanceOf(defaultToken, SELLER), balanceOf(pickedToken, SELLER), balanceOf(pickedToken, core),
        ]);
        expect(sellerPickedAfter, 'the seller\'s MPMT is untouched at commit').toBe(sellerPickedBefore);
        expect(corePickedAfter - corePickedBefore, 'the Core holds both bonds in the denomination').toBe(buyerBond + sellerBond);

        const { graph, leg } = await valueFlowWithLeg(receipt, event, SELLER);
        expect(leg.payload.amountOut, 'the leg yielded the seller\'s bond').toBe(sellerBond);
        expect(leg.payload.amountIn, 'the leg spent what the seller\'s MOCK balance lost')
            .toBe(sellerDefaultBefore - sellerDefaultAfter);
        expectLegEdge(graph, leg);
    });

    test('the translation — the buyer signs the listed price in MPMT at the venue quote; the seller countersigns beside its listed price', async ({ page }) => {
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });
        await setBuyerBalance(pickedToken, 1_000n * 10n ** 18n);
        const [rateNumBefore, rateDenBefore] = await Promise.all([
            publicClient.readContract({ address: venue, abi: VENUE_ABI, functionName: 'rateNumerator' }),
            publicClient.readContract({ address: venue, abi: VENUE_ABI, functionName: 'rateDenominator' }),
        ]);
        // A non-unit rate, so the translation is a real quote: 3 MOCK out
        // per 7 MPMT in.
        await setVenueRate(3n, 7n);
        try {
            const committedBefore = (await queryCommitted()).length;
            const [buyerBefore, sellerBefore, coreBefore] = await Promise.all([
                balanceOf(pickedToken, BUYER), balanceOf(pickedToken, SELLER), balanceOf(pickedToken, core),
            ]);

            const itemId = await buyerPicksPayment(page, 'MPMT');
            const listedBefore = await pinnedCatalogPrice(itemId);
            // The checkout shows the translation with its source: the listed
            // price in MOCK, the venue's quote in MPMT, and the field holding
            // the amount the buyer signs.
            const key = `line:${itemId}`;
            await expect(page.getByTestId(`payment-translation-listed-${key}`), 'the listed price, in the seller\'s token')
                .toHaveText(listedBefore.price);
            const { quote, signed } = await readTranslation(page, itemId);
            await expect(page.getByTestId(`payment-translation-source-${key}`), 'the quote names its venue')
                .toContainText('devnet-mock');
            expect(signed, 'the field holds the quote until the buyer changes it').toBe(quote);
            const expectedQuote = (listedBefore.amount * 7n + 3n - 1n) / 3n;
            expect(quote, 'the quote is the venue\'s exact-output input for the listed amount')
                .toBe(formatToken(expectedQuote, 18));
            await placeAndShare(page);

            const counterSign = await sellerReviewsAtSign(page, itemId, listedBefore.price, signed);
            await expect(counterSign).toBeEnabled({ timeout: 60000 });
            await counterSign.click();
            await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
            await expect(page.getByTestId('preview-swap'), 'no funding leg ⇒ no swap section').toHaveCount(0);
            await page.getByTestId('preview-confirm').click();

            const { event, receipt, payment, buyerBond, sellerBond } = await committedEvent(committedBefore);
            expect(receipt.to?.toLowerCase(), 'no funding leg → the commit goes direct to FigaroCore').toBe(core.toLowerCase());
            expect((event.args.currency as string).toLowerCase(), 'the denomination is the pick').toBe(pickedToken.toLowerCase());
            expect(payment, 'the chain carries the amount the buyer signed').toBe(expectedQuote);
            expect(buyerBond, 'the buyer bonds twice the payment').toBe(2n * payment);
            expect(sellerBond, 'the seller bonds twice the cumulative value').toBe(2n * event.args.cumulativeValue!);
            const [buyerAfter, sellerAfter, coreAfter] = await Promise.all([
                balanceOf(pickedToken, BUYER), balanceOf(pickedToken, SELLER), balanceOf(pickedToken, core),
            ]);
            expect(buyerBefore - buyerAfter, 'the buyer locked its bond in MPMT').toBe(buyerBond);
            expect(sellerBefore - sellerAfter, 'the seller locked its bond in MPMT').toBe(sellerBond);
            expect(coreAfter - coreBefore, 'the Core holds both bonds in MPMT').toBe(buyerBond + sellerBond);

            // The catalog price in the default is untouched on IPFS.
            const listedAfter = await pinnedCatalogPrice(itemId);
            expect(listedAfter, 'the listed price in MOCK is what it was').toEqual(listedBefore);

            // Resolution pays the seller in the pick.
            await resolveAsBuyer(page, event.args.processId!);
            const [buyerFinal, sellerFinal, coreFinal] = await Promise.all([
                balanceOf(pickedToken, BUYER), balanceOf(pickedToken, SELLER), balanceOf(pickedToken, core),
            ]);
            expect(sellerFinal - sellerBefore, 'the seller is paid the payment in MPMT').toBe(payment);
            expect(buyerBefore - buyerFinal, 'the buyer spent exactly the payment in MPMT').toBe(payment);
            expect(coreFinal, 'the Core returned to its baseline').toBe(coreBefore);
        } finally {
            await setVenueRate(rateNumBefore, rateDenBefore);
        }
    });
});
