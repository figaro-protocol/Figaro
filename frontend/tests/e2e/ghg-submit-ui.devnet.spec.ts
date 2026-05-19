/**
 * ghg-submit-ui.devnet.spec.ts
 *
 * Phase 4 C6 (reinstated): UI coverage of the GHG inventory-attestation
 * submit path on `/terminal`'s GHGWorkflowPanel. Originally skipped
 * because `deriveProcessModelFromRuntime` didn't emit the
 * `submit-disclosure-{commitment,inventory}` capabilities — the
 * panel's submit affordances were unreachable in production. With
 * the runtime derivation now wired (see Bug 3 fix), the panel
 * surfaces the buttons when the agreement carries the GHG schemas.
 *
 * Flow:
 *   1. Seed: agreement carries figaro-ghg-iso-14064-v1 +
 *      figaro-ghg-measurement-v1. createRootOrder commits it.
 *   2. Open page as the restaurant (seller) and seed the agreement
 *      to localStorage so the derivation can read it.
 *   3. /terminal?e2e=devnet → set viewedProcessId → Protocol tab.
 *   4. Expand the order row → fill grams → click submit-actual.
 *   5. Assert the on-chain Attestation event.
 *
 * Requires Anvil + ./deploy-local.sh + Kubo.
 */
import { test, expect, ANVIL_ACCOUNTS, gotoAsWallet, seedAgreementForWallet } from './devnet-multi-test';
import {
    createPublicClient,
    defineChain,
    encodeAbiParameters,
    http,
    keccak256,
    parseAbi,
    stringToHex,
    type Hex,
} from 'viem';
// stringToHex still used for GHG_MEASUREMENT_SCHEMA_ID computation below.
import { privateKeyToAccount } from 'viem/accounts';
import {
    createRootOrder,
    ensureTokenApprovals,
    evmRevert,
    evmSnapshot,
    readLocalDeploymentConfig,
} from './devnet-helpers';
import {
    GHG_SCHEMA_KEY,
    GHG_MEASUREMENT_SCHEMA_KEY,
    type Agreement,
} from '@/lib/core/agreementManifest';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});

const BUYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const RESTAURANT_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;

const GHG_MEASUREMENT_SCHEMA_ID = keccak256(stringToHex(GHG_MEASUREMENT_SCHEMA_KEY));
// MEASUREMENT_KIND.measured per `lib/mechanisms/contracts.ts` —
// `submitActualForOrder` always submits stage=1 (measured); estimate is
// reserved for prospective values.
const MEASUREMENT_STAGE_MEASURED = 1;

const ATTESTATION_COORDINATOR_EVENT_ABI = parseAbi([
    'event Attestation(bytes32 indexed orderHash, bytes32 indexed processId, address indexed attester, bytes32 schemaId, uint8 stage, bytes32 contentRef)',
]);

let outerSnapshot: string;
test.beforeAll(async () => { outerSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (outerSnapshot) await evmRevert(outerSnapshot); });

