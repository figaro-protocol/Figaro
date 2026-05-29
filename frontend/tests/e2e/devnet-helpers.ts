import fs from 'fs';
import path from 'path';
import { Page, expect } from '@playwright/test';
export {
    approveIfNeeded,
    waitAndApproveIfNeeded,
    waitForApproved,
    waitForWalletConnected,
    waitForWalletReady,
} from './test-helpers';
import {
    createPublicClient,
    createWalletClient,
    defineChain,
    http,
    keccak256,
    parseAbi,
    parseEther,
    stringToHex,
    type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
    COMMITMENT_TYPES,
    CORE_ABI,
    ATTESTATION_COORDINATOR_ABI,
    SCHEMA_REGISTRY_ABI,
    buildSectionInclusionProof,
    computeAgreementHash,
    getSectionDataBytes,
    type Agreement,
} from '@figaro/core';
import {
    embeddedSpec,
    encodeContentFromSpec,
    type ProximityBand,
} from '@figaro/core/schemas';
import { DEFAULT_AGREEMENT_HASH } from '@/lib/core/contracts';
import { GHG_SCHEMA_KEY, GHG_SCHEMA_ID } from '@/lib/core/agreementManifest';
import { ZERO_PROCESS_ID } from '@/lib/shared/evm';
import { gotoAsWallet } from './devnet-multi-test';

const RPC_URL = 'http://127.0.0.1:8545';
const MAX_UINT256 = (2n ** 256n) - 1n;
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
        default: { http: [RPC_URL] },
    },
});

// figaro-merchant-process-v1 happy-path stages — order-received through
// handed-off — the merchant walks these in the coordination step.
/** The merchant's pre-handoff lifecycle stages, driven by sequential
 *  `btn-merchant-next-<step>` clicks. The final `handed-off` stage is fired
 *  by `btn-merchant-proximity-proof` instead — it's paired with the
 *  merchant's cross-witness proximity-proof attestation against the courier
 *  order (`OrderTimelineView.tsx` swaps the button when a courier sub-order
 *  exists). */
const MERCHANT_PRE_HANDOFF_STEPS = ['order-received', 'accepted', 'prep-started', 'ready-for-pickup'] as const;
/** Merchant-process `handed-off` event stage — the attestation the
 *  `btn-merchant-proximity-proof` click pairs with the proximity-proof. */
const MERCHANT_HANDED_OFF_STAGE = 4;
const ATTESTATION_EVENT_ABI = parseAbi([
    'event Attestation(bytes32 indexed orderHash, bytes32 indexed processId, address indexed attester, bytes32 schemaId, uint8 stage, bytes32 contentRef)',
]);

const BUYER_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const RESTAURANT_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;
const SUPPLIER_PRIVATE_KEY = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a' as const;

const ERC20_TEST_ABI = parseAbi([
    'function approve(address spender, uint256 amount) external returns (bool)',
]);

const DISCLOSURE_KIND = { commitment: 0, inventory: 1, restatement: 2, verification: 3 } as const;

const MERCHANT_PROCESS_SCHEMA_KEY = 'figaro-merchant-process-v1';
const MERCHANT_PROCESS_SCHEMA_ID = keccak256(stringToHex(MERCHANT_PROCESS_SCHEMA_KEY));
const COURIER_PROCESS_SCHEMA_KEY = 'figaro-courier-process-v1';
const COURIER_PROCESS_SCHEMA_ID = keccak256(stringToHex(COURIER_PROCESS_SCHEMA_KEY));
const GHG_MEASUREMENT_SCHEMA_ID = keccak256(stringToHex('figaro-ghg-measurement-v1'));
const PROXIMITY_POLICY_SCHEMA_KEY = 'figaro-proximity-policy-v1';
const PROXIMITY_PROOF_SCHEMA_KEY = 'figaro-proximity-proof-v1';
const PROXIMITY_PROOF_SCHEMA_ID = keccak256(stringToHex(PROXIMITY_PROOF_SCHEMA_KEY));

/** uint8 band indices the on-chain validator accepts (matches
 *  PROXIMITY_BAND_INDEX in sdk/src/schemas/encode.ts and the validator's
 *  band guard at FigaroProximityProofV1Validator.sol). */
const PROXIMITY_BAND_INDEX: Record<ProximityBand, number> = {
    'zone-wifi': 1,
    'nearby-ble': 2,
    'contact-nfc': 3,
};

/** Merchant event types — uint8 stage per the validator's enum. */
const MERCHANT_EVENT = {
    orderReceived: 0,
    accepted: 1,
    prepStarted: 2,
    readyForPickup: 3,
    handedOff: 4,
    cancelled: 5,
} as const;

/** Courier event types — uint8 stage per the validator's enum. */
const COURIER_EVENT = {
    available: 0,
    accepted: 1,
    enRoutePickup: 2,
    arrivedPickup: 3,
    inTransit: 4,
    arrivedDropoff: 5,
    completed: 6,
    cancelled: 7,
} as const;

// ── EIP-712 Types (imported from @figaro/core) ──────────────────────────────

type CoreCommitment = {
    processId: `0x${string}`;
    buyer: `0x${string}`;
    seller: `0x${string}`;
    currency: `0x${string}`;
    payment: bigint;
    expectedCumulativeValue: bigint;
    agreementHash: `0x${string}`;
    salt: bigint;
    deadline: bigint;
};

const seededCommitments = new Map<`0x${string}`, CoreCommitment>();
const agreementsByHash = new Map<`0x${string}`, Agreement>();

// ── Reference agreement manifests ────────────────────────────────────────
// Phase-4a requires every attestation to carry an inclusion proof against the
// order's signed `agreementHash`. We commit a minimal agreement containing the
// clause the seed's attestation will fire under, so the coordinator accepts
// the proof and the Category-2 byte-equality check (sectionData == content)
// passes.

function ghgDisclosureAgreement(buyer: `0x${string}`, seller: `0x${string}`): Agreement {
    return {
        version: 'a1',
        buyer,
        seller,
        sections: [
            { schema: GHG_SCHEMA_KEY, data: { scope: 1 } },
        ],
    };
}

export function merchantProcessAgreement(buyer: `0x${string}`, seller: `0x${string}`): Agreement {
    return {
        version: 'a1',
        buyer,
        seller,
        sections: [
            { schema: MERCHANT_PROCESS_SCHEMA_KEY, data: { eventType: 'order-received', evidenceUri: '' } },
        ],
    };
}

function courierProcessAgreement(buyer: `0x${string}`, seller: `0x${string}`): Agreement {
    return {
        version: 'a1',
        buyer,
        seller,
        sections: [
            { schema: COURIER_PROCESS_SCHEMA_KEY, data: { eventType: 'available', evidenceUri: '' } },
        ],
    };
}

/**
 * Courier handoff agreement carrying both halves of the proximity
 * sister-schema split:
 *   - figaro-proximity-policy-v1 (Cat-2, committed): which bands the
 *     parties agree to verify against at handoff.
 *   - figaro-proximity-proof-v1 (Cat-1, runtime): placeholder for the
 *     per-handoff witness payload. Cat-1 schemas don't enforce
 *     byte-equality against the committed sectionData, but the section
 *     must EXIST in the agreement for the merkle inclusion proof to
 *     open at attest time.
 *
 * The courier-process section is also included so the same agreement
 * can support both the role-event log AND the proximity attestation
 * — mirrors how the production handoff flow composes them.
 */
function proximityHandoffAgreement(
    buyer: `0x${string}`,
    seller: `0x${string}`,
    band: ProximityBand = 'zone-wifi',
): Agreement {
    return {
        version: 'a1',
        buyer,
        seller,
        sections: [
            { schema: COURIER_PROCESS_SCHEMA_KEY, data: { eventType: 'arrived-pickup', evidenceUri: '' } },
            { schema: PROXIMITY_POLICY_SCHEMA_KEY, data: { bands: [band] } },
            // Cat-1 placeholder: any valid shape. The runtime attestation
            // supplies the real (band, nonce, deviceSig) content; the
            // committed sectionData here is just the placeholder that
            // anchors the section's leaf in the agreement's merkle root.
            {
                schema: PROXIMITY_PROOF_SCHEMA_KEY,
                data: {
                    band,
                    nonce: '0x' + '00'.repeat(32),
                    deviceSig: '0x' + '00'.repeat(65),
                },
            },
        ],
    };
}

function agreementReceipt(commitment: CoreCommitment, schemaKey: string) {
    const agreement = agreementsByHash.get(commitment.agreementHash);
    if (!agreement) {
        throw new Error(`No agreement cached for ${commitment.agreementHash}`);
    }
    const section = agreement.sections.find((s) => s.schema === schemaKey);
    if (!section) {
        throw new Error(`Agreement has no section for ${schemaKey}`);
    }
    const sectionData = getSectionDataBytes(section);
    const { proof } = buildSectionInclusionProof(agreement, schemaKey);
    return { sectionData, proof };
}

