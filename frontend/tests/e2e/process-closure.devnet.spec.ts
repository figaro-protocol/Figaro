/**
 * process-closure.devnet.spec.ts
 *
 * Kernel closure invariant: once `resolveProcess` is called, the processId
 * is permanently closed. A subsequent `commit` attempting to extend the
 * same processId reverts with `ProcessAlreadyResolved`.
 *
 * The closure is enforced via the existing `activeOrderCount` field —
 * `resolveProcess` sets it to 0, and `commit`'s sub-order branch refuses
 * when `activeOrderCount == 0 && rootBuyer != address(0)`. No new storage,
 * no lifecycle enum, no finalized flag — just a single check on data the
 * kernel already maintains.
 *
 * Parties wanting a follow-on bonded relationship sign a fresh root
 * commitment, getting a new processId. Cross-process composition is the
 * supported pattern; same-processId re-extension is not.
 *
 * This test is the live-chain guard against any future regression that
 * weakens or removes the closure gate.
 *
 * No UI surface — the test drives FigaroCore via viem directly.
 */
import { test, expect } from '@playwright/test';
import {
    defineChain,
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

let outerSnapshot: string;
test.beforeAll(async () => { outerSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (outerSnapshot) await evmRevert(outerSnapshot); });

test.describe('Kernel process closure (devnet)', () => {
    let testSnapshot: string;
    test.beforeEach(async () => { testSnapshot = await evmSnapshot(); });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    test('post-resolve sub-order commit reverts with ProcessAlreadyResolved', async () => {
        const config = readLocalDeploymentConfig();
        const coreAddress = (process.env.NEXT_PUBLIC_FIGARO_CORE
            ?? config.figaroCore) as Hex;
        const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS
            ?? config.tokenAddress) as Hex;

        await ensureTokenApprovals(coreAddress, tokenAddress, BUYER_KEY, SELLER1_KEY, SELLER2_KEY);

        // ── Round 1: root commit + resolve ────────────────────────────
        const rootPayment = 1_000000000000000000n;
        const { processId, orderHash: rootOrderHash } = await createRootOrder({
            buyerKey: BUYER_KEY, sellerKey: SELLER1_KEY,
            coreAddress, tokenAddress, payment: rootPayment,
        });

        await resolveProcessOnChain({
            processId, orderHashes: [rootOrderHash],
            buyerKey: BUYER_KEY, coreAddress,
        });

        // ── Attempt a sub-order on the now-closed processId ────────────
        // Must revert. cumulativeValue persists at 1e18 from the resolved
        // round, but the closure gate trips before the cumulative check.
        const round2Payment = 500000000000000000n;
        let error: Error | null = null;
        try {
            await createSubOrder({
                processId, buyerKey: BUYER_KEY, sellerKey: SELLER2_KEY,
                coreAddress, tokenAddress, payment: round2Payment,
                parentOrderHashes: [rootOrderHash],
            });
        } catch (e) {
            error = e as Error;
        }

        expect(error).not.toBeNull();
        // The revert reason is `ProcessAlreadyResolved` — viem surfaces the
        // contract error name in the thrown error's message.
        expect(error?.message ?? '').toMatch(/ProcessAlreadyResolved/);
    });
});
