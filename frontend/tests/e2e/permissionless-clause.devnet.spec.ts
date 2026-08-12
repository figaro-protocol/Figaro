/**
 * permissionless-clause.devnet.spec.ts — THE acceptance test (clean rewrite).
 *
 * The single definition of "green" for the open-world claim: a clause that NO
 * code in this repo has ever heard of must flow through the WHOLE pipeline with
 * ZERO code changes —
 *
 *   drawer   → the event-driven designer drawer surfaces it (read from the live
 *              ClauseRegistry → IPFS, never a bundled list)
 *   encode   → composing it into an assembly carries its section into the
 *              published agreement
 *   commit   → a real bilateral order commits that agreement on-chain
 *   runtime  → the order's seller advances the clause's lifecycle through the
 *              ONE generic capability rail (no clause named in the page)
 *   audit    → fed from network state (indexer events + IPFS), the audit package
 *              surfaces the whole lifecycle: EVERY committed leaf's value (commerce,
 *              topology, AND the never-seen clause, each labelled from its spec), the
 *              seller's runtime ATTESTATION (stage label + attester, from the event
 *              log), and a hash verifier that recomputes the merkle root over all
 *              leaves to match the on-chain agreementHash — the whole tree, tied to chain
 *
 * The prior version of this test (and its helpers) was deleted in 3b26329 /
 * 063c517 because it was coupled to closed-world scenario apparatus (pre-computed
 * slugs, UI-bypassing place/accept shortcuts). This rewrite imports NONE of that:
 * it drives the REAL UI end to end, exactly as orders-accept /
 * sellers-onboarding do, and the only non-UI step is the documented permissionless
 * clause registration (ClauseRegistry.registerClause — a single contentHash +
 * metadata URI, NO merkle tree, NO per-clause validator, no on-chain content
 * validation) — network seeding, the same path the protocol's own clauses use,
 * NOT a bypass. That a never-seen clause attests with zero per-clause on-chain
 * code IS the open-world property, now structural: there is no validator to register.
 *
 * Self-contained: registers its OWN novel clause, authors + publishes its OWN
 * assembly, onboards its OWN seller (anvil[14], shared only with rate-pricing —
 * both onboard it idempotently and neither depends on the other's state). It does
 * NOT snapshot/revert — devnet is a mainnet rehearsal, so it leaves its state
 * on-chain and a per-run nonce (minted below) keeps every clause and assembly unique.
 *
 * Requires Anvil + ./scripts/deploy-local.sh + Kubo + the dev server (:3100).
 */
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import {
    createPublicClient, defineChain, http, parseAbi, type Hex,
} from 'viem';
import { privateKeyToAccount, mnemonicToAccount } from 'viem/accounts';
import { readLocalDeploymentConfig, assertPinnedInIpfs } from './devnet-helpers';
import { makeProbeSpec, makeProbeWitnessSpec, registerProbeClause } from './probeAssembly';
import { ANVIL_KEYS } from '../anvilAccounts';
import { CORE_ABI } from '@/lib/kernel/contracts';
import { calculateBonds } from '@figaro/sdk';
import type { Page } from '@playwright/test';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});
const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';

// ── The novel clause — a runtime-attestable lifecycle with one enum ladder, a
//    name NOTHING in this repo knows. Modeled on the SHAPE of a merchant-process
//    clause, but never registered, never bundled.
//
//    The id + title carry a per-run nonce (minted INSIDE the test, below) so each
//    run certifies a genuinely never-seen clause AND the run's composition
//    identity (compositionHash → asm-<hash> slug) is unique. The test leaves its
//    state on-chain (no revert — devnet is a mainnet rehearsal), so a FIXED
//    id/content would collide with a prior run's first-write-wins registration
//    on every re-run and every Playwright retry (registerAssembly reverts:
//    composition already anchored). ──
const NOVEL_FIRST_STAGE_LABEL = 'Probe opened';

// The probe clause spec + its permissionless registration are shared with the
// other publish specs in `./probeAssembly` (makeProbeSpec / registerProbeClause):
// a runtime-attestable lifecycle clause carrying only `block.design.article` —
// runtime-attestability is DERIVED from its enum ladder, not declared.

