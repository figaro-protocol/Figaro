/**
 * onsite-purchase.devnet.spec.ts
 *
 * End-to-end on-site purchase against the SEEDED Counter & Co. seller —
 * the scenario `merchant-place-order.devnet.spec.ts` cannot reach because
 * it self-seeds a binding-less merchant.
 *
 * Counter & Co. (anvil[5]) is registered by `scripts/seed-devnet.mjs` and
 * bound on-chain to the `direct-sale` assembly. That binding drives the
 * fulfilment choice: `useSellerBoundAssemblies` resolves the bound
 * assembly's `figaro-fulfilment-v2` clause (`modalities: [consume-onsite]`)
 * and `SellerDetailView` narrows the dropdown to it — the binding-driven
 * path a binding-less merchant never exercises (it falls back to all six
 * modes).
 *
 * Two tests:
 *
 * 1. Minimal walk — buyer resolves WITHOUT the handoff ceremony. The
 *    buyer-dominance path: commit -> confirm receipt -> resolveProcess. The
 *    handoff-certification attestations are optional evidence, never a gate
 *    on resolution.
 *      - buyer (anvil[0]) opens /m/<Counter & Co.>
 *      - the fulfilment dropdown offers ONLY consume-onsite (binding-driven)
 *      - add the seeded catalogue item, pick consume-onsite, place the order
 *      - the commit redirects to /orders/<processId>; kernel state: 1 active order
 *      - buyer confirms receipt -> resolveProcess -> the process settles (Resolved)
 *
 * 2. Full handoff certification — the merchant<->buyer consume-onsite handoff
 *    IS the certification edge, exactly as the buyer<->merchant pickup edge is
 *    (local-commerce-pickup-runtime). Both parties attest
 *    figaro-proximity-proof-v1 against the SAME root order — buyer via
 *    attestAsBuyer (btn-buyer-pickup-proof), merchant via attestAsSeller
 *    (btn-merchant-proximity-proof) paired with the handed-off lifecycle
 *    event. Same composition, different fulfilment modality — this is the
 *    merchant dispute-evidence the bare walk omits. Each clause in the
 *    enriched direct-sale assembly is surfaced through its driving role.
 *      - buyer commits consume-onsite; the committed root carries proximity-policy
 *      - merchant (anvil[5]) walks order-received -> ... -> ready-for-pickup,
 *        then submits the handoff proximity proof (handed-off)
 *      - buyer submits the symmetric proximity proof, then resolves
 *      - both proximity-proof witnesses sit on chain against the root order
 *
 * Requires Anvil + ./deploy-local.sh + Kubo + a seeded devnet.
 * `npm run test:e2e:devnet` runs `seed-devnet.mjs` before the suite.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import {
    createPublicClient,
    defineChain,
    http,
    keccak256,
    parseAbi,
    stringToHex,
    type Hex,
} from 'viem';
import {
    ensureTokenApprovals,
    evmRevert,
    evmSnapshot,
    readLocalDeploymentConfig,
} from './devnet-helpers';
import { ATTESTATION_COORDINATOR_ABI } from '@figaro/core';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});

// Buyer — anvil[0], the default ?e2e=devnet account. Holds 1M MOCK from
// the MockToken constructor mint to the deployer.
const BUYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const BUYER_ADDR = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;

// Counter & Co. — seeded seller (seed-devnet.mjs SELLERS[0]) on
// anvil[5], bound to `direct-sale`. Holds 100k MOCK from the Deploy.s.sol
// testAccounts mint. anvil[5..8] are disjoint from the test suite's
// anvil[0..4] range, so transacting against it never collides.
const COUNTER_CO_ADDR = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc' as const;
const COUNTER_CO_KEY = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba' as const;

// The seeded catalogue's single item — read from the same fixture
// `seed-devnet.mjs` replays, so a fixture re-capture moves spec + seed
// together (the per-run item `id` is not otherwise stable).
const catalogueFixture = JSON.parse(
    fs.readFileSync(
        path.resolve(__dirname, '../../scripts/fixtures/seller-catalogue.json'),
        'utf8',
    ),
) as { menu: Array<{ id: string; name: string }> };
const ITEM = catalogueFixture.menu[0];

const PROCESSES_ABI = parseAbi([
    'function processes(bytes32) view returns (address rootBuyer, address currency, uint256 cumulativeValue, uint32 activeOrderCount)',
]);

const MERCHANT_PROCESS_CLAUSE_ID = keccak256(stringToHex('figaro-merchant-process-v1'));
const PROXIMITY_PROOF_CLAUSE_ID = keccak256(stringToHex('figaro-proximity-proof-v1'));

/** Happy-path merchant events up to the handoff edge. The btn-merchant-next-*
 *  IDs match seller-timeline.devnet.spec.ts and local-commerce-pickup-runtime.
 *  The handoff edge is NOT a btn-merchant-next-handed-off button on a
 *  handoff-cert order; it is btn-merchant-proximity-proof (the same primitive
 *  delivery uses on the courier sub-order and pickup uses on the root order,
 *  applied here to a consume-onsite root order). */
