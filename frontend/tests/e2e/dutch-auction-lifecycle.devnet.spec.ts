/**
 * dutch-auction-lifecycle.devnet.spec.ts
 *
 * DutchAuction has three terminal paths from `createAuction`:
 *   1. claim — provider takes the job at the decayed price.
 *   2. cancel — creator cancels an unclaimed auction.
 *   3. expire — anyone clears an unclaimed auction after `duration`.
 *
 * `delivery-lifecycle.devnet.spec.ts` covers the claim path. This file
 * covers cancel + expire. Neither is exposed through a clickable UI today
 * (the auction-claim button is the only DutchAuction surface in
 * /orders/<processId>), so these tests drive the contract via viem and
 * use the Playwright harness only for env wiring + `evmSnapshot/revert`.
 *
 * Requires: Anvil running + ./deploy-local.sh
 *   NEXT_PUBLIC_DUTCH_AUCTION must be set in .env.local.
 *
 * Mirrors the seedDeliveryScenario auction setup in devnet-helpers.ts.
 */
import { test, expect } from '@playwright/test';
import {
    createPublicClient,
    createWalletClient,
    defineChain,
    http,
    parseAbi,
    keccak256,
    toHex,
    type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
    evmIncreaseTime,
    evmRevert,
    evmSnapshot,
    readLocalDeploymentConfig,
} from './devnet-helpers';
import { ZERO_ADDRESS } from '../../lib/shared/evm';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});

// Anvil deterministic private keys.
const CREATOR_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const OTHER_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;

// Mirror seedDeliveryScenario's auction setup but parameterised so each
// test gets a fresh auctionId. AssemblyRegistry / Core not needed here —
// DutchAuction is standalone.
const DUTCH_AUCTION_ABI = parseAbi([
    'function createAuction(bytes32 auctionId, uint256 maxPrice, bytes32 processId, address currency) external',
    'function claim(bytes32 auctionId) external',
    'function cancel(bytes32 auctionId) external',
    'function expire(bytes32 auctionId) external',
    'function auctions(bytes32) view returns (address creator, uint64 startTime, uint256 maxPrice, address driver, uint256 clearingPrice)',
    'function duration() view returns (uint64)',
    // Custom errors — required so viem can decode revert data into a
    // typed name (`NotCreator`, `NotExpired`, `AlreadyClaimed`, etc.).
    // Without these, simulateContract throws with the raw 4-byte selector.
    'error NotCreator()',
    'error NotExpired()',
    'error AlreadyClaimed()',
    'error NotStarted()',
]);

interface CreatedAuction {
    auctionId: Hex;
    processId: Hex;
    creator: Hex;
    auctionAddress: Hex;
}

async function createAuction(label: string): Promise<CreatedAuction> {
    const config = readLocalDeploymentConfig();
    const auctionAddress = (process.env.NEXT_PUBLIC_DUTCH_AUCTION
        ?? config.dutchAuction
        ?? '') as Hex;
    const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS
        ?? config.tokenAddress
        ?? '') as Hex;
    if (!auctionAddress || auctionAddress.length !== 42) {
        throw new Error('NEXT_PUBLIC_DUTCH_AUCTION not set — run ./deploy-local.sh');
    }

    const creator = privateKeyToAccount(CREATOR_KEY);
    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const creatorClient = createWalletClient({ account: creator, chain: LOCAL_ANVIL, transport: http(RPC_URL) });

    // Fresh, deterministic-per-label auctionId so parallel describe blocks
    // (if any) don't collide.
    const auctionId = keccak256(toHex(`auction-${label}-${Date.now()}`));
    const processId = keccak256(toHex(`process-${label}-${Date.now()}`));

    const { request } = await publicClient.simulateContract({
        account: creator.address,
        address: auctionAddress,
        abi: DUTCH_AUCTION_ABI,
        functionName: 'createAuction',
        args: [auctionId, 500_000_000_000_000_000n, processId, tokenAddress],
    });
    await publicClient.waitForTransactionReceipt({ hash: await creatorClient.writeContract(request) });

    return { auctionId, processId, creator: creator.address as Hex, auctionAddress };
}