test.describe('GHG inventory submit via UI (devnet)', () => {
    let testSnapshot: string;
    let blockBefore: bigint;

    test.beforeEach(async () => {
        testSnapshot = await evmSnapshot();
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        blockBefore = await publicClient.getBlockNumber();
    });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    test.setTimeout(180_000);

    test('restaurant fills grams, clicks Submit inventory, Attestation event emits', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const coreAddress = (process.env.NEXT_PUBLIC_FIGARO_CORE ?? config.figaroCore) as Hex;
        const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex;
        const coordinator = (process.env.NEXT_PUBLIC_ATTESTATION_COORDINATOR ?? config.attestationCoordinator) as Hex;
        if (!coreAddress || !tokenAddress || !coordinator) {
            throw new Error('Missing FIGARO_CORE / TOKEN_ADDRESS / ATTESTATION_COORDINATOR env');
        }

        const buyer = privateKeyToAccount(BUYER_KEY);
        const restaurant = privateKeyToAccount(RESTAURANT_KEY);
        const restaurantAddr = ANVIL_ACCOUNTS[1];

        await ensureTokenApprovals(coreAddress, tokenAddress, BUYER_KEY, RESTAURANT_KEY);

        const agreement: Agreement = {
            version: 'a1',
            buyer: buyer.address as Hex,
            seller: restaurant.address as Hex,
            sections: [
                { schema: GHG_SCHEMA_KEY, data: { standard: 'iso-14064-1', scope: 1 } },
                { schema: GHG_MEASUREMENT_SCHEMA_KEY, data: {} },
            ],
        };

        const { processId, orderHash } = await createRootOrder({
            buyerKey: BUYER_KEY,
            sellerKey: RESTAURANT_KEY,
            coreAddress,
            tokenAddress,
            payment: 1_000_000_000_000_000_000n,
            agreement,
        });

        // Seed the agreement into the restaurant's localStorage so the
        // semantic-runtime derivation can find it and emit the seller
        // GHG capabilities. Must run BEFORE goto so the init script
        // lands before page scripts.
        await seedAgreementForWallet(page, agreement);

        await gotoAsWallet(page, restaurantAddr, '/terminal?e2e=devnet');

        // Wait for the devnet shim that exposes the viewed-process setter.
        await page.waitForFunction(() => {
            const w = window as unknown as { __FIGARO_SET_VIEWED_PROCESS_ID__?: (id: string | null) => void };
            return typeof w.__FIGARO_SET_VIEWED_PROCESS_ID__ === 'function';
        }, null, { timeout: 30_000 });

        await page.evaluate((pid: string) => {
            const w = window as unknown as { __FIGARO_SET_VIEWED_PROCESS_ID__?: (id: string | null) => void };
            w.__FIGARO_SET_VIEWED_PROCESS_ID__?.(pid);
        }, processId);

        await page.getByRole('tab', { name: 'Protocol' }).click();
        await page.getByTestId('ghg-workflow-panel').waitFor({ state: 'visible', timeout: 15_000 });

        // The order row carries no testid; it's labeled by the truncated
        // orderHash (`truncateHex(orderHash, {head: 14, tail: 0})` =
        // first 14 chars). Find the toggle button by visible text.
        const headFragment = orderHash.slice(0, 14);
        const orderToggle = page.locator('button', { hasText: headFragment }).first();
        await orderToggle.waitFor({ state: 'visible', timeout: 30_000 });
        await orderToggle.click();

        const grams = '1250';
        await page.getByTestId('ghg-actual-input').fill(grams);
        const submitButton = page.getByTestId('ghg-submit-actual');
        await expect(submitButton).toBeEnabled({ timeout: 10_000 });
        await submitButton.click();

        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const deadline = Date.now() + 90_000;
        let events: Array<{ args: { stage: number; contentRef: Hex; schemaId: Hex; attester: Hex } }> = [];
        while (Date.now() < deadline) {
            const all = await publicClient.getContractEvents({
                address: coordinator,
                abi: ATTESTATION_COORDINATOR_EVENT_ABI,
                eventName: 'Attestation',
                args: { orderHash, attester: restaurant.address as Hex },
                fromBlock: blockBefore,
            });
            events = (all as typeof events).filter((e) => e.args.schemaId === GHG_MEASUREMENT_SCHEMA_ID);
            if (events.length >= 1) break;
            await new Promise((r) => setTimeout(r, 1000));
        }
        expect(events.length).toBeGreaterThanOrEqual(1);
        const last = events[events.length - 1];
        expect(last.args.stage).toBe(MEASUREMENT_STAGE_MEASURED);

        // contentRef = keccak256(abi.encode(uint256 grams)).
        const expectedContent = encodeAbiParameters([{ type: 'uint256' }], [BigInt(grams)]);
        expect(last.args.contentRef).toBe(keccak256(expectedContent));
    });
});
