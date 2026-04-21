import fs from 'fs';
import path from 'path';
import { Page } from '@playwright/test';
export {
    approveIfNeeded,
    waitAndApproveIfNeeded,
    waitForApprovalState,
    waitForApproved,
    waitForCreateConfirm,
    waitForWalletReady,
} from './test-helpers';
import {
    createPublicClient,
    createWalletClient,
    defineChain,
    http,
    keccak256,
    parseAbi,
    stringToHex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { COMMITMENT_TYPES } from '@figaro/core';
import { DEFAULT_AGREEMENT_HASH } from '@/lib/core/contracts';
import { ZERO_BYTES32, ZERO_PROCESS_ID } from '@/lib/shared/evm';

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

const BUYER_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const RESTAURANT_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;
const SUPPLIER_PRIVATE_KEY = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a' as const;

const ERC20_TEST_ABI = parseAbi([
    'function approve(address spender, uint256 amount) external returns (bool)',
]);

const COMMITMENT_TUPLE = '(bytes32 processId, address buyer, address seller, address currency, uint256 payment, uint256 expectedCumulativeValue, bytes32 agreementHash, uint256 salt, uint256 deadline)';

// ── V5 Core ABI ─────────────────────────────────────────────────────────────
const CORE_V4_ABI = parseAbi([
    `function commit(${COMMITMENT_TUPLE} commitment, bytes buyerSig, bytes sellerSig) external returns (bytes32 processId, bytes32 orderHash)`,
    `function resolveProcess(bytes32 processId, ${COMMITMENT_TUPLE}[] commitments) external`,
    'function processes(bytes32) view returns (address rootBuyer, address currency, uint256 cumulativeValue, uint256 activeOrderCount)',
    'event OrderCommitted(bytes32 indexed orderHash, bytes32 indexed processId, address indexed buyer, address seller, address currency, uint256 payment, uint256 cumulativeValue, bytes32 agreementHash, uint256 salt, uint256 deadline)',
    'event OrderResolved(bytes32 indexed orderHash, bytes32 indexed processId, uint256 sellerPayout, uint256 buyerPayout)',
    'event ProcessResolved(bytes32 indexed processId, address indexed buyer, uint256 orderCount)',
]);

// ── Attestation ABIs ────────────────────────────────────────────────────────
const ATTESTATION_COORDINATOR_ABI = parseAbi([
    `function attestAsSeller(${COMMITMENT_TUPLE} roleCommitment, bytes32 orderHash, bytes32 schemaId, uint8 stage, bytes32 contentRef) external`,
    'function attestAsBuyer(bytes32 processId, bytes32 orderHash, bytes32 schemaId, uint8 stage, bytes32 contentRef) external',
    'event Attestation(bytes32 indexed processId, bytes32 indexed orderHash, bytes32 indexed schemaId, address attester, uint8 stage, bytes32 contentRef)',
]);

const SCHEMA_REGISTRY_ABI = parseAbi([
    'function registered(bytes32 schemaId) view returns (bool)',
    'function registerSchema(bytes32 schemaId, uint64 version, bytes32 uriHash) external',
]);

const GHG_SCHEMA_KEY = 'figaro-ghg-disclosure-v1';
const GHG_SCHEMA_ID = keccak256(stringToHex(GHG_SCHEMA_KEY));
const DISCLOSURE_KIND = { commitment: 0, inventory: 1, restatement: 2, verification: 3 } as const;

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

// ── Exported types ──────────────────────────────────────────────────────────

export type SeededGhgScenario = {
    schemaId: `0x${string}`;
    processId: `0x${string}`;
    rootOrderHash: `0x${string}`;
    supplierOrderHash: `0x${string}`;
    /** contentRef submitted for the supplier's inventory attestation */
    supplierContentRef: `0x${string}`;
    /** Grams CO2e encoded in the supplier's inventory attestation */
    supplierGrams: bigint;
};

export type SeededSupersededGhgScenario = SeededGhgScenario & {
    initialSupplierContentRef: `0x${string}`;
    latestSupplierContentRef: `0x${string}`;
    latestSupplierGrams: bigint;
};

export type SeededClosedCompleteGhgScenario = SeededGhgScenario & {
    rootContentRef: `0x${string}`;
};

export type SeededUnreportedProcessScenario = {
    schemaId: `0x${string}`;
    processId: `0x${string}`;
    rootOrderHash: `0x${string}`;
    supplierOrderHash: `0x${string}`;
};

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

async function signCommitment(
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
}): Promise<{ processId: `0x${string}`; orderHash: `0x${string}`; commitment: CoreCommitment }> {
    const buyer = privateKeyToAccount(opts.buyerKey);
    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const buyerClient = createWalletClient({ account: buyer, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const seller = privateKeyToAccount(opts.sellerKey);

    const salt = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    const commitment = {
        processId: ZERO_PROCESS_ID,
        buyer: buyer.address as `0x${string}`,
        seller: seller.address as `0x${string}`,
        currency: opts.tokenAddress,
        payment: opts.payment,
        expectedCumulativeValue: opts.payment,
        agreementHash: opts.agreementHash ?? DEFAULT_AGREEMENT_HASH,
        salt,
        deadline,
    };

    const buyerSig = await signCommitment(commitment, opts.buyerKey, opts.coreAddress);
    const sellerSig = await signCommitment(commitment, opts.sellerKey, opts.coreAddress);

    const { result, request } = await publicClient.simulateContract({
        account: buyer.address,
        address: opts.coreAddress,
        abi: CORE_V4_ABI,
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
}): Promise<{ orderHash: `0x${string}`; commitment: CoreCommitment }> {
    const buyer = privateKeyToAccount(opts.buyerKey);
    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const buyerClient = createWalletClient({ account: buyer, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const seller = privateKeyToAccount(opts.sellerKey);

    const processState = await publicClient.readContract({
        address: opts.coreAddress,
        abi: CORE_V4_ABI,
        functionName: 'processes',
        args: [opts.processId],
    });
    const currentCumulativeValue = processState[2];
    const expectedCumulativeValue = currentCumulativeValue + opts.payment;

    const salt = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    const commitment = {
        processId: opts.processId,
        buyer: buyer.address as `0x${string}`,
        seller: seller.address as `0x${string}`,
        currency: opts.tokenAddress,
        payment: opts.payment,
        expectedCumulativeValue,
        agreementHash: opts.agreementHash ?? DEFAULT_AGREEMENT_HASH,
        salt,
        deadline,
    };

    const buyerSig = await signCommitment(commitment, opts.buyerKey, opts.coreAddress);
    const sellerSig = await signCommitment(commitment, opts.sellerKey, opts.coreAddress);

    const { result, request } = await publicClient.simulateContract({
        account: buyer.address,
        address: opts.coreAddress,
        abi: CORE_V4_ABI,
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
        abi: CORE_V4_ABI,
        functionName: 'resolveProcess',
        args: [opts.processId, commitments],
    });
    const txHash = await buyerClient.writeContract(request);
    await publicClient.waitForTransactionReceipt({ hash: txHash });
}

// ── GHG seed scenarios ──────────────────────────────────────────────────────

async function ensureTokenApprovals(coreAddress: `0x${string}`, tokenAddress: `0x${string}`, ...keys: `0x${string}`[]) {
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

    const schemaUriHash = keccak256(stringToHex('ipfs://figaro-ghg-disclosure-v1'));

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
            args: [GHG_SCHEMA_ID, 1n, schemaUriHash],
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
    const supplier = privateKeyToAccount(SUPPLIER_PRIVATE_KEY);
    const supplierClient = createWalletClient({ account: supplier, chain: LOCAL_ANVIL, transport: http(RPC_URL) });

    const schemaId = await ensureGhgSchema(schemaRegistryAddress, BUYER_PRIVATE_KEY);
    await ensureTokenApprovals(coreAddress, tokenAddress, BUYER_PRIVATE_KEY, RESTAURANT_PRIVATE_KEY, SUPPLIER_PRIVATE_KEY);

    // Commit flow — orders are Active immediately
    const { processId, orderHash: rootOrderHash } = await createRootOrder({
        buyerKey: BUYER_PRIVATE_KEY, sellerKey: RESTAURANT_PRIVATE_KEY, coreAddress, tokenAddress, payment: 1_000000000000000000n,
    });
    const { orderHash: supplierOrderHash, commitment: supplierCommitment } = await createSubOrder({
        processId, buyerKey: BUYER_PRIVATE_KEY, sellerKey: SUPPLIER_PRIVATE_KEY, coreAddress, tokenAddress,
        payment: 400000000000000000n, parentOrderHashes: [rootOrderHash],
    });

    // Submit inventory attestation for supplier order (seller = supplier)
    const supplierGrams = 500000n; // 500 kg CO2e
    const supplierContentRef = `0x${supplierGrams.toString(16).padStart(64, '0')}` as `0x${string}`;
    const { request: attestReq } = await publicClient.simulateContract({
        account: supplier.address, address: coordinatorAddress, abi: ATTESTATION_COORDINATOR_ABI,
        functionName: 'attestAsSeller', args: [supplierCommitment, supplierOrderHash, schemaId, DISCLOSURE_KIND.inventory, supplierContentRef],
    });
    await publicClient.waitForTransactionReceipt({ hash: await supplierClient.writeContract(attestReq) });

    return { schemaId, processId, rootOrderHash, supplierOrderHash, supplierContentRef, supplierGrams };
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

    // Submit a second inventory attestation that supersedes the first
    const latestSupplierGrams = 750000n; // 750 kg CO2e
    const latestSupplierContentRef = `0x${latestSupplierGrams.toString(16).padStart(64, '0')}` as `0x${string}`;
    const supplierCommitment = seededCommitments.get(seeded.supplierOrderHash);
    if (!supplierCommitment) throw new Error(`Missing seeded commitment for ${seeded.supplierOrderHash}`);
    const { request } = await publicClient.simulateContract({
        account: supplier.address, address: coordinatorAddress, abi: ATTESTATION_COORDINATOR_ABI,
        functionName: 'attestAsSeller', args: [supplierCommitment, seeded.supplierOrderHash, seeded.schemaId, DISCLOSURE_KIND.inventory, latestSupplierContentRef],
    });
    await publicClient.waitForTransactionReceipt({ hash: await supplierClient.writeContract(request) });

    return { ...seeded, initialSupplierContentRef: seeded.supplierContentRef, latestSupplierContentRef, latestSupplierGrams };
}

export async function seedClosedCompleteGhgDisclosureScenario(): Promise<SeededClosedCompleteGhgScenario> {
    const seeded = await seedGhgDisclosureScenario();
    const localConfig = readLocalDeploymentConfig();
    const coordinatorAddress = resolve('NEXT_PUBLIC_ATTESTATION_COORDINATOR', localConfig.attestationCoordinator)!;
    if (!coordinatorAddress) throw new Error('Missing ATTESTATION_COORDINATOR env for complete disclosure seed');

    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const restaurant = privateKeyToAccount(RESTAURANT_PRIVATE_KEY);
    const restaurantClient = createWalletClient({ account: restaurant, chain: LOCAL_ANVIL, transport: http(RPC_URL) });

    // Submit commitment attestation for the root order (seller = restaurant)
    const rootContentRef = keccak256(stringToHex(`figaro:ghg:commitment:v1:restaurant:${seeded.rootOrderHash}`));
    const rootCommitment = seededCommitments.get(seeded.rootOrderHash);
    if (!rootCommitment) throw new Error(`Missing seeded commitment for ${seeded.rootOrderHash}`);
    const { request: commitReq } = await publicClient.simulateContract({
        account: restaurant.address, address: coordinatorAddress, abi: ATTESTATION_COORDINATOR_ABI,
        functionName: 'attestAsSeller', args: [rootCommitment, seeded.rootOrderHash, seeded.schemaId, DISCLOSURE_KIND.commitment, rootContentRef],
    });
    await publicClient.waitForTransactionReceipt({ hash: await restaurantClient.writeContract(commitReq) });

    return { ...seeded, rootContentRef };
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
    const btn = page.getByTestId('btn-resolve-process');
    await btn.waitFor({ timeout: 10000 });
    await btn.click();
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

const DELIVERY_LIFECYCLE_SCHEMA_KEY = 'figaro-delivery-lifecycle-v1';
const DELIVERY_LIFECYCLE_SCHEMA_ID = keccak256(stringToHex(DELIVERY_LIFECYCLE_SCHEMA_KEY));

/** Delivery lifecycle stages — uint8 in AttestationCoordinator attestations. */
const DELIVERY_STAGE = {
    preparationStarted: 0,
    readyForPickup: 1,
    driverEnRoute: 2,
    pickedUp: 3,
    delivered: 4,
} as const;

/** Map signal names to attestation stages. */
const LIFECYCLE_SIGNAL_TO_STAGE: Record<string, number> = {
    declarePreparationStarted: DELIVERY_STAGE.preparationStarted,
    declareReadyForPickup: DELIVERY_STAGE.readyForPickup,
    declareEnRoute: DELIVERY_STAGE.driverEnRoute,
    declarePickedUp: DELIVERY_STAGE.pickedUp,
    declareDelivered: DELIVERY_STAGE.delivered,
};

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

    // Both orders Active immediately (dual-signed)
    const { processId, orderHash: foodOrderHash } = await createRootOrder({
        buyerKey: BUYER_PRIVATE_KEY, sellerKey: RESTAURANT_PRIVATE_KEY, coreAddress, tokenAddress, payment: 1_000000000000000000n,
    });
    const { orderHash: deliveryOrderHash } = await createSubOrder({
        processId, buyerKey: BUYER_PRIVATE_KEY, sellerKey: SUPPLIER_PRIVATE_KEY, coreAddress, tokenAddress,
        payment: 500000000000000000n, parentOrderHashes: [foodOrderHash],
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

export async function sendLifecycleSignal(
    signal: 'declareEnRoute' | 'declarePickedUp' | 'declareDelivered',
    deliveryOrderHash: `0x${string}`,
): Promise<void> {
    const localConfig = readLocalDeploymentConfig();
    const coordinatorAddress = resolve('NEXT_PUBLIC_ATTESTATION_COORDINATOR', localConfig.attestationCoordinator)!;
    if (!coordinatorAddress) throw new Error('Missing NEXT_PUBLIC_ATTESTATION_COORDINATOR');

    const stage = LIFECYCLE_SIGNAL_TO_STAGE[signal];
    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const driver = privateKeyToAccount(SUPPLIER_PRIVATE_KEY);
    const driverClient = createWalletClient({ account: driver, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const deliveryCommitment = seededCommitments.get(deliveryOrderHash);
    if (!deliveryCommitment) throw new Error(`Missing seeded commitment for ${deliveryOrderHash}`);

    const { request } = await publicClient.simulateContract({
        account: driver.address, address: coordinatorAddress, abi: ATTESTATION_COORDINATOR_ABI,
        functionName: 'attestAsSeller',
        args: [deliveryCommitment, deliveryOrderHash, DELIVERY_LIFECYCLE_SCHEMA_ID, stage, ZERO_BYTES32],
    });
    await publicClient.waitForTransactionReceipt({ hash: await driverClient.writeContract(request) });
}

export async function restaurantPrepSignals(foodOrderHash: `0x${string}`, deliveryOrderHash: `0x${string}`): Promise<void> {
    const localConfig = readLocalDeploymentConfig();
    const coordinatorAddress = resolve('NEXT_PUBLIC_ATTESTATION_COORDINATOR', localConfig.attestationCoordinator)!;
    if (!coordinatorAddress) throw new Error('Missing NEXT_PUBLIC_ATTESTATION_COORDINATOR');

    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const restaurant = privateKeyToAccount(RESTAURANT_PRIVATE_KEY);
    const restaurantClient = createWalletClient({ account: restaurant, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const foodCommitment = seededCommitments.get(foodOrderHash);
    if (!foodCommitment) throw new Error(`Missing seeded commitment for ${foodOrderHash}`);

    // Preparing: restaurant attests on the food order
    const { request: prepReq } = await publicClient.simulateContract({
        account: restaurant.address, address: coordinatorAddress, abi: ATTESTATION_COORDINATOR_ABI,
        functionName: 'attestAsSeller',
        args: [foodCommitment, foodOrderHash, DELIVERY_LIFECYCLE_SCHEMA_ID, DELIVERY_STAGE.preparationStarted, ZERO_BYTES32],
    });
    await publicClient.waitForTransactionReceipt({ hash: await restaurantClient.writeContract(prepReq) });

    // PickupReady: restaurant attests on the food order
    const { request: readyReq } = await publicClient.simulateContract({
        account: restaurant.address, address: coordinatorAddress, abi: ATTESTATION_COORDINATOR_ABI,
        functionName: 'attestAsSeller',
        args: [foodCommitment, foodOrderHash, DELIVERY_LIFECYCLE_SCHEMA_ID, DELIVERY_STAGE.readyForPickup, ZERO_BYTES32],
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
