/**
 * agreement-withdraw.devnet.spec.ts — the registered-agreement stake reclaim,
 * end to end: a designer registers an agreement on its own from the canvas's
 * AgreementDrawer (staked intent), then reclaims the stake from the designer
 * landing's "Your registered agreements" list (`RegisteredAgreementsReclaim`,
 * one `ReclaimStakeRow` per registration), and the registry refunds exactly
 * the deposit.
 *
 * ONE spec, registeredBy-driven, in the shape of assembly-withdraw: publish
 * (staked intent) → reclaim + exact refund. `AgreementRegistry.withdrawDeposit`
 * is once-only per PERMANENT binding, so nothing survives for a runtime spec.
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
 * THE GATE IS NOT EXERCISED here, only its open state. The blocked state needs
 * a VERIFIED in-flight trade whose committed agreement's decoded provenance
 * names this agreementHash (`withdrawGate.ts` `resolveInFlightAgreements` →
 * `deriveAgreementWithdrawGate`): an assembly composed from the agreement,
 * published, bound by a seller, and checked out and committed in THIS browser
 * context (only a witnessed order is verified). That is the full
 * assembly-withdraw choreography; no shorter UI path produces such an order.
 * What this spec asserts of the gate: with no trade composed from the fresh
 * agreement, the row's reclaim renders ENABLED once the gate is read, and any
 * foreign in-flight trades (never witnessed by this fresh context) surface as
 * the party-private caveat, never a block.
 *
 * VALUE LEGS (the chain is the point):
 *   register — designer ETH ↓ exactly (deposit + gasUsed×effectiveGasPrice);
 *              registry ETH ↑ exactly deposit
 *   reclaim  — registry ETH ↓ exactly deposit;
 *              designer ETH ↑ exactly (deposit − gasUsed×effectiveGasPrice)
 *
 * Requires Anvil + ./scripts/devup.sh (deploy + populate: the DAO's mandatory
 * clauses the drawer composes in) + Kubo + :3100.
 */
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import { createPublicClient, defineChain, http, type Hex } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { readLocalDeploymentConfig, readAgreementBinding, waitForConnected } from './devnet-helpers';
import { makeProbeSpec, registerProbeClause } from './probeAssembly';
import { AGREEMENT_REGISTRY_ABI } from '@figaro-protocol/sdk';
import { CORE_ABI } from '@/lib/kernel/contracts';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});
const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';

// anvil[9] — the agreement DESIGNER. Anvil launches 39 unlocked accounts
// (scripts/devup.sh) and every index 0..38 is referenced by some e2e file, so
// no index is wholly unused. anvil[9] is the least contended: no spec signs
// with it; populate-test-data seeds it as a member (Linden Florist) and
// visitor-discover only READS that member's binding. This spec spends only the
// wallet's ETH (stake + gas) and touches no member profile, catalog or token
// balance, so the seeded member is unaffected; every ETH assert is a delta
// between reads with only this spec's own transaction in between.
const DESIGNER = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 9 }).address as Hex;

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
        // The DAO's mandatory commerce + topology are written into every
        // agreement the canvas registers (`composeOrderAgreement` with
        // `mandatoryClausesForCanvas()`); wait until the drawer has read them,
        // or the composition has no commerce/topology to write in.
        await page.getByTestId('drawer-mandatory-list').waitFor({ state: 'visible', timeout: 30000 });
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
        await expect(reclaimBtn).toHaveText('Reclaim stake');
        await expect(reclaimBtn).toHaveAttribute('title', /^Reclaim your registration stake\./);

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

        // ── RECLAIM + VALUE LEG: click; DepositWithdrawn lands; the registry
        //    escrow drops by exactly the deposit and the designer's ETH rises by
        //    exactly deposit − gas (both read from the chain). ──
        const withdrawFrom = await publicClient.getBlockNumber();
        const [registryEth2, designerEth2] = await Promise.all([
            publicClient.getBalance({ address: registry }),
            publicClient.getBalance({ address: DESIGNER }),
        ]);

        await reclaimBtn.click();
        await expect(reclaimBtn, 'the affordance reflects the reclaim').toHaveText('Stake reclaimed', { timeout: 60000 });
        await expect(reclaimBtn).toBeDisabled();
        await expect(page.getByTestId('agreement-withdraw-error')).toHaveCount(0);

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

        // Designer wallet: exact, gas-accounted — the withdraw is the designer's
        // only transaction between the two reads.
        const withdrawReceipt = await publicClient.getTransactionReceipt({ hash: withdrawnEvents[0].transactionHash });
        expect(withdrawReceipt.status, 'the withdraw transaction succeeded').toBe('success');
        const withdrawGas = withdrawReceipt.gasUsed * withdrawReceipt.effectiveGasPrice;
        const designerEth3 = await publicClient.getBalance({ address: DESIGNER });
        expect(designerEth3 - designerEth2, 'designer received exactly the deposit minus gas').toBe(deposit - withdrawGas);

        // The binding is permanent; only the stake moved.
        const after = await readAgreementBinding(agreementHash);
        expect(after?.registeredBy.toLowerCase(), 'the binding stays anchored to the designer').toBe(DESIGNER.toLowerCase());
        expect(after?.stakeWithdrawn, 'the binding records the reclaim').toBe(true);
        test.info().annotations.push({
            type: 'DepositWithdrawn',
            description: `agreement=${agreementHash} deposit=${deposit} gas=${withdrawGas} tx=${withdrawReceipt.transactionHash}`,
        });

        // ── CHAIN-DERIVED REFLECTION: a fresh read of the landing folds
        //    DepositWithdrawn into the row (the wallet-scoped read keeps
        //    withdrawn rows, flagged) — "stake reclaimed", the button disabled. ──
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.getByTestId('agreements-reclaim-list').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const reloadedRow = page.getByTestId(`agreement-reclaim-row-${agreementHash}`);
        await reloadedRow.waitFor({ state: 'visible', timeout: 30000 });
        await expect(
            page.getByTestId(`agreement-reclaim-state-${agreementHash}`),
            'the withdrawn state is chain-derived, not session state',
        ).toHaveText('stake reclaimed', { timeout: 30000 });
        const reloadedBtn = reloadedRow.getByTestId('agreement-withdraw-button');
        await expect(reloadedBtn).toHaveText('Stake reclaimed', { timeout: 30000 });
        await expect(reloadedBtn).toBeDisabled();
    });
});
