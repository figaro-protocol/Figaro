/**
 * proximity-proof-ui.devnet.spec.ts
 *
 * Phase 5 item D2: UI coverage of the courier proximity-proof submit
 * path on /orders/[processId].
 *
 * `useCourierProcessActions.signalWithProof` and its plumbing existed,
 * but OrderTimelineView derived `role` from the root order only — a
 * courier (seller of a non-root sub-order) fell through to "spectator"
 * and the handoff action was unreachable. D2 added the courier role
 * branch + the `btn-courier-proximity-proof` button.
 *
 * Flow:
 *   1. Seed a root order (buyer ↔ restaurant) + a courier sub-order
 *      (buyer ↔ courier) carrying a proximity-handoff agreement.
 *   2. Seed that agreement into the courier's localStorage so the
 *      seller-attestation path can open the inclusion proof.
 *   3. Open /orders/<processId> as the courier wallet.
 *   4. Click the proximity-proof button.
 *   5. Assert the on-chain figaro-proximity-proof-v1 Attestation event.
 *
 * Additive UI-tier coverage — the contract path is covered by
 * proximity-proof.devnet.spec.ts (viem-tier).
 *
 * Requires Anvil + ./deploy-local.sh + Kubo.
 */
import { test, expect, gotoAsWallet, seedAgreementForWallet } from './devnet-multi-test';
import {
    createPublicClient,
    defineChain,
    http,
    keccak256,
    parseAbi,
    stringToHex,
    type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
    createRootOrder,
    createSubOrder,
    ensureTokenApprovals,
    evmRevert,
    evmSnapshot,
    proximityHandoffAgreement,
    readLocalDeploymentConfig,
} from './devnet-helpers';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});

const BUYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const RESTAURANT_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;
const COURIER_KEY = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a' as const;
const COURIER_ADDR = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as const;

const PROXIMITY_PROOF_SCHEMA_ID = keccak256(stringToHex('figaro-proximity-proof-v1'));

const ATTESTATION_COORDINATOR_EVENT_ABI = parseAbi([
    'event Attestation(bytes32 indexed orderHash, bytes32 indexed processId, address indexed attester, bytes32 schemaId, uint8 stage, bytes32 contentRef)',
]);

let outerSnapshot: string;
test.beforeAll(async () => { outerSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (outerSnapshot) await evmRevert(outerSnapshot); });

test.describe('Courier proximity proof via UI (devnet)', () => {
    let testSnapshot: string;
    let blockBefore: bigint;

    test.beforeEach(async () => {
        testSnapshot = await evmSnapshot();
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        blockBefore = await publicClient.getBlockNumber();
    });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    // Two on-chain seed commits + multi-route nav + two attestation txs.
    test.setTimeout(180_000);

    test('courier submits a proximity proof from the order timeline — Attestation event emits', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const coreAddress = (process.env.NEXT_PUBLIC_FIGARO_CORE ?? config.figaroCore) as Hex;
        const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex;
        const coordinator = (process.env.NEXT_PUBLIC_ATTESTATION_COORDINATOR ?? config.attestationCoordinator) as Hex;
        if (!coreAddress || !tokenAddress || !coordinator) {
            throw new Error('Missing FIGARO_CORE / TOKEN_ADDRESS / ATTESTATION_COORDINATOR env');
        }

        const buyer = privateKeyToAccount(BUYER_KEY);
        const courier = privateKeyToAccount(COURIER_KEY);

        await ensureTokenApprovals(coreAddress, tokenAddress, BUYER_KEY, RESTAURANT_KEY, COURIER_KEY);

        // Root order: buyer ↔ restaurant. The courier acts on the
        // sub-order, so the root needs no agreement clause.
        const { processId, orderHash: rootOrderHash } = await createRootOrder({
            buyerKey: BUYER_KEY,
            sellerKey: RESTAURANT_KEY,
            coreAddress,
            tokenAddress,
            payment: 1_000_000_000_000_000_000n,
        });

        // Courier sub-order, carrying the proximity-handoff agreement
        // (courier-process + proximity-policy + proximity-proof sections).
        const courierAgreement = proximityHandoffAgreement(
            buyer.address as Hex,
            courier.address as Hex,
            'zone-wifi',
        );
        const { orderHash: deliveryOrderHash } = await createSubOrder({
            processId,
            buyerKey: BUYER_KEY,
            sellerKey: COURIER_KEY,
            coreAddress,
            tokenAddress,
            payment: 500_000_000_000_000_000n,
            parentOrderHashes: [rootOrderHash],
            agreement: courierAgreement,
        });

        // The seller-attestation path opens an inclusion proof against
        // the committed agreement — seed it into the courier's
        // localStorage before the page mounts.
        await seedAgreementForWallet(page, courierAgreement);

        await gotoAsWallet(page, COURIER_ADDR, `/orders/${processId}?e2e=devnet`);

        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30_000 });

        // The button renders only in the courier role branch — its
        // presence proves the courier-order derivation worked.
        const proofButton = page.getByTestId('btn-courier-proximity-proof');
        await expect(proofButton).toBeEnabled({ timeout: 30_000 });
        await proofButton.click();

        // signalWithProof fires two attestations; assert the
        // figaro-proximity-proof-v1 one landed on the sub-order.
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const deadline = Date.now() + 90_000;
        let events: Array<{ args: { stage: number; schemaId: Hex } }> = [];
        while (Date.now() < deadline) {
            const all = await publicClient.getContractEvents({
                address: coordinator,
                abi: ATTESTATION_COORDINATOR_EVENT_ABI,
                eventName: 'Attestation',
                args: { orderHash: deliveryOrderHash, attester: COURIER_ADDR as Hex },
                fromBlock: blockBefore,
            });
            events = (all as typeof events).filter((e) => e.args.schemaId === PROXIMITY_PROOF_SCHEMA_ID);
            if (events.length >= 1) break;
            await new Promise((r) => setTimeout(r, 1000));
        }
        expect(events.length).toBeGreaterThanOrEqual(1);
        // band 'zone-wifi' → stage 1 (PROXIMITY_BAND_INDEX).
        expect(events[0].args.stage).toBe(1);

        // The UI surfaced no submission error.
        await expect(page.getByTestId('courier-action-error')).toHaveCount(0);
    });
});
