/**
 * local-commerce-purchase.devnet.spec.ts
 *
 * End-to-end local-commerce purchase against the SEEDED Mercato General
 * seller — which carries an ARRAY of two bound assemblies
 * (`direct-sale` + `local-commerce`). The checkout reads that array and
 * surfaces each as a buyer option; the buyer picks `local-commerce`, and
 * the checkout drives a two-order process: the food order (buyer↔merchant)
 * and the courier order (buyer↔Swift Courier), the courier resolved from
 * the seller's seller-assigned `counterpartyBindings` roster.
 *
 * This is the "test the array of assemblies" scenario — the seller's
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
    parseEther,
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

// Mercato General — seeded seller (seed-devnet.mjs SELLERS[3]) on
// anvil[8], bound to BOTH `direct-sale` and `local-commerce` — the array
// of assemblies. Its local-commerce binding designates Swift Courier
// (anvil[7]) as the seller-assigned courier.
const MERCATO_ADDR = '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f' as const;

// The seeded catalogue's single item — read from the same fixture the
// seed replays, so a fixture re-capture moves spec + seed together.
const catalogueFixture = JSON.parse(
    fs.readFileSync(
        path.resolve(__dirname, '../../scripts/fixtures/seller-catalogue.json'),
        'utf8',
    ),
) as { menu: Array<{ id: string; name: string; price: string }> };
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

    test('buyer picks local-commerce from the seller assembly array — food + courier orders both commit', async ({ page }) => {
        const { core, token } = deploymentAddresses();

        // Pre-approve the buyer; the devnet commit shortcut auto-approves
        // each counterparty (merchant, then courier) per commit.
        await ensureTokenApprovals(core, token, BUYER_KEY);

        // Accept every window.confirm the commit path raises.
        page.on('dialog', (dialog) => { dialog.accept().catch(() => {}); });

        // ── Browse the seeded merchant ───────────────────────────────
        await page.goto(`/s/${MERCATO_ADDR}?e2e=devnet`, { waitUntil: 'domcontentloaded' });

        const detailView = page.getByTestId('seller-detail-view');
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
        // Mercato General binds four assemblies; once useSellerBoundAssemblies
        // resolves, the checkout surfaces each as a buyer option — including
        // direct-sale → consume-onsite and local-commerce → deliver:seller-assigned.
        // Their presence is the "frontend read the seller's array" check.
        await expect(page.getByTestId('option-fulfilment-deliver:seller-assigned')).toHaveCount(1, { timeout: 20000 });
        await expect(page.getByTestId('option-fulfilment-consume-onsite')).toHaveCount(1);

        // Pick the local-commerce assembly (seller-assigned delivery).
        await page.getByTestId('select-fulfilment-mode').selectOption('deliver:seller-assigned');

        // Delivery fulfilment requires a delivery location — the geohash is
        // committed to the courier order's figaro-geo-v2 section.
        await page.getByTestId('input-delivery-geohash').fill('dr5regw3pg');
        // The human-readable street address rides the coordination channel.
        await page.getByTestId('input-delivery-address').fill('12 Market St, Apt 4B — ring bell');

        // ── Pick the courier from the merchant's partner list ────────
        // seller-assigned: SellerCataloguePicker surfaces the merchant's
        // designated couriers — pick Swift Courier, then Standard delivery
        // from the courier's catalogue price list.
        await page.getByTestId('select-seller-partner').selectOption({ label: 'Swift Courier' });
        const deliveryItem = page.getByTestId('seller-item-delivery-standard');
        await deliveryItem.waitFor({ state: 'visible', timeout: 30000 });
        await deliveryItem.click();

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

        // The courier payment is the Mercato-negotiated rate (0.3), resolved
        // off Swift Courier's own catalogue — not the courier's public 0.5.
        // cumulativeValue = the food order + the courier order.
        expect(state[2]).toBe(parseEther(ITEM.price) + parseEther('0.3'));

        // The committed courier order carries the assembly's proximity-policy
        // handoff clause AND the buyer's delivery geohash on its figaro-geo-v2
        // section. Both agreements the buyer witnessed are saved to
        // localStorage; the courier one is identified by its proximity clause.
        const courierClauses = await page.evaluate(() => {
            for (let i = 0; i < window.localStorage.length; i++) {
                const key = window.localStorage.key(i);
                if (!key?.startsWith('figaro:agreement:')) continue;
                try {
                    const ag = JSON.parse(window.localStorage.getItem(key) ?? '') as {
                        sections?: Array<{ clause?: string; data?: Record<string, unknown> }>;
                    };
                    const sections = ag.sections ?? [];
                    if (!sections.some((s) => s.clause === 'figaro-proximity-policy-v1')) continue;
                    const geo = sections.find((s) => s.clause === 'figaro-geo-v2');
                    const geoData = geo?.data as
                        { originGeohash?: string; destinationGeohash?: string } | undefined;
                    return {
                        found: true,
                        originGeohash: geoData?.originGeohash ?? null,
                        destinationGeohash: geoData?.destinationGeohash ?? null,
                    };
                } catch { /* not an agreement document — skip */ }
            }
            return { found: false, originGeohash: null, destinationGeohash: null };
        });
        expect(
            courierClauses.found,
            'the committed courier order should carry figaro-proximity-policy-v1',
        ).toBe(true);
        expect(
            courierClauses.destinationGeohash,
            'the courier order geo section carries the buyer delivery geohash',
        ).toBe('dr5regw3pg');
        expect(
            courierClauses.originGeohash,
            "the courier order geo section carries Mercato's pickup geohash",
        ).toBe('dr5regw7');

        // The buyer sent the human-readable street address to the courier
        // over the coordination channel — a HANDOFF_ADDRESS message persists.
        const sentAddress = await page.evaluate(() => {
            const raw = window.localStorage.getItem('__FIGARO_COORDINATION_MOCK_MESSAGES__');
            if (!raw) return null;
            try {
                const msgs = JSON.parse(raw) as Array<{ type?: string; deliveryAddress?: string }>;
                return msgs.find((m) => m.type === 'HANDOFF_ADDRESS')?.deliveryAddress ?? null;
            } catch { return null; }
        });
        expect(
            sentAddress,
            'the buyer sent the delivery address over the coordination channel',
        ).toBe('12 Market St, Apt 4B — ring bell');

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