const ERC20_ABI = parseAbi(['function balanceOf(address) view returns (uint256)']);

const BUYER = privateKeyToAccount(ANVIL_KEYS[0] as Hex).address; // anvil[0] — buyer + author + registrar
const seller = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 14 }); // anvil[14] — shared only with rate-pricing (both self-establish idempotently)
const SELLER = seller.address;

/** Wait for ClientInit's devnet auto-connect (the "Connect Wallet" button goes). */
async function waitForConnected(page: Page) {
    await page.waitForFunction(
        () => !Array.from(document.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Connect Wallet'),
        null,
        { timeout: 30000 },
    );
}

test.describe('PERMISSIONLESS CLAUSE — the definition of green (devnet)', () => {
    test.setTimeout(360_000);

    // No evmSnapshot/evmRevert: devnet is a mainnet REHEARSAL — the run leaves its
    // state on-chain + in IPFS so it can be verified OUT-OF-BAND, never only from the
    // test's own assertions. Modeled on orders-accept.devnet.spec.ts.
    test('a never-seen clause flows drawer → encode → commit → runtime attest → audit with zero code changes', async ({ page }) => {
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });

        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const token = config.tokenAddress as Hex;
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        // Per-RUN (per-attempt) nonce: makes this run's clause id + assembly content
        // unique, so the content-addressed slug never collides with a prior run's or
        // a prior retry's first-write-wins registration on the persistent devnet.
        const runNonce = `${Date.now()}`;
        const NOVEL_CLAUSE_ID = `figaro-probe-attest-${runNonce}`;
        const NOVEL_TITLE = `Probe attestation (acceptance test) ${runNonce}`;
        const NOVEL_SPEC = makeProbeSpec(NOVEL_CLAUSE_ID, NOVEL_TITLE);
        // A SECOND never-seen clause, declaring a WITNESS stage (spec.stages[1])
        // — certifies the feedback loop's open-world property: the rail's form,
        // the filing, and the audit's decode all derive from the declaration.
        const WITNESS_CLAUSE_ID = `figaro-probe-witness-${runNonce}`;
        const WITNESS_TITLE = `Probe witness (feedback loop) ${runNonce}`;
        const WITNESS_SPEC = makeProbeWitnessSpec(WITNESS_CLAUSE_ID, WITNESS_TITLE);

        // ── SETUP: register the novel clauses permissionlessly (no UI for clause
        //    registration exists — this is the documented registration path; no
        //    validator to bind, the chain validates no clause content) ──
        await registerProbeClause(NOVEL_CLAUSE_ID, NOVEL_SPEC);
        await registerProbeClause(WITNESS_CLAUSE_ID, WITNESS_SPEC);

        // ── DRAWER: author an assembly carrying the novel clause, via the REAL
        //    designer. The clause appears ONLY because the drawer read it from
        //    the live registry → IPFS (event-driven, zero code change). ──
        await page.addInitScript(() => {
            try {
                window.localStorage.removeItem('figaro:designer:current');
                window.localStorage.removeItem('figaro:designer:drafts');
            } catch { /* noop */ }
        });
        await page.goto('/assemblies/designer/new?fresh=1&e2e=devnet', { waitUntil: 'domcontentloaded' });
        await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
        await page.getByTestId('designer-saved-hint').waitFor({ timeout: 15000 });

        const rootNode = page.locator('[data-testid^="order-node-"]:not([data-testid$="-delete"])').first();
        await rootNode.waitFor({ state: 'visible', timeout: 10000 });
        await rootNode.click();
        await page.getByTestId('agreement-drawer').waitFor({ state: 'visible', timeout: 10000 });
        await page.getByTestId('drawer-tab-registry').click();
        await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });
        const novel = page.getByTestId(`drawer-registry-clause-${NOVEL_CLAUSE_ID}`);
        await expect(
            novel,
            'the drawer surfaces the NEVER-SEEN clause from the live registry (drawer leg)',
        ).toHaveCount(1, { timeout: 20000 });
        await novel.check();
        // Compose the never-seen WITNESS clause beside it and fill its committed
        // policy — the required scalar the drawer captures at design time.
        const witnessNovel = page.getByTestId(`drawer-registry-clause-${WITNESS_CLAUSE_ID}`);
        await expect(
            witnessNovel,
            'the drawer surfaces the never-seen WITNESS clause from the live registry',
        ).toHaveCount(1, { timeout: 20000 });
        await witnessNovel.check();
        // Design time is STRUCTURAL (ruled 2026-07-14): the never-seen clause
        // is SELECTED here; its required committed policy — a transaction
        // particular — is authored by the buyer at checkout, proving the
        // open-world path end to end under the same rule as every clause.

        const assemblyName = `Probe assembly ${Date.now()}`;
        await page.getByTestId('designer-name-input').fill(assemblyName);
        await page.getByTestId('designer-summary-input').fill('Acceptance probe: a never-seen clause end to end.');
        await page.getByTestId('designer-description-input').fill('Single-node assembly carrying figaro-probe-attest — the open-world certification.');
        await expect(page.getByTestId('designer-review')).toBeEnabled({ timeout: 5000 });
        await page.getByTestId('designer-review').click();

        await page.waitForURL(/\/assemblies\/designer\/view\?slug=asm-/, { timeout: 15000 });
        const handle = page.url().match(/[?&]slug=(asm-[a-z0-9-]+)/)?.[1];
        expect(handle, 'review navigated to a draft handle').toBeTruthy();
        await page.goto(`/assemblies/designer/view?slug=${handle}&intent=publish&e2e=devnet`, { waitUntil: 'domcontentloaded' });
        const confirmBtn = page.getByTestId('review-confirm-publish');
        await confirmBtn.waitFor({ state: 'visible', timeout: 15000 });
        await waitForConnected(page);
        await confirmBtn.click();
        await page.getByTestId('assembly-publish-receipt').waitFor({ timeout: 60000 });
        const slug = (await page.getByTestId('receipt-slug').textContent())?.trim();
        expect(slug, 'publish receipt shows the content slug').toMatch(/^asm-/);

        // ── PUBLIC INVENTORY: the freshly-published assembly is discoverable on the
        //    public /assemblies inventory (on-chain AssemblyRegistered → standalone
        //    indexer → render), adoptable by any reader exactly as on mainnet. This
        //    closes the author → IPFS pin → AssemblyRegistered → visible round-trip. ──
        await page.goto('/assemblies?e2e=devnet', { waitUntil: 'domcontentloaded' });
        await expect(page.locator(`#assembly-${slug}`)).toBeVisible({ timeout: 30000 });

        // ── BIND: onboard anvil[14] as a seller through the REAL wizard, binding
        //    the novel assembly. (No code knows this clause; the seller binds the
        //    assembly the same way it would any other.) ──
        await gotoAsWallet(page, SELLER, '/members');
        await page.goto('/members/identity', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#profile-name')).toBeVisible({ timeout: 30000 });
        await page.locator('#profile-name').fill('Probe Seller');
        await page.locator('#profile-specialty').fill('acceptance probe');
        await page.locator('#profile-geohash').fill('9q8yyk8yu');
        await page.getByRole('button', { name: /\+ MOCK$/ }).click();
        await page.locator('input[name="defaultTokenAddress"]').first().check();
        await page.getByRole('button', { name: /^Next/ }).click();
        await expect(page).toHaveURL(/\/members\/catalogue/);

        await page.locator('[id^="item-"][id$="-name"]').first().fill('Probe item');
        await page.locator('[id^="item-"][id$="-price"]').first().fill('1');
        await page.getByRole('button', { name: /^Next/ }).click();
        await expect(page).toHaveURL(/\/members\/assemblies/);

        // Bind MY novel assembly (by its unique name), not whatever is first.
        const myRow = page.locator('[data-testid^="seller-assembly-row-"]').filter({ hasText: assemblyName });
        await myRow.first().waitFor({ state: 'visible', timeout: 30000 });
        await myRow.first().locator('input[type="checkbox"]').first().check();
        await page.getByRole('button', { name: /^Next/ }).click();
        await expect(page).toHaveURL(/\/members\/buyer/);
        await page.getByRole('button', { name: /^Next/ }).click();
        await expect(page).toHaveURL(/\/members\/agents/);
        await page.getByRole('button', { name: /^Next/ }).click();
        await expect(page).toHaveURL(/\/members\/endpoints/);
        await page.getByRole('button', { name: /^Next/ }).click();
        await page.waitForURL(/\/members\/review/, { timeout: 30000 });
        await page.getByTestId('review-confirm-publish').click();
        await expect(page.getByRole('heading', { name: /Registered\.|Profile updated/i })).toBeVisible({ timeout: 60000 });

        // ── COMMIT: the buyer (anvil[0]) orders from the seller, signs, relays ──
        const committedBefore = (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: BUYER }, fromBlock: 0n,
        })).length;
        // Bond-escrow baseline in the payment token, captured BEFORE the commit pulls
        // bonds. The deltas (not absolutes) are asserted, so this is robust to any
        // residue a prior run left on the persistent devnet.
        const balanceOf = (who: Hex) =>
            publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;
        const [buyerBefore, sellerBefore, coreBefore] = await Promise.all([
            balanceOf(BUYER), balanceOf(SELLER), balanceOf(core),
        ]);
        // Switch the active wallet BACK to the buyer. The seller-onboarding above
        // left a persistent `__FIGARO_SWITCH_ACCOUNT__(SELLER)` init script (gotoAsWallet
        // registers one that re-fires on EVERY navigation) — a plain goto here would
        // place the order as anvil[14] (a self-deal), so the buyer's approval never runs
        // for anvil[0] and `OrderCommitted{buyer: anvil[0]}` never lands. gotoAsWallet(BUYER)
        // registers a later switch-script that wins, mounting wagmi as the buyer.
        await gotoAsWallet(page, BUYER, `/s/view?seller=${SELLER}&e2e=devnet`);
        await page.getByTestId('member-detail-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const addBtn = page.locator('[data-testid^="btn-add-"]').first();
        await addBtn.waitFor({ state: 'visible', timeout: 20000 });
        await addBtn.click();
        await page.getByTestId('btn-review-order').click();
        await page.getByTestId('checkout-view').waitFor({ timeout: 20000 });
        // The NEVER-SEEN witness clause's required committed policy is filled
        // on the generic checkout fill surface — spec-routed, zero per-clause
        // code (templates arrive value-free by construction).
        await page.locator(`[data-testid^="checkout-field-"][data-testid$="-${WITNESS_CLAUSE_ID}-probePolicy"]`).first()
            .fill('probe-policy-token');
        const place = page.getByTestId('btn-place-order');
        await expect(place, 'buyer connected + order ready → "Place order"').toHaveText(/Place order/, { timeout: 20000 });
        await place.click();
        // The buyer confirms the agreement in the SAME pre-sign gate the seller's
        // accept uses — there is no checkout-only bypass.
        await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId('preview-confirm').click();
        await page.getByTestId('buyer-share-panel').waitFor({ timeout: 60000 });
        await page.getByTestId('send-commitment-xmtp').click();
        await expect(page.getByTestId('commitment-xmtp-status')).toBeVisible({ timeout: 30000 });

        // ── BUYER ORDERS LIST — AWAITING ACCEPTANCE: the commitment is relayed over
        //    the coordination channel but NOT yet on-chain, so the buyer's /orders
        //    list shows it under "Awaiting acceptance" (the outbound,
        //    awaitsCounterpartySignature view). This is the SAME relayed pending
        //    commitment the seller sees as "Your turn" in the accept leg below —
        //    buyer-outbound and seller-incoming are two reads of ONE off-chain
        //    payload, the pre-commit half of the actor-neutral list. It exists only
        //    in this window: once OrderCommitted lands, notCommitted() drops it. ──
        await gotoAsWallet(page, BUYER, '/orders?e2e=devnet');
        await page.getByTestId('orders-list').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        await expect(
            page.getByTestId('orders-pending-section'),
            'the buyer sees the relayed-but-uncommitted order under "Awaiting acceptance"',
        ).toBeVisible({ timeout: 30000 });
        await expect(
            page.getByTestId('order-pending-row').first(),
            'the buyer-outbound pending row renders (the same payload the seller accepts below)',
        ).toBeVisible({ timeout: 15000 });

        // ── ACCEPT: the seller accepts on /orders → counter-sign → commit ──
        await gotoAsWallet(page, SELLER, '/orders?e2e=devnet');
        await page.getByTestId('orders-list').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        await page.getByTestId('order-your-turn-card').first().waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId('btn-accept-order').first().click();
        await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId('preview-confirm').click();

        const queryCommitted = () => publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: BUYER }, fromBlock: 0n,
        });
        await expect.poll(async () => (await queryCommitted()).length, {
            timeout: 60000, message: 'a new OrderCommitted lands on-chain',
        }).toBe(committedBefore + 1);
        const committed = await queryCommitted();
        const event = committed[committed.length - 1];
        expect(event.args.seller?.toLowerCase(), 'committed against the novel-assembly seller').toBe(SELLER.toLowerCase());
        const processId = event.args.processId!;
        const payment = event.args.payment!;
        const receipt = await publicClient.getTransactionReceipt({ hash: event.transactionHash });
        expect(receipt.status, 'the commit transaction succeeded').toBe('success');

        // ── Funds actually moved (the real test): buyer↓ buyerBond, seller↓ sellerBond,
        //    FigaroCore escrow↑ both. Gas is paid in ETH, so the payment-token deltas
        //    are the bonds only — the asymmetric-bonding mechanism, on-chain. ──
        const { buyerBond, sellerBond } = calculateBonds(event.args.cumulativeValue!, payment);
        const [buyerAfter, sellerAfter, coreAfter] = await Promise.all([
            balanceOf(BUYER), balanceOf(SELLER), balanceOf(core),
        ]);
        expect(buyerBefore - buyerAfter, 'buyer balance decreased by the buyer bond').toBe(buyerBond);
        expect(sellerBefore - sellerAfter, 'seller balance decreased by the seller bond').toBe(sellerBond);
        expect(coreAfter - coreBefore, 'FigaroCore escrow increased by both bonds').toBe(buyerBond + sellerBond);

        // ── RUNTIME ATTEST (the make-or-break leg): the seller advances the
        //    NOVEL clause's lifecycle through the ONE generic capability rail.
        //    If the runtime engine is clause-agnostic, a capability for a clause
        //    no code knows surfaces here with NO edit to the order page. ──
        await gotoAsWallet(page, SELLER, `/orders/view?process=${processId}&e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const attest = page.getByTestId('capability-execute-submit-clause-attestation').first();
        await expect(
            attest,
            'the runtime surfaces a generic attest capability for the NEVER-SEEN clause (runtime leg)',
        ).toBeVisible({ timeout: 30000 });
        await expect(attest).toBeEnabled({ timeout: 30000 });
        await attest.click();

        // The novel clause's first stage, labelled STRAIGHT from its spec, must
        // surface on the TIMELINE after the attestation lands. Scope to the timeline
        // list (`order-timeline`) — the capability rail also renders the stage label
        // ('Probe opened' on both its card and its execute button), so an unscoped
        // getByText is ambiguous (strict-mode: 2+ matches) until the rail advances.
        await expect(
            page.getByTestId('order-timeline').getByText(NOVEL_FIRST_STAGE_LABEL),
            'the novel clause attestation renders on the timeline, its label read from the spec',
        ).toBeVisible({ timeout: 60000 });

        // ── WITNESS (the feedback loop's open-world certification): the
        //    never-seen witness clause DECLARED spec.stages[1], so the rail
        //    derives its capability, renders its form from the declared
        //    fields, and files the record — zero per-clause code anywhere. ──
        const witnessCap = page.locator(
            `[data-testid="capability-submit-clause-attestation"][data-clause-id="${WITNESS_CLAUSE_ID}"]`,
        );
        await expect(
            witnessCap,
            "the rail derives the never-seen clause's witness capability from its declaration",
        ).toBeVisible({ timeout: 30000 });
        await page.getByTestId(`capability-input-${WITNESS_CLAUSE_ID}-probeReading`).fill('42');
        await witnessCap.getByTestId('capability-execute-submit-clause-attestation').click();
        const witnessRow = page.getByTestId('timeline-event-stage-1').first();
        await expect(
            witnessRow,
            'the witness attestation lands on the timeline',
        ).toBeVisible({ timeout: 60000 });
        await expect(witnessRow, 'the row is labelled by the never-seen spec title')
            .toContainText(WITNESS_TITLE);
        await expect(
            witnessCap,
            'the witness capability remains offered (repeatable while the order is active)',
        ).toBeVisible({ timeout: 15000 });

        // ── BUYER ORDERS LIST — IN PROGRESS: before resolving, the buyer reads the
        //    actor-neutral /orders list. It is event-driven: useWalletProcessRows
        //    reads the OrderCommitted/OrderResolved EVENT logs through the indexer
        //    query layer (lib/kernel/indexer.ts), the SAME events the seller's list
        //    reads — there is NO separate buyer/seller inbox. The committed-but-
        //    unresolved process shows under "In progress", labelled from its state. ──
        await gotoAsWallet(page, BUYER, '/orders?e2e=devnet');
        await page.getByTestId('orders-list').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        await expect(
            page.getByTestId('orders-active-section').getByTestId(`order-row-${processId}`),
            'the buyer sees the committed process under "In progress"',
        ).toBeVisible({ timeout: 30000 });
        await expect(
            page.getByTestId(`order-status-${processId}`),
            "the buyer's in-progress row is labelled In progress",
        ).toHaveText(/In progress/, { timeout: 15000 });

        // ── RESOLVE: the buyer resolves atomically ──
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

        // ── Full-cycle settlement (the real proof, the whole reason for the protocol):
        //    buyer NET −payment, seller NET +payment, escrow returns to its baseline.
        //    The bonds were the mechanism; the net is the trade. ──
        const [buyerFinal, sellerFinal, coreFinal] = await Promise.all([
            balanceOf(BUYER), balanceOf(SELLER), balanceOf(core),
        ]);
        expect(buyerBefore - buyerFinal, 'buyer net paid exactly the payment').toBe(payment);
        expect(sellerFinal - sellerBefore, 'seller net earned exactly the payment').toBe(payment);
        expect(coreFinal, 'FigaroCore escrow returned to its baseline').toBe(coreBefore);

        // ── BUYER ORDERS LIST — COMPLETED: after resolution the SAME /orders list
        //    moves the process out of "In progress" into "Completed" (the row's
        //    isResolved flips once the OrderResolved event is read) — the buyer's
        //    second view of the same event-driven, actor-neutral list, no role split. ──
        await gotoAsWallet(page, BUYER, '/orders?e2e=devnet');
        await page.getByTestId('orders-list').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        await expect(
            page.getByTestId('orders-completed-section').getByTestId(`order-row-${processId}`),
            'the buyer sees the resolved process under "Completed"',
        ).toBeVisible({ timeout: 30000 });
        await expect(
            page.getByTestId(`order-status-${processId}`),
            "the buyer's completed row is labelled Completed",
        ).toHaveText(/Completed/, { timeout: 15000 });

        // ── AUDIT (fed from network state — indexer events + IPFS, never a local
        //    cache): the audit package surfaces the WHOLE order lifecycle for the
        //    never-seen clause — every committed leaf's value, the seller's runtime
        //    ATTESTATION, and a merkle proof tying the agreement to the on-chain root. ──
        await page.goto(`/audit/view?process=${processId}&e2e=devnet`, { waitUntil: 'domcontentloaded' });
        await page.getByTestId('audit-page').waitFor({ timeout: 30000 });
        await waitForConnected(page);

        // VALUES — the clause-evidence view surfaces EVERY committed leaf's value,
        // each rendered from its registered spec title: the two mandatory leaves
        // (commerce + topology) AND the never-seen clause.
        const evidence = page.getByTestId('audit-clause-evidence');
        await evidence.waitFor({ state: 'visible', timeout: 30000 });
        await expect(evidence.getByText('Commerce terms'), 'the commerce leaf value surfaces').toBeVisible({ timeout: 30000 });
        await expect(evidence.getByText('Order topology'), 'the topology leaf value surfaces').toBeVisible({ timeout: 15000 });
        await expect(
            evidence.getByText(NOVEL_TITLE),
            'the never-seen clause surfaces by its spec title — its committed data leaf AND its process-log timeline',
        ).toHaveCount(2, { timeout: 15000 });
        // The witness clause surfaces the same two ways — its committed policy
        // leaf and its witness timeline (the eventLabel is the title too, so the
        // timeline row carries it twice: group heading + event row).
        await expect(
            evidence.getByText(WITNESS_TITLE).first(),
            'the never-seen witness clause surfaces by its spec title',
        ).toBeVisible({ timeout: 15000 });
        const witnessDl = evidence.locator(`[data-testid="audit-witness-${WITNESS_CLAUSE_ID}-1"]`);
        await expect(
            witnessDl,
            "the witness record decodes from calldata against the never-seen clause's declared stage",
        ).toBeVisible({ timeout: 30000 });
        await expect(witnessDl.getByText('Probe reading')).toBeVisible();
        await expect(witnessDl.getByText('42')).toBeVisible();

        // ATTESTATION — the lifecycle's runtime step must surface in the audit too,
        // read from the indexer's AttestationRecorded logs (getAttestationsByOrder),
        // NOT from any local cache: the probe attestation's stage label, attributed
        // to the SELLER who signed it (the attester address from the event). This is
        // the audit's proof the attestation EXISTS, fed from chain events.
        await expect(
            evidence.getByText(NOVEL_FIRST_STAGE_LABEL),
            "the seller's runtime attestation surfaces in the audit, its stage label read from the spec",
        ).toBeVisible({ timeout: 30000 });
        await expect(
            evidence.getByText(new RegExp(SELLER, 'i')).first(),
            'the audit attributes the attestation to the seller who signed it (attester from the event; the witness group carries a second attester span)',
        ).toBeVisible({ timeout: 15000 });

        // MERKLE TREE — the audit must surface the WHOLE committed tree, its root over
        // EVERY leaf. Fetch the agreement from IPFS (the network SSoT the audit resolves
        // via its URI pointer — NOT the local cache), assert it is pinned, then drive
        // the audit's hash verifier (Mode A): it recomputes the merkle root over all
        // leaves and confirms it equals the on-chain agreementHash the kernel stored.
        const agreementHash = event.args.agreementHash as `0x${string}`;
        const agreementUri = await page.evaluate(
            (key) => window.localStorage.getItem(key),
            `figaro:agreement-uri:${agreementHash}`,
        );
        expect(agreementUri, 'the committed agreement has a network (IPFS) locator').toMatch(/^ipfs:\/\//);
        const agreementCid = agreementUri!.replace(/^ipfs:\/\//, '');
        await assertPinnedInIpfs(agreementCid); // the SSoT copy is genuinely pinned, not a local cache
        const ipfsApi = process.env.NEXT_PUBLIC_IPFS_API_URL ?? 'http://127.0.0.1:5001';
        const agreementJson = await (await fetch(`${ipfsApi}/api/v0/cat?arg=${agreementCid}`, { method: 'POST' })).text();
        const agreement = JSON.parse(agreementJson) as { sections: { clause: string }[] };
        const leafClauses = agreement.sections.map((s) => s.clause);
        expect(leafClauses, 'the committed merkle tree carries all four leaves')
            .toEqual(expect.arrayContaining(['figaro-commerce', 'figaro-topology', NOVEL_CLAUSE_ID, WITNESS_CLAUSE_ID]));

        await page.getByTestId('verify-mode-agreement').click();
        await page.getByTestId('verify-agreement-input').fill(agreementJson);
        await page.getByTestId('verify-agreement-expected').fill(agreementHash);
        await expect(
            page.getByTestId('verify-result-computed'),
            'the audit recomputes a merkle root from the IPFS agreement',
        ).toBeVisible({ timeout: 15000 });
        await expect(
            page.getByTestId('verify-result-status'),
            'the recomputed root over every leaf matches the on-chain agreementHash',
        ).toHaveText(/Matches expected hash/, { timeout: 15000 });
    });
});
