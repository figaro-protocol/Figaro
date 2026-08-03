/**
 * tradelens-runtime.devnet.spec.ts
 *
 * TRADELENS RUNTIME — the consuming leg of the scenario pair. Reads the
 * assembly scenario-tradelens anchored (registry → IPFS, the mainnet way;
 * never re-pins), then runs the six-order chain end to end, every
 * participant through its OWN interface, with every value movement asserted
 * from chain:
 *
 *   checkout  the importer-of-record (buyer) orders the container chain from
 *             the shipper's page, fills the transaction particulars, signs
 *             all six orders, relays.
 *   accepts   each of the six sellers accepts on ITS /orders — root first,
 *             then commit order; after every accept the exact 2P/2G bond
 *             deltas are asserted from token balances (the money legs).
 *   witnesses the story of the container, filed by the party that lived it:
 *             the shipper seals (chain-of-custody "applied"), the inspector
 *             passes the goods (acceptance-criteria "conforming"), the
 *             forwarder and customs agent walk their merchant-process
 *             ladders, the carrier records the reefer period (cold-chain),
 *             takes custody (chain-of-custody "transferred") and discloses
 *             voyage emissions (gramsCO2e), the inland carrier witnesses the
 *             hand-off (proximity band). Every witness is verified
 *             out-of-band: the AttestationCoordinator's Attestation event
 *             count for the process advances.
 *   resolve   buyer dominance — ONE signature settles all six orders; net
 *             settlement asserted per wallet (buyer −8.45, each seller +its
 *             price, the core escrow back to baseline).
 *   audit     the new clauses' evidence surfaces in the audit bundle.
 */
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import { ATTESTATION_COORDINATOR_ABI, USAGE_COUNTER_ABI, calculateBonds } from '@figaro/sdk';
import { mnemonicToAccount } from 'viem/accounts';
import { createPublicClient, createWalletClient, http, parseAbi, parseUnits, type Hex } from 'viem';
import type { Page } from '@playwright/test';
import {
    LOCAL_ANVIL,
    RPC_URL,
    confirmAgreementPreviews,
    discoverAnchoredAssemblies,
    ladderLabelsFromChain,
    readLocalDeploymentConfig,
    waitForConnected,
} from './devnet-helpers';
import { CORE_ABI } from '@/lib/kernel/contracts';
import {
    C,
    CARRIER,
    COMMIT_ORDER,
    CUSTOMS,
    DEVICE,
    FORWARDER,
    INLAND,
    INSPECTOR,
    PRICES,
    SHIPPER,
    TRADELENS_BUYER as BUYER,
    fillTradelensCheckout,
    findTradelensAssembly,
} from './tradelensScenario';

const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';
const ERC20_ABI = parseAbi([
    'function balanceOf(address) view returns (uint256)',
    'function mint(address to, uint256 amount) external',
]);

