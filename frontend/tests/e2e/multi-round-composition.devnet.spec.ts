/**
 * multi-round-composition.devnet.spec.ts
 *
 * Kernel composability invariant: a process is NOT finalized at resolve.
 * resolveProcess clears activeOrderCount but leaves rootBuyer, currency,
 * and cumulativeValue intact (FigaroCore.sol's ProcessState struct
 * carries no "resolved" flag — that's a deliberate design decision
 * per docs/v5/DESIGN_DECISIONS.md). Therefore a buyer can commit a
 * fresh sub-order extending the same processId after the process has
 * been resolved — the next commit picks up cumulativeValue where the
 * previous round left off.
 *
 * This test is the live-chain guard against any future regression that
 * reintroduces a finalized flag (Common-Misframing #1 in CLAUDE.md).
 * Foundry tests already cover the kernel logic; this test adds the
 * frontend-tier viem path that the SDK exposes.
 *
 * No UI surface — the test drives FigaroCore via viem directly.
 */
import { test, expect } from '@playwright/test';
import {
    createPublicClient,
    defineChain,
    http,
    parseAbi,
    type Hex,
} from 'viem';
import {
    createRootOrder,
    createSubOrder,
    ensureTokenApprovals,
    evmRevert,
    evmSnapshot,
    readLocalDeploymentConfig,
    resolveProcessOnChain,
} from './devnet-helpers';
import { ZERO_ADDRESS } from '../../lib/shared/evm';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});

const BUYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const SELLER1_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;
const SELLER2_KEY = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a' as const;

const CORE_VIEW_ABI = parseAbi([
    'function processes(bytes32 processId) view returns (address rootBuyer, address currency, uint256 cumulativeValue, uint32 activeOrderCount)',
    'function orderStatus(bytes32 orderHash) view returns (uint8)',
]);

let outerSnapshot: string;
test.beforeAll(async () => { outerSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (outerSnapshot) await evmRevert(outerSnapshot); });

test.describe('Kernel multi-round composition (devnet)', () => {
    let testSnapshot: string;
    test.beforeEach(async () => { testSnapshot = await evmSnapshot(); });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    test('commit → resolve → commit again on the same process extends cumulativeValue', async () => {
        const config = readLocalDeploymentConfig();
        const coreAddress = (process.env.NEXT_PUBLIC_FIGARO_CORE
            ?? config.figaroCore) as Hex;
        const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS
            ?? config.tokenAddress) as Hex;

        await ensureTokenApprovals(coreAddress, tokenAddress, BUYER_KEY, SELLER1_KEY, SELLER2_KEY);
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });

        // ── Round 1: root commit ─────────────────────────────────────────
        const rootPayment = 1_000000000000000000n;
        const { processId, orderHash: rootOrderHash } = await createRootOrder({
            buyerKey: BUYER_KEY, sellerKey: SELLER1_KEY,
            coreAddress, tokenAddress, payment: rootPayment,
        });

        let state = await publicClient.readContract({
            address: coreAddress, abi: CORE_VIEW_ABI,
            functionName: 'processes', args: [processId],
        });
        expect(state[2]).toBe(rootPayment); // cumulativeValue
        expect(state[3]).toBe(1); // activeOrderCount

        // ── Round 1 resolution: clears activeOrderCount, keeps everything else ──
        await resolveProcessOnChain({
            processId, orderHashes: [rootOrderHash],
            buyerKey: BUYER_KEY, coreAddress,
        });

        state = await publicClient.readContract({
            address: coreAddress, abi: CORE_VIEW_ABI,
            functionName: 'processes', args: [processId],
        });
        expect(state[0].toLowerCase()).not.toBe(ZERO_ADDRESS);
        expect(state[2]).toBe(rootPayment); // cumulativeValue persists
        expect(state[3]).toBe(0); // activeOrderCount cleared

        // ── Round 2: NEW commit extending the same processId ────────────
        // If a "finalized" flag had been added, this commit would revert.
        // Kernel doctrine forbids that flag (DESIGN_DECISIONS.md) —
        // composability matters more than convenience-of-resolution.
        const round2Payment = 500000000000000000n;
        const { orderHash: round2OrderHash } = await createSubOrder({
            processId, buyerKey: BUYER_KEY, sellerKey: SELLER2_KEY,
            coreAddress, tokenAddress, payment: round2Payment,
            parentOrderHashes: [rootOrderHash],
        });

        state = await publicClient.readContract({
            address: coreAddress, abi: CORE_VIEW_ABI,
            functionName: 'processes', args: [processId],
        });
        expect(state[2]).toBe(rootPayment + round2Payment); // cumulativeValue extended
        expect(state[3]).toBe(1); // round-2 order is now active

        // ── Round 2 resolution: process settles cleanly again ────────────
        await resolveProcessOnChain({
            processId, orderHashes: [round2OrderHash],
            buyerKey: BUYER_KEY, coreAddress,
        });

        state = await publicClient.readContract({
            address: coreAddress, abi: CORE_VIEW_ABI,
            functionName: 'processes', args: [processId],
        });
        expect(state[2]).toBe(rootPayment + round2Payment); // cumulativeValue still persists
        expect(state[3]).toBe(0);
    });
});
