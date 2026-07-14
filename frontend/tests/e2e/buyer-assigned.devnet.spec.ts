/**
 * buyer-assigned.devnet.spec.ts — BUYER-ASSIGNED COORDINATION: the buyer picks
 * the courier at checkout, end to end.
 *
 * The SAME delivery assembly as local-commerce — one composition, one
 * content-addressed identity — adopted DIFFERENTLY: the merchant binds it
 * with NO courier designation. Coordination is an ADOPTION property, not
 * stored composition (the retired figaro-coordination enum is not how
 * variants are expressed): a binding WITH a designation runs seller-assigned;
 * a binding WITHOUT one leaves the courier node unbound, and checkout falls
 * to the buyer's choice — the SellerCataloguePicker, this spec's NEW
 * coverage (no other e2e drives the unbound path).
 *
 *   ensure   → the delivery assembly is discovered by SHAPE (or authored
 *              once, via the shared author-if-absent helper local-commerce
 *              uses — both specs adopt the same anchored composition).
 *   bind     → the merchant (Aurora Café, a pre-populated seller) pins the
 *              assembly through the seller-edit surface and designates
 *              NOBODY — that absence IS buyer-assigned.
 *   checkout → the buyer orders from the merchant; the P&L's courier row
 *              reads "(choose below)"; the picker renders (unbound path);
 *              the buyer types the courier's address — itself DISCOVERED
 *              from SellerRegistry events + IPFS, never a roster — picks an
 *              item from that courier's live catalogue, and the P&L updates
 *              to the picked price. The buyer signs BOTH orders through the
 *              one confirm gate.
 *   accept   → merchant first (root creates the process), courier second —
 *              the committed courier order's seller IS the buyer's pick;
 *              exact bond deltas asserted after each commit, all amounts
 *              read from chain events (never assumed from seed data).
 *   resolve  → one signature settles both orders: merchant + courier each
 *              net +payment, buyer net −total, escrow back to baseline.
 *   audit    → the financials render one statement per seller + the
 *              consolidation (the ladder/witness runtime is local-commerce's
 *              assertion on this same assembly — not duplicated here).
 *
 * Cast (scenario labels only — the kernel sees ordinary wallets):
 *   buyer    anvil[4]  (used as a buyer by no other spec)
 *   merchant anvil[6]  Aurora Café (seeded)
 *   courier  DISCOVERED from chain (first bound seller that isn't the merchant)
 *
 * No evmSnapshot/evmRevert — devnet is a mainnet rehearsal; the gates are
 * idempotent and the run leaves its state on-chain for out-of-band checks.
 *
 * Requires Anvil + ./scripts/deploy-local.sh + populate-test-data + Kubo + :3100.
 */
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import { createPublicClient, defineChain, http, parseAbi, type Hex } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import {
    confirmAgreementPreviews,
    DELIVERY_CLAUSES,
    DELIVERY_DEVICE,
    discoverSellers,
    ensureDeliveryAssembly,
    fillDeliveryCheckout,
    readLocalDeploymentConfig,
    sellerProfileBindings,
    waitForConnected,
} from './devnet-helpers';
import { ANVIL_ACCOUNTS } from '../anvilAccounts';
import { CORE_ABI } from '@/lib/kernel/contracts';
import { calculateBonds } from '@figaro/sdk';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});
const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';
const ERC20_ABI = parseAbi(['function balanceOf(address) view returns (uint256)']);

const BUYER = ANVIL_ACCOUNTS[4] as Hex; // anvil[4] — a buyer no other spec uses
const MERCHANT = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 6 }).address as Hex; // Aurora Café

