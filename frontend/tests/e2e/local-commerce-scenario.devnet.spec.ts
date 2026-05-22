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
 *      — order-received → accepted → prep-started → ready-for-pickup →
 *      handed-off.
 *   3. Courier (Swift Courier) sees the channel-delivered delivery address
 *      and submits both handoff proximity proofs — arrived-pickup, then
 *      arrived-dropoff.
 *   4. Buyer confirms receipt → resolveProcess atomically settles both
 *      orders.
 *
 * Composes the role flows proven in isolation by local-commerce-purchase
 * (buyer), seller-timeline (merchant), and proximity-proof-ui (courier),
 * driven together against the real committed local-commerce orders.
 *
 * Requires Anvil + ./deploy-local.sh + Kubo + a seeded devnet.
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
// Swift Courier — seeded courier on anvil[7] (seed-devnet.mjs couriers:[7]);
// Mercato's seller-assigned courier in its counterpartyBindings roster.
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
const ATTESTATION_ABI = parseAbi([
    'event Attestation(bytes32 indexed orderHash, bytes32 indexed processId, address indexed attester, bytes32 schemaId, uint8 stage, bytes32 contentRef)',
]);
const COURIER_PROCESS_SCHEMA_ID = keccak256(stringToHex('figaro-courier-process-v1'));

// The merchant-process happy path — figaro-merchant-process-v1 events.
const MERCHANT_STEPS = ['order-received', 'accepted', 'prep-started', 'ready-for-pickup', 'handed-off'] as const;

function deployment(): { core: Hex; token: Hex; coordinator: Hex } {
    const config = readLocalDeploymentConfig();
    return {
        core: (process.env.NEXT_PUBLIC_FIGARO_CORE ?? config.figaroCore) as Hex,
        token: (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex,
        coordinator: (process.env.NEXT_PUBLIC_ATTESTATION_COORDINATOR ?? config.attestationCoordinator) as Hex,
    };
}

/** Courier-process stages attested for the process (block-ordered). */
async function courierStages(
    publicClient: ReturnType<typeof createPublicClient>,
    coordinator: Hex,
    processId: Hex,
): Promise<number[]> {
    const all = await publicClient.getContractEvents({
        address: coordinator, abi: ATTESTATION_ABI, eventName: 'Attestation',
        args: { processId }, fromBlock: 0n,
    });
    return (all as Array<{ args: { schemaId: Hex; stage: number } }>)
        .filter((e) => e.args.schemaId === COURIER_PROCESS_SCHEMA_ID)
        .map((e) => Number(e.args.stage));
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
        const { core, token, coordinator } = deployment();
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        await ensureTokenApprovals(core, token, BUYER_KEY);
        page.on('dialog', (dialog) => { dialog.accept().catch(() => {}); });

        // ── 1. Buyer commits the food + courier orders ───────────────
        const processId = await placeLocalCommerceOrderUI(page, {
            merchant: MERCATO_ADDR,
            itemId: ITEM.id,
        });

        const committed = await publicClient.readContract({
            address: core, abi: PROCESSES_ABI, functionName: 'processes', args: [processId],
        });
        expect(committed[3]).toBe(2); // food + courier orders active

        // ── 2. Merchant walks the coordination ───────────────────────
        await gotoAsWallet(page, MERCATO_ADDR, `/orders/${processId}?e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
        for (const step of MERCHANT_STEPS) {
            const btn = page.getByTestId(`btn-merchant-next-${step}`);
            await btn.waitFor({ state: 'visible', timeout: 60000 });
            await btn.click();
        }
        // The walk is complete — no further merchant-next button.
        await expect(page.locator('[data-testid^="btn-merchant-next-"]')).toHaveCount(0, { timeout: 60000 });

        // ── 3. Courier delivers — both handoffs ──────────────────────
        await gotoAsWallet(page, SWIFT_COURIER_ADDR, `/orders/${processId}?e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
        // The courier sees the buyer's street address — channel-delivered.
        await expect(page.getByTestId('courier-handoff-address')).toBeVisible({ timeout: 30000 });

        const proofBtn = page.getByTestId('btn-courier-proximity-proof');
        // Handoff 1 → arrived-pickup (stage 3); handoff 2 → arrived-dropoff
        // (stage 5). The button reads the courier-process log to target the
        // edge, so each handoff's attestation must land before the next click.
        for (let handoff = 0; handoff < 2; handoff++) {
            await expect(proofBtn).toBeEnabled({ timeout: 45000 });
            await proofBtn.click();
            const want = handoff === 0 ? [3] : [3, 5];
            const deadline = Date.now() + 90_000;
            for (;;) {
                const stages = await courierStages(publicClient, coordinator, processId);
                if (want.every((s) => stages.includes(s))) break;
                if (Date.now() > deadline) throw new Error(`courier handoff ${handoff + 1} timed out — stages ${stages}`);
                await new Promise((r) => setTimeout(r, 1000));
            }
        }
        const finalStages = await courierStages(publicClient, coordinator, processId);
        expect(finalStages).toContain(3); // arrived-pickup (merchant→courier)
        expect(finalStages).toContain(5); // arrived-dropoff (courier→buyer)

        // ── 4. Buyer confirms receipt → atomic resolution ────────────
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
