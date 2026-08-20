/**
 * assembly-withdraw.devnet.spec.ts — the commits==resolves withdraw gate,
 * end to end: an assembly's registering wallet must not reclaim the registration stake
 * while a deal composed from the assembly is in flight; once every composed
 * deal settles, the reclaim goes through and the registry refunds exactly
 * the deposit.
 *
 * ONE spec, registeredBy-driven (not a scenario/runtime pair): the subject is the
 * REGISTERED_BY's registration lifecycle — publish (staked intent) → verified
 * in-flight deal blocks → atomic settle unblocks → reclaim + exact refund.
 * `AssemblyRegistry.withdrawDeposit` is once-only per PERMANENT binding, so
 * nothing survives for a runtime spec to consume (the assembly ends
 * de-surfaced), and the buyer/seller commit+resolve legs are supporting
 * participants already covered by orders-accept — splitting would duplicate
 * that coverage against an assembly that no longer surfaces.
 *
 * Fresh binding per run — the probeAssembly nonce, NOT adopt-the-anchored:
 * the once-only withdraw makes an adopted assembly non-re-testable (run 2
 * hits AlreadyWithdrawn with the button already "Stake reclaimed"), and
 * withdrawing the SEED assembly would de-surface the fixture every other
 * spec consumes. That is exactly flake-pattern 16's sibling rule (a spec
 * that leaves its state AND registers content-addressed clauses or assemblies mints a
 * per-run nonce) — publishProbeAssembly is the sanctioned shared helper.
 * The slug still comes from the network's answer (the publish receipt);
 * the seller binds it through the real wizard reading the registry; the
 * buyer discovers it from the seller page (profile bindings → registry →
 * IPFS). Nothing about the network is hardcoded.
 *
 * The gate is OFF-CHAIN and advisory (the chain carries no composition
 * provenance — AssemblyRegistry.withdrawDeposit's own NatSpec): VERIFIED
 * in-flight deals disable the button with the count; agreements this
 * browser context never witnessed are party-private → surfaced as the
 * caveat strip, never blocking. The buyer's checkout runs in THIS context,
 * so its committed agreement is witnessed (localStorage URI) and the gate
 * verifies it.
 *
 * VALUE LEGS (the chain is the point):
 *   commit  — buyer ↓ buyerBond, seller ↓ sellerBond, FigaroCore escrow ↑ both
 *   resolve — buyer net −payment, seller net +payment, escrow to baseline
 *   reclaim — registry ETH escrow ↓ exactly registrationDeposit;
 *             registeredBy ETH ↑ exactly (deposit − gasUsed×effectiveGasPrice)
 *
 * Requires Anvil + ./scripts/devup.sh (deploy + populate) + Kubo + :3100.
 */
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import { createPublicClient, defineChain, http, parseAbi, type Hex } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { readLocalDeploymentConfig, waitForConnected } from './devnet-helpers';
import { publishProbeAssembly } from './probeAssembly';
import { calculateBonds, ASSEMBLY_REGISTRY_ABI } from '@figaro-protocol/sdk';
import { CORE_ABI } from '@/lib/kernel/contracts';
import { deriveAssemblySlug } from '@/lib/shared/assemblyTemplate';

const ERC20_ABI = parseAbi(['function balanceOf(address) view returns (uint256)']);

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});
const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';

// anvil[0] — the fixture's default buyer (serial project: no cross-spec races).
const BUYER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Hex;
// anvil[18] — the assembly REGISTERED_BY, used by no other spec: each run leaves a
// fresh binding of theirs withdrawn.
const REGISTERED_BY = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 18 }).address as Hex;
// anvil[19] — the seller bound to the per-run probe assembly, used by no other
// spec (its profile binding is rewritten every run).
const SELLER = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 19 }).address as Hex;

