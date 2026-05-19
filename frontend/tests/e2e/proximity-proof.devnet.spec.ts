/**
 * proximity-proof.devnet.spec.ts
 *
 * `figaro-proximity-proof-v1` is the runtime half of the proximity
 * sister-schema split — Category-1, content is fresh per attestation,
 * paired with the Cat-2 `figaro-proximity-policy-v1` clause that
 * commits the bands at agreement signing. The
 * `useCourierProcessActions.signalWithProof` UI path fires this
 * attestation at the two handoff edges (arrived-pickup,
 * arrived-dropoff / completed). No devnet coverage existed
 * pre-2026-05-19.
 *
 * Seed flow:
 *   1. Buyer commits a root order to seller-of-record (anvil[1]).
 *   2. Buyer commits a courier sub-order with an agreement that
 *      carries proximity-policy + proximity-proof sections.
 *   3. Courier (seller of the sub-order) fires the proximity attestation.
 *
 * Negative cases the on-chain validator (FigaroProximityProofV1Validator
 * .sol) enforces structurally:
 *   - band must be in {1, 2, 3} (InvalidBand).
 *   - nonce must be non-zero (ZeroNonce).
 *   - deviceSig length must be in [65, 512] (DeviceSigTooShort /
 *     DeviceSigTooLong).
 * No ecrecover — sig contents are not verified.
 */
import { test, expect } from './devnet-multi-test';
import {
    createPublicClient,
    defineChain,
    http,
    keccak256,
    stringToHex,
    type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
    attestProximityProofAsSeller,
    createRootOrder,
    createSubOrder,
    ensureTokenApprovals,
    evmRevert,
    evmSnapshot,
    proximityHandoffAgreement,
    readLocalDeploymentConfig,
} from './devnet-helpers';
// `privateKeyToAccount` is imported above and used by seedProximityHandoff.
import { ATTESTATION_COORDINATOR_ABI } from '@figaro/core';

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
const COURIER_ADDR = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

const PROXIMITY_PROOF_SCHEMA_ID = keccak256(stringToHex('figaro-proximity-proof-v1'));

// Synthetic 65-byte deviceSig: minimum length the validator accepts.
// Content is not verified (no ecrecover), so a deterministic value is
// fine. Matches the MIN_SIG_LEN guard in FigaroProximityProofV1Validator.
const DEVICE_SIG: Hex = `0x${'01'.repeat(65)}`;
const NONCE: Hex = `0x${'42'.repeat(32)}`;

interface SeededHandoff {
    processId: Hex;
    rootOrderHash: Hex;
    deliveryOrderHash: Hex;
}

async function seedProximityHandoff(): Promise<SeededHandoff> {
    const config = readLocalDeploymentConfig();
    const coreAddress = (process.env.NEXT_PUBLIC_FIGARO_CORE ?? config.figaroCore) as Hex;
    const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex;

    await ensureTokenApprovals(coreAddress, tokenAddress, BUYER_KEY, RESTAURANT_KEY, COURIER_KEY);

    const buyer = privateKeyToAccount(BUYER_KEY);
    const courier = privateKeyToAccount(COURIER_KEY);

    const { processId, orderHash: rootOrderHash } = await createRootOrder({
        buyerKey: BUYER_KEY, sellerKey: RESTAURANT_KEY,
        coreAddress, tokenAddress, payment: 1_000000000000000000n,
    });

    const { orderHash: deliveryOrderHash } = await createSubOrder({
        processId, buyerKey: BUYER_KEY, sellerKey: COURIER_KEY,
        coreAddress, tokenAddress, payment: 500000000000000000n,
        parentOrderHashes: [rootOrderHash],
        agreement: proximityHandoffAgreement(
            buyer.address as Hex,
            courier.address as Hex,
            'zone-wifi',
        ),
    });

    return { processId, rootOrderHash, deliveryOrderHash };
}

let outerSnapshot: string;
test.beforeAll(async () => { outerSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (outerSnapshot) await evmRevert(outerSnapshot); });

