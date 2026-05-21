/**
 * onsite-purchase.devnet.spec.ts
 *
 * End-to-end on-site purchase against the SEEDED Counter & Co. operator —
 * the scenario `merchant-place-order.devnet.spec.ts` cannot reach because
 * it self-seeds a binding-less merchant.
 *
 * Counter & Co. (anvil[5]) is registered by `scripts/seed-devnet.mjs` and
 * bound on-chain to the `direct-sale` assembly. That binding drives the
 * fulfilment choice: `useMerchantBoundModalities` resolves the bound
 * assembly's `figaro-fulfilment-v2` clause (`modalities: [consume-onsite]`)
 * and `MerchantDetailView` narrows the dropdown to it — the binding-driven
 * path a binding-less merchant never exercises (it falls back to all six
 * modes).
 *
 * The walk:
 *   - buyer (anvil[0]) opens /m/<Counter & Co.>
 *   - the fulfilment dropdown offers ONLY consume-onsite (binding-driven)
 *   - add the seeded catalogue item, pick consume-onsite, place the order
 *   - the commit redirects to /orders/<processId>; kernel state: 1 active order
 *   - buyer confirms receipt -> resolveProcess -> the process settles (Resolved)
 *
 * Requires Anvil + ./deploy-local.sh + Kubo + a seeded devnet.
 * `npm run test:e2e:devnet` runs `seed-devnet.mjs` before the suite.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from './devnet-multi-test';
import {
    createPublicClient,
    defineChain,
    http,
    parseAbi,
    type Hex,
} from 'viem';
import {
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

// Buyer — anvil[0], the default ?e2e=devnet account. Holds 1M MOCK from
// the MockToken constructor mint to the deployer.
const BUYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const BUYER_ADDR = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;

// Counter & Co. — seeded operator (seed-devnet.mjs OPERATORS[0]) on
// anvil[5], bound to `direct-sale`. Holds 100k MOCK from the Deploy.s.sol
// testAccounts mint. anvil[5..8] are disjoint from the test suite's
// anvil[0..4] range, so transacting against it never collides.
const COUNTER_CO_ADDR = '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc' as const;
const COUNTER_CO_KEY = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba' as const;

// The seeded catalogue's single item — read from the same fixture
// `seed-devnet.mjs` replays, so a fixture re-capture moves spec + seed
// together (the per-run item `id` is not otherwise stable).
const catalogueFixture = JSON.parse(
    fs.readFileSync(
        path.resolve(__dirname, '../../scripts/fixtures/operator-catalogue.json'),
        'utf8',
    ),
) as { menu: Array<{ id: string; name: string }> };
const ITEM = catalogueFixture.menu[0];

const PROCESSES_ABI = parseAbi([
    'function processes(bytes32) view returns (address rootBuyer, address currency, uint256 cumulativeValue, uint32 activeOrderCount)',
]);

function deploymentAddresses(): { core: Hex; token: Hex } {
    const config = readLocalDeploymentConfig();
    return {
        core: (process.env.NEXT_PUBLIC_FIGARO_CORE ?? config.figaroCore) as Hex,
        token: (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex,
    };
}

let outerSnapshot: string;
test.beforeAll(async () => { outerSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (outerSnapshot) await evmRevert(outerSnapshot); });

test.describe('On-site purchase from seeded Counter & Co. (devnet)', () => {
    let testSnapshot: string;
    test.beforeEach(async () => { testSnapshot = await evmSnapshot(); });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    // Catalogue discovery + binding resolution + sign + commit + resolve.
    test.setTimeout(240_000);

    test('buyer browses the bound merchant, places a consume-onsite order, confirms receipt → Resolved', async ({ page }) => {
        const { core, token } = deploymentAddresses();

        // Pre-approve both parties so the spec stays on the commit +
        // resolve path (permit.devnet covers approval-via-UI).
        await ensureTokenApprovals(core, token, BUYER_KEY, COUNTER_CO_KEY);

        // Accept every window.confirm — the place-order path may raise a
        // defensive one, and /orders confirm-receipt raises two
        // (handleConfirmReceipt + executeTransactionCapability's guard).
        page.on('dialog', (dialog) => { dialog.accept().catch(() => {}); });

        // ── Browse the seeded merchant ───────────────────────────────
        await page.goto(`/m/${COUNTER_CO_ADDR}?e2e=devnet`, { waitUntil: 'domcontentloaded' });

        const detailView = page.getByTestId('merchant-detail-view');
        try {
            await detailView.waitFor({ state: 'visible', timeout: 30000 });
        } catch {
            // Catalogue discovery can lag the first mount.
            await page.reload({ waitUntil: 'domcontentloaded' });
            await detailView.waitFor({ state: 'visible', timeout: 30000 });
        }
        await expect(detailView).toContainText('Counter & Co.');

        // ── Add the seeded catalogue item ────────────────────────────
        const menuItem = page.getByTestId(`menu-item-${ITEM.id}`);
        try {
            await menuItem.waitFor({ state: 'visible', timeout: 15000 });
        } catch {
            await page.reload({ waitUntil: 'domcontentloaded' });
            await detailView.waitFor({ state: 'visible', timeout: 30000 });
            await menuItem.waitFor({ state: 'visible', timeout: 30000 });
        }
        await page.getByTestId(`btn-add-${ITEM.id}`).click();
        await expect(page.getByTestId(`cart-line-${ITEM.id}`)).toBeVisible({ timeout: 10000 });

        // ── Binding-driven fulfilment ────────────────────────────────
        // Counter & Co. is bound to `direct-sale`, whose figaro-fulfilment-v2
        // clause declares modalities: [consume-onsite]. useMerchantBoundModalities
        // resolves that binding off-chain and MerchantDetailView filters the
        // dropdown to it — `pickup` drops out once the binding resolves. A
        // binding-less merchant keeps all six modes, so the absence of
        // `pickup` is the binding-driven assertion.
        await expect(page.getByTestId('option-fulfilment-pickup')).toHaveCount(0, { timeout: 20000 });
        await expect(page.getByTestId('option-fulfilment-consume-onsite')).toHaveCount(1);
        await page.getByTestId('select-fulfilment-mode').selectOption('consume-onsite');

        // ── Place the order ──────────────────────────────────────────
        await page.getByTestId('btn-place-order').click();

        // AgreementPreviewModal gates the signature — signCommitment always
        // posts the preview; confirm it to proceed to the wallet prompt.
        await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 15000 });
        await page.getByTestId('preview-confirm').click();

        // ── Commit landed → redirect to /orders/<processId> ──────────
        await page.waitForURL(/\/orders\/0x[0-9a-fA-F]+/, { timeout: 90000 });
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
        await expect(page.getByTestId('order-timeline-view')).toContainText('You are the buyer');

        const match = page.url().match(/\/orders\/(0x[0-9a-fA-F]+)/);
        expect(match, `expected /orders/<hex> in URL: ${page.url()}`).toBeTruthy();
        const processId = match![1] as Hex;

        // Kernel cross-check — payment committed, one order active, the
        // buyer is rootBuyer.
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const committed = await publicClient.readContract({
            address: core, abi: PROCESSES_ABI, functionName: 'processes', args: [processId],
        });
        expect(committed[0].toLowerCase()).toBe(BUYER_ADDR.toLowerCase()); // rootBuyer
        expect(committed[3]).toBe(1); // activeOrderCount

        // ── Buyer confirms receipt → resolveProcess → Resolved ───────
        const confirmBtn = page.getByTestId('btn-confirm-receipt');
        await confirmBtn.waitFor({ timeout: 30000 });
        await confirmBtn.click();
        await expect(page.getByTestId('order-status-pill')).toHaveText('Completed', { timeout: 90000 });

        // The process settled — no orders left active in the kernel.
        const resolved = await publicClient.readContract({
            address: core, abi: PROCESSES_ABI, functionName: 'processes', args: [processId],
        });
        expect(resolved[3]).toBe(0); // activeOrderCount → 0
    });
});
