import fs from 'fs';
import path from 'path';
import { Page, expect } from '@playwright/test';
export { waitForWalletConnected } from './test-helpers';
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
import { ANVIL_KEYS } from '../anvilAccounts';
import {
    COMMITMENT_TYPES,
    CORE_ABI,
    CLAUSE_REGISTRY_ABI,
    computeAgreementHash,
    type Agreement,
} from '@figaro/core';
import { type ProximityBand } from '@figaro/core/clauses';
import { DEFAULT_AGREEMENT_HASH } from '@/lib/core/contracts';
import { ZERO_PROCESS_ID, ZERO_ADDRESS, hexEqual } from '@/lib/shared/evm';
import { gotoAsWallet } from './devnet-multi-test';

export const RPC_URL = 'http://127.0.0.1:8545';
const MAX_UINT256 = (2n ** 256n) - 1n;
export const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
        default: { http: [RPC_URL] },
    },
});

// ── Shared devnet preamble ───────────────────────────────────────────────────
// The chain, a read client, the common ABI fragments, and the per-test snapshot
// wiring that every spec was re-declaring (the bulk of the e2e clone %). Import
// these instead of restamping a LOCAL_ANVIL / createPublicClient / parseAbi block
// at the top of each spec.

/** A read-only viem client on the local Anvil chain. */
export function localPublicClient() {
    return createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
}

/** FigaroCore `processes(processId)` view — rootBuyer / currency / cumulativeValue
 *  / activeOrderCount. The canonical post-commit / post-resolve assertion source. */
export const CORE_PROCESS_VIEW_ABI = parseAbi([
    'function processes(bytes32 processId) view returns (address rootBuyer, address currency, uint256 cumulativeValue, uint32 activeOrderCount)',
]);

/** ERC-20 `balanceOf` — bond-debit / settlement assertions read it at each stage. */
export const ERC20_BALANCE_ABI = parseAbi([
    'function balanceOf(address) view returns (uint256)',
]);


const ERC20_TEST_ABI = parseAbi([
    'function approve(address spender, uint256 amount) external returns (bool)',
]);

// Tests may name clauses; production code may not.
const MERCHANT_PROCESS_CLAUSE_KEY = 'figaro-merchant-process-v1';
const COURIER_PROCESS_CLAUSE_KEY = 'figaro-courier-process-v1';
const PROXIMITY_POLICY_CLAUSE_KEY = 'figaro-proximity-policy-v1';
const PROXIMITY_PROOF_CLAUSE_KEY = 'figaro-proximity-proof-v1';


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

// ── Reference agreements ────────────────────────────────────────
// Phase-4a requires every attestation to carry an inclusion proof against the
// order's signed `agreementHash`. We commit a minimal agreement containing the
// clause the seed's attestation will fire under, so the coordinator accepts
// the proof and the Category-2 byte-equality check (sectionData == content)
// passes.

export function merchantProcessAgreement(buyer: `0x${string}`, seller: `0x${string}`): Agreement {
    return {
        version: 'a1',
        buyer,
        seller,
        sections: [
            { clause: MERCHANT_PROCESS_CLAUSE_KEY, data: {} },
        ],
    };
}

