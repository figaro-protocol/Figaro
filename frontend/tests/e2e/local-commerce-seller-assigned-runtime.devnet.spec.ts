/**
 * local-commerce-runtime.devnet.spec.ts
 *
 * RUNTIME (lifecycle Phase 4) for the seller-assigned `local-commerce-seller-assigned` scenario
 * — a 2-node delivery sale, every role through its own UI, the mainnet way:
 *
 *   1. Buyer (anvil[0]) browses the onboarded merchant, picks delivery
 *      (seller-assigned), and the merchant's designated courier fills the
 *      courier sub-order — the food order (buyer↔merchant) and the courier
 *      order (buyer↔courier) both commit.
 *   2. Merchant walks its merchant-process ladder; the courier walks its
 *      courier-process ladder and witnesses the proximity proof on its own
 *      order — all through the ONE clause-agnostic capability rail
 *      (runDeliveryCoordination).
 *   3. Buyer co-witnesses proximity (the proof clause is bilateral), then
 *      resolves the process — atomic settlement of both orders.
 *
 * Consumes the sellers + assembly from chain→IPFS (authored by
 * scenario-local-commerce-seller-assigned; sellers onboarded against this devnet). No seed,
 * no fixtures, no hardcoded addresses.
 *
 * PERSISTED, like mainnet: no chain snapshot/revert. Each run places a NEW
 * 2-order process, drives it to atomic resolution, and leaves the settled
 * process as terminal on-chain state.
 *
 * Prerequisite: scenario-local-commerce-seller-assigned (anchors the assembly) and onboarded
 * sellers whose profiles bind `local-commerce-seller-assigned`, against this devnet.
 *
 * Requires Anvil + ./scripts/deploy-local.sh + Kubo + the dev server.
 */
import { test, expect, ANVIL_ACCOUNTS } from './devnet-multi-test';
import { type Hex } from 'viem';
import {
    CORE_PROCESS_VIEW_ABI,
    courierAddressFor,
    discoverSellerByAssembly,
    discoverSellers,
    ensureTokenApprovalsByAddress,
    localPublicClient,
    acceptOrderInInboxUI,
    placeBilateralOrderUI,
    readLocalDeploymentConfig,
    runDeliveryCoordination,
    walkClauseAttestations,
} from './devnet-helpers';

// Buyer = anvil[0] (the connected wallet — "the user"). Sellers are DISCOVERED
// from SellerRegistry events + IPFS by their on-chain assemblyBindings — no
// roster, no hardcoded addresses/names/keys. Driving wallets + token approvals go
// through the unlocked RPC by address, so the runtime needs no private keys.
const BUYER_ADDR = ANVIL_ACCOUNTS[0] as Hex;

test.describe('local-commerce-seller-assigned runtime — 2-node delivery commit, coordination, resolve (devnet)', () => {
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
        // the merchant is the local-commerce-seller-assigned seller that designates a courier; the
        // courier is the one it designated on-chain.
        const sellers = await discoverSellers();
        const merchant = await discoverSellerByAssembly('local-commerce-seller-assigned', { withCourier: true }, sellers);
        const courierAddr = courierAddressFor(merchant, 'local-commerce-seller-assigned');
        const courier = sellers.find((s) => s.address.toLowerCase() === courierAddr.toLowerCase());
        expect(courier, `courier ${courierAddr} (designated by ${merchant.name}) must be a registered seller`).toBeTruthy();

        await ensureTokenApprovalsByAddress(coreAddress, tokenAddress, BUYER_ADDR, merchant.address, courier!.address);

        // ── 1. Buyer commits the food + courier orders ──────────────────────
        // The buyer places ONE order from the merchant; the profile-bound
        // 2-node assembly carries the courier order (the merchant's profile
        // DESIGNATES the courier via counterpartyBindings — no buyer picker).
        // The buyer relays the root; each seller counter-signs its OWN order in
        // its inbox — the genuine bilateral relay. Kernel commit order → the
        // merchant accepts first (root creates the process), then the courier.
        await placeBilateralOrderUI(page, {
            seller: merchant.address,
            method: 'deliver:seller-assigned',
        });
        const processId = await acceptOrderInInboxUI(page, merchant.address);
        await acceptOrderInInboxUI(page, courier!.address);

        const committed = await publicClient.readContract({
            address: coreAddress, abi: CORE_PROCESS_VIEW_ABI, functionName: 'processes', args: [processId],
        });
        expect(committed[0].toLowerCase()).toBe(BUYER_ADDR.toLowerCase()); // rootBuyer
        expect(committed[3]).toBe(2); // food + courier orders active

        // ── 2. Merchant coordinates, courier delivers ───────────────────────
        await runDeliveryCoordination(page, {
            processId, merchant: merchant!.address, courier: courier!.address,
        });

        // ── 3. Buyer co-witnesses proximity, then resolves ──────────────────
        // Each order's hand-off edge is proximity-certified and the proof
        // clause is bilateral — the buyer witnesses BOTH orders' proofs
        // through the same clause-agnostic rail (2 attestations).
        await walkClauseAttestations(page, {
            wallet: BUYER_ADDR, processId, clicks: 2, who: 'buyer',
        });

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
