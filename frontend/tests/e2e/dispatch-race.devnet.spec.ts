/**
 * dispatch-race.devnet.spec.ts — MARKET FORMATION WITH ZERO CONTRACTS: the
 * countersign-first dispatch race, end to end, UI on every wallet.
 *
 * The SAME delivery assembly as buyer-assigned — the merchant binds it with
 * NO courier designation — resolved by the RACE instead of the manual picker:
 *
 *   seed     → two couriers (anvil[10]/[11], re-seeded through the canonical
 *              idempotent seeder) post DIFFERENT delivery prices (2 vs 3);
 *              MOCK minted to them + the buyer (permissionless devnet mint —
 *              MintTokens covers only anvil[0..9]).
 *   race     → the buyer's checkout drafts one exact struct per candidate —
 *              the candidate set is EVERY discovered catalogue that can price
 *              the node (the seeded price-1 sellers included!) — and relays
 *              them UNSIGNED. Both couriers counter-sign & return on THEIR
 *              own /sign pages (concurrent tabs, one per wallet); the cheaper
 *              courier wins even though cheaper-posted candidates exist,
 *              because THEY never countersigned: the cheapest AVAILABLE
 *              candidate wins — availability is the countersignature.
 *   place    → the buyer signs exactly one winner; the walk reproduces the
 *              drafted struct (fixed salts + deadline, digest-asserted) and
 *              relays it carrying BOTH signatures.
 *   accept   → merchant accepts the root (creates the process); the WINNER
 *              submits the commit-ready order from /orders' "Ready to
 *              submit" lane. Exact bond deltas after each commit.
 *   resolve  → one signature settles both; each seller nets +payment, the
 *              LOSING courier nets exactly ZERO — a losing countersignature
 *              costs nothing and never touches the chain.
 *
 * Cast (scenario labels only — the kernel sees ordinary wallets):
 *   buyer      anvil[14]  (deltas only — shared wallets never assume absolutes)
 *   merchant   anvil[6]   Aurora Café (seeded; undesignated binding)
 *   courier A  anvil[10]  re-seeded, delivery at 2 MOCK — the CHEAP courier
 *   courier B  anvil[11]  re-seeded, delivery at 3 MOCK — the EXPENSIVE one
 *
 * No evmSnapshot/evmRevert — devnet is a mainnet rehearsal; the gates are
 * idempotent and the run leaves its state on-chain for out-of-band checks.
 *
 * Requires Anvil + ./scripts/deploy-local.sh + populate-test-data + Kubo + :3100.
 */
import { test, expect, gotoAsWallet, newWalletPage } from './devnet-multi-test';
import { createPublicClient, createWalletClient, defineChain, http, parseAbi, parseUnits, type Hex } from 'viem';
import { privateKeyToAccount, mnemonicToAccount } from 'viem/accounts';
import {
    confirmAgreementPreviews,
    DELIVERY_CLAUSES,
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

const BUYER = ANVIL_ACCOUNTS[14] as Hex; // shared wallet — every assert is a delta
const MERCHANT = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 6 }).address as Hex; // Aurora Café

// The racing couriers — seeded sellers no spec references, re-seeded here
// with distinct posted prices (the canonical seeder is idempotent; other
// specs DISCOVER sellers, never assume their catalogues).
const COURIER_CHEAP_KEY = ANVIL_KEYS[25];
const COURIER_DEAR_KEY = ANVIL_KEYS[26];
const COURIER_CHEAP = privateKeyToAccount(COURIER_CHEAP_KEY).address as Hex; // 2 MOCK
const COURIER_DEAR = privateKeyToAccount(COURIER_DEAR_KEY).address as Hex;   // 3 MOCK
const CHEAP_PRICE = '2';
const DEAR_PRICE = '3';

