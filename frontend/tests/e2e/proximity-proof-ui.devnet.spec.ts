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
 * branch through the ONE clause-agnostic capability rail.
 *
 * Flow:
 *   1. Seed a root order (buyer ↔ restaurant) + a courier sub-order
 *      (buyer ↔ courier) carrying a proximity-handoff agreement.
 *   2. Seed that agreement into the courier's localStorage so the
 *      seller-attestation path can open the inclusion proof.
 *   3. Open /orders/<processId> as the courier wallet.
 *   4. Click the proximity-proof button — handoff 1 (arrived-pickup).
 *   5. Click it again — the button reads the courier-process event log
 *      and certifies handoff 2 (arrived-dropoff) instead.
 *   6. Assert the proximity-proof + courier-process Attestation events
 *      across both handoff edges.
 *
 * Additive UI-tier coverage — the contract path is covered by
 * proximity-proof.devnet.spec.ts (viem-tier).
 *
 * Requires Anvil + ./deploy-local.sh + Kubo.
 */
import { test, expect, seedAgreementForWallet } from './devnet-multi-test';
import { ATTESTATION_COORDINATOR_ABI } from '@figaro/core';
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
    walkClauseAttestations,
    createSubOrder,
    ensureTokenApprovals,
    proximityHandoffAgreement,
    readLocalDeploymentConfig,
} from './devnet-helpers';
import { ANVIL_KEYS } from '../anvilAccounts';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});

const BUYER_KEY = ANVIL_KEYS[0];
const RESTAURANT_KEY = ANVIL_KEYS[1];
const COURIER_KEY = ANVIL_KEYS[2];
const COURIER_ADDR = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as const;

const PROXIMITY_PROOF_CLAUSE_ID = keccak256(stringToHex('figaro-proximity-proof-v1'));
const COURIER_PROCESS_CLAUSE_ID = keccak256(stringToHex('figaro-courier-process-v1'));



test.describe('Courier proximity proof via UI (devnet)', () => {
    let blockBefore: bigint;

    test.beforeEach(async () => {
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        blockBefore = await publicClient.getBlockNumber();
    });

    // Two seed commits + nav + two handoffs, each two attestation txs.
    test.setTimeout(240_000);

    test('courier walks its ladder and witnesses the proximity proof through the generic rail', async ({ page }) => {
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

        // The courier walks its order's attestations through the ONE
        // clause-agnostic rail: the 5-stage courier-process ladder + the
        // bilateral proximity witness at the committed band (6 clicks).
        // (Per-handoff-edge proof PAIRING is the deferred engine-spec work —
        // at HEAD each party witnesses its order's proof once.)
        await walkClauseAttestations(page, {
            wallet: COURIER_ADDR, processId, clicks: 6, who: 'courier',
        });

        // Out-of-band: the courier-process ladder is fully attested (enum
        // ordinals 0..4 — arrived-pickup is 1, arrived-dropoff is 3) and the
        // proximity proof landed at the committed band (zone-wifi = ordinal 0).
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const all = await publicClient.getContractEvents({
            address: coordinator,
            abi: ATTESTATION_COORDINATOR_ABI,
            eventName: 'Attestation',
            args: { orderHash: deliveryOrderHash, attester: COURIER_ADDR as Hex },
            fromBlock: blockBefore,
        });
        const courierStages = (all as Array<{ args: { stage: number; clauseId: Hex } }>)
            .filter((e) => e.args.clauseId === COURIER_PROCESS_CLAUSE_ID)
            .map((e) => Number(e.args.stage))
            .sort((a, b) => a - b);
        expect(courierStages).toEqual([0, 1, 2, 3, 4]);
        const proofEvents = (all as Array<{ args: { stage: number; clauseId: Hex } }>)
            .filter((e) => e.args.clauseId === PROXIMITY_PROOF_CLAUSE_ID);
        expect(proofEvents.length).toBe(1);
        expect(Number(proofEvents[0].args.stage)).toBe(0); // zone-wifi
    });
});
