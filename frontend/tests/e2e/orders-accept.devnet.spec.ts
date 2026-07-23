/**
 * orders-accept.devnet.spec.ts
 *
 * The inbox→orders→badge CONSOLIDATION, end to end. A buyer orders from a seller
 * bound to a published assembly and relays the commitment over the coordination
 * channel; the SELLER then sees it in the "Your turn" section on `/orders` (the
 * surface that replaced the separate inbox), accepts it THERE, and the order
 * commits on-chain and moves to "In progress". No inbox, no notification feed,
 * no toast — one actor-neutral orders surface carrying the action.
 *
 * Single page, two wallets (the multi-wallet fixture): buyer (anvil[0]) places +
 * relays; switch to the seller — DISCOVERED from chain as the wallet bound to
 * the single-order anchored assembly (the authoring gate binds one), never a
 * hardcoded roster; the mock coordination channel
 * (localStorage-backed, same origin) replays the relayed commitment into the
 * seller's /orders, where `awaitsMyCounterSign` surfaces the "Your turn" card.
 *
 * Depends on populate-test-data (clauses + seed assembly + sellers) and the `devnet-authoring` gate (sellers-onboarding):
 * the published assembly and the bound seller must already exist. Iterate with
 * `--no-deps` once the gate has seeded the chain.
 */
import { test, expect, gotoAsWallet, ANVIL_ACCOUNTS } from './devnet-multi-test';
import { createPublicClient, defineChain, http, parseAbi, type Hex } from 'viem';
import { calculateBonds } from '@figaro/sdk';
import { discoverAnchoredAssemblies, discoverSellers, readLocalDeploymentConfig } from './devnet-helpers';
import { CORE_ABI } from '@/lib/kernel/contracts';
import type { Page } from '@playwright/test';

/** Wait for ClientInit's devnet auto-connect — the "Connect Wallet" header
 *  button disappears once the injected wallet connects. Without this the
 *  checkout shows "Connect wallet to order" and place-order is a no-op. */
async function waitForConnected(page: Page) {
    await page.waitForFunction(
        () => !Array.from(document.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Connect Wallet'),
        null,
        { timeout: 30000 },
    );
}

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});

const ERC20_ABI = parseAbi(['function balanceOf(address) view returns (uint256)']);
// anvil[0] — the fixture's default buyer (the multi-wallet FIXTURE's own
// wallet, not world-state — the world's sellers are discovered from chain).
const BUYER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Hex;

/** The seller under test, DISCOVERED from chain → IPFS (never a roster): the
 *  registered seller bound to the single-order anchored assembly — the same
 *  binding the checkout resolves. Runtime e2e discovers its world; a spec that
 *  imports a seller address is not testing mainnet usage. The discovered
 *  wallet must be one the multi-wallet fixture can drive, so the pick is
 *  FILTERED to anvil-held accounts — foreign sellers legitimately bind the
 *  same anchored assemblies on the persisted devnet (the relay smoke's
 *  device-unique seller was the first), and selection-by-capability is not a
 *  roster: the world stays discovered, the wallet driven stays drivable. */
async function discoverBoundSeller(): Promise<Hex> {
    const anvilAddrs = new Set(ANVIL_ACCOUNTS.map((a) => a.toLowerCase()));
    const singleOrderSlugs = new Set(
        (await discoverAnchoredAssemblies()).filter((a) => a.agreements.length === 1).map((a) => a.slug),
    );
    const seller = (await discoverSellers()).find((s) =>
        anvilAddrs.has(s.address.toLowerCase())
        && s.assemblyBindings.some((b) => singleOrderSlugs.has(b.assemblySlug)),
    );
    expect(seller, 'an anvil-held seller is bound to a single-order anchored assembly (run populate-test-data + the authoring gate)').toBeTruthy();
    return seller!.address;
}