test.describe('TRADELENS RUNTIME — six sellers bond, the container story attests, one resolve pays the chain (devnet)', () => {
    test.setTimeout(900_000);

    test('accept → witness → resolve, every money leg from chain', async ({ page, context }) => {
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });
        await context.grantPermissions(['geolocation']);
        await context.setGeolocation({ latitude: DEVICE.lat, longitude: DEVICE.lon });

        // ── CONSUME the scenario leg's artifact — never re-create it. ──
        const slug = await findTradelensAssembly();
        expect(slug, 'the Tradelens assembly is anchored — run scenario-tradelens first').toBeTruthy();

        const config = readLocalDeploymentConfig();
        const token = config.tokenAddress as Hex;
        const core = config.figaroCore as Hex;
        const coordinator = config.attestationCoordinator as Hex;
        const registry = config.clauseRegistry as Hex;
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const balanceOf = (who: Hex) =>
            publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;

        // ── FUND every party (permissionless devnet mint): the buyer's
        //    payment+bond legs and each seller's 2G bond — the last seller
        //    bonds against the full chain value. ──
        const minter = createWalletClient({
            account: mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 0 }), chain: LOCAL_ANVIL, transport: http(RPC_URL),
        });
        for (const who of [BUYER, ...COMMIT_ORDER.map((c) => c.who.address)]) {
            const h = await minter.writeContract({
                address: token, abi: ERC20_ABI, functionName: 'mint', args: [who, parseUnits('1000', 18)],
            });
            await publicClient.waitForTransactionReceipt({ hash: h });
        }

        // ── BASELINES for every wallet, before any bond moves. ──
        const base = new Map<string, bigint>();
        for (const who of [BUYER, core, ...COMMIT_ORDER.map((c) => c.who.address)]) {
            base.set(who.toLowerCase(), await balanceOf(who));
        }

        page.on('pageerror', (err) => console.log(`[tradelens-rt][pageerror] ${err.message}`));
        page.on('console', (msg) => {
            if (msg.type() === 'error') console.log(`[tradelens-rt][console.error] ${msg.text()}`);
        });

        // ── CHECKOUT: sign the six orders, relay to the shipper. ──
        await gotoAsWallet(page, BUYER, `/s/view?seller=${SHIPPER.address}&e2e=devnet`);
        await page.getByTestId('seller-detail-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const addBtn = page.locator('[data-testid^="btn-add-"]').first();
        await addBtn.waitFor({ state: 'visible', timeout: 20000 });
        await addBtn.click();
        await page.getByTestId('btn-review-order').click();
        await page.getByTestId('checkout-view').waitFor({ timeout: 20000 });
        await waitForConnected(page);
        await fillTradelensCheckout(page);
        const place = page.getByTestId('btn-place-order');
        await expect(place).toHaveText(/Place order/, { timeout: 20000 });
        await place.click();
        await confirmAgreementPreviews(page, 6);
        await page.getByTestId('buyer-share-panel').waitFor({ timeout: 60000 });
        // Sub-orders auto-relay at sign; the ROOT relays from the share panel.
        await page.getByTestId('send-commitment-xmtp').click();
        await expect(page.getByTestId('commitment-xmtp-status')).toBeVisible({ timeout: 30000 });

        // ── ACCEPTS in commit order; exact bond deltas after each. ──
        const queryCommitted = () => publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: BUYER }, fromBlock: 0n,
        });
        const committedBefore = (await queryCommitted()).length;
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
            expect(event.args.seller?.toLowerCase(), `${label}'s order committed against ${label}`)
                .toBe(seller.toLowerCase());
            return event;
        };

        let expectedCumulative = 0n;
        let buyerBondSoFar = 0n;
        let escrowSoFar = 0n;
        let processId: `0x${string}` | undefined;
        for (const { who, label } of COMMIT_ORDER) {
            const event = await acceptAs(who.address, label);
            if (!processId) processId = event.args.processId as `0x${string}`;
            else expect(event.args.processId, `${label}'s order extends the SAME process`).toBe(processId);
            const payment = parseUnits(PRICES[label], 18);
            expectedCumulative += payment;
            expect(event.args.payment, `${label}'s payment = its catalogue price`).toBe(payment);
            expect(event.args.cumulativeValue, `cumulative after ${label} = the running chain value`)
                .toBe(expectedCumulative);
            const bonds = calculateBonds(event.args.cumulativeValue!, event.args.payment!);
            buyerBondSoFar += bonds.buyerBond;
            escrowSoFar += bonds.buyerBond + bonds.sellerBond;
            const [b, s, c] = await Promise.all([balanceOf(BUYER), balanceOf(who.address), balanceOf(core)]);
            expect(base.get(BUYER.toLowerCase())! - b, `after ${label}: buyer down by its buyer bonds so far`)
                .toBe(buyerBondSoFar);
            expect(base.get(who.address.toLowerCase())! - s, `${label} bonds 2× CUMULATIVE upstream value`)
                .toBe(bonds.sellerBond);
            expect(c - base.get(core.toLowerCase())!, 'escrow holds every bond so far').toBe(escrowSoFar);
        }
        expect((await queryCommitted()).length, 'exactly six orders committed').toBe(committedBefore + 6);

        // ── WITNESSES: the container's story, each filed by the party that
        //    lived it, each verified out-of-band via the coordinator event. ──
        const attestationCount = async () => (await publicClient.getContractEvents({
            address: coordinator, abi: ATTESTATION_COORDINATOR_ABI, eventName: 'Attestation',
            args: { processId }, fromBlock: 0n,
        })).length;

        const openTimeline = async (wallet: Hex) => {
            await gotoAsWallet(page, wallet, `/orders/view?process=${processId}&e2e=devnet`);
            await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
            await waitForConnected(page);
        };
        const witnessCap = (clauseId: string) => page.locator(
            `[data-testid="capability-submit-clause-attestation"][data-clause-id="${clauseId}"]`,
        ).first();
        const witnessInput = (clauseId: string, field: string) =>
            page.getByTestId(`capability-input-${clauseId}-${field}`);
        const executeWitness = async (clauseId: string, label: string) => {
            const before = await attestationCount();
            await witnessCap(clauseId).getByTestId('capability-execute-submit-clause-attestation').click();
            await expect.poll(attestationCount, {
                timeout: 60000, message: `${label} lands on the AttestationCoordinator`,
            }).toBe(before + 1);
        };

        // The shipper seals the container — custody "applied" on the root.
        await openTimeline(SHIPPER.address as Hex);
        await expect(witnessCap(C.custody), 'the custody witness derives for the shipper').toBeVisible({ timeout: 30000 });
        await witnessInput(C.custody, 'event-applied').check();
        await witnessInput(C.custody, 'unitIdentifier').fill('MSKU1234565');
        await witnessInput(C.custody, 'sealIdentifier').fill('SL-778899');
        await witnessInput(C.custody, 'occurredAt').fill('2026-07-23T08:00');
        await executeWitness(C.custody, "the shipper's seal-applied custody event");

        // The inspector passes the goods — acceptance "conforming".
        await openTimeline(INSPECTOR.address as Hex);
        await expect(witnessCap(C.acceptance), 'the acceptance witness derives for the inspector').toBeVisible({ timeout: 30000 });
        await witnessInput(C.acceptance, 'outcome-conforming').check();
        await witnessInput(C.acceptance, 'occurredAt').fill('2026-07-23T09:00');
        await executeWitness(C.acceptance, "the inspector's conforming outcome");

        // The forwarder and the customs agent walk their process ladders.
        const merchantStages = await ladderLabelsFromChain(publicClient, registry, C.merchant);
        const walkLadder = async (seller: Hex, clauseId: string, stages: string[], label: string) => {
            await openTimeline(seller);
            const ladderBtn = page.locator(
                `[data-testid="capability-execute-submit-clause-attestation"][data-clause-id="${clauseId}"]`,
            );
            const attest = ladderBtn.first();
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
        };
        await walkLadder(FORWARDER.address as Hex, C.merchant, merchantStages, 'the forwarder');
        await walkLadder(CUSTOMS.address as Hex, C.merchant, merchantStages, 'the customs agent');

        // The carrier: reefer period record, custody transfer, voyage emissions.
        await openTimeline(CARRIER.address as Hex);
        await expect(witnessCap(C.coldChain), 'the cold-chain witness derives for the carrier').toBeVisible({ timeout: 30000 });
        await witnessInput(C.coldChain, 'periodStart').fill('2026-07-23T10:00');
        await witnessInput(C.coldChain, 'periodEnd').fill('2026-07-23T22:00');
        await witnessInput(C.coldChain, 'observedMinC').fill('3');
        await witnessInput(C.coldChain, 'observedMaxC').fill('6');
        // The record's evidence is DEVICE-CAPTURED: the spec declares
        // `format: "evidence-capture"` on `evidenceUri`, so the same capture
        // affordance the proximity witness carries mounts here with zero
        // clause-specific code. Browsers read no thermometer — the observed
        // range above is typed/logger-derived; the capture witnesses WHERE the
        // record was filed (the reefer's cell at mechanism grain).
        await witnessInput(C.coldChain, 'evidenceUri-capture-geolocation-cross-check').click();
        await expect.poll(async () => witnessInput(C.coldChain, 'evidenceUri').inputValue(), {
            timeout: 30000, message: "the captured evidence pins and its URI fills the reefer record's field",
        }).toMatch(/^ipfs:\/\/.+/);
        const reeferEvidenceUri = await witnessInput(C.coldChain, 'evidenceUri').inputValue();
        // Pre-type the custody transfer BEFORE the reefer record lands: the
        // post-action reload re-derives the model, and a second form typed
        // mid-flight must SURVIVE it (the bumpProcessReload remount bug —
        // orders now persist across a same-process refresh, so the rail never
        // unmounts and no form is wiped).
        await witnessInput(C.custody, 'event-transferred').check();
        await witnessInput(C.custody, 'unitIdentifier').fill('MSKU1234565');
        await witnessInput(C.custody, 'occurredAt').fill('2026-07-23T10:30');
        await executeWitness(C.coldChain, "the carrier's reefer period record");
        await expect(
            witnessInput(C.custody, 'unitIdentifier'),
            'a second form typed mid-flight survives the post-action reload',
        ).toHaveValue('MSKU1234565', { timeout: 30000 });
        await executeWitness(C.custody, "the carrier's custody-transferred event");
        await witnessInput(C.emissions, 'gramsCO2e').fill('480000');
        await executeWitness(C.emissions, "the carrier's voyage emissions disclosure");

        // The inland carrier witnesses the final hand-off (proximity band).
        await openTimeline(INLAND.address as Hex);
        await expect(witnessCap(C.proximity), 'the hand-off witness derives for the inland carrier').toBeVisible({ timeout: 30000 });
        await witnessInput(C.proximity, 'band-zone-wifi').check();
        await executeWitness(C.proximity, "the inland carrier's hand-off witness");

        // ── RESOLVE: buyer dominance — one signature settles six orders. ──
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

        // ── RPGF USAGE RECORDING (count usage when it happens, ruled
        //    2026-07-28): the resolve capability records every committed
        //    artifact's use on the UsageCounter — one UsageRecorded per
        //    DISTINCT artifact in the process (duplicates AlreadyCounted by
        //    design), INCLUDING the assembly's compositionHash via the
        //    mechanically-folded provenance section. Verified out-of-band
        //    from the chain, never from the UI. ──
        const usageCounter = config.usageCounter as Hex;
        expect(usageCounter, 'UsageCounter address is deployed + recorded').toBeTruthy();
        const usageEvents = () => publicClient.getContractEvents({
            address: usageCounter, abi: USAGE_COUNTER_ABI, eventName: 'UsageRecorded',
            args: { processId }, fromBlock: 0n,
        });
        await expect.poll(async () => (await usageEvents()).length, {
            timeout: 120000, message: 'the resolve capability records the process artifacts on the UsageCounter',
        }).toBeGreaterThanOrEqual(15);
        // The provenance section carries the adopted assembly's own
        // compositionHash, so the ASSEMBLY artifact itself must be among the
        // recorded artifacts — the assembly-designer credit leg, previously
        // dead end-to-end.
        const adopted = (await discoverAnchoredAssemblies()).find((t) => t.slug === slug);
        expect(adopted?.compositionHash, 'the adopted assembly re-discovers from chain').toBeTruthy();
        const artifacts = (await usageEvents()).map((e) => (e.args.artifact as string).toLowerCase());
        expect(
            artifacts,
            "the assembly's compositionHash is a recorded artifact (designer credit)",
        ).toContain(adopted!.compositionHash!.toLowerCase());

        // ── SETTLEMENT: the chain total left the buyer; each value-adder
        //    earned exactly its price; the escrow returned to baseline. ──
        for (const { who, label } of COMMIT_ORDER) {
            const s = await balanceOf(who.address);
            expect(s - base.get(who.address.toLowerCase())!, `${label} net earned exactly its price`)
                .toBe(parseUnits(PRICES[label], 18));
        }
        expect(base.get(BUYER.toLowerCase())! - (await balanceOf(BUYER)), 'buyer net paid the chain total')
            .toBe(expectedCumulative);
        expect(await balanceOf(core), 'FigaroCore escrow returned to its baseline')
            .toBe(base.get(core.toLowerCase())!);

        // ── AUDIT: the new clauses' evidence surfaces in the bundle. ──
        await page.goto(`/audit/view?process=${processId}&e2e=devnet`, { waitUntil: 'domcontentloaded' });
        await page.getByTestId('audit-page').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const evidence = page.getByTestId('audit-clause-evidence');
        await evidence.waitFor({ state: 'visible', timeout: 30000 });
        for (const text of ['Chain of custody', 'Acceptance criteria', 'Cold chain', 'Incoterms']) {
            await expect(
                evidence.getByText(text).first(),
                `the "${text}" evidence leaf surfaces in the audit`,
            ).toBeVisible({ timeout: 30000 });
        }
        // The reefer record DECODES: the published witness content resolves at
        // the keccak-CID its on-chain fingerprint derives, and renders with the
        // spec's own labels — observed range and the device-captured evidence
        // URI, read back from the network.
        const reeferRecord = evidence.locator(`[data-testid="audit-witness-${C.coldChain}-1"]`);
        await expect(reeferRecord, "the carrier's temperature record decodes in the audit").toHaveCount(1, { timeout: 60000 });
        await expect(reeferRecord.first().getByText('Observed min (°C)')).toBeVisible();
        await expect(reeferRecord.first().getByText('Observed max (°C)')).toBeVisible();
        await expect(
            evidence.getByText(reeferEvidenceUri).first(),
            "the reefer record's captured evidence URI surfaces in the audit",
        ).toBeVisible({ timeout: 30000 });
    });
});
