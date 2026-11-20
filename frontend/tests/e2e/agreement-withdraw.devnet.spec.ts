/**
 * agreement-withdraw.devnet.spec.ts — the registered-agreement stake reclaim,
 * end to end: a designer registers an agreement on its own from the canvas's
 * AgreementDrawer (staked intent), then reclaims the stake from the designer
 * landing's "Your registered agreements" list (`RegisteredAgreementsReclaim`,
 * one `ReclaimStakeRow` per registration) in two steps, a request and a claim,
 * and the registry pays back exactly the deposit at the claim.
 *
 * ONE spec, registeredBy-driven, in the shape of assembly-withdraw: publish
 * (staked intent) → request (de-surfaces, moves no ETH) → claim + exact
 * payment. The devnet deploys the registry with a cooldown of 0
 * (`script/Deploy.s.sol`), so the claim is due in the request's block.
 * `AgreementRegistry.requestWithdrawal` is once-only per PERMANENT binding, so
 * nothing survives for a runtime spec.
 *
 * Fresh binding per run — the probeAssembly nonce. An agreement's identity is
 * its composition (`AgreementRegistry`'s notice: the merkle root over one leaf
 * per composed clause; editorial prose is excluded), so a nonce in the NAME
 * alone would hash to the same agreementHash and the second run would revert
 * `AgreementAlreadyRegistered`. The nonce therefore goes into a per-run probe
 * clause (`registerProbeClause(makeProbeSpec(...))`, the sanctioned helper):
 * composing it makes the agreement's bytes — and its key — new every run. The
 * nonce is in the agreement's name too (the canvas names the pinned document
 * `${assembly name} · order 1` — DesignerCanvas `registerOrderAgreement`), so
 * the reclaim row is labeled by this run's document.
 *
 * THE GATE, OPEN (the first test): with no trade composed from the fresh
 * agreement, the row's reclaim renders ENABLED once the gate is read, and any
 * foreign in-flight trades (never witnessed by this fresh context) surface as
 * the party-private caveat, never a block.
 *
 * THE GATE, BLOCKED (the second test): the blocked state needs a VERIFIED
 * in-flight trade whose committed agreement's decoded provenance names the
 * agreementHash (`withdrawGate.ts` `resolveInFlightAgreements` →
 * `deriveAgreementWithdrawGate`). Publishing an assembly through the designer
 * registers each new agreement under the publishing wallet
 * (`publishAssembly.ts`), so `publishProbeAssembly` gives the designer a
 * registered agreement AND an assembly composing it. A seller binds that
 * assembly, the buyer checks out in THIS browser context (only a witnessed
 * order is verified), the seller accepts: the row's reclaim is disabled and
 * its reason names the one trade. The buyer resolves: the reclaim is enabled.
 *
 * VALUE LEGS (the chain is the point):
 *   register — designer ETH ↓ exactly (deposit + gasUsed×effectiveGasPrice);
 *              registry ETH ↑ exactly deposit
 *   reclaim  — registry ETH ↓ exactly deposit;
 *              designer ETH ↑ exactly (deposit − gasUsed×effectiveGasPrice)
 *
 * The second test's three wallets are keys this spec derives (no anvil index:
 * every one of 0..46 is some spec's), funded by `fundDevnetWallets` and signed
 * for in the browser through the local-key signer bridge (`local-signer.ts`).
 *
 * Requires Anvil + ./scripts/devup.sh (deploy + populate) + Kubo + :3100.
 */
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import { createPublicClient, defineChain, http, keccak256, stringToHex, type Hex } from 'viem';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import {
    confirmAgreementPreviews,
    discoverAnchoredAssemblies,
    fundDevnetWallets,
    isBindingOf,
    memberProfileBindings,
    pinJSONToIPFS,
    readLocalDeploymentConfig,
    readAgreementBinding,
    seedRegisteredMember,
    waitForConnected,
} from './devnet-helpers';
import { attachLocalSigner } from './local-signer';
import { makeProbeSpec, publishProbeAssembly, registerProbeClause } from './probeAssembly';
import { AGREEMENT_REGISTRY_ABI } from '@figaro-protocol/sdk';
import { CORE_ABI } from '@/lib/core/contracts';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});
const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';

