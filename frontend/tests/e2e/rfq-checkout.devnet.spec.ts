/**
 * rfq-checkout.devnet.spec.ts — THE RFQ LEG AT CHECKOUT: the candidates author
 * the price, end to end, UI on every wallet.
 *
 * The SAME delivery assembly and cast as dispatch-race — the merchant binds
 * with no courier designation — resolved by REQUEST FOR QUOTES instead of the
 * posted-price race: the buyer names a CEILING, every priceable candidate
 * receives an unsigned draft priced AT that ceiling with the priced fields
 * derived from the built agreement (spec-routed, no clause named), and each
 * courier names their OWN price on their /sign page. The counter-draft is
 * verified by RECONSTRUCTION (the buyer's own draft re-priced at the quote
 * must reproduce it hash-for-hash), the cheapest quote wins, and the commit
 * lands at the QUOTED figure — not the ceiling, not the posted price.
 *
 * Posted catalogue prices (2 and 3 MOCK) serve ONLY as the candidate filter
 * here; the couriers quote 2.5 and 4 — the winner's committed payment is 2.5,
 * proving the quote, not the catalogue, set the figure. The losing quoter
 * nets exactly zero.
 *
 * Cast: buyer anvil[14] · merchant anvil[6] (Aurora) · couriers anvil[10]/[11]
 * (re-seeded by dispatch-race's idempotent seeder — shared shape, same cast).
 *
 * No evmSnapshot/evmRevert — devnet is a mainnet rehearsal.
 * Requires Anvil + ./scripts/deploy-local.sh + populate-test-data + Kubo + :3100.
 */
import { test, expect, gotoAsWallet, newWalletPage } from './devnet-multi-test';
import { createPublicClient, createWalletClient, defineChain, http, parseAbi, parseUnits, type Hex } from 'viem';
import { privateKeyToAccount, mnemonicToAccount } from 'viem/accounts';
import {
    confirmAgreementPreviews,
    DELIVERY_DEVICE,
    ensureDeliveryAssembly,
    fillDeliveryCheckout,
    pinJSONToIPFS,
    readLocalDeploymentConfig,
    seedRegisteredMember,
    memberProfileBindings,
    waitForConnected,
} from './devnet-helpers';
import { ANVIL_ACCOUNTS, ANVIL_KEYS } from '../anvilAccounts';
import { CORE_ABI } from '@/lib/kernel/contracts';
import { calculateBonds } from '@figaro-protocol/sdk';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});
const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';
const ERC20_ABI = parseAbi([
    'function balanceOf(address) view returns (uint256)',
    'function mint(address to, uint256 amount)',
]);

const BUYER = ANVIL_ACCOUNTS[14] as Hex;
const MERCHANT = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 6 }).address as Hex;
const COURIER_CHEAP = privateKeyToAccount(ANVIL_KEYS[27]).address as Hex; // will QUOTE 2.5
const COURIER_DEAR = privateKeyToAccount(ANVIL_KEYS[28]).address as Hex;  // will QUOTE 4
const CEILING = '5';
const CHEAP_QUOTE = '2.5';
const DEAR_QUOTE = '4';

