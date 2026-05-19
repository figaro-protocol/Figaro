/**
 * offset-retirement.devnet.spec.ts
 *
 * Path A — buyer-side carbon-offset retirement. The pre-resolve panel
 * on /orders/<processId> composes four signed tx steps:
 *   1. ERC-20 approve(aggregator, maxAmountIn)
 *   2. aggregator.retire(tons, beneficiary, maxAmountIn) — emits Retired
 *   3. ProcessOffsetReceipt.record(processId, txHash, ...) — anchors
 *      the processId ↔ retirement binding on-chain
 *   4. (caller) FigaroCore.resolveProcess(...)
 *
 * Step 4 is exercised by lifecycle.devnet. Steps 1-3 had no devnet
 * coverage pre-2026-05-19, and the deploy script also failed to
 * propagate NEXT_PUBLIC_MOCK_OFFSET_AGGREGATOR and
 * NEXT_PUBLIC_PROCESS_OFFSET_RECEIPT into frontend/.env.local (both
 * fixed in earlier commits this session). This spec is the live-chain
 * guard for the bridge — if either env var drifts back to empty, the
 * test's deployment-lookup throws early and surfaces the regression.
 *
 * UI-level coverage of the PreResolveOffsetPanel state machine
 * (idle → quoting → ready → approving → … → done) needs a process
 * with GHG measurements + the panel mounted on /orders/<processId>.
 * That's a future-session piece. What ships now: the on-chain
 * contract path the bridge composes.
 *
 * Requires: Anvil + ./deploy-local.sh
 */