// anvil[9] — the agreement DESIGNER. Anvil launches 47 unlocked accounts
// (scripts/devup.sh) and every index 0..46 is referenced by some e2e file, so
// no index is wholly unused. anvil[9] is the least contended: no spec signs
// with it; populate-test-data seeds it as a member (Linden Florist) and
// visitor-discover only READS that member's binding. This spec spends only the
// wallet's ETH (stake + gas) and touches no member profile, catalog or token
// balance, so the seeded member is unaffected; every ETH assert is a delta
// between reads with only this spec's own transaction in between.
const DESIGNER = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 9 }).address as Hex;

// The blocked-gate test's own wallets: keys derived from this file's name and
// the role, so a re-run signs as the same three wallets and no other spec does.
const GATE_DESIGNER_KEY = keccak256(stringToHex('agreement-withdraw.devnet.spec.ts:designer'));
const GATE_SELLER_KEY = keccak256(stringToHex('agreement-withdraw.devnet.spec.ts:seller'));
const GATE_BUYER_KEY = keccak256(stringToHex('agreement-withdraw.devnet.spec.ts:buyer'));

test.describe('AgreementRegistry withdraw — the designer reclaims an agreement stake (devnet)', () => {
    test.setTimeout(240_000);

    test('designer registers an agreement from the drawer, reclaims it on the designer landing; registry refunds exactly the deposit', async ({ page }) => {
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });

        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const registry = (process.env.NEXT_PUBLIC_AGREEMENT_REGISTRY ?? config.agreementRegistry) as Hex;
        expect(registry, 'the AgreementRegistry address is configured').toBeTruthy();
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const deposit = await publicClient.readContract({
            address: registry, abi: AGREEMENT_REGISTRY_ABI, functionName: 'registrationDeposit',
        }) as bigint;

        // ── PROBE CLAUSE: the per-run nonce lives in a fresh clause spec, so
        //    the composed agreement's key is new every run. Registered by the
        //    shared helper (signs as anvil[0]) BEFORE the designer's baselines. ──
        const nonce = `${Date.now()}`;
        const clauseKey = await registerProbeClause(
            makeProbeSpec(`figaro-probe-agreement-${nonce}`, `Probe agreement term ${nonce}`),
        );
        const assemblyName = `Agreement withdraw ${nonce}`;

        // ── COMPOSE (design time, the designer's verb): a blank canvas, the
        //    root order's drawer, the probe clause composed on its registry tab. ──
        await gotoAsWallet(page, DESIGNER, '/assemblies/designer/new?fresh=1&e2e=devnet');
        await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        await page.getByTestId('designer-saved-hint').waitFor({ timeout: 15000 });

        // The name the canvas gives the pinned agreement document
        // (`${name} · order ${index + 1}` — DesignerCanvas registerOrderAgreement).
        await page.getByTestId('designer-name-input').fill(assemblyName);

        const rootNode = page.locator('[data-testid^="order-node-"]:not([data-testid$="-delete"])').first();
        await rootNode.waitFor({ state: 'visible', timeout: 10000 });
        await rootNode.click();
        await page.getByTestId('agreement-drawer').waitFor({ state: 'visible', timeout: 10000 });
        await page.getByTestId('drawer-tab-registry').click();
        await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });
        const probe = page.getByTestId(`drawer-registry-clause-${clauseKey}`);
        await expect(probe, 'the drawer surfaces the just-registered probe clause').toHaveCount(1, { timeout: 20000 });
        await probe.check();

        // ── REGISTER ON ITS OWN (staked intent): the drawer's agreements tab
        //    (AgreementDrawer presentArticles: identity, agreements, registry). ──
        await page.getByTestId('drawer-tab-agreements').click();
        await page.getByTestId('drawer-section-agreements').waitFor({ state: 'visible', timeout: 5000 });
        const registerBtn = page.getByTestId('drawer-register-agreement');
        await expect(registerBtn, 'one composed clause → the register action is open').toBeEnabled({ timeout: 10000 });

        const registerFrom = await publicClient.getBlockNumber();
        const [registryEth0, designerEth0] = await Promise.all([
            publicClient.getBalance({ address: registry }),
            publicClient.getBalance({ address: DESIGNER }),
        ]);
        await registerBtn.click();

        // The order now BINDS the registered key; the bound hash's title is the
        // full agreementHash (AgreementDrawer `drawer-bound-agreement-hash`).
        const boundHash = page.getByTestId('drawer-bound-agreement-hash');
        await expect(boundHash, 'the registration binds the order to its registered agreement').toBeVisible({ timeout: 60000 });
        await expect(page.getByTestId('drawer-register-agreement-error')).toHaveCount(0);
        const drawerHash = (await boundHash.getAttribute('title')) as Hex;
        expect(drawerHash, 'the bound key is a full agreementHash').toMatch(/^0x[0-9a-fA-F]{64}$/);

        // The chain fact: exactly one AgreementRegistered by the designer since
        // the pre-click head (pattern 17), keyed by the drawer's hash.
        const registeredEvents = await publicClient.getContractEvents({
            address: registry, abi: AGREEMENT_REGISTRY_ABI, eventName: 'AgreementRegistered',
            args: { registeredBy: DESIGNER }, fromBlock: registerFrom + 1n,
        });
        expect(registeredEvents, 'exactly one AgreementRegistered for this run').toHaveLength(1);
        const agreementHash = registeredEvents[0].args.agreementHash as Hex;
        expect(agreementHash.toLowerCase(), 'the registered key is the one the drawer bound').toBe(drawerHash.toLowerCase());
        const binding = await readAgreementBinding(agreementHash);
        expect(binding?.registeredBy.toLowerCase(), 'the binding names the designer of record').toBe(DESIGNER.toLowerCase());
        expect(binding?.stakeWithdrawn, 'the stake is live').toBe(false);

        // Value leg (register): the stake left the designer and reached the
        // registry — exact, gas-accounted on the designer's side.
        const registerReceipt = await publicClient.getTransactionReceipt({ hash: registeredEvents[0].transactionHash });
        expect(registerReceipt.status, 'the registration transaction succeeded').toBe('success');
        const registerGas = registerReceipt.gasUsed * registerReceipt.effectiveGasPrice;
        const [registryEth1, designerEth1] = await Promise.all([
            publicClient.getBalance({ address: registry }),
            publicClient.getBalance({ address: DESIGNER }),
        ]);
        expect(registryEth1 - registryEth0, 'registry escrow increased by exactly the deposit').toBe(deposit);
        expect(designerEth0 - designerEth1, 'designer paid exactly the deposit plus gas').toBe(deposit + registerGas);

        // ── RECLAIM SURFACE: the designer landing's registered-agreements list
        //    (RegisteredAgreementsReclaim → ReclaimStakeRow, test ids
        //    `agreement-reclaim-row-<key>` / `agreement-reclaim-state-<key>` /
        //    `agreement-withdraw-button` / `agreement-withdraw-caveat`). ──
        await gotoAsWallet(page, DESIGNER, '/assemblies/designer?e2e=devnet');
        await page.getByTestId('agreements-reclaim-list').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const row = page.getByTestId(`agreement-reclaim-row-${agreementHash}`);
        await row.waitFor({ state: 'visible', timeout: 30000 });
        await expect(
            page.getByTestId(`agreement-reclaim-state-${agreementHash}`),
            'the registration reads live',
        ).toHaveText('live');
        // The row is labeled by its pinned document's name, read and verified
        // against its key (fetchRegisteredAgreement).
        await expect(row, "the row names this run's agreement document").toContainText(`${assemblyName} · order 1`, { timeout: 30000 });

        // ── GATE, OPEN: no trade composes this fresh agreement, so the reclaim
        //    is enabled once the gate is read (pending also disables). ──
        const reclaimBtn = row.getByTestId('agreement-withdraw-button');
        await reclaimBtn.waitFor({ state: 'visible', timeout: 30000 });
        await expect(reclaimBtn, 'no composed trade in flight → the reclaim is enabled').toBeEnabled({ timeout: 60000 });
        await expect(reclaimBtn).toHaveText('Request stake back');
        await expect(reclaimBtn).toHaveAttribute('title', /^Ask for your registration stake back\./);

        // Foreign in-flight orders (an active order of an unresolved process)
        // are never witnessed by this fresh context → the caveat strip renders
        // iff any exist. Determined out of band from the same chain state.
        const [allCommitted, allResolved] = await Promise.all([
            publicClient.getContractEvents({ address: core, abi: CORE_ABI, eventName: 'OrderCommitted', fromBlock: 0n }),
            publicClient.getContractEvents({ address: core, abi: CORE_ABI, eventName: 'ProcessResolved', fromBlock: 0n }),
        ]);
        const resolvedProcesses = new Set(allResolved.map((e) => (e.args.processId as string).toLowerCase()));
        const foreignInFlight = allCommitted.filter(
            (e) => !resolvedProcesses.has((e.args.processId as string).toLowerCase()),
        ).length;
        const caveat = row.getByTestId('agreement-withdraw-caveat');
        if (foreignInFlight > 0) {
            await expect(
                caveat,
                `${foreignInFlight} foreign in-flight trade(s) → the party-private caveat renders (informational, not blocking)`,
            ).toBeVisible({ timeout: 30000 });
            await expect(caveat).toContainText(/could not be checked/);
            await expect(caveat).toContainText(/party-private/);
        } else {
            await expect(caveat, 'no unverifiable trades → no caveat').toBeHidden();
        }

        // ── REQUEST: click; WithdrawalRequested lands; the row reads requested
        //    and offers no second request; no ETH moves. ──
        const requestFrom = await publicClient.getBlockNumber();
        const registryEth2 = await publicClient.getBalance({ address: registry });

        await reclaimBtn.click();
        await expect(
            page.getByTestId(`agreement-reclaim-state-${agreementHash}`),
            'the row reflects the request',
        ).toHaveText('withdrawal requested', { timeout: 60000 });
        await expect(row.getByTestId('agreement-withdraw-button'), 'no second request').toHaveCount(0);
        await expect(page.getByTestId('agreement-withdraw-error')).toHaveCount(0);

        const requestedEvents = await publicClient.getContractEvents({
            address: registry, abi: AGREEMENT_REGISTRY_ABI, eventName: 'WithdrawalRequested',
            args: { agreementHash }, fromBlock: requestFrom + 1n,
        });
        expect(requestedEvents, 'exactly one WithdrawalRequested for this binding').toHaveLength(1);
        expect((requestedEvents[0].args.registeredBy as string).toLowerCase()).toBe(DESIGNER.toLowerCase());
        expect(requestedEvents[0].args.amount, 'the event carries the exact deposit').toBe(deposit);
        expect(await publicClient.getBalance({ address: registry }), 'the request moves no ETH').toBe(registryEth2);
        expect((await readAgreementBinding(agreementHash))?.stakeWithdrawn, 'the binding marks the request').toBe(true);

        // ── CLAIM + VALUE LEG: the devnet cooldown is 0, so the chain's
        //    `withdrawable` is true at once; click; DepositWithdrawn lands; the
        //    registry escrow drops by exactly the deposit and the designer's ETH
        //    rises by exactly deposit − gas (both read from the chain). ──
        const claimBtn = row.getByTestId('agreement-claim-button');
        await expect(claimBtn, 'the chain says the stake is withdrawable').toBeEnabled({ timeout: 60000 });
        const withdrawFrom = await publicClient.getBlockNumber();
        const designerEth2 = await publicClient.getBalance({ address: DESIGNER });

        await claimBtn.click();
        await expect(
            page.getByTestId(`agreement-reclaim-state-${agreementHash}`),
            'the row reflects the claim',
        ).toHaveText('stake reclaimed', { timeout: 60000 });
        await expect(row.getByTestId('agreement-claim-button'), 'nothing left to claim').toHaveCount(0);
        await expect(page.getByTestId('agreement-claim-error')).toHaveCount(0);

        // The event, from strictly after the pre-click head (pattern 17), keyed
        // by THIS run's agreementHash.
        const withdrawnEvents = await publicClient.getContractEvents({
            address: registry, abi: AGREEMENT_REGISTRY_ABI, eventName: 'DepositWithdrawn',
            args: { agreementHash }, fromBlock: withdrawFrom + 1n,
        });
        expect(withdrawnEvents, 'exactly one DepositWithdrawn for this binding').toHaveLength(1);
        expect((withdrawnEvents[0].args.registeredBy as string).toLowerCase()).toBe(DESIGNER.toLowerCase());
        expect(withdrawnEvents[0].args.amount, 'the event carries the exact deposit').toBe(deposit);

        // Registry escrow: exact, gas-free side.
        const registryEth3 = await publicClient.getBalance({ address: registry });
        expect(registryEth2 - registryEth3, 'registry escrow decreased by exactly the deposit').toBe(deposit);

        // Designer wallet: exact, gas-accounted — the claim is the designer's
        // only transaction between the two reads.
        const withdrawReceipt = await publicClient.getTransactionReceipt({ hash: withdrawnEvents[0].transactionHash });
        expect(withdrawReceipt.status, 'the claim transaction succeeded').toBe('success');
        const withdrawGas = withdrawReceipt.gasUsed * withdrawReceipt.effectiveGasPrice;
        const designerEth3 = await publicClient.getBalance({ address: DESIGNER });
        expect(designerEth3 - designerEth2, 'designer received exactly the deposit minus gas').toBe(deposit - withdrawGas);

        // The binding is permanent; only the stake moved.
        const after = await readAgreementBinding(agreementHash);
        expect(after?.registeredBy.toLowerCase(), 'the binding stays anchored to the designer').toBe(DESIGNER.toLowerCase());
        expect(after?.stakeWithdrawn, 'the binding marks the withdrawal').toBe(true);
        test.info().annotations.push({
            type: 'DepositWithdrawn',
            description: `agreement=${agreementHash} deposit=${deposit} gas=${withdrawGas} tx=${withdrawReceipt.transactionHash}`,
        });

        // ── CHAIN-DERIVED REFLECTION: a fresh read of the landing folds
        //    WithdrawalRequested into the row and reads `releaseAt` back as 0
        //    (paid out) — "stake reclaimed", nothing to request or claim. ──
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.getByTestId('agreements-reclaim-list').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const reloadedRow = page.getByTestId(`agreement-reclaim-row-${agreementHash}`);
        await reloadedRow.waitFor({ state: 'visible', timeout: 30000 });
        await expect(
            page.getByTestId(`agreement-reclaim-state-${agreementHash}`),
            'the withdrawn state is chain-derived, not session state',
        ).toHaveText('stake reclaimed', { timeout: 30000 });
        await expect(reloadedRow.getByTestId('agreement-withdraw-button')).toHaveCount(0);
        await expect(reloadedRow.getByTestId('agreement-claim-button')).toHaveCount(0);
    });

    test('a verified in-flight trade composed from the agreement disables the reclaim; the buyer\'s resolution enables it', async ({ page }) => {
        test.setTimeout(360_000);
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });

        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const token = config.tokenAddress as Hex;
        const agreementRegistry = (process.env.NEXT_PUBLIC_AGREEMENT_REGISTRY ?? config.agreementRegistry) as Hex;
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        const designer = privateKeyToAccount(GATE_DESIGNER_KEY);
        const seller = privateKeyToAccount(GATE_SELLER_KEY);
        const buyer = privateKeyToAccount(GATE_BUYER_KEY);
        await fundDevnetWallets([designer.address, seller.address, buyer.address]);
        await attachLocalSigner(page.context(), {
            accounts: [designer, seller, buyer], chain: LOCAL_ANVIL, rpcUrl: RPC_URL, defaultAccount: designer.address,
        });

        // ── PUBLISH: the designer publishes an assembly carrying a per-run
        //    probe clause through the canvas; the publish registers the
        //    assembly's one new agreement under the designer first. ──
        const publishFrom = await publicClient.getBlockNumber();
        await gotoAsWallet(page, designer.address, '/?e2e=devnet');
        const { slug, clauseKey: probeClauseKey } = await publishProbeAssembly(page);

        const registered = await publicClient.getContractEvents({
            address: agreementRegistry, abi: AGREEMENT_REGISTRY_ABI, eventName: 'AgreementRegistered',
            args: { registeredBy: designer.address }, fromBlock: publishFrom + 1n,
        });
        expect(registered, 'the publish registered exactly one agreement under the designer').toHaveLength(1);
        const agreementHash = registered[0].args.agreementHash as Hex;
        const anchored = (await discoverAnchoredAssemblies()).find((a) => a.slug === slug);
        expect(anchored, 'the published assembly hydrates from chain → IPFS').toBeTruthy();
        expect(
            anchored!.agreements.map((a) => a.agreementHash.toLowerCase()),
            "the assembly's one order binds the agreement the publish registered",
        ).toEqual([agreementHash.toLowerCase()]);
        const processDesignHash = anchored!.processDesignHash;

        // ── BIND: the seller's profile binds exactly this run's assembly and
        //    lists one item, priced in the devnet token. ──
        const { uri: catalogURI } = await pinJSONToIPFS({
            subjectAddress: seller.address,
            version: '1.0.0',
            unitSystem: 'metric' as const,
            items: [{
                id: 'agreement-gate-item', name: 'Gate item', description: 'An item sold under the probe assembly',
                price: '1', category: 'digital', available: true,
            }],
        });
        await seedRegisteredMember({
            walletKey: GATE_SELLER_KEY,
            profile: {
                name: 'Agreement gate seller',
                description: 'Seeded by agreement-withdraw.devnet.spec.ts',
                catalogURI,
                acceptedTokens: [{ address: token, symbol: 'MOCK', chainId: LOCAL_ANVIL.id }],
                defaultTokenAddress: token,
                processBindings: [{
                    bindingId: `agreement-gate-${slug}`,
                    subjectAddress: seller.address,
                    processDesignHash,
                    coSellerBindings: [],
                }],
            },
        });
        expect(
            (await memberProfileBindings(seller.address)).some((b) => isBindingOf(b, processDesignHash)),
            "the seller's pinned profile binds this run's assembly",
        ).toBe(true);

        // ── COMMIT: the buyer checks out in THIS context (the order is
        //    witnessed, so the designer's gate verifies it); the seller accepts. ──
        const queryCommitted = () => publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: buyer.address }, fromBlock: 0n,
        });
        const committedBefore = (await queryCommitted()).length;
        await gotoAsWallet(page, buyer.address, `/s/view?seller=${seller.address}&e2e=devnet`);
        await page.getByTestId('member-detail-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const addBtn = page.locator('[data-testid^="btn-add-"]').first();
        await addBtn.waitFor({ state: 'visible', timeout: 20000 });
        await addBtn.click();
        await page.getByTestId('btn-review-order').click();
        await page.getByTestId('checkout-view').waitFor({ timeout: 20000 });
        await expect(page.getByTestId('method-static'), 'the one binding names the probe assembly')
            .toHaveAttribute('data-method', slug, { timeout: 30000 });
        // The probe clause's one field names no filler, so the buyer fills it.
        await page.locator(`[data-testid^="checkout-field-"][data-testid$="-${probeClauseKey}-probeStage-probe-opened"]`).check();
        const place = page.getByTestId('btn-place-order');
        await expect(place, 'buyer connected + order ready → "Place order"').toHaveText(/Place order/, { timeout: 20000 });
        await place.click();
        await confirmAgreementPreviews(page, 1);
        await page.getByTestId('send-commitment-xmtp').click();
        await expect(page.getByTestId('commitment-xmtp-status')).toBeVisible({ timeout: 30000 });

        await gotoAsWallet(page, seller.address, '/orders?e2e=devnet');
        await page.getByTestId('orders-list').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        await page.getByTestId('order-your-turn-card').first().waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId('btn-accept-order').first().click();
        await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId('preview-confirm').click();
        await expect.poll(async () => (await queryCommitted()).length, {
            timeout: 60000, message: 'the order commits on-chain',
        }).toBe(committedBefore + 1);
        const committed = (await queryCommitted()).at(-1)!;
        expect(committed.args.seller?.toLowerCase(), 'committed against the bound seller').toBe(seller.address.toLowerCase());
        const processId = committed.args.processId!;

        // ── GATE, BLOCKED: the designer's registered-agreements list. The row's
        //    reclaim is disabled and its reason names the one verified trade. ──
        const designerRowButton = async () => {
            await gotoAsWallet(page, designer.address, '/assemblies/designer?e2e=devnet');
            await page.getByTestId('agreements-reclaim-list').waitFor({ timeout: 30000 });
            await waitForConnected(page);
            const row = page.getByTestId(`agreement-reclaim-row-${agreementHash}`);
            await row.waitFor({ state: 'visible', timeout: 30000 });
            await expect(page.getByTestId(`agreement-reclaim-state-${agreementHash}`), 'the registration reads live').toHaveText('live');
            return row.getByTestId('agreement-withdraw-button');
        };
        const blockedBtn = await designerRowButton();
        await expect(blockedBtn, 'the reason names the one verified in-flight trade').toHaveAttribute(
            'title', /^Cannot reclaim the stake yet: 1 in-flight trade still composes this registration\./, { timeout: 60000 },
        );
        await expect(blockedBtn, 'the reclaim is disabled while the composed trade is in flight').toBeDisabled();
        expect((await readAgreementBinding(agreementHash))?.stakeWithdrawn, 'the stake is still held').toBe(false);

        // ── RESOLVE: the buyer resolves the process; the trade leaves the
        //    in-flight set. ──
        const queryResolved = () => publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'ProcessResolved', args: { processId }, fromBlock: 0n,
        });
        await gotoAsWallet(page, buyer.address, `/orders/view?process=${processId}&e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const resolveBtn = page.getByTestId('capability-execute-resolve-process');
        await expect(resolveBtn, 'the buyer can resolve the active process').toBeEnabled({ timeout: 30000 });
        await resolveBtn.click();
        await expect.poll(async () => (await queryResolved()).length, {
            timeout: 60000, message: 'ProcessResolved lands on-chain for this process',
        }).toBe(1);

        // ── GATE, OPEN: the same row, read again, offers the reclaim. ──
        const openBtn = await designerRowButton();
        await expect(openBtn, 'every composed trade resolved → the reclaim is enabled').toBeEnabled({ timeout: 60000 });
        await expect(openBtn).toHaveAttribute('title', /^Ask for your registration stake back\./);
        await expect(openBtn).toHaveText('Request stake back');
    });
});