const PRE_HANDOFF_STEPS: Array<{ event: string; button: string; pillLabel: string }> = [
    { event: 'order-received', button: 'btn-merchant-next-order-received', pillLabel: 'Received' },
    { event: 'accepted', button: 'btn-merchant-next-accepted', pillLabel: 'Accepted' },
    { event: 'prep-started', button: 'btn-merchant-next-prep-started', pillLabel: 'Preparing' },
    { event: 'ready-for-pickup', button: 'btn-merchant-next-ready-for-pickup', pillLabel: 'Ready' },
];

function deploymentAddresses(): { core: Hex; token: Hex; coordinator: Hex } {
    const config = readLocalDeploymentConfig();
    return {
        core: (process.env.NEXT_PUBLIC_FIGARO_CORE ?? config.figaroCore) as Hex,
        token: (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex,
        coordinator: (process.env.NEXT_PUBLIC_ATTESTATION_COORDINATOR
            ?? config.attestationCoordinator) as Hex,
    };
}

let outerSnapshot: string;
test.beforeAll(async () => { outerSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (outerSnapshot) await evmRevert(outerSnapshot); });

test.describe('On-site purchase from seeded Counter & Co. (devnet)', () => {
    let testSnapshot: string;
    test.beforeEach(async () => { testSnapshot = await evmSnapshot(); });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    // Catalogue discovery + binding resolution + sign + commit + resolve.
    test.setTimeout(240_000);

    test('buyer browses the bound merchant, places a consume-onsite order, confirms receipt → Resolved', async ({ page }) => {
        const { core, token } = deploymentAddresses();

        // Pre-approve both parties so the spec stays on the commit +
        // resolve path (permit.devnet covers approval-via-UI).
        await ensureTokenApprovals(core, token, BUYER_KEY, COUNTER_CO_KEY);

        // Accept every window.confirm — the place-order path may raise a
        // defensive one, and /orders confirm-receipt raises two
        // (handleConfirmReceipt + executeTransactionCapability's guard).
        page.on('dialog', (dialog) => { dialog.accept().catch(() => {}); });

        // ── Browse the seeded merchant ───────────────────────────────
        await page.goto(`/s/${COUNTER_CO_ADDR}?e2e=devnet`, { waitUntil: 'domcontentloaded' });

        const detailView = page.getByTestId('seller-detail-view');
        try {
            await detailView.waitFor({ state: 'visible', timeout: 30000 });
        } catch {
            // Catalogue discovery can lag the first mount.
            await page.reload({ waitUntil: 'domcontentloaded' });
            await detailView.waitFor({ state: 'visible', timeout: 30000 });
        }
        await expect(detailView).toContainText('Counter & Co.');

        // ── Add the seeded catalogue item ────────────────────────────
        const menuItem = page.getByTestId(`menu-item-${ITEM.id}`);
        try {
            await menuItem.waitFor({ state: 'visible', timeout: 15000 });
        } catch {
            await page.reload({ waitUntil: 'domcontentloaded' });
            await detailView.waitFor({ state: 'visible', timeout: 30000 });
            await menuItem.waitFor({ state: 'visible', timeout: 30000 });
        }
        await page.getByTestId(`btn-add-${ITEM.id}`).click();
        await expect(page.getByTestId(`cart-line-${ITEM.id}`)).toBeVisible({ timeout: 10000 });

        // ── Binding-driven fulfilment ────────────────────────────────
        // Counter & Co. is bound to `direct-sale`, whose figaro-fulfilment-v2
        // clause declares modalities: [consume-onsite]. useSellerBoundAssemblies
        // resolves that binding off-chain and SellerDetailView filters the
        // dropdown to it — `pickup` drops out once the binding resolves. A
        // binding-less merchant keeps all six modes, so the absence of
        // `pickup` is the binding-driven assertion.
        await expect(page.getByTestId('option-fulfilment-pickup')).toHaveCount(0, { timeout: 20000 });
        await expect(page.getByTestId('option-fulfilment-consume-onsite')).toHaveCount(1);
        await page.getByTestId('select-fulfilment-mode').selectOption('consume-onsite');

        // ── Place the order ──────────────────────────────────────────
        await page.getByTestId('btn-place-order').click();

        // AgreementPreviewModal gates the signature — signCommitment always
        // posts the preview; confirm it to proceed to the wallet prompt.
        await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 15000 });
        await page.getByTestId('preview-confirm').click();

        // ── Commit landed → redirect to /orders/<processId> ──────────
        await page.waitForURL(/\/orders\/0x[0-9a-fA-F]+/, { timeout: 90000 });
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
        await expect(page.getByTestId('order-timeline-view')).toContainText('You are the buyer');

        const match = page.url().match(/\/orders\/(0x[0-9a-fA-F]+)/);
        expect(match, `expected /orders/<hex> in URL: ${page.url()}`).toBeTruthy();
        const processId = match![1] as Hex;

        // Kernel cross-check — payment committed, one order active, the
        // buyer is rootBuyer.
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const committed = await publicClient.readContract({
            address: core, abi: PROCESSES_ABI, functionName: 'processes', args: [processId],
        });
        expect(committed[0].toLowerCase()).toBe(BUYER_ADDR.toLowerCase()); // rootBuyer
        expect(committed[3]).toBe(1); // activeOrderCount

        // ── Buyer confirms receipt → resolveProcess → Resolved ───────
        const confirmBtn = page.getByTestId('btn-confirm-receipt');
        await confirmBtn.waitFor({ timeout: 30000 });
        await confirmBtn.click();
        await expect(page.getByTestId('order-status-pill')).toHaveText('Completed', { timeout: 90000 });

        // The process settled — no orders left active in the kernel.
        const resolved = await publicClient.readContract({
            address: core, abi: PROCESSES_ABI, functionName: 'processes', args: [processId],
        });
        expect(resolved[3]).toBe(0); // activeOrderCount → 0
    });

    test('buyer picks consume-onsite, merchant + buyer both attest proximity-proof at handoff, resolve atomically', async ({ page }) => {
        // Buyer commit + four merchant lifecycle events + merchant proximity
        // proof + buyer proximity proof + resolve — each a wallet round-trip.
        test.setTimeout(360_000);

        const { core, token, coordinator } = deploymentAddresses();

        // Pre-approve both parties; commit needs the buyer's payment-bond
        // escrow AND the merchant's seller-bond escrow.
        await ensureTokenApprovals(core, token, BUYER_KEY, COUNTER_CO_KEY);

        // Accept every window.confirm — checkout and confirm-receipt both raise.
        page.on('dialog', (dialog) => { dialog.accept().catch(() => {}); });

        // ── Buyer browses Counter & Co. + picks consume-onsite ────────
        await page.goto(`/s/${COUNTER_CO_ADDR}?e2e=devnet`, { waitUntil: 'domcontentloaded' });
        const detailView = page.getByTestId('seller-detail-view');
        try {
            await detailView.waitFor({ state: 'visible', timeout: 30000 });
        } catch {
            await page.reload({ waitUntil: 'domcontentloaded' });
            await detailView.waitFor({ state: 'visible', timeout: 30000 });
        }
        await expect(detailView).toContainText('Counter & Co.');

        const menuItem = page.getByTestId(`menu-item-${ITEM.id}`);
        try {
            await menuItem.waitFor({ state: 'visible', timeout: 15000 });
        } catch {
            await page.reload({ waitUntil: 'domcontentloaded' });
            await detailView.waitFor({ state: 'visible', timeout: 30000 });
            await menuItem.waitFor({ state: 'visible', timeout: 30000 });
        }
        await page.getByTestId(`btn-add-${ITEM.id}`).click();
        await expect(page.getByTestId(`cart-line-${ITEM.id}`)).toBeVisible({ timeout: 10000 });

        // Counter & Co. binds only `direct-sale` → the dropdown narrows to
        // consume-onsite. Selecting it loads the assembly's manifest, which
        // now carries proximity-policy on the root — SellerDetailView
        // propagates that into clauseFields so the committed root agreement
        // carries proximity-policy too (the gate the handoff buttons check).
        await expect(page.getByTestId('option-fulfilment-pickup')).toHaveCount(0, { timeout: 20000 });
        await expect(page.getByTestId('option-fulfilment-consume-onsite')).toHaveCount(1);
        await page.getByTestId('select-fulfilment-mode').selectOption('consume-onsite');

        // ── Place + commit ───────────────────────────────────────────
        await page.getByTestId('btn-place-order').click();
        await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 15000 });
        await page.getByTestId('preview-confirm').click();

        await page.waitForURL(/\/orders\/0x[0-9a-fA-F]+/, { timeout: 90000 });
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });

        const match = page.url().match(/\/orders\/(0x[0-9a-fA-F]+)/);
        expect(match, `expected /orders/<hex> in URL: ${page.url()}`).toBeTruthy();
        const processId = match![1] as Hex;

        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const committed = await publicClient.readContract({
            address: core, abi: PROCESSES_ABI, functionName: 'processes', args: [processId],
        });
        expect(committed[0].toLowerCase()).toBe(BUYER_ADDR.toLowerCase()); // rootBuyer
        expect(committed[3]).toBe(1); // single root order (consume-onsite = 1-node)

        // The committed root agreement must carry proximity-policy
        // (assembly-authored, SellerDetailView-propagated). This is the
        // gate the runtime btn-buyer-pickup-proof / btn-merchant-proximity-proof
        // both check (isPickupHandoff = rootHasProximityPolicy && !courierSubOrder).
        const rootHasPolicy = await page.evaluate(() => {
            for (let i = 0; i < window.localStorage.length; i++) {
                const key = window.localStorage.key(i);
                if (!key?.startsWith('figaro:agreement:')) continue;
                try {
                    const ag = JSON.parse(window.localStorage.getItem(key) ?? '') as {
                        sections?: Array<{ clause?: string; data?: { bands?: string[] } }>;
                    };
                    const policy = (ag.sections ?? []).find(
                        (s) => s.clause === 'figaro-proximity-policy-v1',
                    );
                    if (policy) return policy.data?.bands ?? null;
                } catch { /* skip non-agreement entries */ }
            }
            return null;
        });
        expect(
            rootHasPolicy,
            'the committed consume-onsite order must carry figaro-proximity-policy-v1',
        ).toEqual(['zone-wifi']);

        // ── Merchant: walk the lifecycle up to ready-for-pickup ─────
        await gotoAsWallet(page, COUNTER_CO_ADDR, `/orders/${processId}?e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
        await expect(page.getByTestId('order-timeline-view')).toContainText(/You are the seller/);

        for (const step of PRE_HANDOFF_STEPS) {
            const btn = page.getByTestId(step.button);
            await btn.waitFor({ state: 'visible', timeout: 30000 });
            await btn.click();
            await expect(page.getByTestId('order-status-pill')).toHaveText(step.pillLabel, {
                timeout: 30000,
            });
        }

        // ── Merchant: witness the consume-onsite handoff ────────────
        // next === handed-off AND root has proximity-policy AND no courier
        // sub-order → btn-merchant-proximity-proof is the root-order variant
        // (same as pickup). signalWithProof attests proximity-proof against
        // the merchant's own order (target = role) AND fires handed-off.
        const merchantProofBtn = page.getByTestId('btn-merchant-proximity-proof');
        await merchantProofBtn.waitFor({ state: 'visible', timeout: 30000 });
        await merchantProofBtn.click();
        await expect(page.getByTestId('order-status-pill')).toHaveText('Handed off', { timeout: 60000 });

        // On chain: the merchant's proximity-proof + paired handed-off event.
        const merchantProofs = await publicClient.getContractEvents({
            address: coordinator,
            abi: ATTESTATION_COORDINATOR_ABI,
            eventName: 'Attestation',
            args: { attester: COUNTER_CO_ADDR as Hex },
            fromBlock: 0n,
        });
        expect(
            merchantProofs.filter((e) => e.args.clauseId === PROXIMITY_PROOF_CLAUSE_ID).length,
            'merchant submitted exactly one proximity-proof attestation',
        ).toBe(1);
        expect(
            merchantProofs.filter((e) => e.args.clauseId === MERCHANT_PROCESS_CLAUSE_ID && e.args.stage === 4).length,
            'merchant submitted the paired handed-off lifecycle event',
        ).toBe(1);

        // ── Buyer: witness the handoff via attestAsBuyer ───────────
        await gotoAsWallet(page, BUYER_ADDR, `/orders/${processId}?e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
        await expect(page.getByTestId('order-timeline-view')).toContainText(/You are the buyer/);

        const buyerProofBtn = page.getByTestId('btn-buyer-pickup-proof');
        await buyerProofBtn.waitFor({ state: 'visible', timeout: 30000 });
        await buyerProofBtn.click();
        await expect(page.getByTestId('buyer-proximity-attested')).toBeVisible({ timeout: 60000 });

        // On chain: the buyer's symmetric proximity-proof landed.
        const buyerProofs = await publicClient.getContractEvents({
            address: coordinator,
            abi: ATTESTATION_COORDINATOR_ABI,
            eventName: 'Attestation',
            args: { attester: BUYER_ADDR as Hex },
            fromBlock: 0n,
        });
        expect(
            buyerProofs.filter((e) => e.args.clauseId === PROXIMITY_PROOF_CLAUSE_ID).length,
            'buyer submitted exactly one proximity-proof attestation',
        ).toBe(1);

        // ── Buyer: resolve ───────────────────────────────────────────
        const confirmBtn = page.getByTestId('btn-confirm-receipt');
        await confirmBtn.waitFor({ timeout: 30000 });
        await confirmBtn.click();
        await expect(page.getByTestId('order-status-pill')).toHaveText('Completed', { timeout: 90000 });

        const resolved = await publicClient.readContract({
            address: core, abi: PROCESSES_ABI, functionName: 'processes', args: [processId],
        });
        expect(resolved[3]).toBe(0); // activeOrderCount → 0 — process settled

        // Both proximity-proof witnesses (buyer + merchant) sit on chain
        // against the same root order: tamper-proof evidence of the
        // consume-onsite handoff, indexable in the public-graph record.
        const allAttestations = await publicClient.getContractEvents({
            address: coordinator,
            abi: ATTESTATION_COORDINATOR_ABI,
            eventName: 'Attestation',
            fromBlock: 0n,
        });
        const attesters = new Set(
            allAttestations
                .filter((e) => e.args.clauseId === PROXIMITY_PROOF_CLAUSE_ID)
                .map((e) => (e.args.attester as string).toLowerCase()),
        );
        expect(attesters.has(BUYER_ADDR.toLowerCase()), 'buyer is among proximity attesters').toBe(true);
        expect(attesters.has(COUNTER_CO_ADDR.toLowerCase()), 'merchant is among proximity attesters').toBe(true);
    });
});
