/**
 * local-commerce-buyer-assigned-runtime.devnet.spec.ts
 *
 * RUNTIME (lifecycle Phase 4) for the buyer-assigned `local-commerce-buyer-assigned`
 * scenario — a 2-node delivery sale where the BUYER picks the courier, every
 * role through its own UI, the mainnet way:
 *
 *   1. Buyer (anvil[0]) browses the onboarded merchant, picks the
 *      buyer-assigned delivery assembly, ENTERS the courier's address in the
 *      SellerCataloguePicker (the adopting merchant's profile binds NO
 *      counterparty — that is what buyer-assigned means), and selects the
 *      courier's delivery item priced from the courier's OWN catalogue. The
 *      food order (buyer↔merchant) and the courier order (buyer↔courier,
 *      seller = the buyer's choice) both commit.
 *   2. Merchant walks its merchant-process ladder; the courier walks its
 *      courier-process ladder and witnesses the proximity proof on its own
 *      order — all through the ONE clause-agnostic capability rail
 *      (runDeliveryCoordination).
 *   3. Buyer co-witnesses proximity on each order, then resolves — atomic
 *      settlement of both orders.
 *
 * Consumes the sellers + assembly from chain→IPFS. The courier the buyer
 * enters is itself DISCOVERED from chain (the courier the local-commerce
 * merchant designates) — no hardcoded addresses.
 *
 * PERSISTED, like mainnet: no chain snapshot/revert.
 *
 * Prerequisite: scenario-local-commerce-buyer-assigned (anchors the assembly)
 * and an onboarded seller whose profile binds it (with no counterparty),
 * against this devnet.
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

// Buyer = anvil[0] (the connected wallet). Sellers are DISCOVERED from
// SellerRegistry events + IPFS by their on-chain assemblyBindings — no roster,
// no hardcoded addresses/names/keys.
const BUYER_ADDR = ANVIL_ACCOUNTS[0] as Hex;

test.describe('local-commerce-buyer-assigned runtime — buyer picks the courier, coordination, resolve (devnet)', () => {
    // Buyer commit (2 orders incl. the picker step) + merchant walk + courier
    // walk + buyer witnesses + resolve — every role through its UI.
    test.setTimeout(420_000);

    test('buyer enters the courier, commits both orders; merchant + courier coordinate; buyer resolves — all through the UI', async ({ page }) => {
        page.on('dialog', (dialog) => { dialog.accept().catch(() => {}); });

        const config = readLocalDeploymentConfig();
        const coreAddress = (process.env.NEXT_PUBLIC_FIGARO_CORE ?? config.figaroCore) as Hex;
        const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex;
        const publicClient = localPublicClient();

        // Discover the sellers the mainnet way. The merchant binds the
        // buyer-assigned assembly with NO counterparty (the buyer chooses).
        // The courier the buyer will enter is itself chain-discovered: the
        // courier the local-commerce merchant designates on-chain.
        const sellers = await discoverSellers();
        const merchant = await discoverSellerByAssembly('local-commerce-buyer-assigned', undefined, sellers);
        const lcMerchant = await discoverSellerByAssembly('local-commerce', { withCourier: true }, sellers);
        const courierAddr = courierAddressFor(lcMerchant, 'local-commerce');
        const courier = sellers.find((s) => s.address.toLowerCase() === courierAddr.toLowerCase());
        expect(courier, `courier ${courierAddr} must be a registered seller`).toBeTruthy();

        await ensureTokenApprovalsByAddress(coreAddress, tokenAddress, BUYER_ADDR, merchant.address, courier!.address);

        // ── 1. Buyer commits the food + courier orders ──────────────────────
        // The buyer ENTERS the courier's address in the picker (buyer-assigned)
        // and selects its delivery item; both orders relay, and each seller
        // counter-signs its OWN order in its inbox — merchant (root) first.
        await placeBilateralOrderUI(page, {
            seller: merchant.address,
            fulfilmentMode: 'deliver:buyer-assigned',
            buyerAssignedCourier: { address: courier!.address },
        });
        const processId = await acceptOrderInInboxUI(page, merchant.address);
        await acceptOrderInInboxUI(page, courier!.address);

        const committed = await publicClient.readContract({
            address: coreAddress, abi: CORE_PROCESS_VIEW_ABI, functionName: 'processes', args: [processId],
        });
        expect(committed[0].toLowerCase()).toBe(BUYER_ADDR.toLowerCase()); // rootBuyer
        expect(committed[3]).toBe(2); // food + courier orders active

        // ── 2. Merchant coordinates, courier delivers — the ONE generic rail ─
        await runDeliveryCoordination(page, {
            processId, merchant: merchant!.address, courier: courier!.address,
        });

        // ── 3. Buyer co-witnesses proximity (both orders), then resolves ────
        await walkClauseAttestations(page, {
            wallet: BUYER_ADDR, processId, clicks: 2, who: 'buyer',
        });

        const resolveBtn = page.getByTestId('capability-execute-resolve-process');
        await resolveBtn.waitFor({ state: 'visible', timeout: 30000 });
        await resolveBtn.click();

        // UI reaction: the event-driven order page reflects atomic settlement of
        // BOTH orders — the indexer feeds the UI, so we wait on the UI.
        await expect(page.getByTestId('order-status-pill')).toHaveText(/Completed/i, { timeout: 90000 });

        // Out-of-band settlement verification (mainnet-rehearsal discipline).
        const resolved = await publicClient.readContract({
            address: coreAddress, abi: CORE_PROCESS_VIEW_ABI, functionName: 'processes', args: [processId],
        });
        expect(Number(resolved[3])).toBe(0);
    });
});
