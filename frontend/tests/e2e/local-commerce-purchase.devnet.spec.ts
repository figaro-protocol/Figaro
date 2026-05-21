/**
 * local-commerce-purchase.devnet.spec.ts
 *
 * End-to-end local-commerce purchase against the SEEDED Mercato General
 * operator — which carries an ARRAY of two bound assemblies
 * (`direct-sale` + `local-commerce`). The checkout reads that array and
 * surfaces each as a buyer option; the buyer picks `local-commerce`, and
 * the checkout drives a two-order process: the food order (buyer↔merchant)
 * and the courier order (buyer↔Swift Courier), the courier resolved from
 * the operator's seller-assigned `counterpartyBindings` roster.
 *
 * This is the "test the array of assemblies" scenario — the operator's
 * `assemblyBindings[]` is the array; the frontend reads it, surfaces each
 * as an option, and the chosen assembly drives the process.
 *
 * It carries through to resolve — the buyer confirms receipt and the
 * kernel atomically settles both orders. What it does NOT yet cover: the
 * coordination + handoff stages between commit and resolve — those follow
 * once the courier-process interface is assembly-clause driven.
 *
 * Requires Anvil + ./deploy-local.sh + Kubo + a seeded devnet.
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

// Buyer — anvil[0], the default ?e2e=devnet account.
const BUYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const BUYER_ADDR = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;

// Mercato General — seeded operator (seed-devnet.mjs OPERATORS[3]) on
// anvil[8], bound to BOTH `direct-sale` and `local-commerce` — the array
// of assemblies. Its local-commerce binding designates Swift Courier
// (anvil[7]) as the seller-assigned courier.
const MERCATO_ADDR = '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f' as const;

// The seeded catalogue's single item — read from the same fixture the
// seed replays, so a fixture re-capture moves spec + seed together.
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

test.describe('Local-commerce purchase from seeded Mercato General (devnet)', () => {
    let testSnapshot: string;
    test.beforeEach(async () => { testSnapshot = await evmSnapshot(); });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    // Catalogue discovery + binding resolution + two sequential commits.
    test.setTimeout(300_000);

    test('buyer picks local-commerce from the operator assembly array — food + courier orders both commit', async ({ page }) => {
        const { core, token } = deploymentAddresses();

        // Pre-approve the buyer; the devnet commit shortcut auto-approves
        // each counterparty (merchant, then courier) per commit.
        await ensureTokenApprovals(core, token, BUYER_KEY);

        // Accept every window.confirm the commit path raises.
        page.on('dialog', (dialog) => { dialog.accept().catch(() => {}); });

        // ── Browse the seeded merchant ───────────────────────────────
        await page.goto(`/m/${MERCATO_ADDR}?e2e=devnet`, { waitUntil: 'domcontentloaded' });

        const detailView = page.getByTestId('merchant-detail-view');
        try {
            await detailView.waitFor({ state: 'visible', timeout: 30000 });
        } catch {
            await page.reload({ waitUntil: 'domcontentloaded' });
            await detailView.waitFor({ state: 'visible', timeout: 30000 });
        }
        await expect(detailView).toContainText('Mercato General');

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

        // ── The array of assemblies ──────────────────────────────────
        // Mercato General binds two assemblies; once useMerchantBoundAssemblies
        // resolves, the checkout surfaces BOTH as buyer options — direct-sale
        // → consume-onsite, local-commerce → deliver:seller-assigned. The
        // presence of both is the "frontend read the operator's array" check.
        await expect(page.getByTestId('option-fulfilment-deliver:seller-assigned')).toHaveCount(1, { timeout: 20000 });
        await expect(page.getByTestId('option-fulfilment-consume-onsite')).toHaveCount(1);

        // Pick the local-commerce assembly (seller-assigned delivery).
        await page.getByTestId('select-fulfilment-mode').selectOption('deliver:seller-assigned');

        // ── Place the order — two sequential commits ─────────────────
        await page.getByTestId('btn-place-order').click();

        // The food commit and the courier commit each gate on the
        // AgreementPreviewModal (signCommitment → requestSignConfirmation);
        // confirm both, in order.
        for (let i = 0; i < 2; i++) {
            const modal = page.getByTestId('agreement-preview-modal');
            await modal.waitFor({ state: 'visible', timeout: 45000 });
            await page.getByTestId('preview-confirm').click();
            await modal.waitFor({ state: 'hidden', timeout: 45000 });
        }

        // ── Both orders committed → /orders/<processId> ──────────────
        await page.waitForURL(/\/orders\/0x[0-9a-fA-F]+/, { timeout: 90000 });
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });

        const match = page.url().match(/\/orders\/(0x[0-9a-fA-F]+)/);
        expect(match, `expected /orders/<hex> in URL: ${page.url()}`).toBeTruthy();
        const processId = match![1] as Hex;

        // Kernel cross-check — the process carries TWO active orders (the
        // food order + the courier order), buyer-rooted.
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const state = await publicClient.readContract({
            address: core, abi: PROCESSES_ABI, functionName: 'processes', args: [processId],
        });
        expect(state[0].toLowerCase()).toBe(BUYER_ADDR.toLowerCase()); // rootBuyer
        expect(state[3]).toBe(2); // activeOrderCount — food + courier

        // ── Buyer confirms receipt → resolveProcess settles both orders ──
        const confirmBtn = page.getByTestId('btn-confirm-receipt');
        await confirmBtn.waitFor({ timeout: 30000 });
        await confirmBtn.click();
        await expect(page.getByTestId('order-status-pill')).toHaveText('Completed', { timeout: 90000 });

        // Atomic resolution — the whole process settled, both orders at once.
        const resolved = await publicClient.readContract({
            address: core, abi: PROCESSES_ABI, functionName: 'processes', args: [processId],
        });
        expect(resolved[3]).toBe(0); // activeOrderCount → 0
    });
});