import { test, expect } from '@playwright/test';
import {
    createPublicClient,
    createWalletClient,
    defineChain,
    http,
    parseAbi,
    parseEther,
    type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
    createRootOrder,
    ensureTokenApprovals,
    evmRevert,
    evmSnapshot,
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
const SELLER_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;
const OUTSIDER_KEY = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a' as const;

const ERC20_ABI = parseAbi([
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function balanceOf(address owner) view returns (uint256)',
]);

const MOCK_OFFSET_AGGREGATOR_ABI = parseAbi([
    'function quote(uint256 tonsToRetire) view returns (uint256)',
    'function retire(uint256 tonsToRetire, address beneficiary, uint256 maxAmountIn) returns (bytes32)',
    'function pricePerTon() view returns (uint256)',
    'event Retired(bytes32 indexed retirementId, address indexed retiringAddress, address indexed beneficiary, uint256 tonsRetired, address inputToken, uint256 inputAmount)',
]);

const PROCESS_OFFSET_RECEIPT_ABI = parseAbi([
    'function record(bytes32 processId, bytes32 retirementTxHash, address aggregator, uint256 tonsRetired, address inputToken, uint256 inputAmount) external',
    'event ReceiptRecorded(bytes32 indexed processId, address indexed buyer, bytes32 indexed retirementTxHash, address aggregator, uint256 tonsRetired, address inputToken, uint256 inputAmount)',
    'error NotRootBuyer()',
    'error ZeroRetirementTxHash()',
    'error ZeroAggregator()',
    'error ZeroTonsRetired()',
    'error ZeroInputToken()',
    'error ZeroInputAmount()',
]);

function getAddresses() {
    const config = readLocalDeploymentConfig();
    const coreAddress = (process.env.NEXT_PUBLIC_FIGARO_CORE ?? config.figaroCore) as Hex;
    const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex;
    const aggregator = (process.env.NEXT_PUBLIC_MOCK_OFFSET_AGGREGATOR ?? '') as Hex;
    const receipts = (process.env.NEXT_PUBLIC_PROCESS_OFFSET_RECEIPT ?? '') as Hex;
    if (!aggregator || aggregator.length !== 42) {
        throw new Error('NEXT_PUBLIC_MOCK_OFFSET_AGGREGATOR not set — re-run ./deploy-local.sh');
    }
    if (!receipts || receipts.length !== 42) {
        throw new Error('NEXT_PUBLIC_PROCESS_OFFSET_RECEIPT not set — re-run ./deploy-local.sh');
    }
    return { coreAddress, tokenAddress, aggregator, receipts };
}

let outerSnapshot: string;
test.beforeAll(async () => { outerSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (outerSnapshot) await evmRevert(outerSnapshot); });

test.describe('Offset retirement (Path A) — bridge composer (devnet)', () => {
    let testSnapshot: string;
    test.beforeEach(async () => { testSnapshot = await evmSnapshot(); });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    test('approve → retire → record receipt — full Path A composition emits both events', async () => {
        const { coreAddress, tokenAddress, aggregator, receipts } = getAddresses();
        await ensureTokenApprovals(coreAddress, tokenAddress, BUYER_KEY, SELLER_KEY);

        const { processId } = await createRootOrder({
            buyerKey: BUYER_KEY, sellerKey: SELLER_KEY,
            coreAddress, tokenAddress, payment: 1_000000000000000000n,
        });

        const buyer = privateKeyToAccount(BUYER_KEY);
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const buyerClient = createWalletClient({ account: buyer, chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        // tonsToRetire is 1e18 fixed-point (1e18 = 1 tonne) — matches the
        // production Klima BCT / Toucan pool-token conventions and the
        // hook's gramsToTonsCeil1e18 output. The mock now divides by 1e18
        // internally, so 1 tonne costs 0.01 ETH = 1e16 wei — well within
        // the buyer's MockToken balance.
        const tons = 10n ** 18n;
        const amountIn = await publicClient.readContract({
            address: aggregator, abi: MOCK_OFFSET_AGGREGATOR_ABI,
            functionName: 'quote', args: [tons],
        });
        expect(amountIn).toBeGreaterThan(0n);

        // Step 1: approve(aggregator, amountIn)
        const { request: approveReq } = await publicClient.simulateContract({
            account: buyer.address, address: tokenAddress,
            abi: ERC20_ABI, functionName: 'approve', args: [aggregator, amountIn],
        });
        await publicClient.waitForTransactionReceipt({ hash: await buyerClient.writeContract(approveReq) });

        // Step 2: aggregator.retire — emits Retired
        const { request: retireReq } = await publicClient.simulateContract({
            account: buyer.address, address: aggregator,
            abi: MOCK_OFFSET_AGGREGATOR_ABI, functionName: 'retire',
            args: [tons, buyer.address as Hex, amountIn],
        });
        const retireTxHash = await buyerClient.writeContract(retireReq);
        await publicClient.waitForTransactionReceipt({ hash: retireTxHash });

        const retiredEvents = await publicClient.getContractEvents({
            address: aggregator, abi: MOCK_OFFSET_AGGREGATOR_ABI,
            eventName: 'Retired',
            args: { retiringAddress: buyer.address as Hex },
            fromBlock: 0n,
        });
        expect(retiredEvents.length).toBeGreaterThanOrEqual(1);
        const lastRetired = retiredEvents[retiredEvents.length - 1];
        expect(lastRetired.args.tonsRetired).toBe(tons);
        expect(lastRetired.args.inputAmount).toBe(amountIn);

        // Step 3: ProcessOffsetReceipt.record — emits ReceiptRecorded
        const { request: recordReq } = await publicClient.simulateContract({
            account: buyer.address, address: receipts,
            abi: PROCESS_OFFSET_RECEIPT_ABI, functionName: 'record',
            args: [processId, retireTxHash, aggregator, tons, tokenAddress, amountIn],
        });
        await publicClient.waitForTransactionReceipt({ hash: await buyerClient.writeContract(recordReq) });

        const receiptEvents = await publicClient.getContractEvents({
            address: receipts, abi: PROCESS_OFFSET_RECEIPT_ABI,
            eventName: 'ReceiptRecorded',
            args: { processId, buyer: buyer.address as Hex },
            fromBlock: 0n,
        });
        expect(receiptEvents.length).toBe(1);
        expect(receiptEvents[0].args.retirementTxHash).toBe(retireTxHash);
        expect(receiptEvents[0].args.aggregator?.toLowerCase()).toBe(aggregator.toLowerCase());
        expect(receiptEvents[0].args.tonsRetired).toBe(tons);
        expect(receiptEvents[0].args.inputAmount).toBe(amountIn);
    });

    test('record reverts NotRootBuyer when caller is not the rootBuyer of the process', async () => {
        const { coreAddress, tokenAddress, aggregator, receipts } = getAddresses();
        await ensureTokenApprovals(coreAddress, tokenAddress, BUYER_KEY, SELLER_KEY);

        // Seed a real process with BUYER as rootBuyer.
        const { processId } = await createRootOrder({
            buyerKey: BUYER_KEY, sellerKey: SELLER_KEY,
            coreAddress, tokenAddress, payment: 1_000000000000000000n,
        });

        // Outsider (anvil[2]) tries to record a fake receipt on the process.
        const outsider = privateKeyToAccount(OUTSIDER_KEY);
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        await expect(
            publicClient.simulateContract({
                account: outsider.address, address: receipts,
                abi: PROCESS_OFFSET_RECEIPT_ABI, functionName: 'record',
                args: [
                    processId,
                    `0x${'a'.repeat(64)}` as Hex,
                    aggregator,
                    parseEther('1'),
                    tokenAddress,
                    parseEther('0.01'),
                ],
            }),
        ).rejects.toThrow(/NotRootBuyer/);
    });
});