async function readAuction(auctionAddress: Hex, auctionId: Hex) {
    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    return publicClient.readContract({
        address: auctionAddress,
        abi: DUTCH_AUCTION_ABI,
        functionName: 'auctions',
        args: [auctionId],
    });
}

async function readDuration(auctionAddress: Hex): Promise<bigint> {
    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    return publicClient.readContract({
        address: auctionAddress,
        abi: DUTCH_AUCTION_ABI,
        functionName: 'duration',
    });
}

let snapshot: string;
test.beforeAll(async () => { snapshot = await evmSnapshot(); });
test.afterAll(async () => { if (snapshot) await evmRevert(snapshot); });

test.describe('DutchAuction lifecycle (devnet)', () => {
    let testSnapshot: string;
    test.beforeEach(async () => {
        testSnapshot = await evmSnapshot();
    });
    test.afterEach(async () => {
        if (testSnapshot) await evmRevert(testSnapshot);
    });

    test('creator cancels unclaimed auction — auction slot is cleared', async () => {
        const { auctionId, creator, auctionAddress } = await createAuction('cancel');

        // Confirm the auction exists before cancel.
        const before = await readAuction(auctionAddress, auctionId);
        expect(before[0].toLowerCase()).toBe(creator.toLowerCase());

        const creatorAccount = privateKeyToAccount(CREATOR_KEY);
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const creatorClient = createWalletClient({ account: creatorAccount, chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        const { request } = await publicClient.simulateContract({
            account: creatorAccount.address,
            address: auctionAddress,
            abi: DUTCH_AUCTION_ABI,
            functionName: 'cancel',
            args: [auctionId],
        });
        await publicClient.waitForTransactionReceipt({ hash: await creatorClient.writeContract(request) });

        // After cancel, the slot is deleted — creator address reads as zero.
        const after = await readAuction(auctionAddress, auctionId);
        expect(after[0]).toBe(ZERO_ADDRESS);
    });

    test('non-creator cannot cancel — NotCreator', async () => {
        const { auctionId, auctionAddress } = await createAuction('cancel-unauth');

        const other = privateKeyToAccount(OTHER_KEY);
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        await expect(
            publicClient.simulateContract({
                account: other.address,
                address: auctionAddress,
                abi: DUTCH_AUCTION_ABI,
                functionName: 'cancel',
                args: [auctionId],
            }),
        ).rejects.toThrow(/NotCreator/);
    });

    test('anyone can expire an unclaimed auction after duration — slot cleared', async () => {
        const { auctionId, creator, auctionAddress } = await createAuction('expire');
        const duration = await readDuration(auctionAddress);

        // Confirm auction exists before expire.
        const before = await readAuction(auctionAddress, auctionId);
        expect(before[0].toLowerCase()).toBe(creator.toLowerCase());

        // Premature expire reverts (duration not elapsed).
        const other = privateKeyToAccount(OTHER_KEY);
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        await expect(
            publicClient.simulateContract({
                account: other.address,
                address: auctionAddress,
                abi: DUTCH_AUCTION_ABI,
                functionName: 'expire',
                args: [auctionId],
            }),
        ).rejects.toThrow(/NotExpired/);

        // Time-travel past `duration`, then expire from a non-creator wallet
        // (permissionless cleanup).
        await evmIncreaseTime(Number(duration) + 1);

        const otherClient = createWalletClient({ account: other, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const { request } = await publicClient.simulateContract({
            account: other.address,
            address: auctionAddress,
            abi: DUTCH_AUCTION_ABI,
            functionName: 'expire',
            args: [auctionId],
        });
        await publicClient.waitForTransactionReceipt({ hash: await otherClient.writeContract(request) });

        const after = await readAuction(auctionAddress, auctionId);
        expect(after[0]).toBe(ZERO_ADDRESS);
    });
});
