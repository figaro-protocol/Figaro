/**
 * local-commerce-scenario.devnet.spec.ts
 *
 * The full local-commerce one-hop scenario, end to end, every role through
 * its own UI:
 *
 *   1. Buyer browses the seeded Mercato General, picks the local-commerce
 *      assembly, captures a delivery location, places the order — the food
 *      order (buyer↔merchant) and the courier order (buyer↔Swift Courier)
 *      both commit.
 *   2. Merchant (Mercato) walks the figaro-merchant-process-v1 coordination
 *      and Swift Courier submits both handoff proximity proofs —
 *      runDeliveryCoordination, the shared full-multi-role runtime step.
 *   3. Buyer confirms receipt → resolveProcess atomically settles both
 *      orders.
 *
 * The seller-assigned member of the local-commerce scenario matrix; its
 * buyer-assigned and dutch-auction siblings run the same
 * runDeliveryCoordination step.
 *
 * Requires Anvil + ./deploy-local.sh + Kubo + a seeded devnet.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import { createPublicClient, defineChain, http, parseAbi, type Hex } from 'viem';
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

// Buyer — anvil[0], the default ?e2e=devnet account.
const BUYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const BUYER_ADDR = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;
// Mercato General — seeded merchant, anvil[8].
const MERCATO_ADDR = '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f' as const;
// Swift Courier — seeded courier on anvil[7]; Mercato's seller-assigned
// courier in its counterpartyBindings roster.
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

function deployment(): { core: Hex; token: Hex } {
    const config = readLocalDeploymentConfig();
    return {
        core: (process.env.NEXT_PUBLIC_FIGARO_CORE ?? config.figaroCore) as Hex,
        token: (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex,
    };
}

let outerSnapshot: string;
test.beforeAll(async () => { outerSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (outerSnapshot) await evmRevert(outerSnapshot); });

test.describe('Full local-commerce scenario (devnet)', () => {
    let testSnapshot: string;
    test.beforeEach(async () => { testSnapshot = await evmSnapshot(); });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    // Buyer commit (2 orders) + merchant walk (5 attestations) + courier
    // handoffs (2 × 2 attestations) + resolve — every role through its UI.
    test.setTimeout(420_000);

    test('buyer commits, merchant coordinates, courier delivers, buyer resolves', async ({ page }) => {
        const { core, token } = deployment();
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        await ensureTokenApprovals(core, token, BUYER_KEY);
        page.on('dialog', (dialog) => { dialog.accept().catch(() => {}); });

        // ── 1. Buyer commits the food + courier orders ───────────────
        const processId = await placeLocalCommerceOrderUI(page, {
            merchant: MERCATO_ADDR,
            itemId: ITEM.id,
            courier: { partnerName: 'Swift Courier', deliveryItemId: 'delivery-standard' },
        });

        const committed = await publicClient.readContract({
            address: core, abi: PROCESSES_ABI, functionName: 'processes', args: [processId],
        });
        expect(committed[3]).toBe(2); // food + courier orders active

        // ── 2. Merchant coordinates, courier delivers ────────────────
        await runDeliveryCoordination(page, {
            processId, merchant: MERCATO_ADDR, courier: SWIFT_COURIER_ADDR,
        });

        // ── 3. Buyer confirms receipt → atomic resolution ────────────
        await gotoAsWallet(page, BUYER_ADDR, `/orders/${processId}?e2e=devnet`);
        const confirmBtn = page.getByTestId('btn-confirm-receipt');
        await confirmBtn.waitFor({ timeout: 30000 });
        await confirmBtn.click();
        await expect(page.getByTestId('order-status-pill')).toHaveText('Completed', { timeout: 90000 });

        const resolved = await publicClient.readContract({
            address: core, abi: PROCESSES_ABI, functionName: 'processes', args: [processId],
        });
        expect(resolved[3]).toBe(0); // both orders atomically settled
    });
});