test.describe('DISPATCH RACE — countersign-first market formation, zero contracts (devnet)', () => {
    test.setTimeout(480_000);

    test('race → cheapest countersigner wins → commit-ready relay → winner submits → one resolve; the loser nets zero', async ({ page }) => {
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });

        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const token = config.tokenAddress as Hex;
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const balanceOf = (who: Hex) =>
            publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;

        await page.context().grantPermissions(['geolocation']);
        await page.context().setGeolocation({ latitude: DELIVERY_DEVICE.lat, longitude: DELIVERY_DEVICE.lon });

        // ── ENSURE the delivery assembly (shared author-if-absent). ──
        const deliverySlug = await ensureDeliveryAssembly(page);

        // ── BIND (idempotent): Aurora pins the assembly, designating NOBODY —
        //    the absence IS what makes the courier node race-able. ──
        if (!(await memberProfileBindings(MERCHANT)).some((b) => b.assemblySlug === deliverySlug)) {
            await gotoAsWallet(page, MERCHANT, '/members/edit/assemblies?e2e=devnet');
            const row = page.getByTestId(`seller-assembly-row-${deliverySlug}`);
            await row.waitFor({ state: 'visible', timeout: 30000 });
            await row.locator('input[type="checkbox"]').first().check();
            await page.getByRole('button', { name: 'Save changes' }).click();
            await expect.poll(async () =>
                (await memberProfileBindings(MERCHANT)).some((b) => b.assemblySlug === deliverySlug), {
                timeout: 60000, message: "the merchant's re-pinned profile carries the (undesignated) binding",
            }).toBe(true);
        }
        const binding = (await memberProfileBindings(MERCHANT)).find((b) => b.assemblySlug === deliverySlug);
        expect(
            (binding?.counterpartyBindings ?? []).some((cb) => cb.clauseId === DELIVERY_CLAUSES.courier),
            'the merchant binding designates no courier — the node is genuinely unbound',
        ).toBe(false);

        // ── SEED the two racing couriers (idempotent re-seed) + fund the
        //    out-of-mint-range wallets. Pre-population, not a UI action. ──
        const seedCourier = async (walletKey: `0x${string}`, address: Hex, name: string, price: string) => {
            const { uri: catalogueURI } = await pinJSONToIPFS({
                subjectAddress: address,
                version: '1.0.0',
                unitSystem: 'metric' as const,
                items: [{
                    id: `race-delivery-${address.slice(2, 8).toLowerCase()}`,
                    name: 'Raced delivery',
                    description: `Posted delivery rate for the dispatch race (${price} MOCK)`,
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
                    description: 'Courier seeded by dispatch-race.devnet.spec.ts',
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
        await seedCourier(COURIER_CHEAP_KEY, COURIER_CHEAP, 'Race Courier (cheap)', CHEAP_PRICE);
        await seedCourier(COURIER_DEAR_KEY, COURIER_DEAR, 'Race Courier (dear)', DEAR_PRICE);

        // MintTokens.s.sol funds anvil[0..9] only; MockERC20.mint is
        // permissionless on the devnet — fund the couriers and the buyer.
        const minter = createWalletClient({
            account: privateKeyToAccount(ANVIL_KEYS[0]), chain: LOCAL_ANVIL, transport: http(RPC_URL),
        });
        for (const who of [BUYER, COURIER_CHEAP, COURIER_DEAR]) {
            const hash = await minter.writeContract({
                address: token, abi: ERC20_ABI, functionName: 'mint', args: [who, parseUnits('1000', 18)],
            });
            await publicClient.waitForTransactionReceipt({ hash });
        }

        // ── BASELINES after funding, before any commit pulls bonds. ──
        const queryCommitted = () => publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: BUYER }, fromBlock: 0n,
        });
        const committedBefore = (await queryCommitted()).length;
        const [buyer0, merchant0, cheap0, dear0, core0] = await Promise.all([
            balanceOf(BUYER), balanceOf(MERCHANT), balanceOf(COURIER_CHEAP), balanceOf(COURIER_DEAR), balanceOf(core),
        ]);

        // ── CHECKOUT: cart → the unbound node → RACE (never the picker). ──
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

        // The unbound node surfaces BOTH resolutions of the same absence: the
        // manual picker and the race panel.
        await expect(page.getByTestId('seller-catalogue-picker'), 'the manual picker renders').toBeVisible({ timeout: 30000 });
        await expect(page.getByTestId('race-panel'), 'the race panel renders beside it').toBeVisible({ timeout: 15000 });

        // The buyer authors the transaction particulars BEFORE racing — the
        // drafts must carry the final clause fills (the digest assertion
        // refuses any post-draft drift).
        await fillDeliveryCheckout(page);

        await page.getByTestId('race-start').click();

        // The candidate set is OPEN: every discovered catalogue that can
        // price the node — the seeded price-1 sellers race too. Our couriers
        // must be among the drafted candidates.
        const cheapRow = page.getByTestId(`race-candidate-${COURIER_CHEAP.toLowerCase()}`);
        const dearRow = page.getByTestId(`race-candidate-${COURIER_DEAR.toLowerCase()}`);
        await cheapRow.waitFor({ state: 'visible', timeout: 60000 });
        await dearRow.waitFor({ state: 'visible', timeout: 15000 });
        const candidateCount = await page.locator('[data-testid^="race-candidate-"]').count();
        expect(candidateCount, 'the race drafts to MORE candidates than the two couriers — the set is the open registry read').toBeGreaterThan(2);
        const cheapPayment = BigInt((await cheapRow.getAttribute('data-payment'))!);
        const dearPayment = BigInt((await dearRow.getAttribute('data-payment'))!);
        expect(cheapPayment, 'the cheap courier drafts at its posted 2 MOCK').toBe(parseUnits(CHEAP_PRICE, 18));
        expect(dearPayment, 'the dear courier drafts at its posted 3 MOCK').toBe(parseUnits(DEAR_PRICE, 18));

        // ── COUNTERSIGN on each courier's OWN /sign — concurrent tabs in the
        //    same context (the coordination bus is shared per-context). ──
        const counterSignAs = async (courier: Hex, label: string) => {
            const tab = await newWalletPage(page.context());
            tab.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });
            await gotoAsWallet(tab, courier, '/sign?e2e=devnet');
            await waitForConnected(tab);
            // The wallet-wide listener replays the bus; the party filter
            // surfaces exactly THIS courier's draft.
            await tab.getByTestId('agreement-review').waitFor({ state: 'visible', timeout: 60000 });
            const returnBtn = tab.getByTestId('btn-counter-sign-return');
            const approveBond = tab.getByRole('button', { name: /Authorize Payment/ });
            await expect(returnBtn.or(approveBond), `${label}: authorize-or-countersign renders`).toBeVisible({ timeout: 60000 });
            if (await approveBond.isVisible().catch(() => false)) {
                await approveBond.click();
            }
            await returnBtn.waitFor({ state: 'visible', timeout: 60000 });
            await returnBtn.click();
            await tab.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
            await tab.getByTestId('preview-confirm').click();
            await tab.getByTestId('sign-offer-returned').waitFor({ state: 'visible', timeout: 60000 });
            return tab;
        };
        const cheapTab = await counterSignAs(COURIER_CHEAP, 'cheap courier');
        const dearTab = await counterSignAs(COURIER_DEAR, 'dear courier');

        // ── The buyer sees both availability answers and closes the race:
        //    cheapest COUNTERSIGNER wins — the cheaper-posted price-1
        //    candidates lose by silence. ──
        await expect.poll(async () => cheapRow.getAttribute('data-replied'), {
            timeout: 60000, message: "the cheap courier's countersignature lands in the buyer's panel",
        }).toBe('true');
        await expect.poll(async () => dearRow.getAttribute('data-replied'), {
            timeout: 30000, message: "the dear courier's countersignature lands too",
        }).toBe('true');
        await page.getByTestId('race-select-now').click();
        const winner = page.getByTestId('race-winner');
        await winner.waitFor({ state: 'visible', timeout: 15000 });
        expect(
            (await winner.getAttribute('data-seller'))!.toLowerCase(),
            'the cheapest AVAILABLE candidate wins the race',
        ).toBe(COURIER_CHEAP.toLowerCase());

        // ── PLACE: the buyer signs sub + root through the one confirm gate;
        //    the raced sub-order reproduces the drafted struct (digest-
        //    asserted in the walk) and relays with BOTH signatures. ──
        const place = page.getByTestId('btn-place-order');
        await expect(place, 'race winner selected → "Place order"').toHaveText(/Place order/, { timeout: 20000 });
        await place.click();
        await confirmAgreementPreviews(page, 2);
        await page.getByTestId('send-commitment-xmtp').click();
        await expect(page.getByTestId('commitment-xmtp-status')).toBeVisible({ timeout: 30000 });

        // ── ROOT accept — the merchant, on /orders (creates the process). ──
        await gotoAsWallet(page, MERCHANT, '/orders?e2e=devnet');
        await page.getByTestId('orders-list').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        await page.getByTestId('order-your-turn-card').first().waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId('btn-accept-order').first().click();
        await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId('preview-confirm').click();
        await expect.poll(async () => (await queryCommitted()).length, {
            timeout: 60000, message: "the merchant's accept lands OrderCommitted on-chain",
        }).toBe(committedBefore + 1);
        const rootEvent = (await queryCommitted())[committedBefore];
        const processId = rootEvent.args.processId!;
        const rootBonds = calculateBonds(rootEvent.args.cumulativeValue!, rootEvent.args.payment!);
        {
            const [b, m, c] = await Promise.all([balanceOf(BUYER), balanceOf(MERCHANT), balanceOf(core)]);
            expect(buyer0 - b, 'after root: buyer down by its buyer bond').toBe(rootBonds.buyerBond);
            expect(merchant0 - m, 'after root: merchant down by its seller bond').toBe(rootBonds.sellerBond);
            expect(c - core0, 'after root: escrow up by both bonds').toBe(rootBonds.buyerBond + rootBonds.sellerBond);
        }

        // ── THE LAST MILE: the winner's /orders surfaces the commit-ready
        //    payload (both signatures) in "Ready to submit" — the WINNER
        //    broadcasts, exactly as an accepted order. ──
        await gotoAsWallet(cheapTab, COURIER_CHEAP, '/orders?e2e=devnet');
        await cheapTab.getByTestId('orders-list').waitFor({ timeout: 30000 });
        await waitForConnected(cheapTab);
        await cheapTab.getByTestId('order-ready-to-submit-card').first().waitFor({ state: 'visible', timeout: 60000 });
        await cheapTab.getByTestId('btn-submit-ready-order').first().click();
        await cheapTab.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
        await cheapTab.getByTestId('preview-confirm').click();
        await expect.poll(async () => (await queryCommitted()).length, {
            timeout: 90000, message: "the winner's submit lands the raced order on-chain",
        }).toBe(committedBefore + 2);

        // THE scenario asserts: the committed seller IS the race winner, at
        // exactly the drafted payment, extending the same process — and the
        // race left exactly two orders on-chain (losing countersignatures
        // never touch it).
        const courierEvent = (await queryCommitted())[committedBefore + 1];
        expect(courierEvent.args.processId, 'the raced order extends the SAME process').toBe(processId);
        expect(
            courierEvent.args.seller?.toLowerCase(),
            'the committed seller IS the race winner — formed at checkout, no contract',
        ).toBe(COURIER_CHEAP.toLowerCase());
        expect(courierEvent.args.payment, "the committed payment is the winner's drafted posted price").toBe(cheapPayment);
        const courierBonds = calculateBonds(courierEvent.args.cumulativeValue!, courierEvent.args.payment!);
        {
            const [b, cc, c] = await Promise.all([balanceOf(BUYER), balanceOf(COURIER_CHEAP), balanceOf(core)]);
            expect(buyer0 - b, 'after the raced commit: buyer down by both buyer bonds')
                .toBe(rootBonds.buyerBond + courierBonds.buyerBond);
            expect(cheap0 - cc, 'the winner bonds against the cumulative value').toBe(courierBonds.sellerBond);
            expect(c - core0, 'escrow holds all four bonds').toBe(
                rootBonds.buyerBond + rootBonds.sellerBond + courierBonds.buyerBond + courierBonds.sellerBond,
            );
        }

        // ── RESOLVE: one signature settles both orders. ──
        const resolvedBefore = (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'ProcessResolved', args: { buyer: BUYER }, fromBlock: 0n,
        })).length;
        await gotoAsWallet(page, BUYER, `/orders/view?process=${processId}&e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const resolveBtn = page.getByTestId('capability-execute-resolve-process');
        await expect(resolveBtn, 'the buyer can resolve the active process').toBeEnabled({ timeout: 30000 });
        await resolveBtn.click();
        await expect.poll(async () => (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'ProcessResolved', args: { buyer: BUYER }, fromBlock: 0n,
        })).length, { timeout: 60000, message: 'ProcessResolved lands on-chain' }).toBe(resolvedBefore + 1);

        // ── SETTLEMENT: winner +payment, merchant +payment, buyer −total,
        //    escrow at baseline — and the LOSER nets exactly ZERO: a losing
        //    countersignature costs nothing. ──
        const [buyerF, merchantF, cheapF, dearF, coreF] = await Promise.all([
            balanceOf(BUYER), balanceOf(MERCHANT), balanceOf(COURIER_CHEAP), balanceOf(COURIER_DEAR), balanceOf(core),
        ]);
        expect(buyer0 - buyerF, 'buyer net paid meal + the raced delivery')
            .toBe(rootEvent.args.payment! + courierEvent.args.payment!);
        expect(merchantF - merchant0, 'merchant net earned exactly its payment').toBe(rootEvent.args.payment!);
        expect(cheapF - cheap0, 'the race winner net earned exactly its posted price').toBe(courierEvent.args.payment!);
        expect(dearF - dear0, "the losing courier's balance is UNTOUCHED — signature-only exposure").toBe(0n);
        expect(coreF, 'FigaroCore escrow returned to its baseline').toBe(core0);

        await cheapTab.close();
        await dearTab.close();
    });
});
