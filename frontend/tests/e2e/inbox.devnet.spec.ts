/**
 * inbox.devnet.spec.ts
 *
 * /inbox is the merchant entry point — surfaces every active root
 * order where the connected wallet is the seller-of-record.
 * `incoming-orders.spec.ts` covers the mock-mode shell + wallet gate;
 * this spec adds devnet coverage with a real on-chain order that the
 * inbox must surface.
 *
 * Also doubles as a regression test for `useWalletProcessRows`'s
 * root-order filter — pre-this-session the filter compared
 * `processId === orderHash`, which was true in legacy commits but
 * never matched V5 (`orderHash = keccak256(processId || structHash)`).
 * If that filter ever drifts back, this test fails immediately.
 *
 * Requires: Anvil + ./deploy-local.sh
 */
import { test, expect, ANVIL_ACCOUNTS } from './devnet-multi-test';
import {
    createRootOrder,
    ensureTokenApprovals,
    evmRevert,
    evmSnapshot,
    readLocalDeploymentConfig,
} from './devnet-helpers';
import type { Hex } from 'viem';

const BUYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const SELLER_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;
const SELLER_ADDR = ANVIL_ACCOUNTS[1];

let outerSnapshot: string;
test.beforeAll(async () => { outerSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (outerSnapshot) await evmRevert(outerSnapshot); });

test.describe('/inbox (devnet)', () => {
    let testSnapshot: string;
    test.beforeEach(async () => { testSnapshot = await evmSnapshot(); });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    test('seller sees an active row for an on-chain order where they are the counterparty', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const coreAddress = (process.env.NEXT_PUBLIC_FIGARO_CORE
            ?? config.figaroCore) as Hex;
        const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS
            ?? config.tokenAddress) as Hex;

        await ensureTokenApprovals(coreAddress, tokenAddress, BUYER_KEY, SELLER_KEY);
        const { processId } = await createRootOrder({
            buyerKey: BUYER_KEY,
            sellerKey: SELLER_KEY,
            coreAddress,
            tokenAddress,
            payment: 1_000000000000000000n,
        });

        // Rotate the active account to the seller wallet BEFORE wagmi
        // mounts so /inbox sees the seller. The default page fixture
        // (devnet-multi-test) already injected inject-ethereum-multi.js
        // which exposes __FIGARO_SWITCH_ACCOUNT__.
        await page.addInitScript((addr: string) => {
            if (typeof (window as any).__FIGARO_SWITCH_ACCOUNT__ === 'function') {
                (window as any).__FIGARO_SWITCH_ACCOUNT__(addr);
            }
        }, SELLER_ADDR);

        await page.goto('/inbox?e2e=devnet', { waitUntil: 'domcontentloaded' });
        await page.getByTestId('merchant-inbox').waitFor({ timeout: 30000 });

        const activeRow = page.getByTestId(`inbox-active-row-${processId}`);
        await expect(activeRow).toBeVisible({ timeout: 30000 });

        // The row links to the seller's per-order page.
        await expect(activeRow).toHaveAttribute('href', `/orders/${processId}`);
    });
});
