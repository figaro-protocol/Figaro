/**
 * clause-authoring.devnet.spec.ts — the clause-side registration lifecycle,
 * end to end through the UI: the /clauses CTA routes to /clauses/register,
 * where the author pastes a spec, watches the off-chain validation pass,
 * registers (pin + anchor + deposit), sees the clause appear in the live
 * /clauses inventory under its article, composes it into a committed order,
 * is BLOCKED from reclaiming the stake while that deal is in flight
 * (commits==resolves, verified through this context's witnessed agreement),
 * resolves, reclaims, and the registry refunds exactly the deposit.
 *
 * ONE spec, author-driven — the clause mirror of assembly-withdraw. Sibling
 * of permissionless-clause (which certifies the open-world pipeline for a
 * clause registered OUT-OF-BAND); this spec's subject is the AUTHORING
 * SURFACE itself: the register form, the inventory reaction, and the
 * reclaim gate.
 *
 * Fresh clause id per run (the probe nonce doctrine): clause identity is
 * (name, version), first-write-wins and immutable, and `withdrawDeposit` is
 * once-only per permanent binding — an adopted clause is non-re-testable
 * after run 1, and withdrawing a SEEDED clause would de-surface a fixture
 * every other spec composes. The nonce keeps each run's binding fresh and
 * collision-free on the persisted devnet (flake-pattern 16's sibling rule).
 *
 * AUTHOR == BUYER (one wallet), deliberately: agreement bodies are
 * party-private — the reclaim gate VERIFIES only agreements this browser
 * context witnessed (the localStorage URI saved at checkout). The author
 * registering the clause AND buying the composed order is legal (the
 * protocol is actor-neutral) and keeps the witnessed URI local to the
 * author's own context, so the gate can verify the in-flight deal exactly
 * as a real author-participant's browser would.
 *
 * Wallets (all 20 unlocked anvil accounts are claimed by some spec; these
 * two are the least-conflicting reuses, both serial with their other users):
 *   AUTHOR==BUYER = anvil[4] — elsewhere a BUYER only (buyer-assigned,
 *     kit-diamond; `devnet` project, serial): buyers hold no persistent
 *     profile state, and those specs take within-run event baselines, so
 *     this spec's extra events for anvil[4] never skew them. Its clause
 *     registrations are per-run-unique and end withdrawn.
 *   SELLER = anvil[19] — shared with assembly-withdraw (this spec's
 *     sibling, same standalone serial project) AND content-delivery; every
 *     sharer onboards through the wizard with the unbind-all-then-bind-own
 *     step, so each run is self-contained regardless of what the others
 *     left bound.
 *
 * VALUE LEGS (the chain is the point):
 *   register — ClauseRegistry ETH escrow +registrationDeposit exactly;
 *              author −(deposit + gasUsed×effectiveGasPrice) exactly
 *   commit   — buyer ↓ buyerBond, seller ↓ sellerBond, core escrow ↑ both
 *   resolve  — buyer net −payment, seller net +payment, escrow to baseline
 *   reclaim  — registry escrow −deposit exactly; author +(deposit − gas)
 *              exactly; DepositWithdrawn for this run's idHash from
 *              blockBefore+1 (pattern 17)
 *
 * Requires Anvil + ./scripts/devup.sh (deploy + populate) + Kubo + :3100.
 */
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import { createPublicClient, defineChain, http, parseAbi, type Hex } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { readLocalDeploymentConfig, waitForConnected } from './devnet-helpers';
import { makeProbeSpec } from './probeAssembly';
import { calculateBonds, computeClauseKey, CLAUSE_REGISTRY_ABI } from '@figaro-protocol/sdk';
import { CORE_ABI } from '@/lib/kernel/contracts';

const ERC20_ABI = parseAbi(['function balanceOf(address) view returns (uint256)']);

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});
const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';