test.describe('Orders consolidation — buyer orders → seller accepts on /orders (devnet)', () => {
    test.setTimeout(180_000);

    test('the "Your turn" accept flow on /orders commits the order', async ({ page }) => {
        // Resolve raises a native window.confirm — auto-accept it (the deleted
        // direct-sale-runtime spec did the same), or the capability blocks.
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });
        const SELLER = await discoverBoundSeller();
        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const token = config.tokenAddress as Hex;
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const balanceOf = (who: Hex) =>
            publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;
        // `seller` is NOT indexed in OrderCommitted (the kernel hit the EVM 3-index
        // limit with orderHash/processId/buyer) — filter on the indexed `buyer`.
        const committedBefore = await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted',
            args: { buyer: BUYER }, fromBlock: 0n,
        });
        // Bond escrow baseline — the kernel pulls bonds in the payment token.
        const [buyerBefore, sellerBefore, coreBefore] = await Promise.all([
            balanceOf(BUYER), balanceOf(SELLER), balanceOf(core),
        ]);

        // ── Buyer (anvil[0], the fixture's DEFAULT) — add to cart → review → checkout ──
        // Plain goto auto-connects the default account via ClientInit (as
        // designer-publish does); gotoAsWallet's switch-to-default is a no-op that
        // leaves wagmi unconnected — reserve the switch for the non-default seller.
        await page.goto(`/s/view?seller=${SELLER}&e2e=devnet`, { waitUntil: 'domcontentloaded' });
        await page.getByTestId('seller-detail-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const addBtn = page.locator('[data-testid^="btn-add-"]').first();
        await addBtn.waitFor({ state: 'visible', timeout: 20000 });
        await addBtn.click();
        await page.getByTestId('btn-review-order').click();

        // ── Checkout → place order (signs + relays the commitment) ──
        await page.getByTestId('checkout-view').waitFor({ timeout: 20000 });
        const place = page.getByTestId('btn-place-order');
        await place.waitFor({ state: 'visible', timeout: 20000 });
        // The label tells the truth: "Connect wallet to order" (not connected) /
        // "Select an option to order" (!orderReady) / "Place order" (ready). Assert
        // the ready state so a connect or method gap fails loudly, not as a no-op.
        await expect(place, 'buyer connected + order ready → "Place order"')
            .toHaveText(/Place order/, { timeout: 20000 });
        await place.click();
        // The buyer confirms the agreement in the SAME pre-sign gate the seller's
        // accept uses — there is no checkout-only bypass.
        await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId('preview-confirm').click();
        // Share panel appears once SIGNED (commitStep = awaiting-seller) — but the
        // root commitment is NOT relayed until the buyer sends it. Click "Send via
        // XMTP" (mock channel in devnet → persisted to localStorage), so the seller's
        // /orders can replay it. (assemblyCheckout's auto-relay is sub-orders only.)
        await page.getByTestId('buyer-share-panel').waitFor({ timeout: 60000 });
        await page.getByTestId('send-commitment-xmtp').click();
        await expect(page.getByTestId('commitment-xmtp-status')).toBeVisible({ timeout: 30000 });

        // ── Switch to the discovered seller → /orders "Your turn" ──
        await gotoAsWallet(page, SELLER, '/orders?e2e=devnet');
        await page.getByTestId('orders-list').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const yourTurn = page.getByTestId('order-your-turn-card').first();
        await yourTurn.waitFor({ state: 'visible', timeout: 30000 });

        // ── Accept on /orders → counter-sign + broadcast → commit ──
        await page.getByTestId('btn-accept-order').first().click();
        // Accept opens the agreement sign-preview ("Review before signing"). The
        // seller's counter-sign does NOT skipPreview (the buyer's checkout does), so
        // confirm it to proceed with counter-sign + broadcast (the on-chain commit).
        // Accept first approves the seller's bond ("Approving bond…"), THEN opens the
        // agreement sign-preview. Confirm it to counter-sign + broadcast (the commit).
        await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId('preview-confirm').click();
        // ── On-chain truth FIRST: exactly one NEW OrderCommitted for the buyer.
        // (Pattern 14: on a persisted devnet a generic row locator can match a
        // PRIOR run's order — confirm the action by the chain event it lands,
        // then assert THAT exact order's row in the UI.)
        const queryCommitted = () => publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted',
            args: { buyer: BUYER }, fromBlock: 0n,
        });
        await expect.poll(async () => (await queryCommitted()).length, {
            timeout: 60000, message: 'a new OrderCommitted lands on-chain for the buyer',
        }).toBe(committedBefore.length + 1);
        const committedAfter = await queryCommitted();
        const event = committedAfter[committedAfter.length - 1];

        // ── UI reaction: THIS order's row reaches In progress on /orders with NO
        // reload — the live watcher path (regression guard: unstable onLogs refs
        // recreated the wagmi event filter every render, so an in-page commit
        // never surfaced and /orders sat on the empty state until a remount). ──
        const processId = event.args.processId!;
        await expect(
            page.getByTestId(`order-row-${processId}`),
            'the accepted order appears on /orders without a reload',
        ).toBeVisible({ timeout: 30000 });
        await expect(
            page.getByTestId(`order-status-${processId}`),
            'the accepted order shows In progress',
        ).toHaveText('In progress', { timeout: 15000 });
        expect(event.args.seller?.toLowerCase(), 'committed against the bound seller')
            .toBe(SELLER.toLowerCase());
        const receipt = await publicClient.getTransactionReceipt({ hash: event.transactionHash });
        expect(receipt.status, 'the commit transaction succeeded').toBe('success');
        // Surface the event + receipt as the proof artifact (not just a UI pass).
        test.info().annotations.push({
            type: 'OrderCommitted',
            description: `order=${event.args.orderHash} payment=${event.args.payment} cumulativeValue=${event.args.cumulativeValue} tx=${receipt.transactionHash} block=${receipt.blockNumber} gasUsed=${receipt.gasUsed}`,
        });

        // ── Funds actually moved (the real test): buyer↓ buyerBond, seller↓
        //    sellerBond, FigaroCore escrow↑ both. Exact deltas — gas is paid in ETH,
        //    so the payment-token deltas are the bonds only. ──
        const { buyerBond, sellerBond } = calculateBonds(event.args.cumulativeValue!, event.args.payment!);
        const [buyerAfter, sellerAfter, coreAfter] = await Promise.all([
            balanceOf(BUYER), balanceOf(SELLER), balanceOf(core),
        ]);
        expect(buyerBefore - buyerAfter, 'buyer balance decreased by the buyer bond').toBe(buyerBond);
        expect(sellerBefore - sellerAfter, 'seller balance decreased by the seller bond').toBe(sellerBond);
        expect(coreAfter - coreBefore, 'FigaroCore escrow increased by both bonds').toBe(buyerBond + sellerBond);

        const payment = event.args.payment!;

        // ── Buyer resolves the process (BUYER DOMINANCE — only the buyer can call
        //    resolveProcess; atomic). Switch back to the buyer, drive the resolve
        //    capability on the process detail, wait for ProcessResolved. ──
        const resolvedBefore = (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'ProcessResolved', args: { buyer: BUYER }, fromBlock: 0n,
        })).length;
        await gotoAsWallet(page, BUYER, `/orders/view?process=${processId}&e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const resolveBtn = page.getByTestId('capability-execute-resolve-process');
        await resolveBtn.waitFor({ state: 'visible', timeout: 30000 });
        await expect(resolveBtn, 'the buyer can resolve the active process').toBeEnabled({ timeout: 30000 });
        await resolveBtn.click();
        await expect.poll(async () => (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'ProcessResolved', args: { buyer: BUYER }, fromBlock: 0n,
        })).length, { timeout: 60000, message: 'ProcessResolved lands on-chain' }).toBe(resolvedBefore + 1);

        // ── Full-cycle settlement (the real proof): buyer NET −payment, seller NET
        //    +payment, escrow returns to its baseline. The bonds were the mechanism;
        //    the net is the trade. ──
        const [buyerFinal, sellerFinal, coreFinal] = await Promise.all([
            balanceOf(BUYER), balanceOf(SELLER), balanceOf(core),
        ]);
        expect(buyerBefore - buyerFinal, 'buyer net paid exactly the payment').toBe(payment);
        expect(sellerFinal - sellerBefore, 'seller net earned exactly the payment').toBe(payment);
        expect(coreFinal, 'FigaroCore escrow returned to its baseline').toBe(coreBefore);

        // ── Conclude the true Figaro cycle: the audit package surfaces the DOCUMENTS
        //    and the EVENTS for the (now resolved) process — its financial statements
        //    (per seller + consolidated) and the on-chain events (the cash-flow log
        //    of commit + resolve transfers, carried in the consolidated statement). ──
        await page.goto(`/audit/view?process=${processId}&e2e=devnet`, { waitUntil: 'domcontentloaded' });
        await page.getByTestId('audit-page').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        await expect(
            page.getByTestId('financials-view'),
            'the audit package renders the process financials',
        ).toBeVisible({ timeout: 30000 });
        await expect(
            page.getByTestId('document-financial-statements-process'),
            'the consolidated financial statement renders',
        ).toBeVisible({ timeout: 30000 });
        await expect(
            page.locator('[data-testid="document-lines-financial-statements-process"] tbody tr').first(),
            'the on-chain events surface in the cash-flow log',
        ).toBeVisible({ timeout: 30000 });
    });
});
