/**
 * local-commerce-pickup-runtime.devnet.spec.ts
 *
 * End-to-end pickup runtime against the SEEDED Mercato General operator
 * (anvil[8]), driving every schema in the local-commerce-pickup assembly
 * through the role that owns it.
 *
 * The pickup edge is the symmetric counterpart to delivery's
 * merchant→courier edge: the buyer↔merchant handoff IS the cryptographic
 * proof event. Both parties attest figaro-proximity-proof-v1 against the
 * SAME root order — buyer via attestAsBuyer, merchant via attestAsSeller
 * — using the existing primitives. Same composition, different
 * counterparty pair.
 *
 * Schema coverage (each surfaced through its driving role):
 *   figaro-arbitration-kleros-v1   — assembly-authored (off-chain dispute forum)
 *   figaro-commerce-v1             — line items + payment, buyer's checkout
 *   figaro-fulfilment-v2           — modalities:[pickup], handoffPoints:[face-to-face]
 *   figaro-geo-v2                  — origin geohash on commit
 *   figaro-merchant-process-v1     — merchant lifecycle (order-received → handed-off)
 *   figaro-proximity-policy-v1     — bands:[zone-wifi], committed at signing
 *   figaro-proximity-proof-v1      — buyer + merchant both attest at handoff
 *   figaro-topology-v1             — root (1-node graph)
 *
 * Requires Anvil + ./deploy-local.sh + Kubo + a seeded devnet
 * (Mercato General bound to local-commerce-pickup).
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

// Buyer — anvil[0], default ?e2e=devnet account.
const BUYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const BUYER_ADDR = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;

// Mercato General — seeded operator (seed-devnet OPERATORS[3]) on anvil[8],
// bound to local-commerce-pickup (added 2026-05-27 alongside this spec).
const MERCATO_ADDR = '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f' as const;
const MERCATO_KEY = '0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97' as const;

// The seeded catalogue's single item — read from the same fixture
// `seed-devnet.mjs` replays so re-capture moves spec + seed together.
const catalogueFixture = JSON.parse(
    fs.readFileSync(
        path.resolve(__dirname, '../../scripts/fixtures/operator-catalogue.json'),
        'utf8',
    ),
) as { menu: Array<{ id: string; name: string }> };
const ITEM = catalogueFixture.menu[0];

const PROCESSES_ABI = parseAbi([
    'function processes(bytes32) view returns (address rootBuyer, address currency, uint256 cumulativeValue, uint32 activeOrderCount)',
]);

const MERCHANT_PROCESS_SCHEMA_ID = keccak256(stringToHex('figaro-merchant-process-v1'));
const PROXIMITY_PROOF_SCHEMA_ID = keccak256(stringToHex('figaro-proximity-proof-v1'));

/** Happy-path merchant events up to the handoff edge. The btn-merchant-next-*
 *  IDs match seller-timeline.devnet.spec.ts. The handoff edge is NOT a
 *  btn-merchant-next-handed-off button on a pickup-with-handoff-cert order;
 *  it is btn-merchant-proximity-proof (the same primitive delivery uses on
 *  the courier sub-order — applied here to the merchant's own order). */
const PRE_HANDOFF_STEPS: Array<{ event: string; button: string; pillLabel: string }> = [
    { event: 'order-received', button: 'btn-merchant-next-order-received', pillLabel: 'Received' },
    { event: 'accepted', button: 'btn-merchant-next-accepted', pillLabel: 'Accepted' },
    { event: 'prep-started', button: 'btn-merchant-next-prep-started', pillLabel: 'Preparing' },
    { event: 'ready-for-pickup', button: 'btn-merchant-next-ready-for-pickup', pillLabel: 'Ready' },
];

