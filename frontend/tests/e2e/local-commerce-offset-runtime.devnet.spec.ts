/**
 * local-commerce-offset-runtime.devnet.spec.ts
 *
 * RUNTIME (lifecycle Phase 4) for the emissions-aware `local-commerce-offset`
 * scenario — a 2-node seller-assigned delivery sale where both sellers disclose
 * GHG emissions and the buyer retires them, every role through its own UI:
 *
 *   1. Buyer (anvil[0]) browses the onboarded merchant (Harbor Provisions), picks
 *      delivery (seller-assigned) + Cardinal Couriers — the food order and the
 *      courier order both commit, each carrying the GHG disclosure.
 *   2. Merchant walks figaro-merchant-process-v1 + files its prep-emissions
 *      measurement; courier submits the handoff proximity proofs + files its
 *      delivery-emissions measurement (runDeliveryCoordination with emissions).
 *   3. Buyer retires carbon offsets covering the process emissions through the
 *      offset ROUTER (Klima/Toucan, mocked) via PreResolveOffsetPanel — approve →
 *      retire → record — anchored on-chain by ProcessOffsetReceipt.
 *   4. Buyer resolves the process — atomic settlement of both orders.
 *
 * The offset is a buyer→router interaction, NOT a bonded order: there is no
 * "offset seller". Consumes the seller + assembly from chain→IPFS (authored by
 * scenario-local-commerce-offset + sellers-onboarding). No seed, no fixtures.
 *
 * Prerequisite: scenario-local-commerce-offset (anchors the assembly) and
 * sellers-onboarding (onboards Harbor Provisions + Cardinal Couriers) have run.
 *
 * Requires Anvil + ./scripts/deploy-local.sh + Kubo + the dev server.
 */
import { test, expect, ANVIL_ACCOUNTS, gotoAsWallet } from './devnet-multi-test';
import { keccak256, parseAbi, stringToHex, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
    CORE_PROCESS_VIEW_ABI,
    ORDER_COMMITTED_EVENT_ABI,
    SELLER_REGISTERED_EVENT_ABI,
    ensureTokenApprovals,
    localPublicClient,
    placeLocalCommerceOrderUI,
    readLocalDeploymentConfig,
    runDeliveryCoordination,
    useChainSnapshot,
} from './devnet-helpers';
import { SELLER_ROSTER } from './seller-roster';

// Buyer = anvil[0]. The merchant is the local-commerce-offset seller; the courier
// is the local-commerce courier (reused), designated by the merchant.
const BUYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const MERCHANT_KEY = '0x701b615bbdfb9de65240bc28bd21bbc0d996645a3dd57e7b12bc2bdf6f192c82' as const; // anvil[11]
const COURIER_KEY = '0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97' as const; // anvil[8]
const BUYER_ADDR = ANVIL_ACCOUNTS[0];

const merchant = SELLER_ROSTER.find((s) => s.assemblies.includes('local-commerce-offset'));
const courier = SELLER_ROSTER.find((s) => s.assemblies.includes('local-commerce') && !s.courierAddresses);

const RECEIPT_ABI = parseAbi([
    'event ReceiptRecorded(bytes32 indexed processId, address indexed buyer, bytes32 indexed retirementTxHash, address aggregator, uint256 tonsRetired, address inputToken, uint256 inputAmount)',
]);

useChainSnapshot(test);