test.describe('RFQ AT CHECKOUT — the candidates author the price (devnet)', () => {
    test.setTimeout(480_000);

    test('ceiling → two quotes on /sign → reconstruction-verified cheapest commits at the QUOTE → loser nets zero', async ({ page }) => {
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });

        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const token = config.tokenAddress as Hex;
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const balanceOf = (who: Hex) =>
            publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;

        await page.context().grantPermissions(['geolocation']);
        await page.context().setGeolocation({ latitude: DELIVERY_DEVICE.lat, longitude: DELIVERY_DEVICE.lon });

        // ── GATES shared with dispatch-race (all idempotent): the assembly,
        //    Aurora's undesignated binding, the two couriers, funding. ──
        const deliverySlug = await ensureDeliveryAssembly(page);
        if (!(await memberProfileBindings(MERCHANT)).some((b) => b.assemblySlug === deliverySlug)) {
            await gotoAsWallet(page, MERCHANT, '/members/edit/assemblies?e2e=devnet');
            const row = page.getByTestId(`seller-assembly-row-${deliverySlug}`);
            await row.waitFor({ state: 'visible', timeout: 30000 });
            await row.locator('input[type="checkbox"]').first().check();
            await page.getByRole('button', { name: 'Save changes' }).click();
            await expect.poll(async () =>
                (await memberProfileBindings(MERCHANT)).some((b) => b.assemblySlug === deliverySlug), {
                timeout: 60000, message: "the merchant's binding lands",
            }).toBe(true);
        }
        const seedCourier = async (walletKey: `0x${string}`, address: Hex, name: string, price: string) => {
            const { uri: catalogueURI } = await pinJSONToIPFS({
                subjectAddress: address,
                version: '1.0.0',
                unitSystem: 'metric' as const,
                items: [{
                    id: `race-delivery-${address.slice(2, 8).toLowerCase()}`,
                    name: 'Raced delivery',
                    description: `Posted delivery rate (${price} MOCK) — the candidate FILTER; RFQ prices by quote`,
                    price,
                    category: 'delivery',
                    image: '🚲',
                    available: true,
                }],
            });
            await seedRegisteredMember({
                walletKey,
                profile: {
                    name,
                    description: 'Courier seeded for the market-formation specs',
                    catalogueURI,
                    acceptedTokens: [{ address: token, symbol: 'MOCK', chainId: 31337 }],
                    defaultTokenAddress: token,
                    assemblyBindings: [{
                        bindingId: `race-binding-${address.slice(2, 8).toLowerCase()}`,
                        subjectAddress: address,
                        assemblySlug: deliverySlug,
                        counterpartyBindings: [],
                    }],
                },
            });
        };
        await seedCourier(ANVIL_KEYS[27], COURIER_CHEAP, 'Race Courier (cheap)', '2');
        await seedCourier(ANVIL_KEYS[28], COURIER_DEAR, 'Race Courier (dear)', '3');
        const minter = createWalletClient({
            account: privateKeyToAccount(ANVIL_KEYS[0]), chain: LOCAL_ANVIL, transport: http(RPC_URL),
        });
        for (const who of [BUYER, COURIER_CHEAP, COURIER_DEAR]) {
            const hash = await minter.writeContract({
                address: token, abi: ERC20_ABI, functionName: 'mint', args: [who, parseUnits('1000', 18)],
            });
            await publicClient.waitForTransactionReceipt({ hash });
        }

        const queryCommitted = () => publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: BUYER }, fromBlock: 0n,
        });
        const committedBefore = (await queryCommitted()).length;
        const [buyer0, merchant0, cheap0, dear0, core0] = await Promise.all([
            balanceOf(BUYER), balanceOf(MERCHANT), balanceOf(COURIER_CHEAP), balanceOf(COURIER_DEAR), balanceOf(core),
        ]);

        // ── CHECKOUT: cart → the unbound node → REQUEST QUOTES at a ceiling. ──
        await gotoAsWallet(page, BUYER, `/s/view?seller=${MERCHANT}&e2e=devnet`);
        await page.getByTestId('member-detail-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const addBtn = page.locator('[data-testid^="btn-add-"]').first();
        await addBtn.waitFor({ state: 'visible', timeout: 20000 });
        await addBtn.click();
        await page.getByTestId('btn-review-order').click();
        await page.getByTestId('checkout-view').waitFor({ timeout: 20000 });
        const methodSelect = page.getByTestId('select-method');
        if (await methodSelect.isVisible().catch(() => false)) {
            await methodSelect.selectOption(deliverySlug);
        }
        await expect(page.getByTestId('race-panel')).toBeVisible({ timeout: 30000 });
        await fillDeliveryCheckout(page);

        await page.getByTestId('quote-ceiling-input').fill(CEILING);
        await page.getByTestId('quote-start').click();

        // Drafts go to every priceable candidate at the CEILING; unreplied
        // rows show no figure (a ceiling is not a quote).
        const cheapRow = page.getByTestId(`race-candidate-${COURIER_CHEAP.toLowerCase()}`);
        const dearRow = page.getByTestId(`race-candidate-${COURIER_DEAR.toLowerCase()}`);
        await cheapRow.waitFor({ state: 'visible', timeout: 60000 });
        await dearRow.waitFor({ state: 'visible', timeout: 15000 });
        expect(BigInt((await cheapRow.getAttribute('data-payment'))!), 'drafts carry the ceiling before any quote')
            .toBe(parseUnits(CEILING, 18));

        // ── Each courier names THEIR price on their own /sign tab. ──
        const quoteAs = async (courier: Hex, quote: string, label: string) => {
            const tab = await newWalletPage(page.context());
            tab.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });
            await gotoAsWallet(tab, courier, '/sign?e2e=devnet');
            await waitForConnected(tab);
            await tab.getByTestId('agreement-review').waitFor({ state: 'visible', timeout: 60000 });
            const quoteBtn = tab.getByTestId('btn-quote-return');
            const approveBond = tab.getByRole('button', { name: /Authorize Payment/ });
            await expect(quoteBtn.or(approveBond), `${label}: authorize-or-quote renders`).toBeVisible({ timeout: 60000 });
            if (await approveBond.isVisible().catch(() => false)) {
                await approveBond.click();
            }
            // The ceiling is shown; the courier's figure is their own.
            await expect(tab.getByTestId('quote-ceiling')).toContainText('5', { timeout: 60000 });
            await tab.getByTestId('quote-price-input').fill(quote);
            await quoteBtn.click();
            await tab.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
            await tab.getByTestId('preview-confirm').click();
            await tab.getByTestId('sign-offer-returned').waitFor({ state: 'visible', timeout: 60000 });
            return tab;
        };
        const cheapTab = await quoteAs(COURIER_CHEAP, CHEAP_QUOTE, 'cheap courier');
        const dearTab = await quoteAs(COURIER_DEAR, DEAR_QUOTE, 'dear courier');

        // ── The quotes land (row payments become the QUOTED figures) and the
        //    buyer takes the best: 2.5 beats 4. ──
        await expect.poll(async () => cheapRow.getAttribute('data-replied'), {
            timeout: 60000, message: "the cheap courier's quote lands",
        }).toBe('true');
        await expect.poll(async () => dearRow.getAttribute('data-replied'), {
            timeout: 30000, message: "the dear courier's quote lands",
        }).toBe('true');
        expect(BigInt((await cheapRow.getAttribute('data-payment'))!), 'the row now carries the QUOTE, not the ceiling')
            .toBe(parseUnits(CHEAP_QUOTE, 18));
        expect(BigInt((await dearRow.getAttribute('data-payment'))!)).toBe(parseUnits(DEAR_QUOTE, 18));
        await page.getByTestId('race-select-now').click();
        const winner = page.getByTestId('race-winner');
        await winner.waitFor({ state: 'visible', timeout: 15000 });
        expect((await winner.getAttribute('data-seller'))!.toLowerCase(), 'the cheapest QUOTE wins')
            .toBe(COURIER_CHEAP.toLowerCase());

        // ── PLACE: the walk rebuilds at the quoted price and must reproduce
        //    the countersigned struct (digest-asserted); relay commit-ready. ──
        const place = page.getByTestId('btn-place-order');
        await expect(place).toHaveText(/Place order/, { timeout: 20000 });
        await place.click();
        await confirmAgreementPreviews(page, 2);
        await page.getByTestId('send-commitment-xmtp').click();
        await expect(page.getByTestId('commitment-xmtp-status')).toBeVisible({ timeout: 30000 });

        // ── Root accept (merchant), then the winner submits from /orders. ──
        await gotoAsWallet(page, MERCHANT, '/orders?e2e=devnet');
        await page.getByTestId('orders-list').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        await page.getByTestId('order-your-turn-card').first().waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId('btn-accept-order').first().click();
        await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId('preview-confirm').click();
        await expect.poll(async () => (await queryCommitted()).length, {
            timeout: 60000, message: 'the root commits',
        }).toBe(committedBefore + 1);
        const rootEvent = (await queryCommitted())[committedBefore];
        const processId = rootEvent.args.processId!;
        const rootBonds = calculateBonds(rootEvent.args.cumulativeValue!, rootEvent.args.payment!);

        await gotoAsWallet(cheapTab, COURIER_CHEAP, '/orders?e2e=devnet');
        await cheapTab.getByTestId('orders-list').waitFor({ timeout: 30000 });
        await waitForConnected(cheapTab);
        await cheapTab.getByTestId('order-ready-to-submit-card').first().waitFor({ state: 'visible', timeout: 60000 });
        await cheapTab.getByTestId('btn-submit-ready-order').first().click();
        await cheapTab.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
        await cheapTab.getByTestId('preview-confirm').click();
        await expect.poll(async () => (await queryCommitted()).length, {
            timeout: 90000, message: "the winner's submit lands the quoted order on-chain",
        }).toBe(committedBefore + 2);

        // THE scenario asserts: committed at the QUOTE — not the ceiling, not
        // the posted catalogue price — to the quoting winner, same process.
        const courierEvent = (await queryCommitted())[committedBefore + 1];
        expect(courierEvent.args.processId).toBe(processId);
        expect(courierEvent.args.seller?.toLowerCase(), 'the committed seller is the winning QUOTER')
            .toBe(COURIER_CHEAP.toLowerCase());
        expect(courierEvent.args.payment, 'committed at the QUOTED 2.5 — the candidate authored the price')
            .toBe(parseUnits(CHEAP_QUOTE, 18));
        const courierBonds = calculateBonds(courierEvent.args.cumulativeValue!, courierEvent.args.payment!);
        {
            const [b, cc, c] = await Promise.all([balanceOf(BUYER), balanceOf(COURIER_CHEAP), balanceOf(core)]);
            expect(buyer0 - b, 'buyer bonded 2× the quoted totals, not the ceiling')
                .toBe(rootBonds.buyerBond + courierBonds.buyerBond);
            expect(cheap0 - cc, 'the winner bonds against the quoted cumulative value').toBe(courierBonds.sellerBond);
            expect(c - core0).toBe(rootBonds.buyerBond + rootBonds.sellerBond + courierBonds.buyerBond + courierBonds.sellerBond);
        }

        // ── RESOLVE + settlement: winner earns the quote; the losing quoter
        //    is bit-identically untouched. ──
        const resolvedBefore = (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'ProcessResolved', args: { buyer: BUYER }, fromBlock: 0n,
        })).length;
        await gotoAsWallet(page, BUYER, `/orders/view?process=${processId}&e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const resolveBtn = page.getByTestId('capability-execute-resolve-process');
        await expect(resolveBtn).toBeEnabled({ timeout: 30000 });
        await resolveBtn.click();
        await expect.poll(async () => (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'ProcessResolved', args: { buyer: BUYER }, fromBlock: 0n,
        })).length, { timeout: 60000, message: 'ProcessResolved lands' }).toBe(resolvedBefore + 1);
        const [buyerF, merchantF, cheapF, dearF, coreF] = await Promise.all([
            balanceOf(BUYER), balanceOf(MERCHANT), balanceOf(COURIER_CHEAP), balanceOf(COURIER_DEAR), balanceOf(core),
        ]);
        expect(buyer0 - buyerF, 'buyer net paid meal + the QUOTED delivery')
            .toBe(rootEvent.args.payment! + courierEvent.args.payment!);
        expect(merchantF - merchant0).toBe(rootEvent.args.payment!);
        expect(cheapF - cheap0, 'the winner net earned exactly their quote').toBe(courierEvent.args.payment!);
        expect(dearF - dear0, "the losing quoter's balance is UNTOUCHED — quoting costs nothing").toBe(0n);
        expect(coreF, 'escrow returned to baseline').toBe(core0);

        // ── AUDIT: a market-formed process is an ORDINARY process to the
        //    audit — the chain records only the winning pair, so the
        //    financials render one statement per seller (merchant + the
        //    quoting winner) plus the consolidation, exactly as any process.
        //    The losing quote left nothing to audit — by design. ──
        await page.goto(`/audit/view?process=${processId}&e2e=devnet`, { waitUntil: 'domcontentloaded' });
        await page.getByTestId('audit-page').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        await expect(page.getByTestId('financials-view'), 'the quoted process renders full financials').toBeVisible({ timeout: 30000 });
        await expect(
            page.locator('[data-testid="document-financial-statements-seller"]'),
            'one financial statement per seller — the merchant and the QUOTING winner',
        ).toHaveCount(2, { timeout: 30000 });
        await expect(page.getByTestId('document-financial-statements-process')).toBeVisible({ timeout: 30000 });

        await cheapTab.close();
        await dearTab.close();
    });
});
