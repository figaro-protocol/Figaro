/**
 * local-commerce-dutch-runtime.devnet.spec.ts
 *
 * RUNTIME (lifecycle Phase 4) for the dutch-auction `local-commerce-dutch`
 * scenario — a 2-node delivery sale where the courier edge is DEFERRED to a
 * descending-price auction, every role through its own UI, the mainnet way:
 *
 *   1. Buyer (anvil[0]) browses the onboarded merchant (Pomodoro Kitchen), picks
 *      delivery (dutch-auction), places the order — only the FOOD order commits;
 *      the courier auction opens (the process carries ONE order).
 *   2. A courier (Cardinal Couriers) opens the order page, CLAIMS the auction at
 *      the decayed price, then COMMITS the courier order at the cleared price —
 *      the courier edge joins the process (now TWO orders, cumulative value grew).
 *   3. Merchant walks figaro-merchant-process-v1; courier submits both handoff
 *      proximity proofs (runDeliveryCoordination).
 *   4. Buyer resolves the process — atomic settlement of both orders.
 *
 * Incremental process assembly: a process opened by the root commit and extended
 * over time as the deferred courier edge resolves — by the party that resolved it.
 *
 * Consumes the seller + assembly from chain→IPFS (authored by
 * scenario-local-commerce-dutch + sellers-onboarding). No seed, no fixtures, no
 * hardcoded addresses — the roster is the single source of sellers.
 *
 * Prerequisite: scenario-local-commerce-dutch (anchors the assembly) and
 * sellers-onboarding (onboards Pomodoro Kitchen + Cardinal Couriers) have run
 * against this devnet.
 *
 * Requires Anvil + ./scripts/deploy-local.sh + Kubo + the dev server.
 */
import { test, expect, ANVIL_ACCOUNTS, gotoAsWallet } from './devnet-multi-test';
import { type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
    CORE_PROCESS_VIEW_ABI,
    SELLER_REGISTERED_EVENT_ABI,
    ensureTokenApprovals,
    localPublicClient,
    readLocalDeploymentConfig,
    runDeliveryCoordination,
    useChainSnapshot,
} from './devnet-helpers';
import { SELLER_ROSTER } from './seller-roster';

// Buyer = anvil[0]. Sellers come from the roster (the single source) — the
// merchant is the local-commerce-dutch seller (defers the courier to an auction);
// the courier is the local-commerce courier, reused, which CLAIMS the auction
// (priced by the auction, not a catalogue).
const BUYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const MERCHANT_KEY = '0xf214f2b2cd398c806f84e317254e0f0b801d0643303237d97a22a48e01628897' as const; // anvil[10]
const COURIER_KEY = '0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97' as const; // anvil[8]
const BUYER_ADDR = ANVIL_ACCOUNTS[0];

const merchant = SELLER_ROSTER.find((s) => s.assemblies.includes('local-commerce-dutch'));
// The courier is the local-commerce courier (no courierAddresses), reused here.
const courier = SELLER_ROSTER.find((s) => s.assemblies.includes('local-commerce') && !s.courierAddresses);

useChainSnapshot(test);