test.describe('AttestationCoordinator + figaro-proximity-proof-v1 (devnet)', () => {
    let testSnapshot: string;
    test.beforeEach(async () => { testSnapshot = await evmSnapshot(); });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    test('courier submits proximity proof — Attestation emitted with band-as-stage', async () => {
        const seeded = await seedProximityHandoff();

        await attestProximityProofAsSeller({
            orderHash: seeded.deliveryOrderHash,
            sellerKey: COURIER_KEY,
            band: 'zone-wifi',
            nonce: NONCE,
            deviceSig: DEVICE_SIG,
        });

        const config = readLocalDeploymentConfig();
        const coordinator = (process.env.NEXT_PUBLIC_ATTESTATION_COORDINATOR
            ?? config.attestationCoordinator) as Hex;
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        const events = await publicClient.getContractEvents({
            address: coordinator, abi: ATTESTATION_COORDINATOR_ABI,
            eventName: 'Attestation',
            args: { orderHash: seeded.deliveryOrderHash, attester: COURIER_ADDR as Hex },
            fromBlock: 0n,
        });
        const proximity = events.filter((e) => e.args.schemaId === PROXIMITY_PROOF_SCHEMA_ID);
        expect(proximity.length).toBe(1);
        // band='zone-wifi' → stage=1 (matches PROXIMITY_BAND_INDEX).
        expect(proximity[0].args.stage).toBe(1);
    });

    test('two distinct attestations at the same edge — fresh nonces, both events emitted', async () => {
        const seeded = await seedProximityHandoff();

        await attestProximityProofAsSeller({
            orderHash: seeded.deliveryOrderHash,
            sellerKey: COURIER_KEY,
            band: 'zone-wifi',
            nonce: NONCE,
            deviceSig: DEVICE_SIG,
        });
        await attestProximityProofAsSeller({
            orderHash: seeded.deliveryOrderHash,
            sellerKey: COURIER_KEY,
            band: 'zone-wifi',
            nonce: `0x${'aa'.repeat(32)}`,
            deviceSig: DEVICE_SIG,
        });

        const config = readLocalDeploymentConfig();
        const coordinator = (process.env.NEXT_PUBLIC_ATTESTATION_COORDINATOR
            ?? config.attestationCoordinator) as Hex;
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        const events = await publicClient.getContractEvents({
            address: coordinator, abi: ATTESTATION_COORDINATOR_ABI,
            eventName: 'Attestation',
            args: { orderHash: seeded.deliveryOrderHash, attester: COURIER_ADDR as Hex },
            fromBlock: 0n,
        });
        const proximity = events.filter((e) => e.args.schemaId === PROXIMITY_PROOF_SCHEMA_ID);
        // Cat-1 schemas don't dedup on content; two distinct nonces →
        // two distinct ABI-encoded contents → two distinct contentRefs.
        expect(proximity.length).toBe(2);
    });

    test('zero nonce reverts ZeroNonce', async () => {
        const seeded = await seedProximityHandoff();

        await expect(
            attestProximityProofAsSeller({
                orderHash: seeded.deliveryOrderHash,
                sellerKey: COURIER_KEY,
                band: 'zone-wifi',
                nonce: `0x${'00'.repeat(32)}`,
                deviceSig: DEVICE_SIG,
            }),
        ).rejects.toThrow(/ZeroNonce/);
    });

    test('too-short deviceSig reverts DeviceSigTooShort (validator MIN_SIG_LEN=65)', async () => {
        const seeded = await seedProximityHandoff();

        await expect(
            attestProximityProofAsSeller({
                orderHash: seeded.deliveryOrderHash,
                sellerKey: COURIER_KEY,
                band: 'zone-wifi',
                nonce: NONCE,
                // 64 bytes — one byte under the floor.
                deviceSig: `0x${'01'.repeat(64)}`,
            }),
        ).rejects.toThrow(/DeviceSigTooShort/);
    });

    // Note: the validator's `band ∈ {1,2,3}` guard (InvalidBand) is covered
    // structurally by the Foundry test FigaroProximityProofV1ValidatorTest.
    // Replicating it through the e2e harness adds no live-chain assurance
    // beyond what the band-1 happy path already proves (the validator IS
    // wired and the coordinator IS hitting it). The two structural reverts
    // above (ZeroNonce, DeviceSigTooShort) are sufficient e2e proof of the
    // validator's runtime gating.
});
