/**
 * kit-assembly-runtime.devnet.spec.ts
 *
 * End-to-end runtime for the `kit-assembly` diamond against the SEEDED Mercato
 * General seller (anvil[8]) — the lead/coordinator the buyer browses.
 *
 * The scenario (the diamond as a "productive" process of independent
 * value-adders): the buyer selects PRODUCT 212 from Mercato's catalogue.
 * The product names its assembly (`assemblySlug: "kit-assembly"`), so the
 * PRODUCT picks the process — not a fulfilment-mode dropdown. Product 212 is a
 * four-order diamond:
 *
 *        A  (Mercato — coordinate)        figaro-merchant-process-v1
 *       / \
 *      B   C    B = Swift (proximity), C = Rosso (GHG)
 *       \ /
 *        D  (Mercato — assemble/serve)    proximity-policy, parents [B, C]
 *
 * Mercato sells TWO orders (A coordinate + D assemble) — a single wallet may
 * sell more than one order in a process (the one-seller-per-process rule was
 * dropped; FigaroCore.commit only enforces buyer == rootBuyer). The order page
 * surfaces a per-order switcher for such a wallet.
 *
 * What Figaro shows that traditional trade hides: the buyer sees each
 * contributor's actual cut, and ONE resolveProcess call pays A, B, C, D —
 * Swift and Rosso are paid from the same settlement that pays Mercato, not
 * redistributed off-ledger.
 *
 * Per-order payments — A's is the product price (1.0); B/C/D come from the
 * assembly assemblyDoc (0.5 / 0.5 / 0.25). Each seller NETS its payment across
 * commit (posts 2× cumulative bond) + resolve (recovers bond + payment):
 *   Mercato (A + D) → +1.25 · Swift (B) → +0.5 · Rosso (C) → +0.5.
 *
 * Requires Anvil + ./deploy-local.sh + ./deploy-mock-kleros.sh + Kubo + a
 * seeded devnet (Mercato bound to kit-assembly).
 */
import { test, expect, gotoAsWallet } from './devnet-multi-test';
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

// The four diamond sellers (seeded sellers). Mercato is the lead (A) AND the
// assembler (D); Swift fills B, Rosso fills C — resolved from Mercato's
// kit-assembly counterpartyBindings (proximity-policy → [Swift, Mercato],
// ghg-measurement → [Rosso]).
const MERCATO_ADDR = '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f' as const; // A + D
const SWIFT_ADDR = '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955' as const;   // B
const ROSSO_ADDR = '0x976EA74026E726554dB657fA54763abd0C3a0aa9' as const;   // C

// Seeded kit product (seed-devnet.mjs Mercato.kitProduct).
const KIT_PRODUCT_ID = 'product-212';

const PROCESSES_ABI = parseAbi([
    'function processes(bytes32) view returns (address rootBuyer, address currency, uint256 cumulativeValue, uint32 activeOrderCount)',
]);
const ERC20_ABI = parseAbi(['function balanceOf(address) view returns (uint256)']);

