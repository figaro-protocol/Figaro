/**
 * sign-countersign.devnet.spec.ts
 *
 * The /sign counter-party leg, end to end. A buyer orders from a seller bound
 * to a published assembly and relays the commitment over the coordination
 * channel; the SELLER opens `/sign` (not /orders), where the page's own
 * channel listener receives the payload and renders the SHARED review —
 * the full agreement terms (`AgreementReview`: parties, line items, clauses,
 * hash) plus the Layer-A integrity verdict — BEFORE the party authorizes a
 * bond or signs anything. The seller then authorizes the bond, counter-signs
 * through the same confirm gate every sign uses, and the order commits
 * on-chain with both bonds pulled.
 *
 * Two wallets (the multi-wallet fixture): buyer (anvil[0]) places + relays;
 * seller (anvil[13], "Wizard Test Bakery", bound to the seed assembly). The
 * mock coordination channel (localStorage-backed, same origin) replays the
 * relayed commitment into the seller's /sign listener.
 *
 * Depends on populate-test-data (clauses + seed assembly + sellers) and the
 * `devnet-authoring` gate (sellers-onboarding). Iterate with `--no-deps`
 * once the gate has seeded the chain.
 */
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import { createPublicClient, defineChain, http, parseAbi, type Hex } from 'viem';
import { calculateBonds } from '@figaro/sdk';
import { readLocalDeploymentConfig, waitForConnected } from './devnet-helpers';
import { CORE_ABI } from '@/lib/kernel/contracts';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});

// anvil[13] — the wizard-registered seller, bound to the seed assembly.
const SELLER = '0x1cbd3b2770909d4e10f157cabc84c7264073c9ec' as Hex;
// anvil[0] — the fixture's default buyer.
const BUYER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Hex;

const ERC20_ABI = parseAbi(['function balanceOf(address) view returns (uint256)']);