/**
 * Courier handoff agreement carrying both halves of the proximity
 * sister-clause split:
 *   - figaro-proximity-policy-v1 (Cat-2, committed): which bands the
 *     parties agree to verify against at handoff.
 *   - figaro-proximity-proof-v1 (Cat-1, runtime): placeholder for the
 *     per-handoff witness payload. Cat-1 clauses don't enforce
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
            { clause: COURIER_PROCESS_CLAUSE_KEY, data: { eventType: 'arrived-pickup', evidenceUri: '' } },
            { clause: PROXIMITY_POLICY_CLAUSE_KEY, data: { bands: [band] } },
            // Cat-1 placeholder: any valid shape. The runtime attestation
            // supplies the real (band, nonce, deviceSig) content; the
            // committed sectionData here is just the placeholder that
            // anchors the section's leaf in the agreement's merkle root.
            {
                clause: PROXIMITY_PROOF_CLAUSE_KEY,
                data: {
                    band,
                    nonce: '0x' + '00'.repeat(32),
                    deviceSig: '0x' + '00'.repeat(65),
                },
            },
        ],
    };
}

type DeploymentConfig = {
    figaroCore?: `0x${string}`;
    tokenAddress?: `0x${string}`;
    attestationCoordinator?: `0x${string}`;
    clauseRegistry?: `0x${string}`;
    clauseRegistrationHelper?: `0x${string}`;
    dutchAuction?: `0x${string}`;
    sellerRegistry?: `0x${string}`;
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
            if (key === 'NEXT_PUBLIC_CLAUSE_REGISTRY') config.clauseRegistry = value;
            if (key === 'NEXT_PUBLIC_CLAUSE_REGISTRATION_HELPER') config.clauseRegistrationHelper = value;
            if (key === 'NEXT_PUBLIC_DUTCH_AUCTION') config.dutchAuction = value;
            if (key === 'NEXT_PUBLIC_SELLER_REGISTRY') config.sellerRegistry = value;
            if (key === 'NEXT_PUBLIC_ASSEMBLY_REGISTRY') config.assemblyRegistry = value;
        }
    }

    if (fs.existsSync(deploymentPath)) {
        const contents = JSON.parse(fs.readFileSync(deploymentPath, 'utf8')) as DeploymentConfig;
        config.figaroCore = config.figaroCore ?? contents.figaroCore;
        config.tokenAddress = config.tokenAddress ?? contents.tokenAddress;
        config.attestationCoordinator = config.attestationCoordinator ?? (contents as any).attestationCoordinator;
        config.clauseRegistry = config.clauseRegistry ?? (contents as any).clauseRegistry;
        config.clauseRegistrationHelper = config.clauseRegistrationHelper ?? (contents as any).clauseRegistrationHelper;
        config.dutchAuction = config.dutchAuction ?? (contents as any).dutchAuction;
        config.sellerRegistry = config.sellerRegistry ?? contents.sellerRegistry;
        config.assemblyRegistry = config.assemblyRegistry ?? (contents as any).assemblyRegistry;
    }

    return config;
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
    /** Optional signed agreement assemblyTemplate. When supplied, its merkle root is
     *  used as the order's `agreementHash` and is cached so later attestation
     *  helpers can produce inclusion proofs. */
    agreement?: Agreement;
}): Promise<{ processId: `0x${string}`; orderHash: `0x${string}`; commitment: CoreCommitment }> {
    const buyer = privateKeyToAccount(opts.buyerKey);
    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const buyerClient = createWalletClient({ account: buyer, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const seller = privateKeyToAccount(opts.sellerKey);

    const salt = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
    // Deadline from CHAIN time — block.timestamp is the clock the kernel
    // checks; the persisted devnet's clock may be far ahead of wall time
    // (the withdraw spec's lock-elapse time travel persists).
    const deadline = (await localPublicClient().getBlock({ blockTag: 'latest' })).timestamp + 3600n;

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
    // Deadline from CHAIN time — block.timestamp is the clock the kernel
    // checks; the persisted devnet's clock may be far ahead of wall time
    // (the withdraw spec's lock-elapse time travel persists).
    const deadline = (await localPublicClient().getBlock({ blockTag: 'latest' })).timestamp + 3600n;

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

// ── Anvil EVM snapshot / revert ──────────────────────────────────────────────

const snapshotClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

export async function evmSnapshot(): Promise<string> {
    return snapshotClient.request({ method: 'evm_snapshot' as any }) as Promise<string>;
}

export async function evmRevert(snapshotId: string): Promise<void> {
    await snapshotClient.request({ method: 'evm_revert' as any, params: [snapshotId] } as any);
}

/** Build the proximity-handoff agreement so callers can seed sub-orders
 *  carrying both the policy and the proof sections. Re-export so the
 *  test spec can compose its own scenario without forking the helper. */
export { proximityHandoffAgreement };

/** SellerRegistry ABI fragment for seedRegisteredSeller. Local copy keeps
 *  the seed helper independent of the frontend's full ABI export. */
const SELLER_REGISTRY_REGISTER_ABI = parseAbi([
    'function register(string metadataURI) external payable',
    'function updateProfile(string metadataURI) external',
    'event SellerRegistered(address indexed seller, string metadataURI)',
    'event SellerWithdrawn(address indexed seller, uint256 deposit)',
]);

const SELLER_REGISTRATION_DEPOSIT = parseEther('0.001');

/** Minimal profile shape for `seedRegisteredSeller`. Mirrors the required
 *  + most-common fields of `SellerProfileMetadata` so callers can author
 *  a registration JSON without pulling the full frontend metadata type. */
export interface SeedSellerProfile {
    name: string;
    description?: string;
    specialty?: string;
    catalogueURI?: string;
    location?: { geohash?: string };
    acceptedTokens?: Array<{ address: `0x${string}`; symbol: string; chainId: number }>;
    defaultTokenAddress?: `0x${string}`;
    /** The assemblies this seller adopts. The assembly-driven checkout only
     *  enables place-order for a seller whose profile binds a PUBLISHED
     *  assembly — a profile without bindings is browse-only. */
    assemblyBindings?: Array<{
        bindingId: string;
        subjectAddress: `0x${string}`;
        assemblySlug: string;
        counterpartyBindings: Array<{ clauseId: string; addresses: string[] }>;
    }>;
}

/** Result of `seedRegisteredSeller`. Includes the on-chain address (derived
 *  from the wallet key) and the IPFS URI of the pinned profile JSON. */
export interface SeededSeller {
    address: `0x${string}`;
    profileURI: string;
    profileCid: string;
}

/**
 * Pin a fresh seller profile JSON to local Kubo and register the wallet
 * on `SellerRegistry`. Pairs with `merchant-page.devnet.spec.ts`'s
 * inline seeder (which inlines this for the catalogue+merchant case); the
 * helper here is the generic "any registered seller" seed, used by
 * Phase 4 C4 to set up the `/sellers/edit/*` UI tests (those routes
 * require a real IPFS-pinned profile so `SellerEditProfile` can mount
 * the form).
 *
 * Requires Kubo running at NEXT_PUBLIC_IPFS_API_URL (default
 * http://127.0.0.1:5001) and `./deploy-local.sh` having populated
 * NEXT_PUBLIC_SELLER_REGISTRY.
 */
export async function seedRegisteredSeller(opts: {
    walletKey: `0x${string}`;
    profile: SeedSellerProfile;
}): Promise<SeededSeller> {
    const localConfig = readLocalDeploymentConfig();
    const sellerRegistry = (process.env.NEXT_PUBLIC_SELLER_REGISTRY
        ?? localConfig.sellerRegistry) as `0x${string}` | undefined;
    if (!sellerRegistry) {
        throw new Error('NEXT_PUBLIC_SELLER_REGISTRY not set — run ./deploy-local.sh');
    }

    const seller = privateKeyToAccount(opts.walletKey);

    // Pin the profile JSON. Frontend's SellerEditProfile.tsx fetches this
    // URI via gateway and parses with `tryParseSellerProfileDocument`, so
    // the shape must satisfy that parser. Required field: `name`.
    const profileDoc = {
        subjectAddress: seller.address,
        ...opts.profile,
    };
    const { cid, uri: profileURI } = await pinJSONToIPFS(profileDoc);

    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const sellerClient = createWalletClient({ account: seller, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    // Idempotent on the PERSISTED devnet: `register` reverts AlreadyRegistered
    // on a second call, so re-runs route through `updateProfile` (profile
    // updates are by design). Registered-or-not is read from the event stream
    // — the network is the source of truth, the contract exposes no view. A
    // wallet is registered iff registrations OUTNUMBER withdrawals (the
    // withdraw spec's wallet cycles register→withdraw every run).
    const [priorRegistrations, priorWithdrawals] = await Promise.all([
        publicClient.getContractEvents({
            address: sellerRegistry,
            abi: SELLER_REGISTRY_REGISTER_ABI,
            eventName: 'SellerRegistered',
            args: { seller: seller.address },
            fromBlock: 0n,
        }),
        publicClient.getContractEvents({
            address: sellerRegistry,
            abi: SELLER_REGISTRY_REGISTER_ABI,
            eventName: 'SellerWithdrawn',
            args: { seller: seller.address },
            fromBlock: 0n,
        }),
    ]);
    if (priorRegistrations.length > priorWithdrawals.length) {
        const { request } = await publicClient.simulateContract({
            account: seller.address,
            address: sellerRegistry,
            abi: SELLER_REGISTRY_REGISTER_ABI,
            functionName: 'updateProfile',
            args: [profileURI],
        });
        await publicClient.waitForTransactionReceipt({ hash: await sellerClient.writeContract(request) });
    } else {
        const { request } = await publicClient.simulateContract({
            account: seller.address,
            address: sellerRegistry,
            abi: SELLER_REGISTRY_REGISTER_ABI,
            functionName: 'register',
            args: [profileURI],
            value: SELLER_REGISTRATION_DEPOSIT,
        });
        await publicClient.waitForTransactionReceipt({ hash: await sellerClient.writeContract(request) });
    }

    return {
        address: seller.address as `0x${string}`,
        profileURI,
        profileCid: cid,
    };
}

// The fig-claims disk-fixture helpers (write/clearFigClaimsFixture) were
// buried 2026-06-12: the prod-build e2e webServer serves only build-time
// public/ assets (a post-build write 404s), so fig-claim-ui.devnet.spec.ts
// simulates the build-time allocation artifact via page.route instead.

const CLAUSE_REGISTRATION_HELPER_ABI = parseAbi([
    'function registerClauseAndValidator(string clauseId, uint64 version, bytes32 contentHash, string metadataURI, bytes32 family, address validator) external',
]);

const COORDINATOR_VALIDATOR_ABI = parseAbi([
    'function clauseValidator(bytes32 clauseId) view returns (address)',
    'function setValidator(bytes32 clauseId, address validator) external',
]);

/**
 * Register a never-seen clause the way a real third party must: deploy its own
 * `IClauseValidator` (here the constructor-parameterized `MockClauseValidator`,
 * compiled by forge), then register Layer A + bind Layer C ATOMICALLY via
 * `ClauseRegistrationHelper.registerClauseAndValidator` — the third-party
 * register+bind discipline from `docs/v5/CLAUSES.md`. Registering without a
 * validator leaves every attestation under the clauseId reverting
 * `ValidatorNotSet`. Idempotent: returns early when the clauseId is registered.
 */
export async function registerNovelClause(
    spec: { clauseId: string; categories: readonly string[] } & Record<string, unknown>,
): Promise<void> {
    const cfg = readLocalDeploymentConfig();
    const registry = (process.env.NEXT_PUBLIC_CLAUSE_REGISTRY ?? cfg.clauseRegistry) as `0x${string}`;
    const helper = (process.env.NEXT_PUBLIC_CLAUSE_REGISTRATION_HELPER
        ?? cfg.clauseRegistrationHelper) as `0x${string}` | undefined;
    if (!helper) throw new Error('ClauseRegistrationHelper address not configured (NEXT_PUBLIC_CLAUSE_REGISTRATION_HELPER)');
    const coordinator = (process.env.NEXT_PUBLIC_ATTESTATION_COORDINATOR
        ?? cfg.attestationCoordinator) as `0x${string}`;
    const pub = localPublicClient();
    const idHash = keccak256(stringToHex(spec.clauseId));
    const registrar = privateKeyToAccount(ANVIL_KEYS[0]);
    const wallet = createWalletClient({ account: registrar, chain: LOCAL_ANVIL, transport: http(RPC_URL) });

    // The third party's own Layer-C validator, one per clauseId (binding checks
    // the validator self-attests the clauseId it serves).
    const deployValidator = async (): Promise<`0x${string}`> => {
        const artifact = JSON.parse(fs.readFileSync(
            path.resolve(__dirname, '../../../out/MockClauseValidator.sol/MockClauseValidator.json'), 'utf8',
        )) as { abi: unknown[]; bytecode: { object: `0x${string}` } };
        const deployHash = await wallet.deployContract({
            abi: artifact.abi as never, bytecode: artifact.bytecode.object, args: [idHash],
        });
        const deployReceipt = await pub.waitForTransactionReceipt({ hash: deployHash });
        if (!deployReceipt.contractAddress) throw new Error('MockClauseValidator deployment returned no address');
        return deployReceipt.contractAddress;
    };

    if (await pub.readContract({ address: registry, abi: CLAUSE_REGISTRY_ABI, functionName: 'registered', args: [idHash] })) {
        // Already registered (persisted devnet). Heal the half-registered state
        // a validator-less registration leaves behind: bind a validator now —
        // setValidator is permissionless first-write-wins, so this is a no-op
        // when a binding already exists.
        const bound = await pub.readContract({
            address: coordinator, abi: COORDINATOR_VALIDATOR_ABI, functionName: 'clauseValidator', args: [idHash],
        });
        if (!hexEqual(bound as string, ZERO_ADDRESS)) return;
        const validator = await deployValidator();
        const { request } = await pub.simulateContract({
            account: registrar.address, address: coordinator, abi: COORDINATOR_VALIDATOR_ABI,
            functionName: 'setValidator', args: [idHash, validator],
        });
        await pub.waitForTransactionReceipt({ hash: await wallet.writeContract(request) });
        return;
    }

    const { uri } = await pinJSONToIPFS(spec);
    const contentHash = keccak256(stringToHex(JSON.stringify(spec)));
    const family = keccak256(stringToHex(spec.categories[0]));
    const validator = await deployValidator();

    const { request } = await pub.simulateContract({
        account: registrar.address, address: helper, abi: CLAUSE_REGISTRATION_HELPER_ABI,
        functionName: 'registerClauseAndValidator',
        args: [spec.clauseId, 1n, contentHash, uri, family, validator],
    });
    await pub.waitForTransactionReceipt({ hash: await wallet.writeContract(request) });
}

/**
 * Pin a JSON document to the local Kubo daemon and return the CID + ipfs URI.
 *
 * Mirrors what `ipfsService.publishJSON` does in the browser, but talks to
 * Kubo from Node directly. Used by devnet tests that need to seed an
 * seller profile or catalogue document in IPFS without walking the
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

// ── Standard scenario-authoring verification ────────────────────────────────
// After a scenario test publishes an assembly, mainnet-compliance means it must
// be (1) anchored on-chain, (2) PINNED in IPFS, and (3) SURFACED on /assemblies.
// (1) is a getContractEvents check in the spec; (2) and (3) are these helpers,
// meant to be called by every scenario-<slug> authoring spec.

/**
 * Assert a CID is PINNED in the local Kubo node — proof the publish actually
 * persisted to IPFS, not that a CID was merely computed or a gateway served it
 * from cache. Mirrors `ipfs pin ls <cid>` against the Kubo HTTP API.
 */
export async function assertPinnedInIpfs(cid: string): Promise<void> {
    const apiUrl = process.env.NEXT_PUBLIC_IPFS_API_URL ?? 'http://127.0.0.1:5001';
    const res = await fetch(`${apiUrl}/api/v0/pin/ls?arg=${encodeURIComponent(cid)}`, { method: 'POST' });
    if (!res.ok) {
        throw new Error(
            `IPFS pin/ls failed for ${cid}: ${res.status} ${res.statusText} — not pinned in the local Kubo node`,
        );
    }
    const body = await res.json() as { Keys?: Record<string, { Type?: string }> };
    expect(body.Keys?.[cid], `CID ${cid} must be pinned in the local Kubo node`).toBeTruthy();
}

const ASSEMBLY_REGISTERED_EVENT_ABI = [
    { type: 'event', name: 'AssemblyRegistered', inputs: [
        { name: 'slugHash', type: 'bytes32', indexed: true }, { name: 'author', type: 'address', indexed: true },
        { name: 'slug', type: 'string', indexed: false }, { name: 'contentHash', type: 'bytes32', indexed: false },
        { name: 'metadataURI', type: 'string', indexed: false } ] },
] as const;

/** True when `slug` is anchored on the AssemblyRegistry (any author) — the
 *  persisted-stage check the permissionless specs use to author ONCE. */
export async function assemblyAnchored(slug: string): Promise<boolean> {
    const cfg = readLocalDeploymentConfig();
    const registry = (process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY ?? cfg.assemblyRegistry) as `0x${string}`;
    const pub = localPublicClient();
    const events = await pub.getContractEvents({
        address: registry, abi: ASSEMBLY_REGISTERED_EVENT_ABI, eventName: 'AssemblyRegistered',
        args: { slugHash: keccak256(stringToHex(slug)) }, fromBlock: 0n,
    });
    return events.length > 0;
}

/**
 * Designer authoring helpers (the multi-node canvas): read the drawn node ids,
 * and DRAW a sub-order under a parent — the designer draws the nodes, 1:1;
 * nothing draws them for the designer.
 */
export async function nodeIds(page: Page): Promise<string[]> {
    return page.locator('[data-testid^="order-node-"]:not([data-testid$="-delete"])')
        .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!.replace('order-node-', '')));
}
export async function addSubOrder(page: Page, parentId: string): Promise<string> {
    const before = new Set(await nodeIds(page));
    await page.getByTestId(`btn-add-suborder-${parentId}`).click();
    await expect.poll(async () => (await nodeIds(page)).length, { timeout: 10000 }).toBeGreaterThan(before.size);
    const after = await nodeIds(page);
    return after.find((id) => !before.has(id))!;
}

/**
 * Assert a published assembly SURFACES on the marketing `/assemblies` inventory.
 * The page reads `AssemblyRegistry` on-chain and lazy-fetches each assemblyTemplate
 * from IPFS; rows are keyed `#assembly-<slug>` (per AssemblyInventory). Navigates
 * the page, so call it after the on-chain / IPFS assertions.
 */
export async function assertAssemblyOnInventory(page: Page, slug: string): Promise<void> {
    await page.goto('/assemblies', { waitUntil: 'domcontentloaded' });
    const row = page.locator(`#assembly-${slug}`);
    await expect(row).toBeVisible({ timeout: 20000 });
    await expect(row).toContainText(slug);
}


// ── Mainnet-faithful seller discovery ───────────────────────────────────────
// Runtime specs must consume sellers the way a mainnet client does: read
// SellerRegistry events, fetch each seller's profile from IPFS, and match on the
// on-chain `assemblyBindings`. NO roster, NO hardcoded addresses/names/keys — a
// spec that takes seller identity from a TS file is not testing mainnet usage.
// (This mirrors what the indexer / `discoveryService` does; it additionally keeps
// the `assemblyBindings` that the buyer-facing `SellerCatalogue` projection drops.)

/** SellerRegistry registration events — carry the profile metadataURI. Internal
 *  to discovery; read by `discoverSellers`. */
const SELLER_REGISTERED_EVENT_ABI = parseAbi([
    'event SellerRegistered(address indexed seller, string metadataURI)',
    'event SellerProfileUpdated(address indexed seller, string metadataURI)',
    'event SellerWithdrawn(address indexed seller, uint256 deposit)',
]);

export interface DiscoveredSeller {
    address: `0x${string}`;
    name: string;
    /** The seller's home geohash (profile.location.geohash), discovered from IPFS. */
    geohash?: string;
    assemblyBindings: Array<{
        assemblySlug: string;
        counterpartyBindings?: Array<{ clauseId: string; addresses: string[] }>;
    }>;
}

/** Every LIVE registered seller, discovered from chain → IPFS (events +
 *  profile docs). Mainnet-realistic tolerance: a withdrawn wallet is skipped
 *  (registrations must outnumber withdrawals), a profile that fails to
 *  fetch or parse is skipped rather than crashing discovery — anyone can
 *  register a garbage URI; consumers must tolerate it — and the live profile
 *  is the most recent `SellerProfileUpdated` post-dating the surviving
 *  registration (mirrors `lib/core/indexer.ts`; `updateProfile` is a
 *  by-design SellerRegistry surface). */
export async function discoverSellers(): Promise<DiscoveredSeller[]> {
    const publicClient = localPublicClient();
    const config = readLocalDeploymentConfig();
    const sellerRegistry = (process.env.NEXT_PUBLIC_SELLER_REGISTRY ?? config.sellerRegistry) as `0x${string}`;
    const [events, updates, withdrawals] = await Promise.all([
        publicClient.getContractEvents({
            address: sellerRegistry, abi: SELLER_REGISTERED_EVENT_ABI, eventName: 'SellerRegistered', fromBlock: 0n,
        }),
        publicClient.getContractEvents({
            address: sellerRegistry, abi: SELLER_REGISTERED_EVENT_ABI, eventName: 'SellerProfileUpdated', fromBlock: 0n,
        }),
        publicClient.getContractEvents({
            address: sellerRegistry, abi: SELLER_REGISTERED_EVENT_ABI, eventName: 'SellerWithdrawn', fromBlock: 0n,
        }),
    ]);
    const withdrawnCount = new Map<string, number>();
    for (const w of withdrawals) {
        const a = ((w.args as { seller?: string }).seller ?? '').toLowerCase();
        withdrawnCount.set(a, (withdrawnCount.get(a) ?? 0) + 1);
    }
    const updatesByAddr = new Map<string, Array<{ uri: string; block: bigint; logIndex: number }>>();
    for (const u of updates) {
        const a = ((u.args as { seller?: string }).seller ?? '').toLowerCase();
        const list = updatesByAddr.get(a) ?? [];
        list.push({
            uri: (u.args as { metadataURI?: string }).metadataURI ?? '',
            block: u.blockNumber ?? 0n,
            logIndex: u.logIndex ?? 0,
        });
        updatesByAddr.set(a, list);
    }
    const registeredCount = new Map<string, number>();
    const out: DiscoveredSeller[] = [];
    for (const ev of events) {
        const address = (ev.args as { seller: `0x${string}` }).seller;
        const key = address.toLowerCase();
        registeredCount.set(key, (registeredCount.get(key) ?? 0) + 1);
        if ((registeredCount.get(key) ?? 0) <= (withdrawnCount.get(key) ?? 0)) continue;
        // Live profile URI = max over (this registration, post-dating updates)
        // by (block, logIndex); updates pre-dating the surviving registration
        // (e.g. before a withdraw→re-register cycle) never win.
        let uri = (ev.args as { metadataURI?: string }).metadataURI ?? '';
        let latest = { block: ev.blockNumber ?? 0n, logIndex: ev.logIndex ?? 0 };
        for (const u of updatesByAddr.get(key) ?? []) {
            if (u.block > latest.block || (u.block === latest.block && u.logIndex > latest.logIndex)) {
                uri = u.uri;
                latest = { block: u.block, logIndex: u.logIndex };
            }
        }
        let profile: {
            name?: string;
            location?: { geohash?: string };
            assemblyBindings?: DiscoveredSeller['assemblyBindings'];
        };
        try {
            profile = await (await fetch(resolveIpfsURI(uri))).json();
        } catch {
            continue; // unresolvable / non-JSON profile — not discoverable
        }
        out.push({
            address,
            name: profile.name ?? '',
            geohash: profile.location?.geohash,
            assemblyBindings: profile.assemblyBindings ?? [],
        });
    }
    return out;
}

/** The registered seller bound to `slug`. `withCourier` disambiguates a
 *  seller-assigned merchant (has courier `counterpartyBindings`) from a courier
 *  (none). Throws unless exactly one matches — discovery, not assumption. */
export async function discoverSellerByAssembly(
    slug: string,
    opts: { withCourier?: boolean } = {},
    sellers?: DiscoveredSeller[],
): Promise<DiscoveredSeller> {
    const all = sellers ?? await discoverSellers();
    const matches = all.filter((s) => {
        const b = s.assemblyBindings.find((x) => x.assemblySlug === slug);
        if (!b) return false;
        if (opts.withCourier === undefined) return true;
        const hasCourier = (b.counterpartyBindings ?? []).some((c) => (c.addresses ?? []).length > 0);
        return opts.withCourier ? hasCourier : !hasCourier;
    });
    if (matches.length !== 1) {
        throw new Error(`discoverSellerByAssembly(${slug}, withCourier=${String(opts.withCourier)}): expected exactly 1 seller, found ${matches.length} — onboard first / check on-chain bindings`);
    }
    return matches[0];
}

/** The courier address the merchant designated ON-CHAIN for `slug` (seller-assigned). */
export function courierAddressFor(merchant: DiscoveredSeller, slug: string): `0x${string}` {
    const b = merchant.assemblyBindings.find((x) => x.assemblySlug === slug);
    const addr = b?.counterpartyBindings?.find((c) => c.clauseId === 'figaro-courier-process-v1')?.addresses?.[0];
    if (!addr) throw new Error(`merchant ${merchant.address} designates no courier for ${slug} on-chain`);
    return addr as `0x${string}`;
}

/** Token approvals by ADDRESS via the unlocked RPC — no private keys (devnet only;
 *  on testnet a funded-wallet keymap keyed by address would replace the unlocked send). */
export async function ensureTokenApprovalsByAddress(
    coreAddress: `0x${string}`, tokenAddress: `0x${string}`, ...addresses: `0x${string}`[]
) {
    const publicClient = localPublicClient();
    for (const address of addresses) {
        const client = createWalletClient({ account: address, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const { request } = await publicClient.simulateContract({
            account: address, address: tokenAddress, abi: ERC20_TEST_ABI,
            functionName: 'approve', args: [coreAddress, MAX_UINT256],
        });
        const txHash = await client.writeContract(request);
        await publicClient.waitForTransactionReceipt({ hash: txHash });
    }
}

/** Resolve an `ipfs://` URI to a Kubo-gateway URL. */
function resolveIpfsURI(uri: string): string {
    const gateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY_URL ?? 'http://127.0.0.1:8080';
    return uri.startsWith('ipfs://')
        ? `${gateway}/ipfs/${uri.slice('ipfs://'.length)}`
        : uri;
}

/**
 * Advance Anvil's block timestamp by `seconds` and mine an empty block
 * so reads pick up the new `block.timestamp`. Used by tests that exercise
 * time-locked paths (SellerRegistry.withdraw's 365-day lock,
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
 * Buyer side of the REAL bilateral relay for a single-order sale.
 *
 * Drives the buyer entirely through the UI: browse the seller, add the
 * product to the cart, place the order, confirm the pre-sign agreement
 * preview (the buyer signs as buyer — never for the seller), and relay the
 * pinned commitment payload to the seller's inbox via `send-commitment-xmtp`.
 * Leaves the order awaiting the seller's counter-signature — pair with
 * `acceptOrderInInboxUI` to land the on-chain commit.
 *
 * This is the mainnet path: there is no RPC auto-signing of the counterparty
 * and no seeded payload. The payload itself is pinned to real IPFS; only the
 * XMTP notification hop is the e2e coordination channel (localStorage-backed,
 * same posture as real-IPFS / no-real-XMTP).
 *
 * `page` is the buyer wallet (the default account[0]). Pass `itemId` to target
 * a specific catalogue item; omit it for a single-product seller (the first
 * "add" button is used).
 */
export async function placeBilateralOrderUI(
    page: Page,
    opts: {
        seller: string;
        itemId?: string;
        method?: string;
        geohash?: string;
        /** buyer-assigned coordination: the courier address the buyer enters in
         *  the SellerCataloguePicker; the first delivery item is selected. For
         *  a buyer-set item (no fixed price) pass `buyerSetPrice` — the buyer
         *  names the delivery fee and the courier order commits at it. */
        buyerAssignedCourier?: { address: string; buyerSetPrice?: string };
    },
): Promise<void> {
    await page.goto(`/s/${opts.seller}?e2e=devnet`, { waitUntil: 'domcontentloaded' });
    const detailView = page.getByTestId('seller-detail-view');
    try {
        await detailView.waitFor({ state: 'visible', timeout: 30000 });
    } catch {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await detailView.waitFor({ state: 'visible', timeout: 30000 });
    }

    const addButton = opts.itemId
        ? page.getByTestId(`btn-add-${opts.itemId}`)
        : page.locator('[data-testid^="btn-add-"]').first();
    try {
        await addButton.waitFor({ state: 'visible', timeout: 15000 });
    } catch {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await detailView.waitFor({ state: 'visible', timeout: 30000 });
        await addButton.waitFor({ state: 'visible', timeout: 30000 });
    }
    await addButton.click();
    await expect(page.locator('[data-testid^="cart-line-"]').first()).toBeVisible({ timeout: 10000 });

    // Browse → checkout: the seller page is browse-only; review-order navigates
    // to /s/<seller>/checkout where the method is chosen and the order commits.
    await page.getByTestId('btn-review-order').click();
    await page.getByTestId('checkout-view').waitFor({ state: 'visible', timeout: 30000 });

    // The buyer's method options ARE the seller's bound assemblies — one
    // option per assembly that carries a modality, labelled by the
    // assembly's own name, valued by the modality string the assembly commits.
    // They render only once the bindings resolve chain→IPFS, and selection is
    // REQUIRED whenever options exist (explicit unset placeholder, no
    // auto-default) — so a caller whose scenario composes a modality MUST pass
    // `method` (the modality value, e.g. 'consume-onsite') and we WAIT
    // for the select; an instant visibility probe races the bindings fetch.
    const methodSelect = page.getByTestId('select-method');
    if (opts.method) {
        await methodSelect.waitFor({ state: 'visible', timeout: 30000 });
        await expect(
            page.getByTestId(`option-method-${opts.method}`),
            `checkout offers the ${opts.method} assembly option`,
        ).toHaveCount(1, { timeout: 20000 });
        await methodSelect.selectOption(opts.method);
    } else if (await methodSelect.isVisible().catch(() => false)) {
        // Caller named no modality (e.g. an assembly with no modality clause
        // usually shows no selector at all) — best-effort: pick the first option.
        const optionValues = await methodSelect.locator('option').evaluateAll(
            (opts2) => opts2.map((o) => (o as HTMLOptionElement).value).filter((v) => v !== ''),
        );
        if (optionValues.length > 0) await methodSelect.selectOption(optionValues[0]);
    }

    // Buyer-assigned coordination: the profile leaves the delivery sub-order
    // unbound — the buyer enters the courier's address in the picker and
    // selects a delivery item from THAT seller's own catalogue (the list
    // renders once the address resolves a discovered catalogue).
    if (opts.buyerAssignedCourier) {
        const addressInput = page.getByTestId('input-seller-address');
        await addressInput.waitFor({ state: 'visible', timeout: 30000 });
        await addressInput.fill(opts.buyerAssignedCourier.address);
        const deliveryItem = page.locator('[data-testid^="seller-item-"]').first();
        await expect(deliveryItem, 'the chosen courier publishes a delivery item').toBeVisible({ timeout: 30000 });
        await deliveryItem.check();
        if (opts.buyerAssignedCourier.buyerSetPrice) {
            const priceInput = page.getByTestId('input-seller-buyer-price');
            await priceInput.waitFor({ state: 'visible', timeout: 10000 });
            await priceInput.fill(opts.buyerAssignedCourier.buyerSetPrice);
        }
    }

    // UI-response checks before placing (the checkout summary is a UI
    // response too — manual review 2026-06-12 caught it un-asserted):
    // the economics rows aggregate the WHOLE plan, so locked-at-commit is
    // always exactly 2× the refundable bond; and the agreement review
    // renders the clauses' composed VALUES, not bare titles.
    const bondText = await page.getByTestId('checkout-bond-refundable').innerText();
    const lockedText = await page.getByTestId('checkout-locked-total').innerText();
    expect(parseFloat(lockedText), 'locked at commit = 2× the refundable bond')
        .toBeCloseTo(parseFloat(bondText) * 2, 6);
    // Multi-order plan: the bond must equal the ALL-sellers total — the
    // root-only regression (bond = lead's cut while the breakdown shows
    // every contributor) satisfies the 2× check above but fails this one.
    const kitTotal = page.getByTestId('cart-kit-total');
    if (await kitTotal.isVisible().catch(() => false)) {
        expect(parseFloat(bondText), 'refundable bond = the full multi-order plan total')
            .toBeCloseTo(parseFloat(await kitTotal.innerText()), 6);
    }
    await expect(page.getByTestId('checkout-agreement-terms')).toContainText('—');

    await page.getByTestId('btn-place-order').click();

    // No pre-sign modal at checkout — the inline agreement terms ARE the review;
    // place-order signs directly. Relay the buyer-signed payload to the seller.
    await page.getByTestId('buyer-share-panel').waitFor({ state: 'visible', timeout: 45000 });
    await page.getByTestId('send-commitment-xmtp').click();
    await expect(page.getByTestId('commitment-xmtp-status')).toContainText(/sent over XMTP/i, { timeout: 45000 });
}

/**
 * Seller side of the REAL bilateral relay: open the seller's inbox, accept the
 * pending order (confirm the pre-sign preview → counter-sign → broadcast), and
 * return the on-chain `processId` from the resulting active row.
 *
 * Switches `page` to the seller wallet via `gotoAsWallet`. The pending card is
 * delivered by the live coordination subscription (no seeding); the active row
 * appears only once the seller's `commit` lands on-chain.
 */
export async function acceptOrderInInboxUI(
    page: Page,
    inboxOwner: string,
    opts: {
        /** The committed order's SELLER, when it differs from the inbox owner —
         *  e.g. the BUYER counter-signing a seller-initiated dutch-auction
         *  order relayed by the claiming seller. Defaults to the inbox owner
         *  (the usual seller-accepts-buyer-order direction). */
        expectedSeller?: string;
    } = {},
): Promise<Hex> {
    const sellerAddress = opts.expectedSeller ?? inboxOwner;
    // Block watermark BEFORE the accept: the devnet persists across runs, so
    // this seller may already have committed orders. The accept is confirmed
    // by the commit THIS accept lands (out-of-band chain read), then asserted
    // in the UI by that exact processId's active row — never by diffing row
    // sets (the rows query loads async; a snapshot race makes an old row look
    // "new" and the spec ends up driving a previous run's process).
    const pub = localPublicClient();
    const cfg = readLocalDeploymentConfig();
    const coreAddress = (process.env.NEXT_PUBLIC_FIGARO_CORE ?? cfg.figaroCore) as `0x${string}`;
    const fromBlock = (await pub.getBlockNumber()) + 1n;

    await gotoAsWallet(page, inboxOwner, '/inbox?e2e=devnet');

    const pendingCard = page.getByTestId('inbox-pending-card');
    await pendingCard.first().waitFor({ state: 'visible', timeout: 60000 });
    await page.getByTestId('btn-accept-order').first().click();

    // Pre-sign agreement preview (seller).
    const previewModal = page.getByTestId('agreement-preview-modal');
    await previewModal.waitFor({ state: 'visible', timeout: 45000 });
    await page.getByTestId('preview-confirm').click();
    await previewModal.waitFor({ state: 'hidden', timeout: 45000 });

    // Out-of-band: the counter-sign broadcast a commit by THIS seller.
    let processId = '' as Hex | '';
    await expect
        .poll(async () => {
            const logs = await pub.getContractEvents({
                address: coreAddress, abi: CORE_ABI, eventName: 'OrderCommitted',
                fromBlock, toBlock: 'latest',
            });
            const mine = logs.find((l) => {
                const args = l.args as { seller?: string };
                return !!args.seller && args.seller.toLowerCase() === sellerAddress.toLowerCase();
            });
            processId = ((mine?.args as { processId?: Hex } | undefined)?.processId ?? '') as Hex | '';
            return processId;
        }, { timeout: 90000, message: 'the counter-signed commit lands on-chain' })
        .not.toBe('');

    // UI reaction: the committed process's row reaches the seller's inbox.
    // (Skipped for a buyer-side counter-sign — the buyer's active orders live
    // at /orders, not the inbox; the on-chain poll above already proved the
    // commit and the caller asserts the process state.)
    if (!opts.expectedSeller || opts.expectedSeller.toLowerCase() === inboxOwner.toLowerCase()) {
        await page.getByTestId(`inbox-active-row-${processId}`).waitFor({ state: 'visible', timeout: 90000 });
    }
    return processId as Hex;
}


/**
 * Walk a wallet's clause attestations through the ONE generic rail
 * (`capability-execute-submit-clause-attestation`) — clause-agnostic: the
 * engine derives one capability per un-attested stage of every category-1
 * clause the wallet's orders carry (labels are the clause's own event codes),
 * so the walk never names a clause. `clicks` is scenario knowledge: how many
 * attestations this party owes (ladder stages + proof witnesses).
 *
 * The rail is EVENT-DRIVEN: it re-derives from the indexer, so the next
 * button (re)appears only once the prior attestation has been indexed —
 * `toBeEnabled` rides out that gap; sequencing is purely the UI reaction,
 * never a chain read. After the final click, the wallet's generic rail
 * retires to zero.
 *
 * Arrival and acceptance are NOT attestations: the order's existence and the
 * seller's acceptance are core (the bilateral commit / inbox counter-sign).
 */
export async function walkClauseAttestations(
    page: Page,
    opts: { wallet: string; processId: Hex; clicks: number; who?: string },
): Promise<void> {
    const who = opts.who ?? opts.wallet.slice(0, 8);
    await gotoAsWallet(page, opts.wallet, `/orders/${opts.processId}?e2e=devnet`);
    await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
    const railBtn = page.getByTestId('capability-execute-submit-clause-attestation');
    for (let i = 0; i < opts.clicks; i++) {
        const btn = railBtn.first();
        await expect(btn, `${who}: generic rail surfaces attestation ${i + 1}/${opts.clicks}`)
            .toBeEnabled({ timeout: 90_000 });
        await btn.click();
    }
    await expect(railBtn, `${who}: rail retires once every clause is run`).toHaveCount(0, { timeout: 90_000 });
}

/**
 * Drive the merchant coordination walk + the courier's two handoff
 * proximity proofs for a committed local-commerce process — the shared
 * runtime steps between the buyer's commit and the buyer's resolve. The
 * coordination is identical across every courier-coordination mode
 * (seller-assigned, buyer-assigned, dutch-auction); only how the courier
 * order is created differs.
 *
 * Each order carries its own proximity-certified hand-off edge, and the proof
 * clause is bilateral — BOTH parties of that order witness it. The SELLER's
 * witness arrives PAIRED with the hand-off lifecycle stage (the engine reads
 * `block.handoffStages`; one click, two attestations), so the seller never
 * clicks a standalone proof button:
 *
 *   - Merchant: its merchant-process ladder (3 stages: prep-started →
 *     ready-for-pickup → handed-off; arrival/acceptance are core, not here);
 *     handed-off pairs the zone witness on its own order = 3 clicks.
 *   - Courier: its courier-process ladder (5 stages); arrived-pickup pairs
 *     the zone witness (arrived-dropoff finds it already witnessed —
 *     once-per-party) = 5 clicks.
 *
 * Everything goes through the ONE clause-agnostic rail. The caller adds the
 * buyer's co-witness on EACH order (2) and resolves.
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
    // Inline emissions submit — file a figaro-ghg-measurement-v1 grams
    // measurement for the currently-active seller wallet on the order page.
    // Folded into the seller's continuous session (rather than a separate
    // gotoAsWallet) so every agreement-dependent piece of state is hot. The
    // reaction is waited on IN THE UI (the panel's "Current" inventory for this
    // order, which surfaces once the measurement lands) — not a chain poll; the
    // on-chain attestation is the spec's out-of-band confirmation.
    const submitEmissionsAsCurrentSeller = async (
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
        const detail = page.getByTestId(`ghg-order-detail-${orderHash.slice(0, 10)}`);
        await detail.getByTestId('ghg-current-actual').waitFor({ state: 'visible', timeout: 90_000 });
    };

    // ── Merchant: 3 ladder stages (handed-off pairs the zone witness) ──────
    await walkClauseAttestations(page, {
        wallet: opts.merchant, processId: opts.processId, clicks: 3, who: 'merchant',
    });
    if (opts.emissions?.merchant) {
        await submitEmissionsAsCurrentSeller(
            opts.emissions.merchant.orderHash,
            opts.emissions.merchant.grams,
        );
    }

    // ── Courier: 5 ladder stages (arrived-pickup pairs the zone witness) ───
    await walkClauseAttestations(page, {
        wallet: opts.courier, processId: opts.processId, clicks: 5, who: 'courier',
    });
    if (opts.emissions?.courier) {
        await submitEmissionsAsCurrentSeller(
            opts.emissions.courier.orderHash,
            opts.emissions.courier.grams,
        );
    }
}
