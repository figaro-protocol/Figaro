/**
 * local-commerce-offset-scenario.devnet.spec.ts
 *
 * The emissions-aware local-commerce scenario, full multi-role, end to end:
 *
 *   1. Buyer commits the local-commerce-offset process — the food order
 *      (buyer↔merchant) and the courier order (buyer↔courier), each
 *      carrying the GHG disclosure + measurement clauses.
 *   2. Merchant + courier coordinate (runDeliveryCoordination — the
 *      merchant-process walk + the courier handoff proximity proofs).
 *   3. Each seller files a figaro-ghg-measurement-v1 grams measurement
 *      through the GHGWorkflowPanel — the merchant the emissions of
 *      preparing the goods, the courier the emissions of the delivery.
 *   4. Buyer retires carbon offsets covering the process emissions via the
 *      PreResolveOffsetPanel (approve → retire at aggregator → record),
 *      anchored on-chain by ProcessOffsetReceipt.
 *   5. Buyer confirms receipt → resolveProcess settles both orders.
 *
 * Exercises every schema the local-commerce-offset assembly composes —
 * including figaro-ghg-iso-14064-v1 and figaro-ghg-measurement-v1, each
 * through the role that drives it (feedback_assembly_e2e_schema_coverage).
 *
 * Requires Anvil + ./deploy-local.sh + ./deploy-mock-kleros.sh-free,
 * Kubo + a seeded devnet.
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
    placeLocalCommerceOrderUI,
    readLocalDeploymentConfig,
    runDeliveryCoordination,
} from './devnet-helpers';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});

const BUYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const BUYER_ADDR = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;
// Harbor Provisions — anvil[9], the seeded merchant bound to
// local-commerce-offset (its own merchant: the assembly is seller-assigned).
const MERCHANT_ADDR = '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720' as const;
const SWIFT_COURIER_ADDR = '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955' as const;

const catalogueFixture = JSON.parse(
    fs.readFileSync(
        path.resolve(__dirname, '../../scripts/fixtures/operator-catalogue.json'),
        'utf8',
    ),
) as { menu: Array<{ id: string }> };
const ITEM = catalogueFixture.menu[0];

const PROCESSES_ABI = parseAbi([
    'function processes(bytes32) view returns (address rootBuyer, address currency, uint256 cumulativeValue, uint32 activeOrderCount)',
]);
const ORDER_COMMITTED_ABI = parseAbi([
    'event OrderCommitted(bytes32 indexed orderHash, bytes32 indexed processId, address indexed buyer, address seller, address currency, uint256 payment, uint256 cumulativeValue, bytes32 agreementHash, uint256 salt, uint256 deadline)',
]);
const ATTESTATION_ABI = parseAbi([
    'event Attestation(bytes32 indexed orderHash, bytes32 indexed processId, address indexed attester, bytes32 schemaId, uint8 stage, bytes32 contentRef)',
]);
const RECEIPT_ABI = parseAbi([
    'event ReceiptRecorded(bytes32 indexed processId, address indexed buyer, bytes32 indexed retirementTxHash, address aggregator, uint256 tonsRetired, address inputToken, uint256 inputAmount)',
]);
const GHG_MEASUREMENT_SCHEMA_ID = keccak256(stringToHex('figaro-ghg-measurement-v1'));

function deployment() {
    const config = readLocalDeploymentConfig();
    return {
        core: (process.env.NEXT_PUBLIC_FIGARO_CORE ?? config.figaroCore) as Hex,
        token: (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex,
        coordinator: (process.env.NEXT_PUBLIC_ATTESTATION_COORDINATOR ?? config.attestationCoordinator) as Hex,
        receipts: process.env.NEXT_PUBLIC_PROCESS_OFFSET_RECEIPT as Hex | undefined,
    };
}

const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

let outerSnapshot: string;
test.beforeAll(async () => { outerSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (outerSnapshot) await evmRevert(outerSnapshot); });

test.describe('Emissions-aware local-commerce scenario (devnet)', () => {
    let testSnapshot: string;
    test.beforeEach(async () => { testSnapshot = await evmSnapshot(); });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    // Commit + coordinate + 2 emissions disclosures + 3-step offset + resolve.
    test.setTimeout(540_000);

    test('buyer commits, sellers disclose emissions, buyer retires offsets, process resolves', async ({ page }) => {
        const { core, token, receipts } = deployment();
        if (!receipts) throw new Error('NEXT_PUBLIC_PROCESS_OFFSET_RECEIPT not set');

        await ensureTokenApprovals(core, token, BUYER_KEY);
        page.on('dialog', (dialog) => { dialog.accept().catch(() => {}); });

        // ── 1. Buyer commits the emissions-aware local-commerce process ──
        const processId = await placeLocalCommerceOrderUI(page, {
            merchant: MERCHANT_ADDR,
            itemId: ITEM.id,
            courier: { partnerName: 'Swift Courier', deliveryItemId: 'delivery-standard' },
        });
        const committed = await publicClient.readContract({
            address: core, abi: PROCESSES_ABI, functionName: 'processes', args: [processId],
        });
        expect(committed[3]).toBe(2);

        const orders = await publicClient.getContractEvents({
            address: core, abi: ORDER_COMMITTED_ABI, eventName: 'OrderCommitted',
            args: { processId }, fromBlock: 0n,
        });
        expect(orders.length).toBe(2);
        const merchantOrder = orders.find(
            (e) => (e.args.seller as string).toLowerCase() === MERCHANT_ADDR.toLowerCase(),
        )!.args.orderHash as Hex;
        const courierOrder = orders.find(
            (e) => (e.args.seller as string).toLowerCase() === SWIFT_COURIER_ADDR.toLowerCase(),
        )!.args.orderHash as Hex;

        // ── 2. Merchant coordinates + emissions; courier delivers + emissions ──
        // Each seller files their figaro-ghg-measurement-v1 grams measurement
        // inline during their own session — the merchant after the walk, the
        // courier after the handoff proofs. The cap surfaces while the seller
        // is on the page with the workspace warm; no second-leg navigation.
        await runDeliveryCoordination(page, {
            processId, merchant: MERCHANT_ADDR, courier: SWIFT_COURIER_ADDR,
            emissions: {
                merchant: { orderHash: merchantOrder, grams: '820' },
                courier: { orderHash: courierOrder, grams: '1340' },
            },
        });

        // ── 4. Buyer retires carbon offsets for the process emissions ────
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

        // The offset receipt is anchored on-chain against the process.
        const receiptEvents = await publicClient.getContractEvents({
            address: receipts, abi: RECEIPT_ABI, eventName: 'ReceiptRecorded',
            args: { processId }, fromBlock: 0n,
        });
        expect(receiptEvents.length).toBe(1);

        // ── 5. Buyer confirms receipt → atomic resolution ────────────────
        const confirmBtn = page.getByTestId('btn-confirm-receipt');
        await confirmBtn.waitFor({ timeout: 30_000 });
        await confirmBtn.click();
        await expect(page.getByTestId('order-status-pill')).toHaveText('Completed', { timeout: 90_000 });

        const resolved = await publicClient.readContract({
            address: core, abi: PROCESSES_ABI, functionName: 'processes', args: [processId],
        });
        expect(resolved[3]).toBe(0);
    });
});
