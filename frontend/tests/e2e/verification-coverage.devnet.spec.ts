/**
 * verification-coverage.devnet.spec.ts — the block-8 coverage gaps, one walk:
 *
 *   revert   → the KERNEL ERROR PATH through the UI: after an order commits,
 *              the same offer counter-signed again must surface the kernel's
 *              typed revert (DuplicateCommitment → "This commitment has
 *              already been submitted") on /sign — an error the user reads,
 *              never a silent failure or a raw hex revert
 *   evidence → /evidence-display, the forum-agnostic public reader: given
 *              only URL params (processId, chainID, coreAddress) it renders
 *              the process's on-chain timeline — the commit and the runtime
 *              attestation this walk produced
 *   verify   → the /audit hash verifier's uncovered modes: B (section-leaf
 *              recompute matches the SDK's own computeSectionLeaf) and C
 *              (hash search resolves the REAL committed agreementHash to its
 *              OrderCommitted anchor, and a junk hash reports no-hits — not
 *              a false match)
 *
 * The producing flow is the minimal seed-assembly trade (buyer anvil[0] ↔
 * the wizard seller, registered by the devnet-authoring gate); the rungs
 * consume ONLY what that flow put on-chain. Money-legs rule: the bond lock
 * is asserted at commit (rung precedent — no resolve; full-cycle settlement
 * is permissionless-clause's assertion).
 *
 * Requires Anvil + ./scripts/deploy-local.sh + populate-test-data + Kubo + :3100.
 */
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import { createPublicClient, defineChain, http, parseAbi, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { readLocalDeploymentConfig } from './devnet-helpers';
import { ANVIL_KEYS } from '../anvilAccounts';
import { CORE_ABI } from '@/lib/kernel/contracts';
import { calculateBonds, computeSectionLeaf } from '@figaro/sdk';
import type { Page } from '@playwright/test';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});
const ERC20_ABI = parseAbi(['function balanceOf(address) view returns (uint256)']);

const BUYER = privateKeyToAccount(ANVIL_KEYS[0] as Hex).address; // anvil[0] — the fixture default buyer
// The wizard seller the devnet-authoring gate registers (anvil[13]), bound
// to the seed assembly — the same producing pair the payment-token specs use.
const SELLER = '0x1cbd3b2770909d4e10f157cabc84c7264073c9ec' as Hex;

