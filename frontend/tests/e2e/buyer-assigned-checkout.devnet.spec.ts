/**
 * buyer-assigned-checkout.devnet.spec.ts
 *
 * Stage E — buyer-assigned delivery, end to end through the UI. The
 * `local-commerce-buyer-assigned` assembly's courier coordination is
 * `buyer-assigned`: the buyer chooses the courier at checkout — not the
 * merchant (seller-assigned), not an auction (dutch-auction). The courier
 * order commits synchronously at the buyer-chosen courier's published rate.
 *
 *   1. Buyer browses Mercato General, picks `deliver:buyer-assigned`,
 *      chooses Swift Courier, places the order.
 *   2. Both orders commit — food (buyer↔merchant) + courier (buyer↔the
 *      chosen courier).
 *   3. The courier order's seller IS the courier the buyer chose.
 *   4. Buyer resolves; both orders settle atomically.
 *
 * Mercato General is bound to `local-commerce-buyer-assigned` (seed-devnet.mjs).
 *
 * Requires Anvil + ./deploy-local.sh + Kubo + a seeded devnet.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from './devnet-multi-test';
import { createPublicClient, defineChain, http, parseAbi, type Hex } from 'viem';
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
// Swift Courier — seeded courier operator on anvil[7]. The buyer picks it.
const SWIFT_COURIER_ADDR = '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955' as const;
// Mercato General — seeded merchant, anvil[8]; bound to local-commerce-buyer-assigned.
const MERCATO_ADDR = '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f' as const;

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

test.describe('Buyer-assigned delivery — buyer chooses the courier (devnet)', () => {
    let testSnapshot: string;
    test.beforeEach(async () => { testSnapshot = await evmSnapshot(); });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    test.setTimeout(300_000);

    test('buyer picks the courier at checkout; both orders commit; buyer resolves', async ({ page }) => {
        const { core } = deployment();
        const token = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS
            ?? readLocalDeploymentConfig().tokenAddress) as Hex;

        // The buyer initiates both orders; the chosen courier is the
        // counterparty on the courier order (auto-approved in devnet).
        await ensureTokenApprovals(core, token, BUYER_KEY);
        page.on('dialog', (dialog) => { dialog.accept().catch(() => {}); });

        // ── 1. Buyer picks buyer-assigned delivery + chooses the courier ──
        const processId = await placeLocalCommerceOrderUI(page, {
            merchant: MERCATO_ADDR,
            itemId: ITEM.id,
            fulfilmentMode: 'deliver:buyer-assigned',
            courier: { address: SWIFT_COURIER_ADDR, deliveryItemId: 'delivery-standard' },
        });

        // ── 2. Both orders committed — food + courier ─────────────────
        const committed = await publicClient.readContract({
            address: core, abi: PROCESSES_ABI, functionName: 'processes', args: [processId],
        });
        expect(committed[3]).toBe(2);

        // ── 3. The courier order's seller is the courier the buyer chose ──
        const orders = await publicClient.getContractEvents({
            address: core, abi: ORDER_COMMITTED_ABI, eventName: 'OrderCommitted',
            args: { processId }, fromBlock: 0n,
        });
        expect(orders.length).toBe(2);
        const sellers = orders.map((e) => (e.args.seller as string).toLowerCase());
        expect(sellers).toContain(SWIFT_COURIER_ADDR.toLowerCase());

        // ── 4. Buyer resolves — both orders settle atomically ─────────
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