// ── Exported types ──────────────────────────────────────────────────────────
// Grams and contentRef are not derivable from `figaro-ghg-iso-14064-v1` under
// Phase-4a — that schema's content is `(uint8 scope)` and the validator
// enforces content == sectionData. The grams channel lives in
// `figaro-ghg-measurement-v1` (Category-1, runtime-only); specs assert on
// attestation existence and associated order hash.

export type SeededGhgScenario = {
    schemaId: `0x${string}`;
    processId: `0x${string}`;
    rootOrderHash: `0x${string}`;
    supplierOrderHash: `0x${string}`;
};

export type SeededSupersededGhgScenario = SeededGhgScenario;

export type SeededClosedCompleteGhgScenario = SeededGhgScenario;

export type SeededUnreportedProcessScenario = SeededGhgScenario;

export type SeededDeliveryScenario = {
    processId: `0x${string}`;
    foodOrderHash: `0x${string}`;
    deliveryOrderHash: `0x${string}`;
    buyer: `0x${string}`;
    restaurant: `0x${string}`;
    driver: `0x${string}`;
};

type DeploymentConfig = {
    figaroCore?: `0x${string}`;
    tokenAddress?: `0x${string}`;
    attestationCoordinator?: `0x${string}`;
    schemaRegistry?: `0x${string}`;
    dutchAuction?: `0x${string}`;
    operatorRegistry?: `0x${string}`;
    assemblyRegistry?: `0x${string}`;
};

export function readLocalDeploymentConfig(): DeploymentConfig {
    const envPath = path.resolve(__dirname, '../../.env.local');
    const deploymentPath = path.resolve(__dirname, '../../../.deployments/local.json');
    const config: DeploymentConfig = {};

    if (fs.existsSync(envPath)) {
        const contents = fs.readFileSync(envPath, 'utf8');
        for (const line of contents.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eq = trimmed.indexOf('=');
            if (eq === -1) continue;
            const key = trimmed.slice(0, eq).trim();
            const value = trimmed.slice(eq + 1).trim() as `0x${string}`;
            if (key === 'NEXT_PUBLIC_FIGARO_CORE') config.figaroCore = value;
            if (key === 'NEXT_PUBLIC_TOKEN_ADDRESS') config.tokenAddress = value;
            if (key === 'NEXT_PUBLIC_ATTESTATION_COORDINATOR') config.attestationCoordinator = value;
            if (key === 'NEXT_PUBLIC_SCHEMA_REGISTRY') config.schemaRegistry = value;
            if (key === 'NEXT_PUBLIC_DUTCH_AUCTION') config.dutchAuction = value;
            if (key === 'NEXT_PUBLIC_OPERATOR_REGISTRY') config.operatorRegistry = value;
            if (key === 'NEXT_PUBLIC_ASSEMBLY_REGISTRY') config.assemblyRegistry = value;
        }
    }

    if (fs.existsSync(deploymentPath)) {
        const contents = JSON.parse(fs.readFileSync(deploymentPath, 'utf8')) as DeploymentConfig;
        config.figaroCore = config.figaroCore ?? contents.figaroCore;
        config.tokenAddress = config.tokenAddress ?? contents.tokenAddress;
        config.attestationCoordinator = config.attestationCoordinator ?? (contents as any).attestationCoordinator;
        config.schemaRegistry = config.schemaRegistry ?? (contents as any).schemaRegistry;
        config.dutchAuction = config.dutchAuction ?? (contents as any).dutchAuction;
        config.operatorRegistry = config.operatorRegistry ?? contents.operatorRegistry;
        config.assemblyRegistry = config.assemblyRegistry ?? (contents as any).assemblyRegistry;
    }

    return config;
}

function resolve(envKey: string, fallback?: `0x${string}`): `0x${string}` | undefined {
    return (process.env[envKey] as `0x${string}` | undefined) ?? fallback;
}

// ── V5 EIP-712 signing ──────────────────────────────────────────────────────

function getEIP712Domain(coreAddress: `0x${string}`) {
    return {
        name: 'FigaroCore',
        version: '3',
        chainId: 31337,
        verifyingContract: coreAddress,
    };
}