test.describe('local-commerce-dutch runtime — deferred courier edge, claim, commit, resolve (devnet)', () => {
    // Buyer commit (food) + auction open + courier claim + courier-order commit +
    // merchant walk + courier handoffs + resolve — every role through its UI.
    test.setTimeout(420_000);

    test('buyer opens the courier auction, a courier claims + commits, merchant + courier coordinate, buyer resolves — all through the UI', async ({ page }) => {
        page.on('dialog', (dialog) => { dialog.accept().catch(() => {}); });

        expect(merchant, 'local-commerce-dutch merchant must be in SELLER_ROSTER').toBeTruthy();
        expect(courier, 'local-commerce courier must be in SELLER_ROSTER').toBeTruthy();
        expect(privateKeyToAccount(MERCHANT_KEY).address.toLowerCase()).toBe(merchant!.address.toLowerCase());
        expect(privateKeyToAccount(COURIER_KEY).address.toLowerCase()).toBe(courier!.address.toLowerCase());

        const config = readLocalDeploymentConfig();
        const coreAddress = (process.env.NEXT_PUBLIC_FIGARO_CORE ?? config.figaroCore) as Hex;
        const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex;
        const sellerRegistry = (process.env.NEXT_PUBLIC_SELLER_REGISTRY ?? config.sellerRegistry) as Hex;
        const publicClient = localPublicClient();

        // Prerequisite: both sellers onboarded (consumed from chain, not seeded).
        for (const s of [merchant!, courier!]) {
            const registered = await publicClient.getContractEvents({
                address: sellerRegistry,
                abi: SELLER_REGISTERED_EVENT_ABI,
                eventName: 'SellerRegistered',
                args: { seller: s.address },
                fromBlock: 0n,
            });
            expect(
                registered.length,
                `${s.name} (${s.address}) is not registered — run sellers-onboarding first`,
            ).toBeGreaterThanOrEqual(1);
        }

        // The buyer initiates the food order; the courier initiates the courier
        // order (as the claiming seller). Both need an allowance; the merchant is
        // the food order's counterparty.
        await ensureTokenApprovals(coreAddress, tokenAddress, BUYER_KEY, MERCHANT_KEY, COURIER_KEY);

        // ── 1. Buyer picks dutch-auction delivery — only the food order commits ─
        await page.goto(`/s/${merchant!.address}?e2e=devnet`, { waitUntil: 'domcontentloaded' });
        const detailView = page.getByTestId('seller-detail-view');
        try {
            await detailView.waitFor({ state: 'visible', timeout: 30000 });
        } catch {
            await page.reload({ waitUntil: 'domcontentloaded' });
            await detailView.waitFor({ state: 'visible', timeout: 30000 });
        }
        const addButton = page.locator('[data-testid^="btn-add-"]').first();
        try {
            await addButton.waitFor({ state: 'visible', timeout: 15000 });
        } catch {
            await page.reload({ waitUntil: 'domcontentloaded' });
            await detailView.waitFor({ state: 'visible', timeout: 30000 });
            await addButton.waitFor({ state: 'visible', timeout: 30000 });
        }
        await addButton.click();
        await expect(page.locator('[data-testid^="cart-line-"]').first()).toBeVisible({ timeout: 10000 });

        await expect(page.getByTestId('option-fulfilment-deliver:dutch-auction')).toHaveCount(1, { timeout: 20000 });
        await page.getByTestId('select-fulfilment-mode').selectOption('deliver:dutch-auction');
        await page.getByTestId('input-delivery-geohash').fill('dr5regw3pg');
        await page.getByTestId('input-delivery-address').fill('12 Market St, Apt 4B — ring bell');
        await page.getByTestId('btn-place-order').click();

        // ONE agreement-preview modal — the food order. The courier order is
        // deferred to the auction, so it does NOT commit at checkout.
        const foodModal = page.getByTestId('agreement-preview-modal');
        await foodModal.waitFor({ state: 'visible', timeout: 45000 });
        await page.getByTestId('preview-confirm').click();
        await foodModal.waitFor({ state: 'hidden', timeout: 45000 });

        await page.waitForURL(/\/orders\/0x[0-9a-fA-F]+/, { timeout: 90000 });
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
        const processId = page.url().match(/\/orders\/(0x[0-9a-fA-F]+)/)![1] as Hex;

        // ── 2. The process carries ONE order; the auction is open ───────────
        const opened = await publicClient.readContract({
            address: coreAddress, abi: CORE_PROCESS_VIEW_ABI, functionName: 'processes', args: [processId],
        });
        expect(opened[0].toLowerCase()).toBe(BUYER_ADDR.toLowerCase()); // rootBuyer
        expect(opened[3]).toBe(1); // activeOrderCount — food order only
        await expect(page.getByTestId('seller-auction-panel')).toBeVisible({ timeout: 30000 });

        // ── 3. A courier claims the auction at the decayed price ────────────
        await gotoAsWallet(page, courier!.address, `/orders/${processId}?e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
        const claimButton = page.getByTestId('btn-claim-seller-auction');
        await claimButton.waitFor({ state: 'visible', timeout: 30000 });
        await claimButton.click();
        await expect(page.getByTestId('seller-auction-claimed')).toBeVisible({ timeout: 60000 });

        // ── 4. The courier commits the courier order at the cleared price ───
        const commitButton = page.getByTestId('btn-commit-seller-order');
        await commitButton.waitFor({ state: 'visible', timeout: 30000 });
        await commitButton.click();
        // The courier-order commit gates on its own agreement-preview modal.
        const courierModal = page.getByTestId('agreement-preview-modal');
        await courierModal.waitFor({ state: 'visible', timeout: 45000 });
        await page.getByTestId('preview-confirm').click();
        await expect(page.getByTestId('seller-auction-committed')).toBeVisible({ timeout: 90000 });

        // The courier edge joined the process — TWO orders now, cumulative value
        // grew by the cleared price.
        const assembled = await publicClient.readContract({
            address: coreAddress, abi: CORE_PROCESS_VIEW_ABI, functionName: 'processes', args: [processId],
        });
        expect(assembled[3]).toBe(2); // food + courier
        expect(assembled[2]).toBeGreaterThan(opened[2]); // cumulativeValue grew

        // ── 5. Merchant coordinates, courier delivers ───────────────────────
        await runDeliveryCoordination(page, {
            processId, merchant: merchant!.address, courier: courier!.address,
        });

        // ── 6. Buyer resolves → atomic settlement of both orders ────────────
        await gotoAsWallet(page, BUYER_ADDR, `/orders/${processId}?e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ state: 'visible', timeout: 30000 });

        const resolveBtn = page.getByTestId('capability-execute-resolve-process');
        await resolveBtn.waitFor({ state: 'visible', timeout: 30000 });
        await resolveBtn.click();

        await expect(page.getByTestId('order-status-pill')).toHaveText(/Completed/i, { timeout: 90000 });

        // Out-of-band settlement verification (mainnet-rehearsal discipline): both
        // orders really resolved on-chain — a confirmation OF the UI, not its driver.
        const resolved = await publicClient.readContract({
            address: coreAddress, abi: CORE_PROCESS_VIEW_ABI, functionName: 'processes', args: [processId],
        });
        expect(Number(resolved[3])).toBe(0); // both orders atomically settled
    });
});