test.describe('/sign counter-sign — shared review before commit (devnet)', () => {
    test.setTimeout(180_000);

    test('the seller reviews the verified agreement on /sign, counter-signs, and the order commits', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const token = config.tokenAddress as Hex;
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const balanceOf = (who: Hex) =>
            publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;
        // `seller` is NOT indexed in OrderCommitted — filter on the indexed `buyer`.
        const queryCommitted = () => publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted',
            args: { buyer: BUYER }, fromBlock: 0n,
        });
        const committedBefore = await queryCommitted();
        const [buyerBefore, sellerBefore, coreBefore] = await Promise.all([
            balanceOf(BUYER), balanceOf(SELLER), balanceOf(core),
        ]);

        // ── Buyer (anvil[0], the fixture's DEFAULT) — cart → checkout → sign → relay ──
        await page.goto(`/s/view?seller=${SELLER}&e2e=devnet`, { waitUntil: 'domcontentloaded' });
        await page.getByTestId('seller-detail-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const addBtn = page.locator('[data-testid^="btn-add-"]').first();
        await addBtn.waitFor({ state: 'visible', timeout: 20000 });
        await addBtn.click();
        await page.getByTestId('btn-review-order').click();

        await page.getByTestId('checkout-view').waitFor({ timeout: 20000 });
        const place = page.getByTestId('btn-place-order');
        await expect(place, 'buyer connected + order ready → "Place order"')
            .toHaveText(/Place order/, { timeout: 20000 });
        await place.click();
        // The buyer's sign runs through the shared confirm gate (sign intent).
        const buyerModal = page.getByTestId('agreement-preview-modal');
        await buyerModal.waitFor({ state: 'visible', timeout: 30000 });
        await expect(buyerModal, 'the buyer gate words itself as a SIGN review')
            .toContainText('Review before signing');
        await page.getByTestId('preview-confirm').click();
        await page.getByTestId('buyer-share-panel').waitFor({ timeout: 60000 });
        await page.getByTestId('send-commitment-xmtp').click();
        await expect(page.getByTestId('commitment-xmtp-status')).toBeVisible({ timeout: 30000 });

        // ── Seller (anvil[13]) → /sign; the page's channel listener receives ──
        await gotoAsWallet(page, SELLER, '/sign?e2e=devnet');
        await waitForConnected(page);

        // The SHARED review renders the full agreement INLINE — before any
        // authorization or signature: parties, line items, and the hash the
        // signatures bind to. This is the review-before-commit surface.
        const review = page.getByTestId('agreement-review');
        await review.waitFor({ state: 'visible', timeout: 60000 });
        await expect(page.getByTestId('preview-buyer'), 'the buyer party renders in full')
            .toHaveText(new RegExp(BUYER, 'i'));
        await expect(page.getByTestId('preview-seller'), 'the seller party renders in full')
            .toHaveText(new RegExp(SELLER, 'i'));
        await expect(page.getByTestId('preview-line-items'), 'the catalogue line items render')
            .toBeVisible();
        await expect(page.getByTestId('preview-agreement-hash'), 'the signed hash renders beside the terms')
            .toHaveText(/^0x[0-9a-f]{64}$/i);
        // Layer A over the relayed payload: the inline agreement recomputes to
        // the signed agreementHash and conforms to its clause specs.
        await expect(page.getByTestId('sign-agreement-verified'), 'the relayed terms verify against the signed hash')
            .toBeVisible();
        await expect(page.getByTestId('sign-agreement-invalid')).toHaveCount(0);

        // ── Authorize the seller bond, then counter-sign through the gate.
        //    TokenApprovalFlow auto-completes when the allowance already
        //    suffices (it renders no button and flips approvalDone), so the
        //    authorize click is conditional on the button appearing. ──
        const counterSign = page.getByTestId('btn-counter-sign');
        const authorize = page.getByRole('button', { name: /Authorize Payment/ });
        await expect(counterSign.or(authorize), 'either the authorize step or the counter-sign renders')
            .toBeVisible({ timeout: 60000 });
        if (await authorize.isVisible()) {
            await authorize.click();
        }
        await counterSign.waitFor({ state: 'visible', timeout: 60000 });
        await counterSign.click();
        const sellerModal = page.getByTestId('agreement-preview-modal');
        await sellerModal.waitFor({ state: 'visible', timeout: 30000 });
        await expect(sellerModal, 'the seller gate words itself as a SIGN review')
            .toContainText('Review before signing');
        await page.getByTestId('preview-confirm').click();

        // ── On-chain truth: exactly one NEW OrderCommitted for the buyer ──
        await expect.poll(async () => (await queryCommitted()).length, {
            timeout: 60000, message: 'a new OrderCommitted lands on-chain for the buyer',
        }).toBe(committedBefore.length + 1);
        const committedAfter = await queryCommitted();
        const event = committedAfter[committedAfter.length - 1];
        expect(event.args.seller?.toLowerCase(), 'committed against the bound seller')
            .toBe(SELLER.toLowerCase());
        const receipt = await publicClient.getTransactionReceipt({ hash: event.transactionHash });
        expect(receipt.status, 'the commit transaction succeeded').toBe('success');
        test.info().annotations.push({
            type: 'OrderCommitted',
            description: `order=${event.args.orderHash} payment=${event.args.payment} cumulativeValue=${event.args.cumulativeValue} tx=${receipt.transactionHash} block=${receipt.blockNumber} gasUsed=${receipt.gasUsed}`,
        });

        // ── UI reaction on the SAME page: /sign reaches its success state ──
        await expect(page.getByText('Commitment submitted on-chain.'), 'the /sign page confirms the commit')
            .toBeVisible({ timeout: 30000 });

        // ── Money legs (the real test): buyer↓ buyerBond, seller↓ sellerBond,
        //    FigaroCore escrow↑ both. Exact deltas — gas is ETH, so the
        //    payment-token deltas are the bonds only. ──
        const { buyerBond, sellerBond } = calculateBonds(event.args.cumulativeValue!, event.args.payment!);
        const [buyerAfter, sellerAfter, coreAfter] = await Promise.all([
            balanceOf(BUYER), balanceOf(SELLER), balanceOf(core),
        ]);
        expect(buyerBefore - buyerAfter, 'buyer balance decreased by the buyer bond').toBe(buyerBond);
        expect(sellerBefore - sellerAfter, 'seller balance decreased by the seller bond').toBe(sellerBond);
        expect(coreAfter - coreBefore, 'FigaroCore escrow increased by both bonds').toBe(buyerBond + sellerBond);
    });
});
