/**
 * local-commerce.devnet.spec.ts — MEAL/GROCERY DELIVERY, the local-commerce
 * runtime, end to end.
 *
 * The everyday scenario the protocol generalizes: a buyer orders a meal from
 * a merchant and a courier delivers it. Two co-equal orders — the merchant
 * order (the meal, requested as delivery via the modalities clause) and the
 * courier order (the transfer) — one process, one resolve. Every leg runs
 * THROUGH THE UI; every chain effect is verified out-of-band:
 *
 *   author   → the delivery scenario is WRITTEN on the designer canvas (a
 *              root order composing merchant-process + modalities=delivery;
 *              a drawn courier sub-order composing courier-process — drawn,
 *              never spawned) and published to the AssemblyRegistry.
 *              Idempotent: the composition is content-addressed, so a re-run
 *              discovers the anchored assembly by SHAPE and consumes it.
 *   bind     → the merchant (Rosa's Kitchen, a pre-populated seller) pins the
 *              assembly to its profile through the seller-edit surface and
 *              DESIGNATES its courier (Cardinal Couriers); the courier pins
 *              the assembly it participates in (the even-surfacing rule:
 *              only a bound seller's catalogue is readable anywhere).
 *   checkout → the buyer orders the pizza from the merchant's page; the
 *              method line shows the delivery assembly; the P&L breakdown
 *              prices the courier LIVE from the courier's own catalogue;
 *              the buyer signs BOTH orders through the one confirm gate.
 *   accept   → merchant accepts first (root creates the process), courier
 *              second (extends it) — exact bond deltas asserted after each:
 *              buyer 2× payment per order, merchant 2×1, courier 2×2 (the
 *              courier bonds against CUMULATIVE upstream value).
 *   attest   → the story on the timeline: the merchant walks its WHOLE
 *              ladder (Preparation started → Ready for pickup → Handed off),
 *              then the courier walks its WHOLE ladder (En route to pickup →
 *              Arrived at pickup → In transit → Arrived at drop-off →
 *              Completed) — each stage through the ONE generic capability
 *              rail, each event landing on the timeline. First coverage of a
 *              full multi-stage ladder walk.
 *   resolve  → the buyer resolves ONCE: merchant net +1, courier net +1,
 *              buyer net −2, escrow back to baseline.
 *   audit    → financials, a line item for BOTH orders, the cash-flow log,
 *              and the clause evidence carrying every committed leaf and all
 *              EIGHT attested stages.
 *
 * Cast (scenario labels only — the kernel sees ordinary wallets):
 *   author   anvil[0]  (any wallet designs; neither party here)
 *   buyer    anvil[2]  (used as a buyer by no other spec)
 *   merchant anvil[7]  Rosa's Kitchen  (seeded; catalogue: Margherita pizza @1)
 *   courier  anvil[8]  Cardinal Couriers (seeded; catalogue: Standard delivery @1)
 *
 * No evmSnapshot/evmRevert — devnet is a mainnet rehearsal; both gates are
 * idempotent and the run leaves its state on-chain for out-of-band checks.
 *
 * Requires Anvil + ./scripts/deploy-local.sh + populate-test-data + Kubo + :3100.
 */
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import { createPublicClient, defineChain, http, parseAbi, parseEther, type Hex } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import {
    discoverAnchoredAssemblies,
    readLocalDeploymentConfig,
    sellerProfileBindings,
} from './devnet-helpers';
import { ANVIL_ACCOUNTS } from '../anvilAccounts';
import { CORE_ABI } from '@/lib/kernel/contracts';
import { calculateBonds } from '@figaro/core';
import type { Page } from '@playwright/test';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});
const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';
const ERC20_ABI = parseAbi(['function balanceOf(address) view returns (uint256)']);

const BUYER = ANVIL_ACCOUNTS[2] as Hex; // anvil[2] — a buyer no other spec uses
const MERCHANT = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 7 }).address as Hex; // Rosa's Kitchen
const COURIER = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 8 }).address as Hex; // Cardinal Couriers

const COURIER_CLAUSE = 'figaro-courier-process';
const MERCHANT_CLAUSE = 'figaro-merchant-process';
const MODALITIES_CLAUSE = 'figaro-modalities';

// The two transfer ladders, stage labels straight from the registered specs
// (`clauses/figaro-{merchant,courier}-process.json` valueLabels) — the story
// the timeline tells.
const MERCHANT_STAGES = ['Preparation started', 'Ready for pickup', 'Handed off'];
const COURIER_STAGES = ['En route to pickup', 'Arrived at pickup', 'In transit', 'Arrived at drop-off', 'Completed'];

