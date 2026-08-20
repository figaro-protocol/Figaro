/**
 * swap-funded-checkout.devnet.spec.ts
 *
 * THE PAYMENT TOKEN, end to end and UI on both ends. The corrected model
 * (maintainer ruling 2026-07-20): the buyer PICKS the payment token from the
 * seller's accepted array, and the pick IS the process denomination — the
 * commitment records it, both 2× bonds and the payment move in it, and the
 * seller RECEIVES it (and can spend it onward — circulation, not LP demand).
 * Swap-and-commit is the ON-RAMP into that denomination for EITHER party
 * short of it — funding is never the order's denomination.
 *
 * Three passes, each with value legs from the chain (the standing rule),
 * at the devnet venue's 1:1 rate (prices convert identically):
 *
 *  1. THE PICK — buyer holds the accepted token (MPMT), picks it at checkout;
 *     the commit goes DIRECT to the kernel; every leg moves in MPMT; resolve
 *     nets the seller +payment in MPMT.
 *  2. BUYER ON-RAMP — buyer picks MPMT but holds NONE (drained); the funding
 *     panel on-ramps from the default (MOCK) through the coordinator; the
 *     order still denominates, escrows, and settles in MPMT.
 *  3. SELLER ON-RAMP — the buyer pays in MPMT; the seller counter-signs on
 *     /sign funding their 2× bond from MOCK; the accept routes through the
 *     coordinator; the seller's MPMT is untouched at commit.
 *
 * Depends on populate-test-data (clauses + seed assembly + sellers with the
 * MPMT token in acceptedTokens) and the devnet-authoring gate.
 */
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import { createWalletClient, http, parseAbi, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { calculateBonds } from '@figaro-protocol/sdk';
import { localPublicClient, readLocalDeploymentConfig, LOCAL_ANVIL, RPC_URL } from './devnet-helpers';
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

const ERC20_ABI = parseAbi([
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

test.describe('THE PAYMENT TOKEN — the buyer picks the denomination; swap is the on-ramp (devnet)', () => {
    test.setTimeout(300_000);

    const config = readLocalDeploymentConfig();
    const core = config.figaroCore as Hex;
    const defaultToken = config.tokenAddress as Hex;      // MOCK — the seller's default (unit of account)
    const pickedToken = config.permitTokenAddress as Hex; // MPMT — the accepted token under test
    const coordinator = config.witnessSwapAndCommitCoordinator as Hex;
    const publicClient = localPublicClient();
    const balanceOf = (token: Hex, who: Hex) =>
        publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;
    const walletFor = (key: Hex) => createWalletClient({
        account: privateKeyToAccount(key), chain: LOCAL_ANVIL, transport: http(RPC_URL),
    });

    /** Scenario pre-population (NOT the action under test): set the buyer's
     *  picked-token balance — drain to the sink, then mint back up to `floor`.
     *  Idempotent across runs. */
    async function setPickedBalance(floor: bigint) {
        const held = await balanceOf(pickedToken, BUYER);
        const wallet = walletFor(BUYER_KEY);
        if (held > floor) {
            const hash = await wallet.writeContract({
                address: pickedToken, abi: ERC20_ABI, functionName: 'transfer', args: [SINK, held - floor],
            });
            await publicClient.waitForTransactionReceipt({ hash });
        } else if (held < floor) {
            const hash = await wallet.writeContract({
                address: pickedToken, abi: ERC20_ABI, functionName: 'mint', args: [BUYER, floor - held],
            });
            await publicClient.waitForTransactionReceipt({ hash });
        }
    }

    const queryCommitted = () => publicClient.getContractEvents({
        address: core, abi: CORE_ABI, eventName: 'OrderCommitted',
        args: { buyer: BUYER }, fromBlock: 0n,
    });

    /** Buyer leg: browse → cart → checkout → PICK the payment token. Leaves
     *  the page on the checkout with the pick applied. */
    async function buyerPicksPayment(page: Page) {
        await gotoAsWallet(page, BUYER, `/s/view?seller=${SELLER}&e2e=devnet`);
        await page.getByTestId('member-detail-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const addBtn = page.locator('[data-testid^="btn-add-"]').first();
        await addBtn.waitFor({ state: 'visible', timeout: 20000 });
        await addBtn.click();
        await page.getByTestId('btn-review-order').click();
        await page.getByTestId('checkout-view').waitFor({ timeout: 20000 });
        // THE PICK: the seller's accepted array renders as the payment-token
        // choice; picking MPMT re-quotes the totals and becomes the
        // denomination the commitment records.
        await page.getByTestId('payment-token-picker').waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId('payment-token-MPMT').check();
    }

    /** Place the order and relay it over the channel. `expectSwap` asserts the
     *  confirm modal's swap-funded-bond section (the Permit2 leg's maxInput) is
     *  surfaced BEFORE the single approval — the WYSIWYS parity added for the
     *  swap witness; when false, it asserts that section is ABSENT (no swap ⇒ no
     *  swap section). */
    async function placeAndShare(page: Page, { expectSwap = false }: { expectSwap?: boolean } = {}) {
        const place = page.getByTestId('btn-place-order');
        await expect(place, 'buyer connected + order ready → "Place order"')
            .toHaveText(/Place order/, { timeout: 20000 });
        await place.click();
        await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
        if (expectSwap) {
            await expect(page.getByTestId('preview-swap'), 'swap-funded bond surfaced in the confirm').toBeVisible();
            await expect(page.getByTestId('preview-swap-max-input'), 'the authorized maxInput is shown').not.toBeEmpty();
        } else {
            await expect(page.getByTestId('preview-swap'), 'no swap leg ⇒ no swap section').toHaveCount(0);
        }
        await page.getByTestId('preview-confirm').click();
        await page.getByTestId('buyer-share-panel').waitFor({ timeout: 60000 });
        await page.getByTestId('send-commitment-xmtp').click();
        await expect(page.getByTestId('commitment-xmtp-status')).toBeVisible({ timeout: 30000 });
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

    test('the pick IS the committed denomination — direct commit, every leg in the picked token', async ({ page }) => {
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });
        // The buyer holds plenty of the picked token — no on-ramp anywhere.
        await setPickedBalance(1_000n * 10n ** 18n);
        const committedBefore = (await queryCommitted()).length;
        const [buyerPickedBefore, sellerPickedBefore, corePickedBefore] = await Promise.all([
            balanceOf(pickedToken, BUYER), balanceOf(pickedToken, SELLER), balanceOf(pickedToken, core),
        ]);

        await buyerPicksPayment(page);
        await placeAndShare(page);

        // Seller accepts on /orders — their bond approval + pull are in the
        // PICKED token (the commitment's currency), nothing else.
        await gotoAsWallet(page, SELLER, '/orders?e2e=devnet');
        await page.getByTestId('orders-list').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        await page.getByTestId('order-your-turn-card').first().waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId('btn-accept-order').first().click();
        await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId('preview-confirm').click();

        const { event, receipt, payment, buyerBond, sellerBond } = await committedEvent(committedBefore);
        expect(receipt.to?.toLowerCase(), 'no funding leg → the commit goes DIRECT to the kernel')
            .toBe(core.toLowerCase());

        // Value legs at commit — every one in the PICKED token.
        const [buyerPickedAfter, sellerPickedAfter, corePickedAfter] = await Promise.all([
            balanceOf(pickedToken, BUYER), balanceOf(pickedToken, SELLER), balanceOf(pickedToken, core),
        ]);
        expect(buyerPickedBefore - buyerPickedAfter, 'buyer bonded 2× in the picked token').toBe(buyerBond);
        expect(sellerPickedBefore - sellerPickedAfter, 'seller bonded 2× in the picked token').toBe(sellerBond);
        expect(corePickedAfter - corePickedBefore, 'escrow holds both bonds in the picked token').toBe(buyerBond + sellerBond);

        // Resolve (buyer dominance) — the seller is PAID in the picked token:
        // the circulation the accepted array exists for.
        const processId = event.args.processId!;
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

        const [buyerPickedFinal, sellerPickedFinal, corePickedFinal] = await Promise.all([
            balanceOf(pickedToken, BUYER), balanceOf(pickedToken, SELLER), balanceOf(pickedToken, core),
        ]);
        expect(sellerPickedFinal - sellerPickedBefore, 'seller NET RECEIVED the payment in the picked token').toBe(payment);
        expect(buyerPickedBefore - buyerPickedFinal, 'buyer net spent exactly the payment in the picked token').toBe(payment);
        expect(corePickedFinal, 'escrow returned to baseline').toBe(corePickedBefore);
    });

    test('buyer on-ramp — picked-token order funded from the default through the coordinator', async ({ page }) => {
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });
        // The buyer holds NONE of the picked token; they hold the default.
        await setPickedBalance(0n);
        const committedBefore = (await queryCommitted()).length;
        const [buyerDefaultBefore, corePickedBefore] = await Promise.all([
            balanceOf(defaultToken, BUYER), balanceOf(pickedToken, core),
        ]);

        await buyerPicksPayment(page);

        // The funding panel surfaces (insufficient picked-token balance):
        // on-ramp from the DEFAULT into the picked denomination.
        await page.getByTestId('swap-funding-panel').waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId(`funding-token-option-${defaultToken.toLowerCase()}`).click();
        // Permit2 authorization is CONDITIONAL on the persisted chain — a prior
        // run's maxUint256 approval survives (devnet is a mainnet rehearsal, no
        // snapshots), so the button renders only when the allowance is short.
        // Same pattern as the seller on-ramp test below; demanding the button
        // unconditionally fails every re-run after the first.
        const authorize = page.getByTestId('funding-authorize');
        if (await authorize.isVisible().catch(() => false)) {
            await authorize.click();
            await authorize.waitFor({ state: 'hidden', timeout: 30000 });
        }

        // Buyer's swap-funded bond: the confirm surfaces the swap leg (item 1).
        await placeAndShare(page, { expectSwap: true });

        await gotoAsWallet(page, SELLER, '/orders?e2e=devnet');
        await page.getByTestId('orders-list').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        await page.getByTestId('order-your-turn-card').first().waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId('btn-accept-order').first().click();
        await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId('preview-confirm').click();

        const { receipt, buyerBond, sellerBond } = await committedEvent(committedBefore);
        expect(receipt.to?.toLowerCase(), 'the funded payload routed through WitnessSwapAndCommitCoordinator')
            .toBe(coordinator.toLowerCase());

        // Value legs: the buyer paid FROM the default (1:1 venue), the order
        // escrows IN the picked token, and no residue sticks anywhere.
        const [buyerDefaultAfter, buyerPickedAfter, corePickedAfter, coordPicked, coordDefault] = await Promise.all([
            balanceOf(defaultToken, BUYER), balanceOf(pickedToken, BUYER),
            balanceOf(pickedToken, core), balanceOf(pickedToken, coordinator), balanceOf(defaultToken, coordinator),
        ]);
        expect(buyerDefaultBefore - buyerDefaultAfter, 'buyer funded the bond FROM the default token (1:1 quote)').toBe(buyerBond);
        expect(buyerPickedAfter, 'swap proceeds exactly consumed by the kernel pull — funding ≠ denomination').toBe(0n);
        expect(corePickedAfter - corePickedBefore, 'escrow holds both bonds in the PICKED token').toBe(buyerBond + sellerBond);
        expect(coordPicked, 'the coordinator retains no picked token').toBe(0n);
        expect(coordDefault, 'the coordinator retains no default token').toBe(0n);
    });

    test('seller on-ramp — the seller funds their bond from another token at /sign', async ({ page }) => {
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });
        // The buyer pays in the picked token directly; the SELLER on-ramps.
        await setPickedBalance(1_000n * 10n ** 18n);
        const committedBefore = (await queryCommitted()).length;
        const [sellerDefaultBefore, sellerPickedBefore, corePickedBefore] = await Promise.all([
            balanceOf(defaultToken, SELLER), balanceOf(pickedToken, SELLER), balanceOf(pickedToken, core),
        ]);

        await buyerPicksPayment(page);
        await placeAndShare(page);

        // Seller counter-signs on /sign — the channel listener receives the
        // payload; the seller approves the bond, then chooses to FUND it from
        // their default token (their own accepted array; the on-ramp works
        // whether or not they hold the denomination).
        await gotoAsWallet(page, SELLER, '/sign?e2e=devnet');
        await waitForConnected(page);
        await page.getByTestId('agreement-review').waitFor({ state: 'visible', timeout: 60000 });

        // Bond authorization: TokenApprovalFlow auto-completes when the
        // allowance already suffices (prior runs' max approvals) — the click
        // is conditional on the button appearing.
        const counterSign = page.getByTestId('btn-counter-sign');
        const approveBond = page.getByRole('button', { name: /Authorize Payment/ });
        await expect(counterSign.or(approveBond), 'either the authorize step or the counter-sign renders')
            .toBeVisible({ timeout: 60000 });
        if (await approveBond.isVisible()) {
            await approveBond.click();
        }
        // The seller's on-ramp: collapsed by default (the treasury choice —
        // this seller HOLDS the denomination and still opts to bond from the
        // default token); the toggle discloses the panel.
        await page.getByTestId('seller-funding-toggle').click();
        await page.getByTestId('swap-funding-panel').waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId(`funding-token-option-${defaultToken.toLowerCase()}`).click();
        const authorize = page.getByTestId('funding-authorize');
        if (await authorize.isVisible().catch(() => false)) {
            await authorize.click();
            await authorize.waitFor({ state: 'hidden', timeout: 30000 });
        }
        await counterSign.waitFor({ state: 'visible', timeout: 60000 });
        await counterSign.click();
        await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
        // Seller's on-ramp: the confirm surfaces the swap leg's maxInput (item 1).
        await expect(page.getByTestId('preview-swap'), 'swap-funded bond surfaced in the seller confirm').toBeVisible();
        await expect(page.getByTestId('preview-swap-max-input'), 'the authorized maxInput is shown').not.toBeEmpty();
        await page.getByTestId('preview-confirm').click();

        const { receipt, buyerBond, sellerBond } = await committedEvent(committedBefore);
        expect(receipt.to?.toLowerCase(), 'the seller-funded accept routed through WitnessSwapAndCommitCoordinator')
            .toBe(coordinator.toLowerCase());

        // Value legs: the seller's bond came FROM their default token; their
        // picked-token balance is untouched at commit.
        const [sellerDefaultAfter, sellerPickedAfter, corePickedAfter] = await Promise.all([
            balanceOf(defaultToken, SELLER), balanceOf(pickedToken, SELLER), balanceOf(pickedToken, core),
        ]);
        expect(sellerDefaultBefore - sellerDefaultAfter, 'seller funded the bond FROM their default token (1:1 quote)').toBe(sellerBond);
        expect(sellerPickedAfter, 'the seller’s picked-token balance is untouched at commit').toBe(sellerPickedBefore);
        expect(corePickedAfter - corePickedBefore, 'escrow holds both bonds in the PICKED token').toBe(buyerBond + sellerBond);
    });
});