export async function signCommitment(
    commitment: {
        processId: `0x${string}`;
        buyer: `0x${string}`;
        seller: `0x${string}`;
        currency: `0x${string}`;
        payment: bigint;
        expectedCumulativeValue: bigint;
        agreementHash: `0x${string}`;
        salt: bigint;
        deadline: bigint;
    },
    signerKey: `0x${string}`,
    coreAddress: `0x${string}`,
): Promise<`0x${string}`> {
    const account = privateKeyToAccount(signerKey);
    const client = createWalletClient({ account, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    return client.signTypedData({
        domain: getEIP712Domain(coreAddress),
        types: COMMITMENT_TYPES,
        primaryType: 'Commitment',
        message: commitment,
    });
}

// ── V5 on-chain helpers ─────────────────────────────────────────────────────

export async function createRootOrder(opts: {
    buyerKey: `0x${string}`;
    sellerKey: `0x${string}`;
    coreAddress: `0x${string}`;
    tokenAddress: `0x${string}`;
    payment: bigint;
    agreementHash?: `0x${string}`;
    /** Optional signed agreement manifest. When supplied, its merkle root is
     *  used as the order's `agreementHash` and is cached so later attestation
     *  helpers can produce inclusion proofs. */
    agreement?: Agreement;
}): Promise<{ processId: `0x${string}`; orderHash: `0x${string}`; commitment: CoreCommitment }> {
    const buyer = privateKeyToAccount(opts.buyerKey);
    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const buyerClient = createWalletClient({ account: buyer, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const seller = privateKeyToAccount(opts.sellerKey);

    const salt = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    const agreementHash = opts.agreement
        ? computeAgreementHash(opts.agreement)
        : (opts.agreementHash ?? DEFAULT_AGREEMENT_HASH);
    if (opts.agreement) agreementsByHash.set(agreementHash, opts.agreement);

    const commitment = {
        processId: ZERO_PROCESS_ID,
        buyer: buyer.address as `0x${string}`,
        seller: seller.address as `0x${string}`,
        currency: opts.tokenAddress,
        payment: opts.payment,
        expectedCumulativeValue: opts.payment,
        agreementHash,
        salt,
        deadline,
    };

    const buyerSig = await signCommitment(commitment, opts.buyerKey, opts.coreAddress);
    const sellerSig = await signCommitment(commitment, opts.sellerKey, opts.coreAddress);

    const { result, request } = await publicClient.simulateContract({
        account: buyer.address,
        address: opts.coreAddress,
        abi: CORE_ABI,
        functionName: 'commit',
        args: [commitment, buyerSig, sellerSig],
    });
    const txHash = await buyerClient.writeContract(request);
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    seededCommitments.set(result[1] as `0x${string}`, commitment);

    return {
        processId: result[0] as `0x${string}`,
        orderHash: result[1] as `0x${string}`,
        commitment,
    };
}

export async function createSubOrder(opts: {
    processId: `0x${string}`;
    buyerKey: `0x${string}`;
    sellerKey: `0x${string}`;
    coreAddress: `0x${string}`;
    tokenAddress: `0x${string}`;
    payment: bigint;
    parentOrderHashes: `0x${string}`[];
    agreementHash?: `0x${string}`;
    agreement?: Agreement;
}): Promise<{ orderHash: `0x${string}`; commitment: CoreCommitment }> {
    const buyer = privateKeyToAccount(opts.buyerKey);
    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const buyerClient = createWalletClient({ account: buyer, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const seller = privateKeyToAccount(opts.sellerKey);

    const processState = await publicClient.readContract({
        address: opts.coreAddress,
        abi: CORE_ABI,
        functionName: 'processes',
        args: [opts.processId],
    });
    const currentCumulativeValue = processState[2];
    const expectedCumulativeValue = currentCumulativeValue + opts.payment;

    const salt = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    const agreementHash = opts.agreement
        ? computeAgreementHash(opts.agreement)
        : (opts.agreementHash ?? DEFAULT_AGREEMENT_HASH);
    if (opts.agreement) agreementsByHash.set(agreementHash, opts.agreement);

    const commitment = {
        processId: opts.processId,
        buyer: buyer.address as `0x${string}`,
        seller: seller.address as `0x${string}`,
        currency: opts.tokenAddress,
        payment: opts.payment,
        expectedCumulativeValue,
        agreementHash,
        salt,
        deadline,
    };

    const buyerSig = await signCommitment(commitment, opts.buyerKey, opts.coreAddress);
    const sellerSig = await signCommitment(commitment, opts.sellerKey, opts.coreAddress);

    const { result, request } = await publicClient.simulateContract({
        account: buyer.address,
        address: opts.coreAddress,
        abi: CORE_ABI,
        functionName: 'commit',
        args: [commitment, buyerSig, sellerSig],
    });
    const txHash = await buyerClient.writeContract(request);
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    seededCommitments.set(result[1] as `0x${string}`, commitment);

    return { orderHash: result[1] as `0x${string}`, commitment };
}

export async function resolveProcessOnChain(opts: {
    processId: `0x${string}`;
    orderHashes: `0x${string}`[];
    buyerKey: `0x${string}`;
    coreAddress: `0x${string}`;
}): Promise<void> {
    const buyer = privateKeyToAccount(opts.buyerKey);
    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const buyerClient = createWalletClient({ account: buyer, chain: LOCAL_ANVIL, transport: http(RPC_URL) });

    const commitments = opts.orderHashes.map((orderHash) => {
        const commitment = seededCommitments.get(orderHash);
        if (!commitment) throw new Error(`Missing seeded commitment for ${orderHash}`);
        return commitment;
    });

    const { request } = await publicClient.simulateContract({
        account: buyer.address,
        address: opts.coreAddress,
        abi: CORE_ABI,
        functionName: 'resolveProcess',
        args: [opts.processId, commitments],
    });
    const txHash = await buyerClient.writeContract(request);
    await publicClient.waitForTransactionReceipt({ hash: txHash });
}

// ── GHG seed scenarios ──────────────────────────────────────────────────────

export async function ensureTokenApprovals(coreAddress: `0x${string}`, tokenAddress: `0x${string}`, ...keys: `0x${string}`[]) {
    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    for (const key of keys) {
        const acct = privateKeyToAccount(key);
        const client = createWalletClient({ account: acct, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const { request } = await publicClient.simulateContract({
            account: acct.address,
            address: tokenAddress,
            abi: ERC20_TEST_ABI,
            functionName: 'approve',
            args: [coreAddress, MAX_UINT256],
        });
        await publicClient.waitForTransactionReceipt({ hash: await client.writeContract(request) });
    }
}

async function ensureGhgSchema(schemaRegistryAddress: `0x${string}`, signerKey: `0x${string}`): Promise<`0x${string}`> {
    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const signer = privateKeyToAccount(signerKey);
    const signerClient = createWalletClient({ account: signer, chain: LOCAL_ANVIL, transport: http(RPC_URL) });

    const schemaUriHash = keccak256(stringToHex('ipfs://figaro-ghg-iso-14064/v1'));

    // Check if already registered (idempotent)
    let alreadyRegistered = false;
    try {
        alreadyRegistered = await publicClient.readContract({
            address: schemaRegistryAddress,
            abi: SCHEMA_REGISTRY_ABI,
            functionName: 'registered',
            args: [GHG_SCHEMA_ID],
        }) as boolean;
    } catch { /* not deployed or not registered */ }

    if (!alreadyRegistered) {
        const { request } = await publicClient.simulateContract({
            account: signer.address,
            address: schemaRegistryAddress,
            abi: SCHEMA_REGISTRY_ABI,
            functionName: 'registerSchema',
            args: [GHG_SCHEMA_ID, 1n, schemaUriHash, keccak256(stringToHex('emissions'))],
        });
        await publicClient.waitForTransactionReceipt({ hash: await signerClient.writeContract(request) });
    }

    return GHG_SCHEMA_ID;
}

export async function seedGhgDisclosureScenario(): Promise<SeededGhgScenario> {
    const localConfig = readLocalDeploymentConfig();
    const coreAddress = resolve('NEXT_PUBLIC_FIGARO_CORE', localConfig.figaroCore)!;
    const tokenAddress = resolve('NEXT_PUBLIC_TOKEN_ADDRESS', localConfig.tokenAddress)!;
    const coordinatorAddress = resolve('NEXT_PUBLIC_ATTESTATION_COORDINATOR', localConfig.attestationCoordinator)!;
    const schemaRegistryAddress = resolve('NEXT_PUBLIC_SCHEMA_REGISTRY', localConfig.schemaRegistry)!;
    if (!coreAddress || !tokenAddress || !coordinatorAddress || !schemaRegistryAddress) {
        throw new Error('Missing deployment env for GHG seed (need FIGARO_CORE, TOKEN, ATTESTATION_COORDINATOR, SCHEMA_REGISTRY)');
    }

    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const buyer = privateKeyToAccount(BUYER_PRIVATE_KEY);
    const restaurant = privateKeyToAccount(RESTAURANT_PRIVATE_KEY);
    const supplier = privateKeyToAccount(SUPPLIER_PRIVATE_KEY);
    const supplierClient = createWalletClient({ account: supplier, chain: LOCAL_ANVIL, transport: http(RPC_URL) });

    const schemaId = await ensureGhgSchema(schemaRegistryAddress, BUYER_PRIVATE_KEY);
    await ensureTokenApprovals(coreAddress, tokenAddress, BUYER_PRIVATE_KEY, RESTAURANT_PRIVATE_KEY, SUPPLIER_PRIVATE_KEY);

    // Root order: buyer ↔ restaurant, GHG-disclosure clause committed.
    const { processId, orderHash: rootOrderHash } = await createRootOrder({
        buyerKey: BUYER_PRIVATE_KEY, sellerKey: RESTAURANT_PRIVATE_KEY, coreAddress, tokenAddress, payment: 1_000000000000000000n,
        agreement: ghgDisclosureAgreement(buyer.address as `0x${string}`, restaurant.address as `0x${string}`),
    });
    // Supplier sub-order: buyer ↔ supplier, same clause committed so the
    // supplier's inventory attestation can build an inclusion proof.
    const { orderHash: supplierOrderHash, commitment: supplierCommitment } = await createSubOrder({
        processId, buyerKey: BUYER_PRIVATE_KEY, sellerKey: SUPPLIER_PRIVATE_KEY, coreAddress, tokenAddress,
        payment: 400000000000000000n, parentOrderHashes: [rootOrderHash],
        agreement: ghgDisclosureAgreement(buyer.address as `0x${string}`, supplier.address as `0x${string}`),
    });

    // Inventory-stage attestation from supplier. Category-2 schema — content
    // must byte-equal the committed sectionData.
    const { sectionData, proof } = agreementReceipt(supplierCommitment, GHG_SCHEMA_KEY);
    const { request: attestReq } = await publicClient.simulateContract({
        account: supplier.address, address: coordinatorAddress, abi: ATTESTATION_COORDINATOR_ABI,
        functionName: 'attestAsSeller',
        args: [supplierCommitment, supplierCommitment, schemaId, DISCLOSURE_KIND.inventory, sectionData, proof, sectionData],
    });
    await publicClient.waitForTransactionReceipt({ hash: await supplierClient.writeContract(attestReq) });

    return { schemaId, processId, rootOrderHash, supplierOrderHash };
}

export async function seedUnreportedProcessScenario(): Promise<SeededUnreportedProcessScenario> {
    const localConfig = readLocalDeploymentConfig();
    const coreAddress = resolve('NEXT_PUBLIC_FIGARO_CORE', localConfig.figaroCore)!;
    const tokenAddress = resolve('NEXT_PUBLIC_TOKEN_ADDRESS', localConfig.tokenAddress)!;
    const schemaRegistryAddress = resolve('NEXT_PUBLIC_SCHEMA_REGISTRY', localConfig.schemaRegistry)!;
    if (!coreAddress || !tokenAddress || !schemaRegistryAddress) {
        throw new Error('Missing deployment env for unreported process seed (need FIGARO_CORE, TOKEN, SCHEMA_REGISTRY)');
    }

    await ensureGhgSchema(schemaRegistryAddress, BUYER_PRIVATE_KEY);
    await ensureTokenApprovals(coreAddress, tokenAddress, BUYER_PRIVATE_KEY, RESTAURANT_PRIVATE_KEY, SUPPLIER_PRIVATE_KEY);

    // Unreported = commit but never attest. No agreement needed since no proof
    // will be produced; DEFAULT_AGREEMENT_HASH keeps the commitment shape valid.
    const { processId, orderHash: rootOrderHash } = await createRootOrder({
        buyerKey: BUYER_PRIVATE_KEY, sellerKey: RESTAURANT_PRIVATE_KEY, coreAddress, tokenAddress, payment: 2_000000000000000000n,
    });
    const { orderHash: supplierOrderHash } = await createSubOrder({
        processId, buyerKey: BUYER_PRIVATE_KEY, sellerKey: SUPPLIER_PRIVATE_KEY, coreAddress, tokenAddress,
        payment: 500000000000000000n, parentOrderHashes: [rootOrderHash],
    });

    return { schemaId: GHG_SCHEMA_ID, processId, rootOrderHash, supplierOrderHash };
}

export async function seedSupersededGhgDisclosureScenario(): Promise<SeededSupersededGhgScenario> {
    const seeded = await seedGhgDisclosureScenario();
    const localConfig = readLocalDeploymentConfig();
    const coordinatorAddress = resolve('NEXT_PUBLIC_ATTESTATION_COORDINATOR', localConfig.attestationCoordinator)!;
    if (!coordinatorAddress) throw new Error('Missing ATTESTATION_COORDINATOR env for superseded disclosure seed');

    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const supplier = privateKeyToAccount(SUPPLIER_PRIVATE_KEY);
    const supplierClient = createWalletClient({ account: supplier, chain: LOCAL_ANVIL, transport: http(RPC_URL) });

    // Fire a second inventory attestation against the same order. The emitted
    // event stream carries both; the UI treats the later one as superseding.
    const supplierCommitment = seededCommitments.get(seeded.supplierOrderHash);
    if (!supplierCommitment) throw new Error(`Missing seeded commitment for ${seeded.supplierOrderHash}`);
    const { sectionData, proof } = agreementReceipt(supplierCommitment, GHG_SCHEMA_KEY);
    const { request } = await publicClient.simulateContract({
        account: supplier.address, address: coordinatorAddress, abi: ATTESTATION_COORDINATOR_ABI,
        functionName: 'attestAsSeller',
        args: [supplierCommitment, supplierCommitment, seeded.schemaId, DISCLOSURE_KIND.inventory, sectionData, proof, sectionData],
    });
    await publicClient.waitForTransactionReceipt({ hash: await supplierClient.writeContract(request) });

    return seeded;
}

export async function seedClosedCompleteGhgDisclosureScenario(): Promise<SeededClosedCompleteGhgScenario> {
    const seeded = await seedGhgDisclosureScenario();
    const localConfig = readLocalDeploymentConfig();
    const coordinatorAddress = resolve('NEXT_PUBLIC_ATTESTATION_COORDINATOR', localConfig.attestationCoordinator)!;
    if (!coordinatorAddress) throw new Error('Missing ATTESTATION_COORDINATOR env for complete disclosure seed');

    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const restaurant = privateKeyToAccount(RESTAURANT_PRIVATE_KEY);
    const restaurantClient = createWalletClient({ account: restaurant, chain: LOCAL_ANVIL, transport: http(RPC_URL) });

    // Add a commitment-stage attestation from the restaurant against the root
    // order so the full disclosure arc is represented (commitment + inventory).
    const rootCommitment = seededCommitments.get(seeded.rootOrderHash);
    if (!rootCommitment) throw new Error(`Missing seeded commitment for ${seeded.rootOrderHash}`);
    const { sectionData, proof } = agreementReceipt(rootCommitment, GHG_SCHEMA_KEY);
    const { request: commitReq } = await publicClient.simulateContract({
        account: restaurant.address, address: coordinatorAddress, abi: ATTESTATION_COORDINATOR_ABI,
        functionName: 'attestAsSeller',
        args: [rootCommitment, rootCommitment, seeded.schemaId, DISCLOSURE_KIND.commitment, sectionData, proof, sectionData],
    });
    await publicClient.waitForTransactionReceipt({ hash: await restaurantClient.writeContract(commitReq) });

    return seeded;
}

export async function getNodeIds(page: Page): Promise<string[]> {
    const handles = await page.locator('[data-testid^="order-node-"]').all();
    const ids: string[] = [];
    for (const handle of handles) {
        const testId = await handle.getAttribute('data-testid');
        if (testId) ids.push(testId.replace('order-node-', ''));
    }
    return ids;
}

export async function selectProcessForOrder(page: Page, orderHash: string): Promise<void> {
    const processItem = page.locator('li').filter({
        has: page.getByTestId(`process-order-item-${orderHash}`),
    });
    await processItem.waitFor({ timeout: 30000 });
    await processItem.locator('[data-testid^="process-item-"]').click();
}

export async function clickSuborderCloseIfOpen(page: Page): Promise<void> {
    const modal = page.getByTestId('suborder-modal');
    if (!await modal.count()) return;
    await page.evaluate(() => {
        const btn = document.querySelector('[data-testid="suborder-modal"] button[aria-label="Close"]') as HTMLElement | null;
        btn?.click();
    });
    await modal.waitFor({ state: 'detached', timeout: 5000 }).catch(() => { });
}

/** Orders are Active at commit time. Verify state attribute. */
export async function assertOrderActive(page: Page, orderHash: string): Promise<void> {
    await page.waitForFunction(
        (hash) => document.querySelector(`[data-testid="order-node-${hash}"]`)?.getAttribute('data-order-state') === 'active',
        orderHash, { timeout: 30000 }
    );
}

export async function resolveVisibleProcess(page: Page): Promise<void> {
    // btn-resolve-process lives on the Orders tab (semantic process workspace).
    // Switch there if needed.
    const ordersTab = page.getByRole('tab', { name: 'Create Order' });
    const isSelected = await ordersTab.getAttribute('aria-selected').catch(() => null);
    if (isSelected !== 'true') {
        await ordersTab.click().catch(() => {});
    }

    // executeTransactionCapability calls window.confirm before the resolve tx;
    // Playwright auto-dismisses unless we accept first.
    page.once('dialog', (dialog) => { dialog.accept().catch(() => {}); });

    const btn = page.getByTestId('btn-resolve-process');
    await btn.waitFor({ timeout: 10000 });
    await btn.click();

    // After tx confirms, order-node testids only render on the Graph tab.
    // Switch there to assert the resolved state.
    const graphTab = page.getByRole('tab', { name: 'Graph' });
    await graphTab.click().catch(() => {});

    await page.waitForFunction(() => {
        const nodes = Array.from(document.querySelectorAll('[data-testid^="order-node-"]'));
        return nodes.length > 0 && nodes.every(n => n.getAttribute('data-order-state') === 'resolved');
    }, null, { timeout: 60000 });
}

// ── Delivery lifecycle seed ─────────────────────────────────────────────────

const DUTCH_AUCTION_TEST_ABI = parseAbi([
    'function createAuction(bytes32 auctionId, uint256 maxPrice, bytes32 processId, address currency) external',
    'function claim(bytes32 auctionId) external',
    'function cancel(bytes32 auctionId) external',
    'function expire(bytes32 auctionId) external',
    'function auctions(bytes32) view returns (address creator, uint64 startTime, uint256 maxPrice, address driver, uint256 clearingPrice)',
    'function getCurrentPrice(bytes32 auctionId) view returns (uint256)',
    'event AuctionCreated(bytes32 indexed auctionId, address indexed creator, uint256 maxPrice, bytes32 processId, address currency)',
    'event AuctionClaimed(bytes32 indexed auctionId, address indexed driver, uint256 clearingPrice)',
]);

export async function seedDeliveryScenario(): Promise<SeededDeliveryScenario> {
    const localConfig = readLocalDeploymentConfig();
    const coreAddress = resolve('NEXT_PUBLIC_FIGARO_CORE', localConfig.figaroCore)!;
    const tokenAddress = resolve('NEXT_PUBLIC_TOKEN_ADDRESS', localConfig.tokenAddress)!;
    const auctionAddress = resolve('NEXT_PUBLIC_DUTCH_AUCTION', localConfig.dutchAuction)!;
    if (!coreAddress || !tokenAddress || !auctionAddress) throw new Error('Missing deployment addresses for delivery seed (need FIGARO_CORE, TOKEN, DUTCH_AUCTION)');

    const buyer = privateKeyToAccount(BUYER_PRIVATE_KEY);
    const restaurant = privateKeyToAccount(RESTAURANT_PRIVATE_KEY);
    const driver = privateKeyToAccount(SUPPLIER_PRIVATE_KEY);
    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const buyerClient = createWalletClient({ account: buyer, chain: LOCAL_ANVIL, transport: http(RPC_URL) });

    await ensureTokenApprovals(coreAddress, tokenAddress, BUYER_PRIVATE_KEY, RESTAURANT_PRIVATE_KEY, SUPPLIER_PRIVATE_KEY);

    // Both orders Active immediately (dual-signed). The merchant order carries a
    // figaro-merchant-process-v1 clause and the courier sub-order carries a
    // figaro-courier-process-v1 clause, so each role's seller can fire its own
    // sovereign event log attestations.
    const { processId, orderHash: foodOrderHash } = await createRootOrder({
        buyerKey: BUYER_PRIVATE_KEY, sellerKey: RESTAURANT_PRIVATE_KEY, coreAddress, tokenAddress, payment: 1_000000000000000000n,
        agreement: merchantProcessAgreement(buyer.address as `0x${string}`, restaurant.address as `0x${string}`),
    });
    const { orderHash: deliveryOrderHash } = await createSubOrder({
        processId, buyerKey: BUYER_PRIVATE_KEY, sellerKey: SUPPLIER_PRIVATE_KEY, coreAddress, tokenAddress,
        payment: 500000000000000000n, parentOrderHashes: [foodOrderHash],
        agreement: courierProcessAgreement(buyer.address as `0x${string}`, driver.address as `0x${string}`),
    });

    // Create auction for the delivery job (pure coordination — no token handling)
    const { request: auctionReq } = await publicClient.simulateContract({
        account: buyer.address,
        address: auctionAddress,
        abi: DUTCH_AUCTION_TEST_ABI,
        functionName: 'createAuction',
        args: [deliveryOrderHash, 500000000000000000n, processId, tokenAddress],
    });
    await publicClient.waitForTransactionReceipt({ hash: await buyerClient.writeContract(auctionReq) });

    return {
        processId, foodOrderHash, deliveryOrderHash,
        buyer: buyer.address as `0x${string}`,
        restaurant: restaurant.address as `0x${string}`,
        driver: driver.address as `0x${string}`,
    };
}

export async function driverClaimJob(deliveryOrderHash: `0x${string}`): Promise<void> {
    const localConfig = readLocalDeploymentConfig();
    const auctionAddress = resolve('NEXT_PUBLIC_DUTCH_AUCTION', localConfig.dutchAuction)!;
    if (!auctionAddress) throw new Error('Missing NEXT_PUBLIC_DUTCH_AUCTION');

    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const driver = privateKeyToAccount(SUPPLIER_PRIVATE_KEY);
    const driverClient = createWalletClient({ account: driver, chain: LOCAL_ANVIL, transport: http(RPC_URL) });

    const { request } = await publicClient.simulateContract({
        account: driver.address, address: auctionAddress, abi: DUTCH_AUCTION_TEST_ABI,
        functionName: 'claim', args: [deliveryOrderHash],
    });
    await publicClient.waitForTransactionReceipt({ hash: await driverClient.writeContract(request) });
}

/** Courier-side lifecycle signals — fires `figaro-courier-process-v1`
 *  attestations on the delivery sub-order. Each signal maps to the
 *  validator's uint8 event index. */
const COURIER_SIGNAL_TO_EVENT: Record<string, { stage: number; eventType: 'en-route-pickup' | 'arrived-pickup' | 'completed' }> = {
    declareEnRoute: { stage: COURIER_EVENT.enRoutePickup, eventType: 'en-route-pickup' },
    declarePickedUp: { stage: COURIER_EVENT.arrivedPickup, eventType: 'arrived-pickup' },
    declareDelivered: { stage: COURIER_EVENT.completed, eventType: 'completed' },
};

export async function sendLifecycleSignal(
    signal: 'declareEnRoute' | 'declarePickedUp' | 'declareDelivered',
    deliveryOrderHash: `0x${string}`,
): Promise<void> {
    const localConfig = readLocalDeploymentConfig();
    const coordinatorAddress = resolve('NEXT_PUBLIC_ATTESTATION_COORDINATOR', localConfig.attestationCoordinator)!;
    if (!coordinatorAddress) throw new Error('Missing NEXT_PUBLIC_ATTESTATION_COORDINATOR');

    const mapping = COURIER_SIGNAL_TO_EVENT[signal];
    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const driver = privateKeyToAccount(SUPPLIER_PRIVATE_KEY);
    const driverClient = createWalletClient({ account: driver, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const deliveryCommitment = seededCommitments.get(deliveryOrderHash);
    if (!deliveryCommitment) throw new Error(`Missing seeded commitment for ${deliveryOrderHash}`);

    const { sectionData, proof } = agreementReceipt(deliveryCommitment, COURIER_PROCESS_SCHEMA_KEY);
    // Category-1 courier-process content: (uint8 eventType, string evidenceUri).
    // No byte-equality cross-check with sectionData.
    const content = encodeContentFromSpec(
        embeddedSpec('figaro-courier-process-v1')!,
        { eventType: mapping.eventType, evidenceUri: '' },
    );
    const { request } = await publicClient.simulateContract({
        account: driver.address, address: coordinatorAddress, abi: ATTESTATION_COORDINATOR_ABI,
        functionName: 'attestAsSeller',
        args: [deliveryCommitment, deliveryCommitment, COURIER_PROCESS_SCHEMA_ID, mapping.stage, sectionData, proof, content],
    });
    await publicClient.waitForTransactionReceipt({ hash: await driverClient.writeContract(request) });
}

export async function restaurantPrepSignals(foodOrderHash: `0x${string}`, _deliveryOrderHash: `0x${string}`): Promise<void> {
    const localConfig = readLocalDeploymentConfig();
    const coordinatorAddress = resolve('NEXT_PUBLIC_ATTESTATION_COORDINATOR', localConfig.attestationCoordinator)!;
    if (!coordinatorAddress) throw new Error('Missing NEXT_PUBLIC_ATTESTATION_COORDINATOR');

    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const restaurant = privateKeyToAccount(RESTAURANT_PRIVATE_KEY);
    const restaurantClient = createWalletClient({ account: restaurant, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const foodCommitment = seededCommitments.get(foodOrderHash);
    if (!foodCommitment) throw new Error(`Missing seeded commitment for ${foodOrderHash}`);

    const { sectionData, proof } = agreementReceipt(foodCommitment, MERCHANT_PROCESS_SCHEMA_KEY);

    // Preparing: restaurant attests prep-started on the food order
    const prepContent = encodeContentFromSpec(
        embeddedSpec('figaro-merchant-process-v1')!,
        { eventType: 'prep-started', evidenceUri: '' },
    );
    const { request: prepReq } = await publicClient.simulateContract({
        account: restaurant.address, address: coordinatorAddress, abi: ATTESTATION_COORDINATOR_ABI,
        functionName: 'attestAsSeller',
        args: [foodCommitment, foodCommitment, MERCHANT_PROCESS_SCHEMA_ID, MERCHANT_EVENT.prepStarted, sectionData, proof, prepContent],
    });
    await publicClient.waitForTransactionReceipt({ hash: await restaurantClient.writeContract(prepReq) });

    // PickupReady: restaurant attests ready-for-pickup on the food order
    const readyContent = encodeContentFromSpec(
        embeddedSpec('figaro-merchant-process-v1')!,
        { eventType: 'ready-for-pickup', evidenceUri: '' },
    );
    const { request: readyReq } = await publicClient.simulateContract({
        account: restaurant.address, address: coordinatorAddress, abi: ATTESTATION_COORDINATOR_ABI,
        functionName: 'attestAsSeller',
        args: [foodCommitment, foodCommitment, MERCHANT_PROCESS_SCHEMA_ID, MERCHANT_EVENT.readyForPickup, sectionData, proof, readyContent],
    });
    await publicClient.waitForTransactionReceipt({ hash: await restaurantClient.writeContract(readyReq) });
}

// ── Anvil EVM snapshot / revert ──────────────────────────────────────────────

const snapshotClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

export async function evmSnapshot(): Promise<string> {
    return snapshotClient.request({ method: 'evm_snapshot' as any }) as Promise<string>;
}

export async function evmRevert(snapshotId: string): Promise<void> {
    await snapshotClient.request({ method: 'evm_revert' as any, params: [snapshotId] } as any);
}

/**
 * AttestationCoordinator ABI extended with the proximity-proof
 * validator's custom errors. Without these, viem decodes a revert
 * from FigaroProximityProofV1Validator.sol as a raw 4-byte selector
 * (e.g. `0x150b14ee` for `ZeroNonce()`) instead of a typed name, and
 * test assertions matching on the error name fail.
 */
const PROXIMITY_VALIDATOR_ERROR_FRAGMENTS = parseAbi([
    'error InvalidBand(uint8 band)',
    'error ZeroNonce()',
    'error DeviceSigTooShort(uint256 length)',
    'error DeviceSigTooLong(uint256 length)',
    'error SchemaIdMismatch(bytes32 expected, bytes32 actual)',
]);

const COORDINATOR_ABI_WITH_PROXIMITY_ERRORS = [
    ...ATTESTATION_COORDINATOR_ABI,
    ...PROXIMITY_VALIDATOR_ERROR_FRAGMENTS,
] as const;

/**
 * Submit a `figaro-proximity-proof-v1` attestation as the seller of
 * the given order. The order's committed agreement must carry a
 * `figaro-proximity-proof-v1` section — use `proximityHandoffAgreement`
 * when constructing the sub-order.
 *
 * On-chain validator (FigaroProximityProofV1Validator.sol) checks
 * structural validity only: `band ∈ {1, 2, 3}`, nonce non-zero,
 * deviceSig length ∈ [65, 512]. No ecrecover.
 *
 * Returns the AttestationCoordinator tx hash.
 */
export async function attestProximityProofAsSeller(opts: {
    orderHash: `0x${string}`;
    sellerKey: `0x${string}`;
    band: ProximityBand;
    nonce: `0x${string}`;
    deviceSig: `0x${string}`;
}): Promise<`0x${string}`> {
    const localConfig = readLocalDeploymentConfig();
    const coordinatorAddress = resolve('NEXT_PUBLIC_ATTESTATION_COORDINATOR', localConfig.attestationCoordinator);
    if (!coordinatorAddress) throw new Error('Missing NEXT_PUBLIC_ATTESTATION_COORDINATOR');

    const commitment = seededCommitments.get(opts.orderHash);
    if (!commitment) throw new Error(`Missing seeded commitment for ${opts.orderHash}`);

    const { sectionData, proof } = agreementReceipt(commitment, PROXIMITY_PROOF_SCHEMA_KEY);
    const content = encodeContentFromSpec(
        embeddedSpec('figaro-proximity-proof-v1')!,
        { band: opts.band, nonce: opts.nonce, deviceSig: opts.deviceSig },
    );

    const seller = privateKeyToAccount(opts.sellerKey);
    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const sellerClient = createWalletClient({ account: seller, chain: LOCAL_ANVIL, transport: http(RPC_URL) });

    const { request } = await publicClient.simulateContract({
        account: seller.address,
        address: coordinatorAddress,
        abi: COORDINATOR_ABI_WITH_PROXIMITY_ERRORS,
        functionName: 'attestAsSeller',
        // role == target (same-order attestation), stage = band index.
        args: [
            commitment,
            commitment,
            PROXIMITY_PROOF_SCHEMA_ID,
            PROXIMITY_BAND_INDEX[opts.band],
            sectionData,
            proof,
            content,
        ],
    });
    // Wait for the receipt before returning — callers query the
    // Attestation event right after, and an unmined tx makes that
    // getContractEvents race come back empty. Matches every sibling
    // write helper in this file.
    const hash = await sellerClient.writeContract(request);
    await publicClient.waitForTransactionReceipt({ hash });
    return hash;
}

/** Build the proximity-handoff agreement so callers can seed sub-orders
 *  carrying both the policy and the proof sections. Re-export so the
 *  test spec can compose its own scenario without forking the helper. */
export { proximityHandoffAgreement };

/**
 * Submit a buyer-side GHG attestation on an order seeded by one of the
 * seedGhg*Scenario helpers. Pairs with the existing seller-side
 * inventory attestation that those seeds fire, exercising the
 * AttestationCoordinator.attestAsBuyer write path (only Vitest-tested
 * pre-2026-05-19).
 *
 * The order's committed agreement must contain a `figaro-ghg-iso-14064-v1`
 * section — true for every order seeded via `ghgDisclosureAgreement(...)`.
 */
export async function attestGhgAsBuyer(
    orderHash: `0x${string}`,
    stage: 0 | 1 | 2 | 3 = DISCLOSURE_KIND.verification,
): Promise<`0x${string}`> {
    const localConfig = readLocalDeploymentConfig();
    const coordinatorAddress = resolve('NEXT_PUBLIC_ATTESTATION_COORDINATOR', localConfig.attestationCoordinator);
    if (!coordinatorAddress) throw new Error('Missing NEXT_PUBLIC_ATTESTATION_COORDINATOR');

    const commitment = seededCommitments.get(orderHash);
    if (!commitment) throw new Error(`Missing seeded commitment for ${orderHash} — call seedGhg*Scenario first`);

    const { sectionData, proof } = agreementReceipt(commitment, GHG_SCHEMA_KEY);

    const buyer = privateKeyToAccount(BUYER_PRIVATE_KEY);
    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const buyerClient = createWalletClient({ account: buyer, chain: LOCAL_ANVIL, transport: http(RPC_URL) });

    const { request } = await publicClient.simulateContract({
        account: buyer.address,
        address: coordinatorAddress,
        abi: ATTESTATION_COORDINATOR_ABI,
        functionName: 'attestAsBuyer',
        args: [commitment, GHG_SCHEMA_ID, stage, sectionData, proof, sectionData],
    });
    // Wait for the receipt before returning — callers query the
    // Attestation event right after, and an unmined tx makes that
    // getContractEvents race come back empty. Matches every sibling
    // write helper in this file.
    const hash = await buyerClient.writeContract(request);
    await publicClient.waitForTransactionReceipt({ hash });
    return hash;
}

/** OperatorRegistry ABI fragment for seedRegisteredOperator. Local copy keeps
 *  the seed helper independent of the frontend's full ABI export. */
const OPERATOR_REGISTRY_REGISTER_ABI = parseAbi([
    'function register(string metadataURI) external payable',
    'event OperatorRegistered(address indexed operator, string metadataURI)',
]);

const OPERATOR_REGISTRATION_DEPOSIT = parseEther('0.001');

/** Minimal profile shape for `seedRegisteredOperator`. Mirrors the required
 *  + most-common fields of `OperatorProfileMetadata` so callers can author
 *  a registration JSON without pulling the full frontend metadata type. */
export interface SeedOperatorProfile {
    name: string;
    description?: string;
    specialty?: string;
    catalogueURI?: string;
    acceptedTokens?: Array<{ address: `0x${string}`; symbol: string; chainId: number }>;
    defaultTokenAddress?: `0x${string}`;
}

/** Result of `seedRegisteredOperator`. Includes the on-chain address (derived
 *  from the wallet key) and the IPFS URI of the pinned profile JSON. */
export interface SeededOperator {
    address: `0x${string}`;
    profileURI: string;
    profileCid: string;
}

/**
 * Pin a fresh operator profile JSON to local Kubo and register the wallet
 * on `OperatorRegistry`. Pairs with `merchant-page.devnet.spec.ts`'s
 * inline seeder (which inlines this for the catalogue+merchant case); the
 * helper here is the generic "any registered operator" seed, used by
 * Phase 4 C4 to set up the `/operators/edit/*` UI tests (those routes
 * require a real IPFS-pinned profile so `OperatorEditProfile` can mount
 * the form).
 *
 * Requires Kubo running at NEXT_PUBLIC_IPFS_API_URL (default
 * http://127.0.0.1:5001) and `./deploy-local.sh` having populated
 * NEXT_PUBLIC_OPERATOR_REGISTRY.
 */
export async function seedRegisteredOperator(opts: {
    walletKey: `0x${string}`;
    profile: SeedOperatorProfile;
}): Promise<SeededOperator> {
    const localConfig = readLocalDeploymentConfig();
    const operatorRegistry = (process.env.NEXT_PUBLIC_OPERATOR_REGISTRY
        ?? localConfig.operatorRegistry) as `0x${string}` | undefined;
    if (!operatorRegistry) {
        throw new Error('NEXT_PUBLIC_OPERATOR_REGISTRY not set — run ./deploy-local.sh');
    }

    const operator = privateKeyToAccount(opts.walletKey);

    // Pin the profile JSON. Frontend's OperatorEditProfile.tsx fetches this
    // URI via gateway and parses with `tryParseOperatorProfileDocument`, so
    // the shape must satisfy that parser. Required field: `name`.
    const profileDoc = {
        subjectAddress: operator.address,
        ...opts.profile,
    };
    const { cid, uri: profileURI } = await pinJSONToIPFS(profileDoc);

    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const operatorClient = createWalletClient({ account: operator, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const { request } = await publicClient.simulateContract({
        account: operator.address,
        address: operatorRegistry,
        abi: OPERATOR_REGISTRY_REGISTER_ABI,
        functionName: 'register',
        args: [profileURI],
        value: OPERATOR_REGISTRATION_DEPOSIT,
    });
    await publicClient.waitForTransactionReceipt({ hash: await operatorClient.writeContract(request) });

    return {
        address: operator.address as `0x${string}`,
        profileURI,
        profileCid: cid,
    };
}

/** Per-stage allocation file shape consumed by `ClaimPanel` (mirrors the
 *  `AllocationEntry` type in `components/core/ClaimPanel.tsx:18-21`).
 *  Amounts are decimal-string wei; proofs are bytes32 hex arrays. */
export interface FigClaimAllocations {
    [lowercaseAddress: string]: { amount: string; proof: `0x${string}`[] };
}

/** Paths to the three per-stage allocation files. Mirrors `STAGE_FILES`
 *  in `ClaimPanel.tsx:24-28`. Public-asset paths — Next.js serves them
 *  verbatim from `frontend/public/`. */
const FIG_CLAIMS_FIXTURE_PATHS: readonly [string, string, string] = [
    'fig-claims-y2.json',
    'fig-claims-y5.json',
    'fig-claims-y9.json',
];

function getFigClaimsFixturePath(stageIndex: 0 | 1 | 2): string {
    return path.resolve(__dirname, '../../public', FIG_CLAIMS_FIXTURE_PATHS[stageIndex]);
}

/**
 * Write a per-stage allocation file under `frontend/public/` so the
 * /fig/claim UI's `fetchAllocation()` returns a real entry for the
 * connected wallet. The static file is a mainnet-generation artifact
 * by design; this helper lets devnet tests inject a transient fixture
 * for the duration of a single test (paired with
 * `clearFigClaimsFixture` in afterEach).
 *
 * Single-leaf merkle tree note: when the deploy script seeds the
 * airdrop with `leaf == root`, the inclusion proof for that single
 * claimant is the empty array. Pass `{[addr.toLowerCase()]: {amount,
 * proof: []}}` to match the on-chain root.
 *
 * Returns the absolute path of the written file so callers can verify
 * existence if needed.
 */
export async function writeFigClaimsFixture(
    stageIndex: 0 | 1 | 2,
    allocations: FigClaimAllocations,
): Promise<string> {
    const filePath = getFigClaimsFixturePath(stageIndex);
    await fs.promises.writeFile(filePath, JSON.stringify(allocations, null, 2), 'utf8');
    return filePath;
}

/**
 * Remove a fig-claims fixture file. Idempotent — succeeds whether or
 * not the file exists, so afterEach can call it unconditionally even
 * if the test failed before writing the fixture.
 */
export async function clearFigClaimsFixture(stageIndex: 0 | 1 | 2): Promise<void> {
    const filePath = getFigClaimsFixturePath(stageIndex);
    try {
        await fs.promises.unlink(filePath);
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
}

/**
 * Pin a JSON document to the local Kubo daemon and return the CID + ipfs URI.
 *
 * Mirrors what `ipfsService.publishJSON` does in the browser, but talks to
 * Kubo from Node directly. Used by devnet tests that need to seed an
 * operator profile or catalogue document in IPFS without walking the
 * full onboarding wizard.
 */
export async function pinJSONToIPFS(data: unknown): Promise<{ cid: string; uri: string }> {
    const apiUrl = process.env.NEXT_PUBLIC_IPFS_API_URL ?? 'http://127.0.0.1:5001';
    const form = new FormData();
    form.append('file', new Blob([JSON.stringify(data)], { type: 'application/json' }));
    const res = await fetch(`${apiUrl}/api/v0/add?pin=true`, { method: 'POST', body: form });
    if (!res.ok) {
        throw new Error(`IPFS pin failed: ${res.status} ${res.statusText}`);
    }
    const result = await res.json() as { Hash?: string };
    if (typeof result.Hash !== 'string' || !result.Hash) {
        throw new Error('IPFS pin returned no CID');
    }
    return { cid: result.Hash, uri: `ipfs://${result.Hash}` };
}

/**
 * Capture-or-guard a designer-published assembly manifest as a seed fixture.
 *
 * With `FIGARO_CAPTURE_FIXTURES` set, writes the manifest — `slug` and
 * `name` normalised to the canonical reference values — to
 * `scripts/fixtures/<slug>.manifest.json`, the data `seed-devnet.mjs`
 * replays. Without it, loads that committed fixture and returns its
 * `agreements` map so the spec can drift-guard the live designer output
 * (`expect(manifest.agreements).toEqual(...)`).
 *
 * `agreements` is the deterministic part of the manifest — per-run
 * `processId` / `deadline` live only on `orders` — so it is a stable
 * drift signal: if the designer's clause generation changes, the
 * committed fixture stops matching and must be re-captured.
 */
export function captureOrGuardAssemblyManifest(
    manifest: Record<string, unknown> & { agreements: Record<string, unknown> },
    opts: { slug: string; name: string },
): Record<string, unknown> {
    const fixturePath = path.resolve(
        __dirname,
        `../../scripts/fixtures/${opts.slug}.manifest.json`,
    );
    if (process.env.FIGARO_CAPTURE_FIXTURES) {
        const normalized = { ...manifest, slug: opts.slug, name: opts.name };
        fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
        fs.writeFileSync(fixturePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
        return manifest.agreements;
    }
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as {
        agreements: Record<string, unknown>;
    };
    return fixture.agreements;
}

/** OperatorRegistry registration event — carries the profile metadataURI. */
const OPERATOR_REGISTERED_EVENT_ABI = parseAbi([
    'event OperatorRegistered(address indexed operator, string metadataURI)',
]);

/** Resolve an `ipfs://` URI to a Kubo-gateway URL. */
function resolveIpfsURI(uri: string): string {
    const gateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY_URL ?? 'http://127.0.0.1:8080';
    return uri.startsWith('ipfs://')
        ? `${gateway}/ipfs/${uri.slice('ipfs://'.length)}`
        : uri;
}

/**
 * Capture-or-guard a wizard-published operator catalogue as a seed fixture.
 *
 * Reads `operatorAddress`'s on-chain profile (OperatorRegistered event ->
 * metadataURI), follows the profile's `catalogueURI` to the pinned
 * OperatorCatalogueMetadata. With `FIGARO_CAPTURE_FIXTURES` set, writes it to
 * `scripts/fixtures/operator-catalogue.json` — the data `seed-devnet.mjs`
 * replays. Without it, drift-guards the live catalogue's `menu` against the
 * committed fixture and throws on mismatch.
 *
 * Same capture-or-guard pattern as `captureOrGuardAssemblyManifest`: the
 * canonical authoring UI (here the operator-registration wizard) produces
 * the artifact; the seed replays it; the spec guards the two stay in sync.
 */
export async function captureOrGuardOperatorCatalogue(operatorAddress: string): Promise<void> {
    const config = readLocalDeploymentConfig();
    const operatorRegistry = (process.env.NEXT_PUBLIC_OPERATOR_REGISTRY
        ?? config.operatorRegistry) as `0x${string}` | undefined;
    if (!operatorRegistry) {
        throw new Error('NEXT_PUBLIC_OPERATOR_REGISTRY not set — run ./deploy-local.sh');
    }

    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const events = await publicClient.getContractEvents({
        address: operatorRegistry,
        abi: OPERATOR_REGISTERED_EVENT_ABI,
        eventName: 'OperatorRegistered',
        args: { operator: operatorAddress as `0x${string}` },
        fromBlock: 0n,
    });
    if (events.length === 0) {
        throw new Error(`No OperatorRegistered event for ${operatorAddress}`);
    }
    const profileURI = events[events.length - 1].args.metadataURI as string;
    const profile = await (await fetch(resolveIpfsURI(profileURI))).json() as {
        catalogueURI?: string;
    };
    if (!profile.catalogueURI) {
        throw new Error(`Operator ${operatorAddress} profile carries no catalogueURI`);
    }
    const catalogue = await (await fetch(resolveIpfsURI(profile.catalogueURI))).json() as {
        menu: unknown[];
    };

    const fixturePath = path.resolve(__dirname, '../../scripts/fixtures/operator-catalogue.json');
    if (process.env.FIGARO_CAPTURE_FIXTURES) {
        fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
        fs.writeFileSync(fixturePath, `${JSON.stringify(catalogue, null, 2)}\n`, 'utf8');
        return;
    }
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as { menu: unknown[] };
    // Each menu item's `id` is generated fresh per wizard run, so comparing
    // it would drift the guard every run. Strip it — the guarded surface is
    // the structural shape (name, price, category, available, item count).
    const withoutIds = (menu: unknown[]) =>
        menu.map((item) => {
            const rest = { ...(item as Record<string, unknown>) };
            delete rest.id;
            return rest;
        });
    if (JSON.stringify(withoutIds(catalogue.menu)) !== JSON.stringify(withoutIds(fixture.menu))) {
        throw new Error(
            'scripts/fixtures/operator-catalogue.json drift — the wizard-published ' +
            'catalogue no longer matches the committed fixture; re-capture with ' +
            'FIGARO_CAPTURE_FIXTURES=1.',
        );
    }
}

/**
 * Advance Anvil's block timestamp by `seconds` and mine an empty block
 * so reads pick up the new `block.timestamp`. Used by tests that exercise
 * time-locked paths (OperatorRegistry.withdraw's 365-day lock,
 * RpgfMinter unlock cliffs, etc.).
 *
 * Pair with `evmSnapshot()` / `evmRevert()` so the time jump doesn't leak
 * into adjacent tests.
 */
export async function evmIncreaseTime(seconds: number): Promise<void> {
    await snapshotClient.request({ method: 'evm_increaseTime' as any, params: [seconds] } as any);
    await snapshotClient.request({ method: 'evm_mine' as any } as any);
}

/**
 * Drive the buyer's local-commerce checkout through the UI — browse the
 * seeded merchant, add the catalogue item, pick a delivery fulfilment
 * mode, place the order, confirm both agreement-preview modals (the food
 * order, then the courier order) — and return the committed processId.
 *
 * Extracted from the local-commerce devnet specs where the buyer commit is
 * pure SETUP for what the spec actually exercises (the dispute path, the
 * full multi-role scenario). `local-commerce-purchase` keeps its own inline
 * copy on purpose: there the placement UI — the assembly-array surface, the
 * negotiated-price and courier-clause assertions — IS the spec's subject.
 *
 * The two-iteration modal loop is correct, not a flake: each commit (food,
 * then courier) gates on its own AgreementPreviewModal, and the hidden-wait
 * sequences modal-1 → modal-2 — without it iteration 2 races the stale
 * first modal, whose confirm is already resolved (the click is a no-op).
 */
export async function placeLocalCommerceOrderUI(
    page: Page,
    opts: {
        merchant: string;
        itemId: string;
        fulfilmentMode?: string;
        geohash?: string;
        deliveryAddress?: string;
        /** Courier selection for a delivery mode, driven through
         *  CourierCataloguePicker after the fulfilment mode is set. */
        courier?: {
            /** seller-assigned: the courier to pick from the merchant's
             *  partner dropdown, by name. */
            partnerName?: string;
            /** buyer-assigned: the courier's address to enter. */
            address?: string;
            /** The delivery item to select — `courier-item-<deliveryItemId>`. */
            deliveryItemId: string;
            /** If the delivery item is buyer-set, the token amount to enter. */
            buyerSetPrice?: string;
        };
    },
): Promise<Hex> {
    const fulfilmentMode = opts.fulfilmentMode ?? 'deliver:seller-assigned';
    const geohash = opts.geohash ?? 'dr5regw3pg';
    const deliveryAddress = opts.deliveryAddress ?? '12 Market St, Apt 4B — ring bell';

    await page.goto(`/s/${opts.merchant}?e2e=devnet`, { waitUntil: 'domcontentloaded' });
    const detailView = page.getByTestId('seller-detail-view');
    try {
        await detailView.waitFor({ state: 'visible', timeout: 30000 });
    } catch {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await detailView.waitFor({ state: 'visible', timeout: 30000 });
    }
    const menuItem = page.getByTestId(`menu-item-${opts.itemId}`);
    try {
        await menuItem.waitFor({ state: 'visible', timeout: 15000 });
    } catch {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await detailView.waitFor({ state: 'visible', timeout: 30000 });
        await menuItem.waitFor({ state: 'visible', timeout: 30000 });
    }
    await page.getByTestId(`btn-add-${opts.itemId}`).click();
    await expect(page.getByTestId(`cart-line-${opts.itemId}`)).toBeVisible({ timeout: 10000 });

    await expect(page.getByTestId(`option-fulfilment-${fulfilmentMode}`)).toHaveCount(1, { timeout: 20000 });
    await page.getByTestId('select-fulfilment-mode').selectOption(fulfilmentMode);
    await page.getByTestId('input-delivery-geohash').fill(geohash);
    await page.getByTestId('input-delivery-address').fill(deliveryAddress);
    if (opts.courier) {
        // Drive CourierCataloguePicker — seller-assigned picks the courier
        // from the merchant's partner dropdown, buyer-assigned enters an
        // address; both then choose a delivery item from the courier's
        // catalogue (and name the price for a buyer-set item).
        if (fulfilmentMode === 'deliver:seller-assigned') {
            await page.getByTestId('select-courier-partner')
                .selectOption({ label: opts.courier.partnerName! });
        } else {
            await page.getByTestId('input-courier-address').fill(opts.courier.address!);
        }
        const deliveryItem = page.getByTestId(`courier-item-${opts.courier.deliveryItemId}`);
        await deliveryItem.waitFor({ state: 'visible', timeout: 30000 });
        await deliveryItem.click();
        if (opts.courier.buyerSetPrice) {
            await page.getByTestId('input-courier-buyer-price').fill(opts.courier.buyerSetPrice);
        }
    }
    await page.getByTestId('btn-place-order').click();

    for (let i = 0; i < 2; i++) {
        const modal = page.getByTestId('agreement-preview-modal');
        await modal.waitFor({ state: 'visible', timeout: 45000 });
        await page.getByTestId('preview-confirm').click();
        await modal.waitFor({ state: 'hidden', timeout: 45000 });
    }

    await page.waitForURL(/\/orders\/0x[0-9a-fA-F]+/, { timeout: 90000 });
    await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
    return page.url().match(/\/orders\/(0x[0-9a-fA-F]+)/)![1] as Hex;
}

/**
 * Drive the merchant coordination walk + the courier's two handoff
 * proximity proofs for a committed local-commerce process — the shared
 * runtime steps between the buyer's commit and the buyer's resolve. The
 * coordination is identical across every courier-coordination mode
 * (seller-assigned, buyer-assigned, dutch-auction); only how the courier
 * order is created differs.
 *
 *   - Merchant walks figaro-merchant-process-v1: order-received → accepted
 *     → prep-started → ready-for-pickup → handed-off.
 *   - Courier submits both handoff proximity proofs — arrived-pickup
 *     (stage 3) then arrived-dropoff (stage 5); each must land on-chain
 *     before the next click, so the button targets the right edge.
 *
 * Asserts both handoff stages attested. The caller resolves.
 */
export async function runDeliveryCoordination(
    page: Page,
    opts: {
        processId: Hex;
        merchant: string;
        courier: string;
        emissions?: {
            merchant?: { orderHash: Hex; grams: string };
            courier?: { orderHash: Hex; grams: string };
        };
    },
): Promise<void> {
    const config = readLocalDeploymentConfig();
    const coordinator = (process.env.NEXT_PUBLIC_ATTESTATION_COORDINATOR
        ?? config.attestationCoordinator) as Hex;
    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

    const courierStages = async (): Promise<number[]> => {
        const all = await publicClient.getContractEvents({
            address: coordinator, abi: ATTESTATION_EVENT_ABI, eventName: 'Attestation',
            args: { processId: opts.processId }, fromBlock: 0n,
        });
        return (all as Array<{ args: { schemaId?: Hex; stage?: number } }>)
            .filter((e) => e.args.schemaId === COURIER_PROCESS_SCHEMA_ID)
            .map((e) => Number(e.args.stage));
    };

    // Inline emissions submit — file a figaro-ghg-measurement-v1 grams
    // measurement for the currently-active seller wallet on the order page.
    // Folded into the seller's continuous session (rather than a separate
    // gotoAsWallet) so every agreement-dependent piece of state is hot.
    const submitEmissionsAsCurrentSeller = async (
        seller: Hex,
        orderHash: Hex,
        grams: string,
    ): Promise<void> => {
        await page.getByTestId('ghg-workflow-panel').waitFor({ state: 'visible', timeout: 30_000 });
        const orderToggle = page.locator('button', { hasText: orderHash.slice(0, 14) }).first();
        await orderToggle.waitFor({ state: 'visible', timeout: 30_000 });
        await orderToggle.click();
        await page.getByTestId('ghg-actual-input').fill(grams);
        const submit = page.getByTestId('ghg-submit-actual');
        await expect(submit).toBeEnabled({ timeout: 10_000 });
        await submit.click();
        const deadline = Date.now() + 90_000;
        for (;;) {
            const events = await publicClient.getContractEvents({
                address: coordinator,
                abi: ATTESTATION_EVENT_ABI,
                eventName: 'Attestation',
                args: { orderHash, attester: seller },
                fromBlock: 0n,
            });
            if (events.some((e) => (e.args as { schemaId?: Hex }).schemaId === GHG_MEASUREMENT_SCHEMA_ID)) break;
            if (Date.now() > deadline) throw new Error(`emissions measurement for ${orderHash} timed out`);
            await new Promise((r) => setTimeout(r, 1000));
        }
    };

    // ── Merchant walks the figaro-merchant-process-v1 coordination ──
    await gotoAsWallet(page, opts.merchant, `/orders/${opts.processId}?e2e=devnet`);
    await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
    for (const step of MERCHANT_PRE_HANDOFF_STEPS) {
        const btn = page.getByTestId(`btn-merchant-next-${step}`);
        await btn.waitFor({ state: 'visible', timeout: 60000 });
        await btn.click();
    }
    // Final handoff: the merchant's `handed-off` event is paired with a
    // cross-witness proximity-proof against the courier's order. Wait for
    // both attestations to land before moving on.
    const merchantHandoffBtn = page.getByTestId('btn-merchant-proximity-proof');
    await expect(merchantHandoffBtn).toBeEnabled({ timeout: 60000 });
    await merchantHandoffBtn.click();
    const merchantHandoffDeadline = Date.now() + 90_000;
    for (;;) {
        const events = await publicClient.getContractEvents({
            address: coordinator, abi: ATTESTATION_EVENT_ABI, eventName: 'Attestation',
            args: { processId: opts.processId, attester: opts.merchant as Hex }, fromBlock: 0n,
        });
        const handedOff = events.some((e) => {
            const args = (e as { args: { schemaId?: Hex; stage?: number } }).args;
            return args.schemaId === MERCHANT_PROCESS_SCHEMA_ID && Number(args.stage) === MERCHANT_HANDED_OFF_STAGE;
        });
        const proofWitness = events.some(
            (e) => (e as { args: { schemaId?: Hex } }).args.schemaId === PROXIMITY_PROOF_SCHEMA_ID,
        );
        if (handedOff && proofWitness) break;
        if (Date.now() > merchantHandoffDeadline) {
            throw new Error('merchant handoff (handed-off + proximity-proof cross-witness) timed out');
        }
        await new Promise((r) => setTimeout(r, 1000));
    }
    await expect(page.locator('[data-testid^="btn-merchant-next-"]')).toHaveCount(0, { timeout: 60000 });
    if (opts.emissions?.merchant) {
        await submitEmissionsAsCurrentSeller(
            opts.merchant as Hex,
            opts.emissions.merchant.orderHash,
            opts.emissions.merchant.grams,
        );
    }

    // ── Courier submits both handoff proximity proofs ──
    await gotoAsWallet(page, opts.courier, `/orders/${opts.processId}?e2e=devnet`);
    await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
    await expect(page.getByTestId('courier-handoff-address')).toBeVisible({ timeout: 30000 });
    const proofBtn = page.getByTestId('btn-courier-proximity-proof');
    for (let handoff = 0; handoff < 2; handoff++) {
        await expect(proofBtn).toBeEnabled({ timeout: 45000 });
        await proofBtn.click();
        const want = handoff === 0 ? [3] : [3, 5];
        const deadline = Date.now() + 90_000;
        for (;;) {
            const stages = await courierStages();
            if (want.every((s) => stages.includes(s))) break;
            if (Date.now() > deadline) throw new Error(`courier handoff ${handoff + 1} timed out — stages ${stages}`);
            await new Promise((r) => setTimeout(r, 1000));
        }
    }
    const finalStages = await courierStages();
    expect(finalStages).toContain(3); // arrived-pickup (merchant→courier)
    expect(finalStages).toContain(5); // arrived-dropoff (courier→buyer)
    if (opts.emissions?.courier) {
        await submitEmissionsAsCurrentSeller(
            opts.courier as Hex,
            opts.emissions.courier.orderHash,
            opts.emissions.courier.grams,
        );
    }
}