async function waitForConnected(page: Page) {
    await page.waitForFunction(
        () => !Array.from(document.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Connect Wallet'),
        null,
        { timeout: 30000 },
    );
}

test.describe('VERIFICATION COVERAGE — kernel-revert path, evidence reader, verifier modes B/C (devnet)', () => {
    test.setTimeout(300_000);

    test('one trade feeds all three rungs: typed revert on re-submit, the public evidence timeline, and both verifier modes', async ({ page }) => {
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });

        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const token = config.tokenAddress as Hex;
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const balanceOf = (who: Hex) =>
            publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;

        // ── The producing trade: buyer orders from the wizard seller's seed
        //    assembly, places, relays; the seller accepts. ──
        const queryCommitted = () => publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: BUYER }, fromBlock: 0n,
        });
        const committedBefore = (await queryCommitted()).length;
        const [buyerBefore, sellerBefore, coreBefore] = await Promise.all([
            balanceOf(BUYER), balanceOf(SELLER), balanceOf(core),
        ]);

        await gotoAsWallet(page, BUYER, `/s/view?seller=${SELLER}&e2e=devnet`);
        await page.getByTestId('seller-detail-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const addBtn = page.locator('[data-testid^="btn-add-"]').first();
        await addBtn.waitFor({ state: 'visible', timeout: 20000 });
        await addBtn.click();
        await page.getByTestId('btn-review-order').click();
        await page.getByTestId('checkout-view').waitFor({ timeout: 20000 });
        const place = page.getByTestId('btn-place-order');
        await expect(place, 'buyer connected + order ready → "Place order"').toHaveText(/Place order/, { timeout: 20000 });
        await place.click();
        await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId('preview-confirm').click();
        await page.getByTestId('buyer-share-panel').waitFor({ timeout: 60000 });
        await page.getByTestId('send-commitment-xmtp').click();
        await expect(page.getByTestId('commitment-xmtp-status')).toBeVisible({ timeout: 30000 });

        await gotoAsWallet(page, SELLER, '/orders?e2e=devnet');
        await page.getByTestId('orders-list').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        await page.getByTestId('order-your-turn-card').first().waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId('btn-accept-order').first().click();
        await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId('preview-confirm').click();

        await expect.poll(async () => (await queryCommitted()).length, {
            timeout: 60000, message: 'the trade lands OrderCommitted on-chain',
        }).toBe(committedBefore + 1);
        const committed = await queryCommitted();
        const event = committed[committed.length - 1];
        const processId = event.args.processId! as Hex;
        const agreementHash = event.args.agreementHash! as Hex;

        // Money leg — the bond lock, read from the token contract.
        const { buyerBond, sellerBond } = calculateBonds(event.args.cumulativeValue!, event.args.payment!);
        const [buyerAfter, sellerAfter, coreAfter] = await Promise.all([
            balanceOf(BUYER), balanceOf(SELLER), balanceOf(core),
        ]);
        expect(buyerBefore - buyerAfter, 'buyer bonded 2× payment').toBe(buyerBond);
        expect(sellerBefore - sellerAfter, 'seller bonded 2× cumulative value').toBe(sellerBond);
        expect(coreAfter - coreBefore, 'escrow holds both bonds').toBe(buyerBond + sellerBond);

        // ── RUNG 1 — the KERNEL ERROR PATH: the mock channel still carries
        //    the buyer-signed offer; the seller re-opens /sign, the payload
        //    replays, and counter-signing it AGAIN must surface a TYPED kernel
        //    revert as readable copy — never a raw hex revert. This seed order
        //    is a ROOT (it creates the process), so re-committing throws
        //    ProcessAlreadyExists → "Process ID already exists" (a sub-order
        //    re-commit would throw DuplicateCommitment instead; either way the
        //    point is the DECODED, readable form). ──
        await gotoAsWallet(page, SELLER, '/sign?e2e=devnet');
        await waitForConnected(page);
        await page.getByTestId('agreement-review').waitFor({ state: 'visible', timeout: 60000 });
        const counterSign = page.getByTestId('btn-counter-sign');
        const approveBond = page.getByRole('button', { name: /Authorize Payment/ });
        await expect(counterSign.or(approveBond), 'the counter-sign surface renders for the replayed offer')
            .toBeVisible({ timeout: 60000 });
        if (await approveBond.isVisible()) {
            await approveBond.click();
        }
        await counterSign.waitFor({ state: 'visible', timeout: 60000 });
        await counterSign.click();
        const previewModal = page.getByTestId('agreement-preview-modal');
        if (await previewModal.isVisible({ timeout: 5000 }).catch(() => false)) {
            await page.getByTestId('preview-confirm').click();
        }
        await expect(
            page.getByTestId('sign-error'),
            "the kernel's typed revert surfaces as decoded, readable copy — not a raw hex revert",
        ).toContainText(/already exists|already been submitted/i, { timeout: 60000 });

        // ── RUNG 2 — the PUBLIC EVIDENCE READER: the forum-iframe contract.
        //    URL params ALONE (processId, chainID, coreAddress — no wallet,
        //    no app state) must render the process's on-chain timeline. This
        //    is the untested surface: /evidence-display is reachable by a
        //    forum iframe or a stranger's URL, and nothing e2e proved it
        //    reads the chain from params. The seed trade is a single node
        //    with no runtime ladder, so the committed event IS the timeline. ──
        // arbitrableJsonRpcUrl is REQUIRED (the page errors without it —
        // its own header calls it "optional", a doc/behavior mismatch): the
        // reader connects to whatever chain the forum names, so the RPC is
        // part of the URL contract.
        await page.goto(
            `/evidence-display?processId=${processId}&chainID=31337&coreAddress=${core}` +
            `&arbitrableJsonRpcUrl=${encodeURIComponent(RPC_URL)}&e2e=devnet`,
            { waitUntil: 'domcontentloaded' },
        );
        await expect(
            page.getByRole('heading', { name: 'Figaro Process Timeline' }),
            'the forum-iframe reader renders the process timeline from URL params alone',
        ).toBeVisible({ timeout: 30000 });
        // The page humanizes event names — "Order Committed", not the raw
        // event symbol — sourced from the on-chain FigaroCore events.
        await expect(
            page.getByText('Order Committed').first(),
            'the committed event renders on the public timeline',
        ).toBeVisible({ timeout: 30000 });

        // ── RUNG 3 — the HASH VERIFIER, modes B + C. ──
        await gotoAsWallet(page, BUYER, '/audit?e2e=devnet');
        await page.getByTestId('verify-page').waitFor({ timeout: 30000 });
        await waitForConnected(page);

        // Mode B — section-leaf recompute: the page's computation must equal
        // the SDK's own computeSectionLeaf for the same section.
        // version is part of the leaf (keccak over computeClauseKey(clause,
        // version) ++ data hash) — the pasted JSON must carry it, or the
        // page recomputes a different leaf.
        const section = { clause: 'figaro-topology', version: 1, data: { parentOrderHashes: [] as string[] } };
        const expectedLeaf = computeSectionLeaf(section);
        await page.getByTestId('verify-mode-section').click();
        await page.getByTestId('verify-section-mode').waitFor({ state: 'visible', timeout: 10000 });
        await page.getByTestId('verify-section-input').fill(JSON.stringify(section));
        await page.getByTestId('verify-section-expected').fill(expectedLeaf);
        await expect(page.getByTestId('verify-result-computed'), 'the page recomputes the SDK leaf')
            .toHaveText(expectedLeaf, { timeout: 10000 });
        await expect(page.getByTestId('verify-result-status'), 'expected vs computed reports a MATCH')
            .toContainText(/match/i, { timeout: 10000 });

        // Mode C — hash search: the REAL committed agreementHash resolves to
        // its OrderCommitted anchor; junk reports no-hits, never a false match.
        await page.getByTestId('verify-mode-search').click();
        await page.getByTestId('verify-search-mode').waitFor({ state: 'visible', timeout: 10000 });
        await page.getByTestId('verify-search-input').fill(agreementHash);
        await expect(page.getByTestId('verify-search-hit-0'), 'the agreementHash resolves to its on-chain anchor')
            .toContainText(/agreementHash/i, { timeout: 30000 });
        await page.getByTestId('verify-search-input').fill('0x' + 'ab'.repeat(32));
        await expect(page.getByTestId('verify-search-no-hits'), 'a junk hash reports no-hits — no false match')
            .toBeVisible({ timeout: 10000 });
    });
});