/** Wait for ClientInit's devnet auto-connect (the "Connect Wallet" button goes). */
async function waitForConnected(page: Page) {
    await page.waitForFunction(
        () => !Array.from(document.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Connect Wallet'),
        null,
        { timeout: 30000 },
    );
}

/** The delivery assembly's SHAPE — how the spec recognizes it on-chain
 *  without a hardcoded slug: exactly two orders, the sub-order carrying the
 *  courier process clause. */
async function findDeliveryAssembly(): Promise<string | undefined> {
    const templates = await discoverAnchoredAssemblies();
    return templates.find(
        (t) => t.orders.length === 2
            && t.orders.some((o) => Object.keys(o.clauses ?? {}).includes(COURIER_CLAUSE)),
    )?.slug;
}

test.describe('LOCAL COMMERCE — meal delivery: canvas → bind → order → attest → one resolve pays both (devnet)', () => {
    test.setTimeout(480_000);

    test('the delivery scenario is authored on the canvas, pinned by its sellers, and run to a fully-attested settlement', async ({ page }) => {
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });

        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const token = config.tokenAddress as Hex;
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const balanceOf = (who: Hex) =>
            publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;

        // ── AUTHOR (idempotent): write the scenario on the designer canvas.
        //    The composition is content-addressed (identical composition →
        //    identical slug, first-write-wins), so when a prior run anchored
        //    it, this run discovers it by shape and consumes it — the mainnet
        //    ensure-exists semantics. ──
        let deliverySlug = await findDeliveryAssembly();
        if (!deliverySlug) {
            await page.addInitScript(() => {
                try {
                    window.localStorage.removeItem('figaro:designer:current');
                    window.localStorage.removeItem('figaro:designer:drafts');
                } catch { /* noop */ }
            });
            await page.goto('/builders/designer/new?fresh=1&e2e=devnet', { waitUntil: 'domcontentloaded' });
            await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
            await page.getByTestId('designer-saved-hint').waitFor({ timeout: 15000 });

            const orderNodes = page.locator('[data-testid^="order-node-"]:not([data-testid$="-delete"])');
            await expect(orderNodes).toHaveCount(1, { timeout: 10000 });
            const rootTestId = await orderNodes.first().getAttribute('data-testid');
            const rootId = rootTestId!.replace('order-node-', '');

            // Root order — the meal: the merchant's process ladder + the
            // buyer's committed delivery request (the modalities clause).
            await orderNodes.first().click();
            await page.getByTestId('agreement-drawer').waitFor({ state: 'visible', timeout: 10000 });
            await page.getByTestId('drawer-tab-registry').click();
            await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });
            await page.getByTestId(`drawer-registry-clause-${MERCHANT_CLAUSE}`).check();
            await page.getByTestId(`drawer-registry-clause-${MODALITIES_CLAUSE}`).check();
            await page.getByTestId(`drawer-field-${MODALITIES_CLAUSE}-modality-delivery`).check();

            // The courier order is DRAWN — a second co-equal node under the
            // root (never spawned by a checkbox; the drawn edge IS delivery
            // reality, the modalities value only the request).
            await page.getByTestId(`btn-add-suborder-${rootId}`).click();
            await expect(orderNodes).toHaveCount(2, { timeout: 10000 });
            const nodeIds = await orderNodes.evaluateAll((els) =>
                els.map((el) => el.getAttribute('data-testid')!.replace('order-node-', '')));
            const subId = nodeIds.find((id) => id !== rootId)!;

            // Compose the courier's process ladder on the drawn order, via the
            // drawer's node tab.
            await page.getByTestId(`drawer-node-tab-${subId}`).click();
            await page.getByTestId('drawer-tab-registry').click();
            await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });
            await page.getByTestId(`drawer-registry-clause-${COURIER_CLAUSE}`).check();

            // Editorial identity + publish (pin template → AssemblyRegistered).
            await page.getByTestId('designer-name-input').fill('Local delivery');
            await page.getByTestId('designer-summary-input').fill('Meal/grocery delivery: a merchant order plus one co-equal courier order.');
            await page.getByTestId('designer-description-input').fill('The local-commerce runtime: the buyer orders with the delivery modality; the courier order carries the goods; each transfer is attested; one resolve pays both.');
            await expect(page.getByTestId('designer-review')).toBeEnabled({ timeout: 5000 });
            await page.getByTestId('designer-review').click();
            await page.waitForURL(/\/builders\/designer\/view\/asm-/, { timeout: 15000 });
            const handle = page.url().match(/\/view\/(asm-[a-z0-9-]+)/)?.[1];
            expect(handle, 'review navigated to a draft handle').toBeTruthy();
            await page.goto(`/builders/designer/view/${handle}?intent=publish&e2e=devnet`, { waitUntil: 'domcontentloaded' });
            const confirmBtn = page.getByTestId('review-confirm-publish');
            await confirmBtn.waitFor({ state: 'visible', timeout: 15000 });
            await waitForConnected(page);
            await confirmBtn.click();
            await page.getByTestId('assembly-publish-receipt').waitFor({ timeout: 60000 });
            const receiptSlug = (await page.getByTestId('receipt-slug').textContent())?.trim();
            expect(receiptSlug, 'publish receipt shows the content slug').toMatch(/^asm-/);

            // The anchored assembly is discoverable by SHAPE — the same read
            // every consumer uses; a re-run consumes exactly this.
            deliverySlug = await findDeliveryAssembly();
            expect(deliverySlug, 'the published delivery assembly is discoverable by shape').toBe(receiptSlug);
        }

        // The public inventory carries it — author → pin → anchor → visible.
        await page.goto('/assemblies?e2e=devnet', { waitUntil: 'domcontentloaded' });
        await expect(page.locator(`#assembly-${deliverySlug}`)).toBeVisible({ timeout: 30000 });

        // ── BIND (idempotent): the merchant pins the assembly + designates its
        //    courier through the seller-edit surface; the courier pins the
        //    assembly it participates in. Both verified out-of-band from the
        //    registry events + IPFS. ──
        const merchantConformant = async (): Promise<boolean> => {
            const bindings = await sellerProfileBindings(MERCHANT);
            const binding = bindings.find((b) => b.assemblySlug === deliverySlug);
            return !!binding && (binding.counterpartyBindings ?? []).some(
                (cb) => cb.clauseId === COURIER_CLAUSE
                    && cb.addresses.some((a) => a.toLowerCase() === COURIER.toLowerCase()),
            );
        };
        if (!(await merchantConformant())) {
            await gotoAsWallet(page, MERCHANT, '/sellers/edit/assemblies?e2e=devnet');
            const row = page.getByTestId(`seller-assembly-row-${deliverySlug}`);
            await row.waitFor({ state: 'visible', timeout: 30000 });
            await row.locator('input[type="checkbox"]').first().check();
            const counterparties = page.getByTestId(`seller-assembly-counterparties-${deliverySlug}`);
            await counterparties.waitFor({ state: 'visible', timeout: 30000 });
            await counterparties.getByTestId(`counterparty-${COURIER_CLAUSE}-input-0`).fill(COURIER);
            await page.getByRole('button', { name: 'Save changes' }).click();
            await expect.poll(merchantConformant, {
                timeout: 60000, message: "the merchant's re-pinned profile carries the binding + courier designation",
            }).toBe(true);
        }
        if (!(await sellerProfileBindings(COURIER)).some((b) => b.assemblySlug === deliverySlug)) {
            await gotoAsWallet(page, COURIER, '/sellers/edit/assemblies?e2e=devnet');
            const row = page.getByTestId(`seller-assembly-row-${deliverySlug}`);
            await row.waitFor({ state: 'visible', timeout: 30000 });
            await row.locator('input[type="checkbox"]').first().check();
            await page.getByRole('button', { name: 'Save changes' }).click();
            await expect.poll(async () =>
                (await sellerProfileBindings(COURIER)).some((b) => b.assemblySlug === deliverySlug), {
                timeout: 60000, message: "the courier's re-pinned profile carries the binding",
            }).toBe(true);
        }

        // ── BASELINES for every party, before any bond moves. ──
        const queryCommitted = () => publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: BUYER }, fromBlock: 0n,
        });
        const committedBefore = (await queryCommitted()).length;
        const [buyer0, merchant0, courier0, core0] = await Promise.all([
            balanceOf(BUYER), balanceOf(MERCHANT), balanceOf(COURIER), balanceOf(core),
        ]);

        // ── CHECKOUT: the buyer orders the pizza with delivery. One bound
        //    assembly → the static method line names it; the breakdown prices
        //    the courier live from the courier's own catalogue. ──
        await gotoAsWallet(page, BUYER, `/s/${MERCHANT}?e2e=devnet`);
        await page.getByTestId('seller-detail-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const addBtn = page.locator('[data-testid^="btn-add-"]').first();
        await addBtn.waitFor({ state: 'visible', timeout: 20000 });
        await addBtn.click();
        await page.getByTestId('btn-review-order').click();
        await page.getByTestId('checkout-view').waitFor({ timeout: 20000 });

        await expect(
            page.getByTestId('method-static'),
            "one binding → the method line names the merchant's delivery assembly",
        ).toHaveAttribute('data-method', deliverySlug!, { timeout: 30000 });
        await expect(page.getByTestId('cart-contributor-breakdown'), 'checkout shows the two-contributor P&L')
            .toBeVisible({ timeout: 30000 });
        await expect(page.getByTestId('cart-kit-total'), 'meal 1 + delivery 1').toHaveText(/^2(\.0*)?$/, { timeout: 15000 });
        await expect(page.getByTestId('checkout-locked-total'), 'the buyer locks 2× the total').toHaveText(/^4(\.0*)?$/, { timeout: 15000 });

        const place = page.getByTestId('btn-place-order');
        await expect(place, 'buyer connected + assembly bound → "Place order"').toHaveText(/Place order/, { timeout: 20000 });
        await place.click();
        // The buyer signs BOTH orders through the same pre-sign gate every
        // order uses: the courier sub-order first (signed + auto-relayed to
        // the courier), the root last (relayed from the share panel).
        for (const leg of ['courier sub-order', 'root order']) {
            const modal = page.getByTestId('agreement-preview-modal');
            await modal.waitFor({ state: 'visible', timeout: 60000 });
            await page.getByTestId('preview-confirm').click();
            await modal.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {
                throw new Error(`the ${leg} confirm did not close the preview gate`);
            });
        }
        await page.getByTestId('buyer-share-panel').waitFor({ timeout: 60000 });
        await page.getByTestId('send-commitment-xmtp').click();
        await expect(page.getByTestId('commitment-xmtp-status')).toBeVisible({ timeout: 30000 });

        // ── ACCEPTS in walk order (root creates the process, the sub extends
        //    it), exact bond deltas after each. ──
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
            expect(event.args.seller?.toLowerCase(), `${label}'s order committed against ${label}`)
                .toBe(seller.toLowerCase());
            test.info().annotations.push({
                type: 'OrderCommitted',
                description: `${label}: order=${event.args.orderHash} payment=${event.args.payment} cumulativeValue=${event.args.cumulativeValue} tx=${event.transactionHash}`,
            });
            return event;
        };

        const merchantEvent = await acceptAs(MERCHANT, 'merchant');
        const processId = merchantEvent.args.processId!;
        expect(merchantEvent.args.payment, "meal payment = the merchant's catalogue price").toBe(parseEther('1'));
        expect(merchantEvent.args.cumulativeValue, 'root cumulative = its own payment').toBe(parseEther('1'));
        const merchantBonds = calculateBonds(merchantEvent.args.cumulativeValue!, merchantEvent.args.payment!);
        {
            const [b, m, c] = await Promise.all([balanceOf(BUYER), balanceOf(MERCHANT), balanceOf(core)]);
            expect(buyer0 - b, 'after the meal commit: buyer down by its buyer bond').toBe(merchantBonds.buyerBond);
            expect(merchant0 - m, 'after the meal commit: merchant down by its seller bond').toBe(merchantBonds.sellerBond);
            expect(c - core0, 'after the meal commit: escrow up by both bonds').toBe(merchantBonds.buyerBond + merchantBonds.sellerBond);
        }

        const courierEvent = await acceptAs(COURIER, 'courier');
        expect(courierEvent.args.processId, 'the courier order extends the SAME process').toBe(processId);
        expect(courierEvent.args.payment, "delivery payment = the courier's own catalogue price").toBe(parseEther('1'));
        expect(courierEvent.args.cumulativeValue, 'courier cumulative = meal + delivery').toBe(parseEther('2'));
        const courierBonds = calculateBonds(courierEvent.args.cumulativeValue!, courierEvent.args.payment!);
        {
            const [b, cr, c] = await Promise.all([balanceOf(BUYER), balanceOf(COURIER), balanceOf(core)]);
            expect(buyer0 - b, 'after the delivery commit: buyer down by both buyer bonds')
                .toBe(merchantBonds.buyerBond + courierBonds.buyerBond);
            expect(courier0 - cr, 'the courier bonds against CUMULATIVE upstream value, not just its own cut')
                .toBe(courierBonds.sellerBond);
            expect(c - core0, 'escrow holds every bond in the process').toBe(
                merchantBonds.buyerBond + merchantBonds.sellerBond
                + courierBonds.buyerBond + courierBonds.sellerBond,
            );
        }
        expect((await queryCommitted()).length, 'exactly two orders committed').toBe(committedBefore + 2);

        // ── ATTEST: the story on the timeline. Each seller walks its WHOLE
        //    ladder through the ONE generic capability rail — the rail offers
        //    exactly the next unattested stage, labelled from the clause spec;
        //    each executed stage lands on the timeline; a finished ladder
        //    leaves the rail. ──
        const walkLadder = async (seller: Hex, stages: string[], label: string) => {
            await gotoAsWallet(page, seller, `/orders/${processId}?e2e=devnet`);
            await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
            await waitForConnected(page);
            const attest = page.getByTestId('capability-execute-submit-clause-attestation').first();
            for (const stage of stages) {
                await expect(attest, `the rail offers ${label}'s next stage: "${stage}"`)
                    .toContainText(stage, { timeout: 30000 });
                await expect(attest).toBeEnabled({ timeout: 30000 });
                await attest.click();
                await expect(
                    page.getByTestId('order-timeline').getByText(stage),
                    `"${stage}" lands on the timeline`,
                ).toBeVisible({ timeout: 60000 });
            }
            await expect(
                page.getByTestId('capability-execute-submit-clause-attestation'),
                `${label}'s ladder is fully attested — the rail offers no further stage`,
            ).toHaveCount(0, { timeout: 30000 });
        };
        await walkLadder(MERCHANT, MERCHANT_STAGES, 'the merchant');
        await walkLadder(COURIER, COURIER_STAGES, 'the courier');

        // ── RESOLVE: buyer dominance — one signature settles both orders. ──
        const resolvedBefore = (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'ProcessResolved', args: { buyer: BUYER }, fromBlock: 0n,
        })).length;
        await gotoAsWallet(page, BUYER, `/orders/${processId}?e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const resolveBtn = page.getByTestId('capability-execute-resolve-process');
        await expect(resolveBtn, 'the buyer can resolve the active process').toBeEnabled({ timeout: 30000 });
        await resolveBtn.click();
        await expect.poll(async () => (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'ProcessResolved', args: { buyer: BUYER }, fromBlock: 0n,
        })).length, { timeout: 60000, message: 'ProcessResolved lands on-chain' }).toBe(resolvedBefore + 1);

        // ── SETTLEMENT: the whole point — one signature pays the meal AND the
        //    delivery; the bonds were the mechanism, the net is the trade. ──
        const [buyerF, merchantF, courierF, coreF] = await Promise.all([
            balanceOf(BUYER), balanceOf(MERCHANT), balanceOf(COURIER), balanceOf(core),
        ]);
        expect(buyer0 - buyerF, 'buyer net paid meal + delivery').toBe(parseEther('2'));
        expect(merchantF - merchant0, 'merchant net earned exactly the meal price').toBe(parseEther('1'));
        expect(courierF - courier0, 'courier net earned exactly the delivery price').toBe(parseEther('1'));
        expect(coreF, 'FigaroCore escrow returned to its baseline').toBe(core0);

        // ── AUDIT: the full evidentiary record — financials, BOTH line items,
        //    the cash-flow log, every committed leaf, and all EIGHT attested
        //    stages, read from network state. ──
        await page.goto(`/audit/${processId}?e2e=devnet`, { waitUntil: 'domcontentloaded' });
        await page.getByTestId('audit-page').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        await expect(page.getByTestId('financials-view')).toBeVisible({ timeout: 30000 });
        for (const [event, label] of [[merchantEvent, 'meal'], [courierEvent, 'delivery']] as const) {
            await expect(
                page.getByTestId(`line-item-${event.args.orderHash}`),
                `the ${label} order surfaces as its own line item`,
            ).toBeVisible({ timeout: 30000 });
        }
        await expect(page.locator('[data-testid^="line-item-"]'), 'exactly one line item per order').toHaveCount(2);
        await expect(page.getByTestId('financials-cashflow')).toBeVisible({ timeout: 30000 });

        const evidence = page.getByTestId('audit-clause-evidence');
        await evidence.waitFor({ state: 'visible', timeout: 30000 });
        for (const text of [
            'Commerce terms',
            'Order topology',
            'Modalities',
            'Merchant internal process events',
            'Courier internal process events',
            ...MERCHANT_STAGES,
            ...COURIER_STAGES,
        ]) {
            await expect(
                evidence.getByText(text).first(),
                `the "${text}" evidence leaf surfaces in the audit`,
            ).toBeVisible({ timeout: 30000 });
        }
    });
});
