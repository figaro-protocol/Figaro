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
import {
    CORE_PROCESS_VIEW_ABI,
    courierAddressFor,
    discoverSellerByAssembly,
    discoverSellers,
    ensureTokenApprovalsByAddress,
    localPublicClient,
    placeLocalCommerceOrderUI,
    readLocalDeploymentConfig,
    runDeliveryCoordination,
    useChainSnapshot,
} from './devnet-helpers';

// Buyer = anvil[0] (the connected wallet — "the user"). Sellers are DISCOVERED
// from SellerRegistry events + IPFS by their on-chain assemblyBindings — no
// roster, no hardcoded addresses/names/keys. Driving wallets + token approvals go
// through the unlocked RPC by address, so the runtime needs no private keys.
const BUYER_ADDR = ANVIL_ACCOUNTS[0] as Hex;

useChainSnapshot(test);

test.describe('local-commerce runtime — 2-node delivery commit, coordination, resolve (devnet)', () => {
    // Buyer commit (2 orders) + merchant walk + courier handoffs + resolve —
    // every role through its UI.
    test.setTimeout(420_000);

    test('buyer commits both orders, merchant + courier coordinate, buyer resolves — all through the UI', async ({ page }) => {
        page.on('dialog', (dialog) => { dialog.accept().catch(() => {}); });

        const config = readLocalDeploymentConfig();
        const coreAddress = (process.env.NEXT_PUBLIC_FIGARO_CORE ?? config.figaroCore) as Hex;
        const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex;
        const publicClient = localPublicClient();

        // Discover the sellers the mainnet way (events → IPFS → on-chain bindings):
        // the merchant is the local-commerce seller that designates a courier; the
        // courier is the one it designated on-chain.
        const sellers = await discoverSellers();
        const merchant = await discoverSellerByAssembly('local-commerce', { withCourier: true }, sellers);
        const courierAddr = courierAddressFor(merchant, 'local-commerce');
        const courier = sellers.find((s) => s.address.toLowerCase() === courierAddr.toLowerCase());
        expect(courier, `courier ${courierAddr} (designated by ${merchant.name}) must be a registered seller`).toBeTruthy();

        await ensureTokenApprovalsByAddress(coreAddress, tokenAddress, BUYER_ADDR, merchant.address, courier!.address);

        // ── 1. Buyer commits the food + courier orders ──────────────────────
        // No item ids: pick the merchant's + courier's first catalogue items off
        // the network. The courier is the merchant's on-chain partner, by name.
        const processId = await placeLocalCommerceOrderUI(page, {
            merchant: merchant.address,
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