// anvil[4] — AUTHOR == BUYER (see header for the reuse rationale).
const AUTHOR = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 4 }).address as Hex;
// anvil[19] — the seller bound to the per-run assembly (shared only with
// assembly-withdraw; both unbind-all first).
const SELLER = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 19 }).address as Hex;

test.describe('CLAUSE AUTHORING — register on /clauses/register, inventory reaction, commits==resolves reclaim (devnet)', () => {
    test.setTimeout(360_000);

    test('author registers a clause through the UI, a composed deal blocks the reclaim, settlement frees it, the registry refunds the deposit', async ({ page }) => {
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });

        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const token = config.tokenAddress as Hex;
        const registry = (process.env.NEXT_PUBLIC_CLAUSE_REGISTRY ?? config.clauseRegistry) as Hex;
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const balanceOf = (who: Hex) =>
            publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;

        // Per-run nonce → per-run clause id → fresh first-write-wins binding
        // every run and every retry. The spec shape is the shared probe (a
        // runtime-attestable ladder carrying `block.design.article: "attestations"`,
        // so the inventory grouping renders).
        const runNonce = `${Date.now()}`;
        const CLAUSE_ID = `figaro-authored-${runNonce}`;
        const CLAUSE_TITLE = `Authored clause ${runNonce}`;
        const SPEC = makeProbeSpec(CLAUSE_ID, CLAUSE_TITLE);
        const idHash = computeClauseKey(CLAUSE_ID, SPEC.version);

        // ── CTA ROUND-TRIP, OUTBOUND: the marketing /clauses page carries the
        //    "Register a clause" CTA; driving it lands the author on the
        //    authoring surface. ──
        await gotoAsWallet(page, AUTHOR, '/clauses?e2e=devnet');
        // Two links carry this name (the in-prose CTA + the shared footer
        // column) — both route to /clauses/register; drive the first (the
        // prose CTA, earlier in DOM order).
        const cta = page.getByRole('link', { name: 'Register a clause' }).first();
        await cta.waitFor({ state: 'visible', timeout: 30000 });
        await expect(cta).toHaveAttribute('href', /^\/clauses\/register\/?$/);
        await cta.click();
        await page.waitForURL(/\/clauses\/register/, { timeout: 15000 });

        // ── REGISTER: paste the spec, watch the off-chain validation pass, then
        //    anchor. Validation is walletless and live; the write needs the
        //    connected author. ──
        const specInput = page.getByTestId('clause-spec-input');
        await specInput.waitFor({ state: 'visible', timeout: 30000 });
        await specInput.fill(JSON.stringify(SPEC, null, 2));
        await expect(
            page.getByTestId('clause-validation-ok'),
            'the pasted spec passes the generic off-chain well-formedness gate',
        ).toBeVisible({ timeout: 15000 });

        await waitForConnected(page);
        const registerBtn = page.getByTestId('clause-register-button');
        await registerBtn.waitFor({ state: 'visible', timeout: 30000 });

        // Value-leg baselines, taken immediately before the ONE author tx.
        const deposit = await publicClient.readContract({
            address: registry, abi: CLAUSE_REGISTRY_ABI, functionName: 'registrationDeposit',
        }) as bigint;
        const registerBlockBefore = await publicClient.getBlockNumber();
        const [registryEthBefore, authorEthBefore] = await Promise.all([
            publicClient.getBalance({ address: registry }),
            publicClient.getBalance({ address: AUTHOR }),
        ]);

        await registerBtn.click();
        const receiptPanel = page.getByTestId('clause-register-receipt');
        await receiptPanel.waitFor({ state: 'visible', timeout: 60000 });
        await expect(
            page.getByTestId('receipt-clause-id'),
            'the receipt names the registered clause id',
        ).toHaveText(CLAUSE_ID);

        // Value leg (register): the registration event from strictly after the
        // pre-click head (pattern 17), its tx receipt for the exact gas.
        const registeredEvents = await publicClient.getContractEvents({
            address: registry, abi: CLAUSE_REGISTRY_ABI, eventName: 'ClauseRegistered',
            args: { registeredBy: AUTHOR }, fromBlock: registerBlockBefore + 1n,
        });
        expect(registeredEvents, 'exactly one ClauseRegistered for the author this run').toHaveLength(1);
        expect(registeredEvents[0].args.clauseId).toBe(CLAUSE_ID);
        const registerReceipt = await publicClient.getTransactionReceipt({ hash: registeredEvents[0].transactionHash });
        expect(registerReceipt.status, 'the registration transaction succeeded').toBe('success');
        const registerGas = registerReceipt.gasUsed * registerReceipt.effectiveGasPrice;
        const [registryEthAfterReg, authorEthAfterReg] = await Promise.all([
            publicClient.getBalance({ address: registry }),
            publicClient.getBalance({ address: AUTHOR }),
        ]);
        expect(registryEthAfterReg - registryEthBefore, 'registry escrow increased by exactly the deposit').toBe(deposit);
        expect(authorEthBefore - authorEthAfterReg, 'author paid exactly deposit + gas').toBe(deposit + registerGas);
        test.info().annotations.push({
            type: 'ClauseRegistered',
            description: `clause=${CLAUSE_ID} idHash=${idHash} deposit=${deposit} gas=${registerGas} tx=${registerReceipt.transactionHash}`,
        });

        // ── INVENTORY REACTION (the CTA's round-trip promise): the live
        //    registry explorer — ClauseRegistered events → IPFS specs — now
        //    lists the new clause under its article, no rebuild, no bundled
        //    copy. ──
        await page.goto('/registries?family=clauses&e2e=devnet', { waitUntil: 'domcontentloaded' });
        const inventoryRow = page.locator(`#clause-${CLAUSE_ID}`);
        await expect(
            inventoryRow,
            'the just-registered clause appears in the live inventory',
        ).toBeVisible({ timeout: 60000 });
        await expect(
            inventoryRow.locator('xpath=ancestor::ul[1]/preceding-sibling::h3[1]'),
            "the clause is grouped under its spec's block.design.article",
        ).toHaveText('attestations');

        // ── COMPOSE: author an assembly carrying the new clause on the real
        //    canvas (the drawer surfaces it from the live registry), publish. ──
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
        const drawerClause = page.getByTestId(`drawer-registry-clause-${CLAUSE_ID}`);
        await expect(
            drawerClause,
            'the drawer surfaces the UI-registered clause from the live registry',
        ).toHaveCount(1, { timeout: 20000 });
        await drawerClause.check();

        const assemblyName = `Authored-clause assembly ${runNonce}`;
        await page.getByTestId('designer-name-input').fill(assemblyName);
        await page.getByTestId('designer-summary-input').fill('Clause-authoring coverage: an order composing the UI-registered clause.');
        await page.getByTestId('designer-description-input').fill(`Single-node assembly carrying ${CLAUSE_ID}.`);
        await expect(page.getByTestId('designer-review')).toBeEnabled({ timeout: 5000 });
        await page.getByTestId('designer-review').click();
        await page.waitForURL(/\/assemblies\/designer\/view\/?\?slug=asm-/, { timeout: 15000 });
        const handle = page.url().match(/[?&]slug=(asm-[a-z0-9-]+)/)?.[1];
        expect(handle, 'review navigated to a draft handle').toBeTruthy();
        await page.goto(`/assemblies/designer/view?slug=${handle}&intent=publish&e2e=devnet`, { waitUntil: 'domcontentloaded' });
        const confirmBtn = page.getByTestId('review-confirm-publish');
        await confirmBtn.waitFor({ state: 'visible', timeout: 30000 });
        await waitForConnected(page);
        await confirmBtn.click();
        await page.getByTestId('assembly-publish-receipt').waitFor({ timeout: 60000 });
        const slug = (await page.getByTestId('receipt-slug').textContent())?.trim();
        expect(slug, 'publish receipt shows the content slug').toMatch(/^asm-/);

        // ── BIND: onboard the dedicated seller, unbind-all then bind THIS
        //    run's assembly (self-contained on the persisted devnet). ──
        await gotoAsWallet(page, SELLER, '/members');
        await page.goto('/members/identity', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#profile-name')).toBeVisible({ timeout: 30000 });
        await page.locator('#profile-name').fill('Clause Authoring Seller');
        await page.locator('#profile-specialty').fill('clause-authoring coverage');
        await page.locator('#profile-geohash').fill('9q8yyk8yu');
        await page.getByRole('button', { name: /\+ MOCK$/ }).click();
        await page.locator('input[name="defaultTokenAddress"]').first().check();
        await page.getByRole('button', { name: /^Next/ }).click();
        await expect(page).toHaveURL(/\/members\/assemblies/);
        const checkedRows = page.locator('[data-testid^="seller-assembly-row-"] input[type="checkbox"]:checked');
        while ((await checkedRows.count()) > 0) await checkedRows.first().uncheck();
        const myRow = page.getByTestId(`seller-assembly-row-${slug}`);
        await myRow.waitFor({ state: 'visible', timeout: 30000 });
        await myRow.locator('input[type="checkbox"]').first().check();
        await page.getByRole('button', { name: /^Next/ }).click();
        await expect(page).toHaveURL(/\/members\/catalogue/);
        await page.locator('[id^="item-"][id$="-name"]').first().fill('Authored item');
        await page.locator('[id^="item-"][id$="-price"]').first().fill('1');
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

        // ── COMMIT: the author-as-buyer orders from the bound seller, signs,
        //    relays; the seller accepts. This context witnesses the agreement
        //    at checkout — the reclaim gate below verifies THROUGH it. ──
        const committedBefore = (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: AUTHOR }, fromBlock: 0n,
        })).length;
        const [buyerBefore, sellerBefore, coreBefore] = await Promise.all([
            balanceOf(AUTHOR), balanceOf(SELLER), balanceOf(core),
        ]);
        await gotoAsWallet(page, AUTHOR, `/s/view?seller=${SELLER}&e2e=devnet`);
        await page.getByTestId('member-detail-view').waitFor({ timeout: 30000 });
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

        const queryCommitted = () => publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: AUTHOR }, fromBlock: 0n,
        });
        await expect.poll(async () => (await queryCommitted()).length, {
            timeout: 60000, message: 'a new OrderCommitted lands on-chain',
        }).toBe(committedBefore + 1);
        const committed = await queryCommitted();
        const event = committed[committed.length - 1];
        expect(event.args.seller?.toLowerCase(), 'committed against the bound seller').toBe(SELLER.toLowerCase());
        const processId = event.args.processId!;
        const payment = event.args.payment!;

        // Value leg (commit): the asymmetric bonds actually locked.
        const { buyerBond, sellerBond } = calculateBonds(event.args.cumulativeValue!, payment);
        const [buyerMid, sellerMid, coreMid] = await Promise.all([
            balanceOf(AUTHOR), balanceOf(SELLER), balanceOf(core),
        ]);
        expect(buyerBefore - buyerMid, 'buyer balance decreased by the buyer bond').toBe(buyerBond);
        expect(sellerBefore - sellerMid, 'seller balance decreased by the seller bond').toBe(sellerBond);
        expect(coreMid - coreBefore, 'FigaroCore escrow increased by both bonds').toBe(buyerBond + sellerBond);

        // ── GATE, BLOCKED: back on /clauses/register as the author — the
        //    reclaim row for THIS run's idHash shows the button disabled,
        //    reason naming the ONE verified in-flight deal (the clause gate
        //    counts committed-unresolved ORDERS composing the clause). ──
        await gotoAsWallet(page, AUTHOR, '/clauses/register?e2e=devnet');
        await waitForConnected(page);
        const reclaimRow = page.getByTestId(`clause-reclaim-row-${idHash}`);
        await reclaimRow.waitFor({ state: 'visible', timeout: 60000 });
        const reclaimBtn = reclaimRow.getByTestId('clause-withdraw-button');
        await expect(
            reclaimBtn,
            'the reclaim is disabled while the composed deal is in flight',
        ).toBeDisabled();
        await expect(
            reclaimBtn,
            'the disabled reason names the verified in-flight count',
        ).toHaveAttribute('title', /Cannot reclaim the stake yet: 1 in-flight deal still composes this clause or assembly/, { timeout: 60000 });
        await expect(reclaimBtn).toBeDisabled();

        // ── RESOLVE (buyer dominance, atomic): the author-as-buyer settles the
        //    process through the UI. ──
        const resolvedBefore = (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'ProcessResolved', args: { buyer: AUTHOR }, fromBlock: 0n,
        })).length;
        await gotoAsWallet(page, AUTHOR, `/orders/view?process=${processId}&e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const resolveBtn = page.getByTestId('capability-execute-resolve-process');
        await resolveBtn.waitFor({ state: 'visible', timeout: 30000 });
        await expect(resolveBtn, 'the buyer can resolve the active process').toBeEnabled({ timeout: 30000 });
        await resolveBtn.click();
        await expect.poll(async () => (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'ProcessResolved', args: { buyer: AUTHOR }, fromBlock: 0n,
        })).length, { timeout: 60000, message: 'ProcessResolved lands on-chain' }).toBe(resolvedBefore + 1);

        // Value leg (full cycle): net settlement, escrow back to baseline.
        const [buyerFinal, sellerFinal, coreFinal] = await Promise.all([
            balanceOf(AUTHOR), balanceOf(SELLER), balanceOf(core),
        ]);
        expect(buyerBefore - buyerFinal, 'buyer net paid exactly the payment').toBe(payment);
        expect(sellerFinal - sellerBefore, 'seller net earned exactly the payment').toBe(payment);
        expect(coreFinal, 'FigaroCore escrow returned to its baseline').toBe(coreBefore);

        // ── GATE, OPEN: every composed deal settled → the reclaim enables.
        //    Foreign in-flight orders (other specs' unresolved processes on the
        //    persisted devnet) are party-private → the caveat renders iff such
        //    orders exist — informational, never blocking. Determined out of
        //    band from the same chain state the gate reads (the clause gate
        //    counts ORDERS, so the condition is per-order). ──
        await gotoAsWallet(page, AUTHOR, '/clauses/register?e2e=devnet');
        await waitForConnected(page);
        const rowAfter = page.getByTestId(`clause-reclaim-row-${idHash}`);
        await rowAfter.waitFor({ state: 'visible', timeout: 60000 });
        const reclaimBtnAfter = rowAfter.getByTestId('clause-withdraw-button');
        await expect(
            reclaimBtnAfter,
            'every composed deal settled → the reclaim is enabled',
        ).toBeEnabled({ timeout: 60000 });

        const [allCommitted, allResolved] = await Promise.all([
            publicClient.getContractEvents({ address: core, abi: CORE_ABI, eventName: 'OrderCommitted', fromBlock: 0n }),
            publicClient.getContractEvents({ address: core, abi: CORE_ABI, eventName: 'ProcessResolved', fromBlock: 0n }),
        ]);
        const resolvedProcesses = new Set(allResolved.map((e) => (e.args.processId as string).toLowerCase()));
        const foreignInFlight = allCommitted.filter(
            (e) => !resolvedProcesses.has((e.args.processId as string).toLowerCase()),
        ).length;
        const caveat = rowAfter.getByTestId('clause-withdraw-caveat');
        if (foreignInFlight > 0) {
            await expect(
                caveat,
                `${foreignInFlight} foreign in-flight order(s) → the party-private caveat renders (informational, not blocking)`,
            ).toBeVisible({ timeout: 30000 });
            await expect(caveat).toContainText(/could not be checked/);
            await expect(caveat).toContainText(/party-private/);
        } else {
            await expect(caveat, 'no unverifiable deals → no caveat').toBeHidden();
        }

        // ── RECLAIM + VALUE LEG: click; DepositWithdrawn lands for this run's
        //    idHash; the registry escrow drops by exactly the deposit and the
        //    author's ETH rises by exactly deposit − gas. ──
        const withdrawBlockBefore = await publicClient.getBlockNumber();
        const [registryEthBeforeW, authorEthBeforeW] = await Promise.all([
            publicClient.getBalance({ address: registry }),
            publicClient.getBalance({ address: AUTHOR }),
        ]);

        await reclaimBtnAfter.click();
        await expect(
            reclaimBtnAfter,
            'the affordance reflects the reclaim (stake reclaimed)',
        ).toHaveText('Stake reclaimed', { timeout: 60000 });
        await expect(reclaimBtnAfter).toBeDisabled();

        // The event, from strictly after the pre-click head (pattern 17),
        // keyed by THIS run's clause key. (The event's indexed `clauseId`
        // topic IS the idHash — the withdraw path keys on
        // keccak256(abi.encode(clauseId, version)).)
        const withdrawnEvents = await publicClient.getContractEvents({
            address: registry, abi: CLAUSE_REGISTRY_ABI, eventName: 'DepositWithdrawn',
            args: { clauseId: idHash }, fromBlock: withdrawBlockBefore + 1n,
        });
        expect(withdrawnEvents, 'exactly one DepositWithdrawn for this binding').toHaveLength(1);
        expect((withdrawnEvents[0].args.registeredBy as string).toLowerCase()).toBe(AUTHOR.toLowerCase());
        expect(withdrawnEvents[0].args.amount, 'the event carries the exact deposit').toBe(deposit);

        const withdrawReceipt = await publicClient.getTransactionReceipt({ hash: withdrawnEvents[0].transactionHash });
        expect(withdrawReceipt.status, 'the withdraw transaction succeeded').toBe('success');
        const withdrawGas = withdrawReceipt.gasUsed * withdrawReceipt.effectiveGasPrice;
        const [registryEthAfterW, authorEthAfterW] = await Promise.all([
            publicClient.getBalance({ address: registry }),
            publicClient.getBalance({ address: AUTHOR }),
        ]);
        expect(registryEthBeforeW - registryEthAfterW, 'registry escrow decreased by exactly the deposit').toBe(deposit);
        expect(authorEthAfterW - authorEthBeforeW, 'author received exactly the deposit minus gas').toBe(deposit - withdrawGas);
        test.info().annotations.push({
            type: 'DepositWithdrawn',
            description: `clause=${CLAUSE_ID} idHash=${idHash} deposit=${deposit} gas=${withdrawGas} tx=${withdrawReceipt.transactionHash}`,
        });

        // ── DE-SURFACE REFLECTION: a fresh read of the page derives the
        //    withdrawn state from the chain (the DepositWithdrawn fold), not
        //    session state. ──
        await page.reload({ waitUntil: 'domcontentloaded' });
        await waitForConnected(page);
        const reloadedRow = page.getByTestId(`clause-reclaim-row-${idHash}`);
        await reloadedRow.waitFor({ state: 'visible', timeout: 60000 });
        await expect(
            reloadedRow.getByTestId(`clause-reclaim-state-${idHash}`),
            'the row state is chain-derived: stake reclaimed',
        ).toHaveText('stake reclaimed', { timeout: 30000 });
        const reloadedBtn = reloadedRow.getByTestId('clause-withdraw-button');
        await expect(reloadedBtn).toHaveText('Stake reclaimed', { timeout: 15000 });
        await expect(reloadedBtn).toBeDisabled();
    });
});