test.describe('AssemblyRegistry withdraw — the commits==resolves gate (devnet)', () => {
    test.setTimeout(360_000);

    test('registeredBy reclaims the stake only after every composed deal settles; registry refunds exactly the deposit', async ({ page }) => {
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });

        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const token = config.tokenAddress as Hex;
        const registry = (process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY ?? config.assemblyRegistry) as Hex;
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const balanceOf = (who: Hex) =>
            publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;

        // ── PUBLISH (the registeredBy's staked intent): the registeredBy registers a
        //    per-run probe clause and publishes a single-node assembly carrying
        //    it through the REAL designer canvas. The nonce guarantees a fresh
        //    binding, so the once-only withdraw is drivable every run. The
        //    slug is the network's answer (publish receipt). ──
        await gotoAsWallet(page, REGISTERED_BY, '/?e2e=devnet');
        const { slug } = await publishProbeAssembly(page);

        // The binding this run anchors — compositionHash found by deriving each
        // AssemblyRegistered event's slug (the slug exists nowhere on-chain).
        const registered = await publicClient.getContractEvents({
            address: registry, abi: ASSEMBLY_REGISTRY_ABI, eventName: 'AssemblyRegistered',
            args: { registeredBy: REGISTERED_BY }, fromBlock: 0n,
        });
        const binding = registered.find((e) => deriveAssemblySlug(e.args.compositionHash as Hex) === slug);
        expect(binding, 'the publish anchored a binding whose derived slug matches the receipt').toBeTruthy();
        const compositionHash = binding!.args.compositionHash as Hex;

        // ── BIND: onboard the dedicated seller through the real wizard — one
        //    catalogue item, EXACTLY this run's assembly bound (a prior run's
        //    binding is unchecked; its assembly is withdrawn → de-surfaced). ──
        await gotoAsWallet(page, SELLER, '/members');
        await page.goto('/members/identity', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#profile-name')).toBeVisible({ timeout: 30000 });
        await page.locator('#profile-name').fill('Withdraw Gate Seller');
        await page.locator('#profile-specialty').fill('withdraw-gate coverage');
        await page.locator('#profile-geohash').fill('9q8yyk8yu');
        await page.getByRole('button', { name: /\+ MOCK$/ }).click();
        await page.locator('input[name="defaultTokenAddress"]').first().check();
        await page.getByRole('button', { name: /^Next/ }).click();
        await expect(page).toHaveURL(/\/members\/catalogue/);

        await page.locator('[id^="item-"][id$="-name"]').first().fill('Gate item');
        await page.locator('[id^="item-"][id$="-price"]').first().fill('1');
        await page.getByRole('button', { name: /^Next/ }).click();
        await expect(page).toHaveURL(/\/members\/assemblies/);

        const checkedRows = page.locator('[data-testid^="seller-assembly-row-"] input[type="checkbox"]:checked');
        while ((await checkedRows.count()) > 0) await checkedRows.first().uncheck();
        const myRow = page.getByTestId(`seller-assembly-row-${slug}`);
        await myRow.waitFor({ state: 'visible', timeout: 30000 });
        await myRow.locator('input[type="checkbox"]').first().check();
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

        // ── COMMIT (the deal that must block the reclaim): buyer orders from
        //    the bound seller, signs, relays; seller accepts on /orders. This
        //    context WITNESSES the agreement at checkout, so the registeredBy's gate
        //    can verify it. ──
        const committedBefore = (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: BUYER }, fromBlock: 0n,
        })).length;
        const [buyerBefore, sellerBefore, coreBefore] = await Promise.all([
            balanceOf(BUYER), balanceOf(SELLER), balanceOf(core),
        ]);

        await gotoAsWallet(page, BUYER, `/s/view?seller=${SELLER}&e2e=devnet`);
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
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: BUYER }, fromBlock: 0n,
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
            balanceOf(BUYER), balanceOf(SELLER), balanceOf(core),
        ]);
        expect(buyerBefore - buyerMid, 'buyer balance decreased by the buyer bond').toBe(buyerBond);
        expect(sellerBefore - sellerMid, 'seller balance decreased by the seller bond').toBe(sellerBond);
        expect(coreMid - coreBefore, 'FigaroCore escrow increased by both bonds').toBe(buyerBond + sellerBond);

        // ── GATE, BLOCKED: the registeredBy opens their own published-assembly view.
        //    The reclaim affordance renders (registeredBy-only) but is DISABLED, its
        //    reason naming the ONE verified in-flight deal — the buyer's
        //    unresolved process, verified through this context's witnessed
        //    agreement. ──
        await gotoAsWallet(page, REGISTERED_BY, `/assemblies/designer/view?slug=${slug}&e2e=devnet`);
        await page.getByTestId('assembly-view-page').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const withdrawBtn = page.getByTestId('view-withdraw-button');
        await withdrawBtn.waitFor({ state: 'visible', timeout: 30000 });
        await expect(
            withdrawBtn,
            'the reclaim is disabled while the composed deal is in flight',
        ).toBeDisabled();
        await expect(
            withdrawBtn,
            'the disabled reason names the verified in-flight count',
        ).toHaveAttribute('title', /Cannot reclaim the stake yet: 1 in-flight deal still composes this clause or assembly/, { timeout: 60000 });
        // Still disabled after the gate resolved (not just the loading state).
        await expect(withdrawBtn).toBeDisabled();

        // ── RESOLVE (buyer dominance, atomic): the buyer settles the process
        //    through the UI; the deal leaves the in-flight set. ──
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

        // Value leg (full cycle): net settlement, escrow back to baseline.
        const [buyerFinal, sellerFinal, coreFinal] = await Promise.all([
            balanceOf(BUYER), balanceOf(SELLER), balanceOf(core),
        ]);
        expect(buyerBefore - buyerFinal, 'buyer net paid exactly the payment').toBe(payment);
        expect(sellerFinal - sellerBefore, 'seller net earned exactly the payment').toBe(payment);
        expect(coreFinal, 'FigaroCore escrow returned to its baseline').toBe(coreBefore);

        // ── GATE, OPEN: back on the registeredBy view, the reclaim is enabled. Any
        //    OTHER unresolved processes on the persisted devnet are foreign
        //    (party-private, never witnessed here) → the caveat strip renders
        //    iff such deals exist — informational, never blocking. Determined
        //    out of band from the same chain state the gate reads. ──
        await gotoAsWallet(page, REGISTERED_BY, `/assemblies/designer/view?slug=${slug}&e2e=devnet`);
        await page.getByTestId('assembly-view-page').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const reclaimBtn = page.getByTestId('view-withdraw-button');
        await reclaimBtn.waitFor({ state: 'visible', timeout: 30000 });
        await expect(
            reclaimBtn,
            'every composed deal settled → the reclaim is enabled',
        ).toBeEnabled({ timeout: 60000 });

        // Foreign in-flight orders (committed, process unresolved) — the
        // caveat's exact condition. All of OUR orders are resolved, so every
        // remaining in-flight order is foreign to this context.
        const [allCommitted, allResolved] = await Promise.all([
            publicClient.getContractEvents({ address: core, abi: CORE_ABI, eventName: 'OrderCommitted', fromBlock: 0n }),
            publicClient.getContractEvents({ address: core, abi: CORE_ABI, eventName: 'ProcessResolved', fromBlock: 0n }),
        ]);
        const resolvedProcesses = new Set(allResolved.map((e) => (e.args.processId as string).toLowerCase()));
        const foreignInFlight = allCommitted.filter(
            (e) => !resolvedProcesses.has((e.args.processId as string).toLowerCase()),
        ).length;
        const caveat = page.getByTestId('withdraw-caveat');
        if (foreignInFlight > 0) {
            await expect(
                caveat,
                `${foreignInFlight} foreign in-flight deal(s) → the party-private caveat renders (informational, not blocking)`,
            ).toBeVisible({ timeout: 30000 });
            await expect(caveat).toContainText(/could not be checked/);
            await expect(caveat).toContainText(/party-private/);
        } else {
            await expect(caveat, 'no unverifiable deals → no caveat').toBeHidden();
        }

        // ── RECLAIM + VALUE LEG: click; DepositWithdrawn lands; the registry
        //    escrow drops by exactly the deposit and the registeredBy's ETH rises by
        //    exactly deposit − gas (both read from the chain). ──
        const deposit = await publicClient.readContract({
            address: registry, abi: ASSEMBLY_REGISTRY_ABI, functionName: 'registrationDeposit',
        }) as bigint;
        const blockBefore = await publicClient.getBlockNumber();
        const [registryEthBefore, authorEthBefore] = await Promise.all([
            publicClient.getBalance({ address: registry }),
            publicClient.getBalance({ address: REGISTERED_BY }),
        ]);

        await reclaimBtn.click();
        await expect(
            reclaimBtn,
            'the affordance reflects the reclaim (stakeWithdrawn)',
        ).toHaveText('Stake reclaimed', { timeout: 60000 });
        await expect(reclaimBtn).toBeDisabled();

        // The event, from strictly after the pre-click head (pattern 17),
        // keyed by THIS run's compositionHash.
        const withdrawnEvents = await publicClient.getContractEvents({
            address: registry, abi: ASSEMBLY_REGISTRY_ABI, eventName: 'DepositWithdrawn',
            args: { compositionHash }, fromBlock: blockBefore + 1n,
        });
        expect(withdrawnEvents, 'exactly one DepositWithdrawn for this binding').toHaveLength(1);
        expect((withdrawnEvents[0].args.registeredBy as string).toLowerCase()).toBe(REGISTERED_BY.toLowerCase());
        expect(withdrawnEvents[0].args.amount, 'the event carries the exact deposit').toBe(deposit);

        // Registry escrow: exact, gas-free side.
        const registryEthAfter = await publicClient.getBalance({ address: registry });
        expect(registryEthBefore - registryEthAfter, 'registry escrow decreased by exactly the deposit').toBe(deposit);

        // RegisteredBy wallet: exact, gas-accounted — the withdraw is the registeredBy's
        // only transaction between the two reads.
        const receipt = await publicClient.getTransactionReceipt({ hash: withdrawnEvents[0].transactionHash });
        expect(receipt.status, 'the withdraw transaction succeeded').toBe('success');
        const gasCost = receipt.gasUsed * receipt.effectiveGasPrice;
        const authorEthAfter = await publicClient.getBalance({ address: REGISTERED_BY });
        expect(
            authorEthAfter - authorEthBefore,
            'registeredBy received exactly the deposit minus gas',
        ).toBe(deposit - gasCost);
        test.info().annotations.push({
            type: 'DepositWithdrawn',
            description: `composition=${compositionHash} deposit=${deposit} gas=${gasCost} tx=${receipt.transactionHash}`,
        });

        // ── DE-SURFACE REFLECTION: a fresh read of the view page resolves the
        //    binding's withdrawn state from the chain (not local state) — the
        //    button renders "Stake reclaimed", disabled. The binding itself is
        //    permanent; only the stake moved. ──
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.getByTestId('assembly-view-page').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const reloadedBtn = page.getByTestId('view-withdraw-button');
        await reloadedBtn.waitFor({ state: 'visible', timeout: 30000 });
        await expect(reloadedBtn, 'the withdrawn state is chain-derived, not session state').toHaveText('Stake reclaimed', { timeout: 30000 });
        await expect(reloadedBtn).toBeDisabled();
    });
});
