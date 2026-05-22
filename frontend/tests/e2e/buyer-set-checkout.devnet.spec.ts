/**
 * buyer-set-checkout.devnet.spec.ts
 *
 * Buyer-set delivery pricing, end to end through the UI. A courier's
 * catalogue may carry a buyer-set delivery item — one with no fixed price.
 * When the buyer selects it, CourierCataloguePicker surfaces a token-amount
 * input; the buyer names the delivery fee, and that figure is what the
 * courier order commits at.
 *
 *   1. Buyer browses Mercato General, picks seller-assigned delivery,
 *      chooses Swift Courier, then its buyer-set "Name-your-price"
 *      delivery item, and names the delivery fee.
 *   2. Both orders commit — the courier order's payment is the buyer-named
 *      figure, not a catalogue price.
 *   3. Buyer resolves; both orders settle atomically.
 *
 * Buyer-set is a pricing variant orthogonal to the courier-coordination
 * mode — it works the same under seller-assigned or buyer-assigned. This
 * spec exercises it under seller-assigned.
 *
 * Requires Anvil + ./deploy-local.sh + Kubo + a seeded devnet.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from './devnet-multi-test';
import { createPublicClient, defineChain, http, parseAbi, parseEther, type Hex } from 'viem';
import {
    ensureTokenApprovals,
    evmRevert,
    evmSnapshot,
    placeLocalCommerceOrderUI,
    readLocalDeploymentConfig,
} from './devnet-helpers';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});

// Buyer — anvil[0], the default ?e2e=devnet account.
const BUYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
// Swift Courier — seeded courier on anvil[7]; its catalogue carries the
// buyer-set "Name-your-price" delivery item (delivery-quote).
const SWIFT_COURIER_ADDR = '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955' as const;
// Mercato General — seeded merchant, anvil[8].
const MERCATO_ADDR = '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f' as const;

// The delivery fee the buyer names on the buyer-set courier item.
const BUYER_SET_DELIVERY_FEE = '0.7';

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

function deployment(): { core: Hex } {
    const config = readLocalDeploymentConfig();
    return {
        core: (process.env.NEXT_PUBLIC_FIGARO_CORE ?? config.figaroCore) as Hex,
    };
}

const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

test.describe('Buyer-set delivery pricing (devnet)', () => {
    let testSnapshot: string;
    test.beforeEach(async () => { testSnapshot = await evmSnapshot(); });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    test.setTimeout(300_000);

    test('buyer names the delivery fee on a buyer-set courier item; the courier order commits at that figure', async ({ page }) => {
        const { core } = deployment();
        const token = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS
            ?? readLocalDeploymentConfig().tokenAddress) as Hex;

        await ensureTokenApprovals(core, token, BUYER_KEY);
        page.on('dialog', (dialog) => { dialog.accept().catch(() => {}); });

        // ── 1. Buyer picks the buyer-set delivery item + names the fee ──
        const processId = await placeLocalCommerceOrderUI(page, {
            merchant: MERCATO_ADDR,
            itemId: ITEM.id,
            courier: {
                partnerName: 'Swift Courier',
                deliveryItemId: 'delivery-quote',
                buyerSetPrice: BUYER_SET_DELIVERY_FEE,
            },
        });

        // ── 2. Both orders commit ─────────────────────────────────────
        const committed = await publicClient.readContract({
            address: core, abi: PROCESSES_ABI, functionName: 'processes', args: [processId],
        });
        expect(committed[3]).toBe(2);

        // The courier order's payment is the buyer-named figure — proof the
        // buyer-set price flowed from the input into the commitment, rather
        // than a fixed catalogue price.
        const orders = await publicClient.getContractEvents({
            address: core, abi: ORDER_COMMITTED_ABI, eventName: 'OrderCommitted',
            args: { processId }, fromBlock: 0n,
        });
        expect(orders.length).toBe(2);
        const courierOrder = orders.find(
            (e) => (e.args.seller as string).toLowerCase() === SWIFT_COURIER_ADDR.toLowerCase(),
        );
        expect(courierOrder).toBeDefined();
        expect(courierOrder!.args.payment).toBe(parseEther(BUYER_SET_DELIVERY_FEE));

        // ── 3. Buyer resolves — both orders settle atomically ─────────
        const confirmButton = page.getByTestId('btn-confirm-receipt');
        await confirmButton.waitFor({ timeout: 30000 });
        await confirmButton.click();
        await expect(page.getByTestId('order-status-pill')).toHaveText('Completed', { timeout: 90000 });

        const resolved = await publicClient.readContract({
            address: core, abi: PROCESSES_ABI, functionName: 'processes', args: [processId],
        });
        expect(resolved[3]).toBe(0);
    });
});