test.describe('BUYER-ASSIGNED — the buyer picks the courier at checkout (devnet)', () => {
    test.setTimeout(420_000);

    test('unbound binding → picker checkout → commits against the buyer\'s pick → one resolve pays both', async ({ page }) => {
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

        // ── BIND (idempotent): Aurora pins the assembly and designates NOBODY.
        //    The counterparty editor is left untouched — the ABSENCE of a
        //    designation is what makes this adoption buyer-assigned. ──
        if (!(await sellerProfileBindings(MERCHANT)).some((b) => b.assemblySlug === deliverySlug)) {
            await gotoAsWallet(page, MERCHANT, '/sellers/edit/assemblies?e2e=devnet');
            const row = page.getByTestId(`seller-assembly-row-${deliverySlug}`);
            await row.waitFor({ state: 'visible', timeout: 30000 });
            await row.locator('input[type="checkbox"]').first().check();
            await page.getByRole('button', { name: 'Save changes' }).click();
            await expect.poll(async () =>
                (await sellerProfileBindings(MERCHANT)).some((b) => b.assemblySlug === deliverySlug), {
                timeout: 60000, message: "the merchant's re-pinned profile carries the (undesignated) binding",
            }).toBe(true);
        }
        // The scenario's precondition, verified out-of-band: the binding names
        // NO courier — the node is genuinely unbound.
        const binding = (await sellerProfileBindings(MERCHANT)).find((b) => b.assemblySlug === deliverySlug);
        expect(
            (binding?.counterpartyBindings ?? []).some((cb) => cb.clauseId === DELIVERY_CLAUSES.courier),
            'the merchant binding designates no courier (buyer-assigned adoption)',
        ).toBe(false);

        // ── The COURIER the buyer will pick — DISCOVERED from SellerRegistry
        //    events + IPFS (never a roster): the first bound seller that is
        //    not the merchant (a binding is what admits a catalogue to every
        //    read — the even-surfacing rule). ──
        const sellers = await discoverSellers();
        const courier = sellers.find(
            (s) => s.address.toLowerCase() !== MERCHANT.toLowerCase() && s.assemblyBindings.length > 0,
        );
        expect(courier, 'a bound, non-merchant seller exists on-chain to pick').toBeTruthy();
        const COURIER = courier!.address;

        // ── BASELINES before any commit pulls bonds (deltas, never absolutes). ──
        const committedBefore = (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: BUYER }, fromBlock: 0n,
        })).length;
        const [buyer0, merchant0, courier0, core0] = await Promise.all([
            balanceOf(BUYER), balanceOf(MERCHANT), balanceOf(COURIER), balanceOf(core),
        ]);

        // ── CHECKOUT: the unbound path. The picker is the NEW coverage. ──
        await gotoAsWallet(page, BUYER, `/s/view?seller=${MERCHANT}&e2e=devnet`);
        await page.getByTestId('seller-detail-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const addBtn = page.locator('[data-testid^="btn-add-"]').first();
        await addBtn.waitFor({ state: 'visible', timeout: 20000 });
        await addBtn.click();
        await page.getByTestId('btn-review-order').click();
        await page.getByTestId('checkout-view').waitFor({ timeout: 20000 });

        // A multi-binding merchant offers the method choice; a single-binding
        // one preselects. Either way the delivery assembly drives this order.
        const methodSelect = page.getByTestId('select-method');
        if (await methodSelect.isVisible().catch(() => false)) {
            await methodSelect.selectOption(deliverySlug);
        }

        // The unbound courier node surfaces as the buyer's choice: the P&L row
        // reads "(choose below)" and the picker renders. On the designated
        // path (local-commerce) this surface never mounts.
        const breakdown = page.getByTestId('cart-contributor-breakdown');
        await expect(breakdown, 'the P&L renders the per-contributor breakdown').toBeVisible({ timeout: 30000 });
        await expect(breakdown, 'the unbound node awaits the buyer\'s choice').toContainText('(choose below)');
        const picker = page.getByTestId('seller-catalogue-picker');
        await expect(picker, 'the unbound path mounts the seller picker (buyer-assigned)').toBeVisible({ timeout: 15000 });

        // The buyer types the courier's address; the courier's LIVE catalogue
        // renders from IPFS and the buyer picks an item at its published price.
        await page.getByTestId('input-seller-address').fill(COURIER);
        await page.getByTestId('seller-catalogue-list').waitFor({ state: 'visible', timeout: 30000 });
        await page.locator('[data-testid^="seller-item-"]').first().check();
        await expect(breakdown, 'the picked courier prices into the P&L').not.toContainText('(choose below)', { timeout: 15000 });

        // The buyer authors the transaction particulars (modality request,
        // hand-off mode, proximity band, geolocation endpoints) — templates
        // arrive value-free by construction (ruled 2026-07-14).
        await fillDeliveryCheckout(page);

        const place = page.getByTestId('btn-place-order');
        await expect(place, 'buyer connected + pick made → "Place order"').toHaveText(/Place order/, { timeout: 20000 });
        await place.click();
        await confirmAgreementPreviews(page, 2);
        await page.getByTestId('send-commitment-xmtp').click();
        await expect(page.getByTestId('commitment-xmtp-status')).toBeVisible({ timeout: 30000 });

        // ── ACCEPTS in walk order; every amount read from chain events. ──
        const queryCommitted = () => publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: BUYER }, fromBlock: 0n,
        });
        const acceptAs = async (seller: Hex, label: string) => {
            const before = (await queryCommitted()).length;
            await gotoAsWallet(page, seller, '/orders?e2e=devnet');
            await page.getByTestId('orders-list').waitFor({ timeout: 30000 });
            await waitForConnected(page);
            await page.getByTestId('order-your-turn-card').first().waitFor({ state: 'visible', timeout: 30000 });
            await page.getByTestId('btn-accept-order').first().click();
            await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
            await page.getByTestId('preview-confirm').click();
            await expect.poll(async () => (await queryCommitted()).length, {
                timeout: 60000, message: `${label}'s accept lands OrderCommitted on-chain`,
            }).toBe(before + 1);
            const events = await queryCommitted();
            const event = events[events.length - 1];
            const receipt = await publicClient.getTransactionReceipt({ hash: event.transactionHash });
            expect(receipt.status, `${label}'s commit transaction succeeded`).toBe('success');
            return event;
        };

        // Root — the merchant. Creates the process.
        const rootEvent = await acceptAs(MERCHANT, 'merchant');
        const processId = rootEvent.args.processId!;
        const rootBonds = calculateBonds(rootEvent.args.cumulativeValue!, rootEvent.args.payment!);
        {
            const [b, m, c] = await Promise.all([balanceOf(BUYER), balanceOf(MERCHANT), balanceOf(core)]);
            expect(buyer0 - b, 'after root: buyer down by its buyer bond').toBe(rootBonds.buyerBond);
            expect(merchant0 - m, 'after root: merchant down by its seller bond').toBe(rootBonds.sellerBond);
            expect(c - core0, 'after root: escrow up by both bonds').toBe(rootBonds.buyerBond + rootBonds.sellerBond);
        }

        // Sub — the courier. THE scenario assert: the committed seller is the
        // wallet the BUYER picked, and it bonds against the cumulative value.
        const courierEvent = await acceptAs(COURIER, 'courier');
        expect(courierEvent.args.processId, 'the courier order extends the SAME process').toBe(processId);
        expect(
            courierEvent.args.seller?.toLowerCase(),
            "the committed courier IS the buyer's pick — buyer-assigned, on-chain",
        ).toBe(COURIER.toLowerCase());
        const courierBonds = calculateBonds(courierEvent.args.cumulativeValue!, courierEvent.args.payment!);
        {
            const [b, c2, c] = await Promise.all([balanceOf(BUYER), balanceOf(COURIER), balanceOf(core)]);
            expect(buyer0 - b, 'after courier: buyer down by both buyer bonds')
                .toBe(rootBonds.buyerBond + courierBonds.buyerBond);
            expect(courier0 - c2, 'after courier: courier down by its cumulative-scaled bond').toBe(courierBonds.sellerBond);
            expect(c - core0, 'after courier: escrow holds all four bonds').toBe(
                rootBonds.buyerBond + rootBonds.sellerBond + courierBonds.buyerBond + courierBonds.sellerBond,
            );
        }
        expect((await queryCommitted()).length, 'exactly two orders committed').toBe(committedBefore + 2);

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

        // ── SETTLEMENT: each seller net +payment, buyer net −total, escrow at
        //    baseline — every figure from the chain events above. ──
        const [buyerF, merchantF, courierF, coreF] = await Promise.all([
            balanceOf(BUYER), balanceOf(MERCHANT), balanceOf(COURIER), balanceOf(core),
        ]);
        expect(buyer0 - buyerF, 'buyer net paid meal + the picked delivery')
            .toBe(rootEvent.args.payment! + courierEvent.args.payment!);
        expect(merchantF - merchant0, 'merchant net earned exactly its payment').toBe(rootEvent.args.payment!);
        expect(courierF - courier0, "the buyer's pick net earned exactly its payment").toBe(courierEvent.args.payment!);
        expect(coreF, 'FigaroCore escrow returned to its baseline').toBe(core0);

        // ── AUDIT (lean — the runtime legs are local-commerce's assertion on
        //    this same assembly): the financials render a statement per seller
        //    plus the consolidation. ──
        await page.goto(`/audit/view?process=${processId}&e2e=devnet`, { waitUntil: 'domcontentloaded' });
        await page.getByTestId('audit-page').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        await expect(page.getByTestId('financials-view')).toBeVisible({ timeout: 30000 });
        await expect(
            page.locator('[data-testid="document-financial-statements-seller"]'),
            'one financial-statements document per seller (merchant + the picked courier)',
        ).toHaveCount(2, { timeout: 30000 });
        await expect(page.getByTestId('document-financial-statements-process')).toBeVisible({ timeout: 30000 });
    });
});
