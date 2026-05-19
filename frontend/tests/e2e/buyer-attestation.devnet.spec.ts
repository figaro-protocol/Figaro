/**
 * buyer-attestation.devnet.spec.ts
 *
 * `AttestationCoordinator.attestAsBuyer` was Vitest-tested only
 * (`tests/lib/useGHGDisclosure.test.ts`) — no devnet coverage that
 * exercises the on-chain leaf-validation + event-emission path with a
 * real committed agreement. This spec closes that gap.
 *
 * Test pattern mirrors the existing GHG seed scenarios but adds a
 * buyer-side verification attestation alongside the supplier-side
 * inventory attestation. Both are valid attestations on the same
 * order: distinct (msg.sender, stage) tuples, distinct events.
 *
 * Requires: Anvil + ./deploy-local.sh
 *   NEXT_PUBLIC_ATTESTATION_COORDINATOR must be set in .env.local.
 */
import { test, expect } from './devnet-multi-test';
import {
    createPublicClient,
    defineChain,
    http,
    type Hex,
} from 'viem';
import {
    attestGhgAsBuyer,
    evmRevert,
    evmSnapshot,
    readLocalDeploymentConfig,
    seedGhgDisclosureScenario,
} from './devnet-helpers';
import { ATTESTATION_COORDINATOR_ABI } from '@figaro/core';
import { GHG_SCHEMA_ID } from '@/lib/core/agreementManifest';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});

const BUYER_ADDR = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;

let outerSnapshot: string;
test.beforeAll(async () => { outerSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (outerSnapshot) await evmRevert(outerSnapshot); });

test.describe('AttestationCoordinator.attestAsBuyer (devnet)', () => {
    let testSnapshot: string;
    test.beforeEach(async () => { testSnapshot = await evmSnapshot(); });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    test('buyer submits a verification attestation alongside the supplier inventory attestation', async () => {
        const seeded = await seedGhgDisclosureScenario();

        const config = readLocalDeploymentConfig();
        const coordinator = (process.env.NEXT_PUBLIC_ATTESTATION_COORDINATOR
            ?? config.attestationCoordinator) as Hex;

        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        // ── Buyer attestation on the supplier sub-order, verification stage ──
        // The seed already fires a supplier-side inventory attestation on this
        // order (stage=1). The buyer-side verification (stage=3) is a distinct
        // event by the (attester, stage) pair.
        await attestGhgAsBuyer(seeded.supplierOrderHash, 3);

        // schemaId is NOT indexed on the Attestation event — filter on the
        // indexed orderHash + attester args, then post-filter by schemaId
        // and stage from the decoded payload.
        const events = await publicClient.getContractEvents({
            address: coordinator,
            abi: ATTESTATION_COORDINATOR_ABI,
            eventName: 'Attestation',
            args: { orderHash: seeded.supplierOrderHash },
            fromBlock: 0n,
        });
        const ghgEvents = events.filter((e) => e.args.schemaId === GHG_SCHEMA_ID);
        // At minimum: supplier inventory (stage=1) + buyer verification (stage=3).
        expect(ghgEvents.length).toBeGreaterThanOrEqual(2);

        const buyerVerification = ghgEvents.find(
            (e) => e.args.attester?.toLowerCase() === BUYER_ADDR.toLowerCase() && e.args.stage === 3,
        );
        expect(buyerVerification).toBeDefined();

        const supplierInventory = ghgEvents.find(
            (e) => e.args.attester?.toLowerCase() !== BUYER_ADDR.toLowerCase() && e.args.stage === 1,
        );
        expect(supplierInventory).toBeDefined();
    });

    test('buyer can also commit a stage-0 attestation on the root order', async () => {
        const seeded = await seedGhgDisclosureScenario();

        const config = readLocalDeploymentConfig();
        const coordinator = (process.env.NEXT_PUBLIC_ATTESTATION_COORDINATOR
            ?? config.attestationCoordinator) as Hex;

        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        // Commitment stage (0) — the canonical "I agree to disclose under this
        // standard" attestation. Distinct event from the supplier inventory
        // attestation on the seed.
        await attestGhgAsBuyer(seeded.rootOrderHash, 0);

        const events = await publicClient.getContractEvents({
            address: coordinator,
            abi: ATTESTATION_COORDINATOR_ABI,
            eventName: 'Attestation',
            args: { orderHash: seeded.rootOrderHash, attester: BUYER_ADDR },
            fromBlock: 0n,
        });
        const onRoot = events.filter(
            (e) => e.args.schemaId === GHG_SCHEMA_ID && e.args.stage === 0,
        );
        expect(onRoot.length).toBeGreaterThanOrEqual(1);
    });
});