test.describe('local-commerce-offset runtime — emissions disclosed, offsets retired, resolve (devnet)', () => {
    // Commit (2 orders) + coordinate + 2 emissions measurements + 3-step offset
    // retirement + resolve — every role through its UI.
    test.setTimeout(540_000);

    test('buyer commits, both sellers disclose emissions, buyer retires offsets via the router, process resolves — all through the UI', async ({ page }) => {
        page.on('dialog', (dialog) => { dialog.accept().catch(() => {}); });

        expect(merchant, 'local-commerce-offset merchant must be in SELLER_ROSTER').toBeTruthy();
        expect(courier, 'local-commerce courier must be in SELLER_ROSTER').toBeTruthy();
        expect(privateKeyToAccount(MERCHANT_KEY).address.toLowerCase()).toBe(merchant!.address.toLowerCase());
        expect(privateKeyToAccount(COURIER_KEY).address.toLowerCase()).toBe(courier!.address.toLowerCase());

        const config = readLocalDeploymentConfig();
        const coreAddress = (process.env.NEXT_PUBLIC_FIGARO_CORE ?? config.figaroCore) as Hex;
        const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex;
        const sellerRegistry = (process.env.NEXT_PUBLIC_SELLER_REGISTRY ?? config.sellerRegistry) as Hex;
        const receipts = process.env.NEXT_PUBLIC_PROCESS_OFFSET_RECEIPT as Hex | undefined;
        if (!receipts) throw new Error('NEXT_PUBLIC_PROCESS_OFFSET_RECEIPT not set — deploy the offset contracts');
        const publicClient = localPublicClient();

        // Prerequisite: both sellers onboarded (consumed from chain, not seeded).
        for (const s of [merchant!, courier!]) {
            const registered = await publicClient.getContractEvents({
                address: sellerRegistry,
                abi: SELLER_REGISTERED_EVENT_ABI,
                eventName: 'SellerRegistered',
                args: { seller: s.address },
                fromBlock: 0n,
            });
            expect(
                registered.length,
                `${s.name} (${s.address}) is not registered — run sellers-onboarding first`,
            ).toBeGreaterThanOrEqual(1);
        }

        await ensureTokenApprovals(coreAddress, tokenAddress, BUYER_KEY, MERCHANT_KEY, COURIER_KEY);

        // ── 1. Buyer commits the food + courier orders (each GHG-bearing) ───
        const processId = await placeLocalCommerceOrderUI(page, {
            merchant: merchant!.address,
            courier: { partnerName: courier!.name },
        });

        const committed = await publicClient.readContract({
            address: coreAddress, abi: CORE_PROCESS_VIEW_ABI, functionName: 'processes', args: [processId],
        });
        expect(committed[0].toLowerCase()).toBe(BUYER_ADDR.toLowerCase()); // rootBuyer
        expect(committed[3]).toBe(2); // food + courier

        // Resolve each order's hash by its seller, for the per-seller emissions.
        const orders = await publicClient.getContractEvents({
            address: coreAddress, abi: ORDER_COMMITTED_EVENT_ABI, eventName: 'OrderCommitted',
            args: { processId }, fromBlock: 0n,
        });
        expect(orders.length).toBe(2);
        const merchantOrder = orders.find(
            (e) => (e.args.seller as string).toLowerCase() === merchant!.address.toLowerCase(),
        )!.args.orderHash as Hex;
        const courierOrder = orders.find(
            (e) => (e.args.seller as string).toLowerCase() === courier!.address.toLowerCase(),
        )!.args.orderHash as Hex;

        // ── 2. Coordinate + each seller files its GHG measurement inline ────
        // The merchant the emissions of preparing the goods, the courier the
        // emissions of the delivery — each in its own warm session.
        await runDeliveryCoordination(page, {
            processId, merchant: merchant!.address, courier: courier!.address,
            emissions: {
                merchant: { orderHash: merchantOrder, grams: '820' },
                courier: { orderHash: courierOrder, grams: '1340' },
            },
        });

        // ── 3. Buyer retires carbon offsets through the router ──────────────
        await gotoAsWallet(page, BUYER_ADDR, `/orders/${processId}?e2e=devnet`);
        const offsetPanel = page.getByTestId('pre-resolve-offset-panel');
        await offsetPanel.waitFor({ state: 'visible', timeout: 30_000 });
        const approve = page.getByTestId('offset-step-approve');
        await approve.waitFor({ state: 'visible', timeout: 30_000 });
        await approve.click();
        const retire = page.getByTestId('offset-step-retire');
        await retire.waitFor({ state: 'visible', timeout: 60_000 });
        await retire.click();
        const record = page.getByTestId('offset-step-record');
        await record.waitFor({ state: 'visible', timeout: 60_000 });
        await record.click();
        await page.getByTestId('offset-done').waitFor({ state: 'visible', timeout: 60_000 });

        // The offset receipt is anchored on-chain against the process (router
        // retirement recorded by ProcessOffsetReceipt) — out-of-band confirmation.
        const receiptEvents = await publicClient.getContractEvents({
            address: receipts, abi: RECEIPT_ABI, eventName: 'ReceiptRecorded',
            args: { processId }, fromBlock: 0n,
        });
        expect(receiptEvents.length).toBe(1);

        // ── 4. Buyer resolves → atomic settlement of both orders ────────────
        await page.getByTestId('order-timeline-view').waitFor({ state: 'visible', timeout: 30000 });
        const resolveBtn = page.getByTestId('capability-execute-resolve-process');
        await resolveBtn.waitFor({ state: 'visible', timeout: 30000 });
        await resolveBtn.click();
        await expect(page.getByTestId('order-status-pill')).toHaveText(/Completed/i, { timeout: 90000 });

        const resolved = await publicClient.readContract({
            address: coreAddress, abi: CORE_PROCESS_VIEW_ABI, functionName: 'processes', args: [processId],
        });
        expect(Number(resolved[3])).toBe(0);

        // Both sellers' measurements really landed (out-of-band): a GHG-measurement
        // attestation per seller against the process.
        const ghgClauseId = keccak256(stringToHex('figaro-ghg-measurement-v1'));
        const ATTESTATION_ABI = parseAbi([
            'event Attestation(bytes32 indexed orderHash, bytes32 indexed processId, address indexed attester, bytes32 clauseId, uint8 stage, bytes32 contentRef)',
        ]);
        for (const [who, addr] of [['merchant', merchant!.address], ['courier', courier!.address]] as const) {
            const atts = await publicClient.getContractEvents({
                address: (process.env.NEXT_PUBLIC_ATTESTATION_COORDINATOR ?? config.attestationCoordinator) as Hex,
                abi: ATTESTATION_ABI, eventName: 'Attestation',
                args: { processId, attester: addr as Hex }, fromBlock: 0n,
            });
            expect(
                atts.some((e) => (e.args as { clauseId?: Hex }).clauseId === ghgClauseId),
                `${who} should have filed a GHG measurement`,
            ).toBe(true);
        }
    });
});