function deployment(): { core: Hex; token: Hex } {
    const config = readLocalDeploymentConfig();
    return {
        core: (process.env.NEXT_PUBLIC_FIGARO_CORE ?? config.figaroCore) as Hex,
        token: (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex,
    };
}

let outerSnapshot: string;
test.beforeAll(async () => { outerSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (outerSnapshot) await evmRevert(outerSnapshot); });

test.describe('Kit-assembly runtime — four sellers, one transparent settlement (devnet)', () => {
    let testSnapshot: string;
    test.beforeEach(async () => { testSnapshot = await evmSnapshot(); });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    // Catalogue discovery + binding resolution + four sequential commits + resolve.
    test.setTimeout(360_000);

    test('buyer picks product 212 → four orders commit → one resolve pays every seller its cut', async ({ page }) => {
        const { core, token } = deployment();

        // Pre-approve the buyer; the devnet commit shortcut auto-approves each
        // seller (Mercato, Swift, Rosso) per commit as it posts their bond.
        await ensureTokenApprovals(core, token, BUYER_KEY);

        // Accept every window.confirm the commit + confirm-receipt paths raise.
        page.on('dialog', (dialog) => { dialog.accept().catch(() => {}); });

        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const balanceOf = (who: Hex) => publicClient.readContract({
            address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who],
        });

        // Seller balances BEFORE the process — net change after resolve is each
        // seller's cut (bond posted at commit is recovered at resolve; only the
        // payment remains).
        const before = {
            mercato: await balanceOf(MERCATO_ADDR),
            swift: await balanceOf(SWIFT_ADDR),
            rosso: await balanceOf(ROSSO_ADDR),
        };

        // ── Browse Mercato + add product 212 ─────────────────────────
        await page.goto(`/s/${MERCATO_ADDR}?e2e=devnet`, { waitUntil: 'domcontentloaded' });
        const detailView = page.getByTestId('seller-detail-view');
        try {
            await detailView.waitFor({ state: 'visible', timeout: 30000 });
        } catch {
            await page.reload({ waitUntil: 'domcontentloaded' });
            await detailView.waitFor({ state: 'visible', timeout: 30000 });
        }
        await expect(detailView).toContainText('Mercato General');

        const kitItem = page.getByTestId(`menu-item-${KIT_PRODUCT_ID}`);
        try {
            await kitItem.waitFor({ state: 'visible', timeout: 15000 });
        } catch {
            await page.reload({ waitUntil: 'domcontentloaded' });
            await detailView.waitFor({ state: 'visible', timeout: 30000 });
            await kitItem.waitFor({ state: 'visible', timeout: 30000 });
        }
        await page.getByTestId(`btn-add-${KIT_PRODUCT_ID}`).click();
        await expect(page.getByTestId(`cart-line-${KIT_PRODUCT_ID}`)).toBeVisible({ timeout: 10000 });

        // ── Product-driven selection ─────────────────────────────────
        // The product names the kit assembly, so the fulfilment-mode dropdown
        // is replaced by the assembly note and place-order is enabled without a
        // modality pick.
        await expect(page.getByTestId('product-assembly-note')).toContainText('kit-assembly', { timeout: 10000 });
        await expect(page.getByTestId('select-fulfilment-mode')).toHaveCount(0);

        // ── Transparent pricing ──────────────────────────────────────
        // The cart shows each contributor's cut, priced live from that
        // contributor's own catalogue (Swift + Rosso each negotiated 0.5 with
        // Mercato), plus Mercato's own coordinate (1.0) + assemble (0.25) =
        // 2.25 total. The buyer sees what every seller actually gets.
        const breakdown = page.getByTestId('cart-contributor-breakdown');
        await expect(breakdown).toBeVisible({ timeout: 20000 });
        await expect(breakdown).toContainText('Swift Courier');
        await expect(breakdown).toContainText('Rosso Kitchen');
        await expect(page.getByTestId('cart-kit-total')).toContainText('2.25', { timeout: 20000 });

        // ── Place the order — four sequential commits ────────────────
        await page.getByTestId('btn-place-order').click();
        // Four sequential commits (A, B, C, D), each gated by the pre-sign
        // agreement-preview modal.
        for (let i = 0; i < 4; i++) {
            const modal = page.getByTestId('agreement-preview-modal');
            await modal.waitFor({ state: 'visible', timeout: 60000 });
            await page.getByTestId('preview-confirm').click();
            await modal.waitFor({ state: 'hidden', timeout: 60000 });
        }

        // ── All four committed → /orders/<processId> ─────────────────
        await page.waitForURL(/\/orders\/0x[0-9a-fA-F]+/, { timeout: 120000 });
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
        const match = page.url().match(/\/orders\/(0x[0-9a-fA-F]+)/);
        expect(match, `expected /orders/<hex> in URL: ${page.url()}`).toBeTruthy();
        const processId = match![1] as Hex;

        // Kernel cross-check — four active orders, buyer-rooted, cumulative =
        // A(1) + B(0.5) + C(0.5) + D(0.25).
        const committed = await publicClient.readContract({
            address: core, abi: PROCESSES_ABI, functionName: 'processes', args: [processId],
        });
        expect(committed[0].toLowerCase()).toBe(BUYER_ADDR.toLowerCase()); // rootBuyer
        expect(committed[3]).toBe(4); // activeOrderCount — A, B, C, D
        expect(committed[2]).toBe(parseEther('2.25')); // cumulativeValue

        // ── Mercato sells two orders → the per-order switcher ────────
        // A (coordinate) + D (assemble). The dropped one-seller-per-process
        // rule lets one wallet hold both; the order page surfaces a switcher.
        await gotoAsWallet(page, MERCATO_ADDR, `/orders/${processId}?e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
        await expect(page.getByTestId('order-timeline-view')).toContainText(/You are the seller/);
        const switcher = page.getByTestId('seller-order-switcher');
        await switcher.waitFor({ state: 'visible', timeout: 15000 });
        await expect(switcher.locator('button')).toHaveCount(2);

        // ── Buyer resolves → one call settles all four orders ────────
        await gotoAsWallet(page, BUYER_ADDR, `/orders/${processId}?e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
        const confirmBtn = page.getByTestId('btn-confirm-receipt');
        await confirmBtn.waitFor({ timeout: 30000 });
        await confirmBtn.click();
        await expect(page.getByTestId('order-status-pill')).toHaveText('Completed', { timeout: 90000 });

        // Atomic resolution — the whole process settled at once.
        const resolved = await publicClient.readContract({
            address: core, abi: PROCESSES_ABI, functionName: 'processes', args: [processId],
        });
        expect(resolved[3]).toBe(0); // activeOrderCount → 0

        // Transparent settlement — each seller's NET gain equals its cut, all
        // paid from the single resolve. Mercato earns A(1) + D(0.25); Swift
        // earns B(0.5); Rosso earns C(0.5).
        const after = {
            mercato: await balanceOf(MERCATO_ADDR),
            swift: await balanceOf(SWIFT_ADDR),
            rosso: await balanceOf(ROSSO_ADDR),
        };
        expect(after.mercato - before.mercato).toBe(parseEther('1.25'));
        expect(after.swift - before.swift).toBe(parseEther('0.5'));
        expect(after.rosso - before.rosso).toBe(parseEther('0.5'));
    });
});
