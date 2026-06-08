/**
 * local-commerce-runtime.devnet.spec.ts
 *
 * RUNTIME (lifecycle Phase 4) for the seller-assigned `local-commerce` scenario
 * — a 2-node delivery sale, every role through its own UI, the mainnet way:
 *
 *   1. Buyer (anvil[0]) browses the onboarded merchant (Rosa's Kitchen), picks
 *      delivery (seller-assigned), and the merchant's roster courier (Cardinal
 *      Couriers) fills the courier sub-order — the food order (buyer↔merchant)
 *      and the courier order (buyer↔courier) both commit.
 *   2. Merchant walks figaro-merchant-process-v1; courier submits both handoff
 *      proximity proofs (runDeliveryCoordination).
 *   3. Buyer resolves the process — atomic settlement of both orders.
 *
 * Consumes the seller + assembly from chain→IPFS (authored by
 * scenario-local-commerce + sellers-onboarding). No seed, no fixtures, no
 * hardcoded addresses — the roster is the single source of sellers.
 *
 * Prerequisite: scenario-local-commerce (anchors the assembly) and
 * sellers-onboarding (onboards Rosa's Kitchen + Cardinal Couriers) have run
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
    placeLocalCommerceOrderUI,
    readLocalDeploymentConfig,
    runDeliveryCoordination,
    useChainSnapshot,
} from './devnet-helpers';
import { SELLER_ROSTER } from './seller-roster';

// Buyer = anvil[0]. Sellers come from the roster (the single source) — the
// merchant is the local-commerce seller that designates a courier; the courier
// is the local-commerce seller that does not.
const BUYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const MERCHANT_KEY = '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356' as const; // anvil[7]
const COURIER_KEY = '0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97' as const; // anvil[8]
const BUYER_ADDR = ANVIL_ACCOUNTS[0];

const merchant = SELLER_ROSTER.find((s) => s.assemblies.includes('local-commerce') && !!s.courierAddresses);
const courier = SELLER_ROSTER.find((s) => s.assemblies.includes('local-commerce') && !s.courierAddresses);

useChainSnapshot(test);

test.describe('local-commerce runtime — 2-node delivery commit, coordination, resolve (devnet)', () => {
    // Buyer commit (2 orders) + merchant walk + courier handoffs + resolve —
    // every role through its UI.
    test.setTimeout(420_000);

    test('buyer commits both orders, merchant + courier coordinate, buyer resolves — all through the UI', async ({ page }) => {
        page.on('dialog', (dialog) => { dialog.accept().catch(() => {}); });

        expect(merchant, 'local-commerce merchant must be in SELLER_ROSTER').toBeTruthy();
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

        await ensureTokenApprovals(coreAddress, tokenAddress, BUYER_KEY, MERCHANT_KEY, COURIER_KEY);

        // ── 1. Buyer commits the food + courier orders ──────────────────────
        // No item ids: pick the merchant's + courier's first catalogue items off
        // the network. The courier is the merchant's roster partner, by name.
        const processId = await placeLocalCommerceOrderUI(page, {
            merchant: merchant!.address,
            courier: { partnerName: courier!.name },
        });

        const committed = await publicClient.readContract({
            address: coreAddress, abi: CORE_PROCESS_VIEW_ABI, functionName: 'processes', args: [processId],
        });
        expect(committed[0].toLowerCase()).toBe(BUYER_ADDR.toLowerCase()); // rootBuyer
        expect(committed[3]).toBe(2); // food + courier orders active

        // ── 2. Merchant coordinates, courier delivers ───────────────────────
        await runDeliveryCoordination(page, {
            processId, merchant: merchant!.address, courier: courier!.address,
        });

        // ── 3. Buyer resolves → atomic settlement of both orders ────────────
        await gotoAsWallet(page, BUYER_ADDR, `/orders/${processId}?e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ state: 'visible', timeout: 30000 });

        const resolveBtn = page.getByTestId('capability-execute-resolve-process');
        await resolveBtn.waitFor({ state: 'visible', timeout: 30000 });
        await resolveBtn.click();

        // UI reaction: the event-driven order page reflects atomic settlement of
        // BOTH orders — the indexer feeds the UI, so we wait on the UI, not a poll.
        await expect(page.getByTestId('order-status-pill')).toHaveText(/Completed/i, { timeout: 90000 });

        // Out-of-band settlement verification (mainnet-rehearsal discipline): both
        // orders really resolved on-chain — a confirmation OF the UI, not its driver.
        const resolved = await publicClient.readContract({
            address: coreAddress, abi: CORE_PROCESS_VIEW_ABI, functionName: 'processes', args: [processId],
        });
        expect(Number(resolved[3])).toBe(0);
    });
});