function deployment(): { core: Hex; token: Hex; coordinator: Hex } {
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

test.describe('Pickup runtime — buyer + merchant both witness the handoff (devnet)', () => {
    let testSnapshot: string;
    test.beforeEach(async () => { testSnapshot = await evmSnapshot(); });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    // Buyer commit + four merchant lifecycle events + merchant proximity
    // proof + buyer proximity proof + resolve. Each is a wallet round-trip.
    test.setTimeout(360_000);

    test('buyer picks pickup, merchant + buyer both attest proximity-proof at handoff, resolve atomically', async ({ page }) => {
        const { core, token, coordinator } = deployment();

        // Pre-approve both parties; the commit path needs the buyer's
        // payment-bond escrow AND the merchant's seller-bond escrow.
        await ensureTokenApprovals(core, token, BUYER_KEY, MERCATO_KEY);

        // Accept every window.confirm — checkout and confirm-receipt both raise.
        page.on('dialog', (dialog) => { dialog.accept().catch(() => {}); });

        // ── Buyer browses Mercato + picks pickup ──────────────────────
        await page.goto(`/m/${MERCATO_ADDR}?e2e=devnet`, { waitUntil: 'domcontentloaded' });
        const detailView = page.getByTestId('merchant-detail-view');
        try {
            await detailView.waitFor({ state: 'visible', timeout: 30000 });
        } catch {
            await page.reload({ waitUntil: 'domcontentloaded' });
            await detailView.waitFor({ state: 'visible', timeout: 30000 });
        }
        await expect(detailView).toContainText('Mercato General');

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

        // Mercato General's array of bound assemblies now includes
        // local-commerce-pickup; the binding-driven path surfaces "Pickup"
        // alongside the other four. Selecting it loads the pickup
        // assembly's manifest, which carries proximity-policy on the root
        // — and MerchantDetailView propagates that into manifestFields so
        // the committed root agreement also carries proximity-policy.
        await expect(page.getByTestId('option-fulfilment-pickup')).toHaveCount(1, { timeout: 20000 });
        await page.getByTestId('select-fulfilment-mode').selectOption('pickup');

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
        expect(committed[3]).toBe(1); // single root order (pickup = 1-node)

        // The committed root agreement must carry proximity-policy
        // (assembly-authored, MerchantDetailView-propagated). This is the
        // gate the runtime btn-buyer-pickup-proof checks.
        const rootHasPolicy = await page.evaluate(() => {
            for (let i = 0; i < window.localStorage.length; i++) {
                const key = window.localStorage.key(i);
                if (!key?.startsWith('figaro:agreement:')) continue;
                try {
                    const ag = JSON.parse(window.localStorage.getItem(key) ?? '') as {
                        sections?: Array<{ schema?: string; data?: { bands?: string[] } }>;
                    };
                    const policy = (ag.sections ?? []).find(
                        (s) => s.schema === 'figaro-proximity-policy-v1',
                    );
                    if (policy) return policy.data?.bands ?? null;
                } catch { /* skip non-agreement entries */ }
            }
            return null;
        });
        expect(
            rootHasPolicy,
            'the committed pickup order must carry figaro-proximity-policy-v1',
        ).toEqual(['zone-wifi']);

        // ── Merchant: walk the lifecycle up to ready-for-pickup ─────
        await gotoAsWallet(page, MERCATO_ADDR, `/orders/${processId}?e2e=devnet`);
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

        // ── Merchant: cross-witness the handoff ─────────────────────
        // next === handed-off AND root has proximity-policy AND no courier
        // sub-order → btn-merchant-proximity-proof is the pickup variant.
        // signalWithProof attests proximity-proof against the merchant's
        // own order (target = role) AND fires the handed-off lifecycle
        // event. The "Handed off" pill transition confirms both landed.
        const merchantProofBtn = page.getByTestId('btn-merchant-proximity-proof');
        await merchantProofBtn.waitFor({ state: 'visible', timeout: 30000 });
        await merchantProofBtn.click();
        await expect(page.getByTestId('order-status-pill')).toHaveText('Handed off', { timeout: 60000 });

        // Verify on chain: the merchant's proximity-proof attestation landed.
        const merchantProofs = await publicClient.getContractEvents({
            address: coordinator,
            abi: ATTESTATION_COORDINATOR_ABI,
            eventName: 'Attestation',
            args: { attester: MERCATO_ADDR as Hex },
            fromBlock: 0n,
        });
        expect(
            merchantProofs.filter((e) => e.args.schemaId === PROXIMITY_PROOF_SCHEMA_ID).length,
            'merchant submitted exactly one proximity-proof attestation',
        ).toBe(1);
        expect(
            merchantProofs.filter((e) => e.args.schemaId === MERCHANT_PROCESS_SCHEMA_ID && e.args.stage === 4).length,
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

        // Verify on chain: the buyer's symmetric proximity-proof landed.
        const buyerProofs = await publicClient.getContractEvents({
            address: coordinator,
            abi: ATTESTATION_COORDINATOR_ABI,
            eventName: 'Attestation',
            args: { attester: BUYER_ADDR as Hex },
            fromBlock: 0n,
        });
        expect(
            buyerProofs.filter((e) => e.args.schemaId === PROXIMITY_PROOF_SCHEMA_ID).length,
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
        // pickup edge, indexable in the public-graph trade record.
        const allAttestations = await publicClient.getContractEvents({
            address: coordinator,
            abi: ATTESTATION_COORDINATOR_ABI,
            eventName: 'Attestation',
            fromBlock: 0n,
        });
        const attesters = new Set(
            allAttestations
                .filter((e) => e.args.schemaId === PROXIMITY_PROOF_SCHEMA_ID)
                .map((e) => (e.args.attester as string).toLowerCase()),
        );
        expect(attesters.has(BUYER_ADDR.toLowerCase()), 'buyer is among proximity attesters').toBe(true);
        expect(attesters.has(MERCATO_ADDR.toLowerCase()), 'merchant is among proximity attesters').toBe(true);
    });
});
