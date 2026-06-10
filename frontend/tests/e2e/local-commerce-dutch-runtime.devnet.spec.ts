/**
 * local-commerce-dutch-runtime.devnet.spec.ts
 *
 * RUNTIME (lifecycle Phase 4) for the dutch-auction `local-commerce-dutch`
 * scenario — a 2-node delivery sale whose courier edge is DEFERRED to a
 * descending-price auction, every role through its own UI, the mainnet way:
 *
 *   1. Buyer (anvil[0]) browses the onboarded merchant, picks the dutch
 *      assembly, names the auction start price, and places the order. ONLY
 *      the food order relays + commits (merchant counter-signs in its inbox);
 *      the courier order's build parameters are stashed on this device and
 *      the descending-price auction opens on-chain.
 *   2. A courier claims the auction on the order page (SellerAuctionPanel) at
 *      the current descending price, signs the delivery order from the
 *      stashed draft, and relays it to the BUYER — who counter-signs in their
 *      own inbox. The process extends to 2 active orders.
 *   3. Merchant + courier walk their ladders and witness proximity through
 *      the ONE clause-agnostic rail; the buyer co-witnesses both orders'
 *      proofs and resolves — atomic settlement.
 *
 * Consumes the sellers + assembly from chain→IPFS; the claiming courier is
 * itself chain-discovered. PERSISTED, like mainnet: no snapshot/revert.
 *
 * Prerequisite: scenario-local-commerce-dutch (anchors the assembly) and an
 * onboarded seller whose profile binds it (no counterparty), on this devnet.
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
    acceptOrderInInboxUI,
    placeBilateralOrderUI,
    readLocalDeploymentConfig,
    runDeliveryCoordination,
    walkClauseAttestations,
} from './devnet-helpers';

// Buyer = anvil[0] (the connected wallet). Sellers are DISCOVERED from
// SellerRegistry events + IPFS by their on-chain assemblyBindings.
const BUYER_ADDR = ANVIL_ACCOUNTS[0] as Hex;

test.describe('local-commerce-dutch runtime — auction-deferred courier, coordination, resolve (devnet)', () => {
    // Buyer commit + auction open + claim + deferred commit + two walks +
    // buyer witnesses + resolve — every role through its UI.
    test.setTimeout(420_000);

    test('the courier edge defers to the auction, a courier claims + commits, the process runs and resolves — all through the UI', async ({ page }) => {
        page.on('dialog', (dialog) => { dialog.accept().catch(() => {}); });

        const config = readLocalDeploymentConfig();
        const coreAddress = (process.env.NEXT_PUBLIC_FIGARO_CORE ?? config.figaroCore) as Hex;
        const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex;
        const publicClient = localPublicClient();

        // Discover the sellers the mainnet way. The merchant binds the dutch
        // assembly with NO counterparty (the auction fills it); the claiming
        // courier is chain-discovered (the local-commerce designee).
        const sellers = await discoverSellers();
        const merchant = await discoverSellerByAssembly('local-commerce-dutch', undefined, sellers);
        const lcMerchant = await discoverSellerByAssembly('local-commerce', { withCourier: true }, sellers);
        const courierAddr = courierAddressFor(lcMerchant, 'local-commerce');
        const courier = sellers.find((s) => s.address.toLowerCase() === courierAddr.toLowerCase());
        expect(courier, `courier ${courierAddr} must be a registered seller`).toBeTruthy();

        await ensureTokenApprovalsByAddress(coreAddress, tokenAddress, BUYER_ADDR, merchant.address, courier!.address);

        // ── 1. Buyer commits the food order; the courier edge defers ────────
        // The start price pre-fills from the cart store; place-order stashes
        // the courier draft on this device and opens the descending auction,
        // then relays the ROOT order only.
        await placeBilateralOrderUI(page, {
            seller: merchant.address,
            fulfilmentMode: 'deliver:dutch-auction',
        });
        const processId = await acceptOrderInInboxUI(page, merchant.address);

        const committed = await publicClient.readContract({
            address: coreAddress, abi: CORE_PROCESS_VIEW_ABI, functionName: 'processes', args: [processId],
        });
        expect(committed[0].toLowerCase()).toBe(BUYER_ADDR.toLowerCase()); // rootBuyer
        expect(committed[3]).toBe(1); // the food order only — the courier edge is deferred

        // ── 2. The courier claims + commits the deferred delivery order ─────
        // The auction panel is keyed off the processId; the claim is at the
        // current descending price; the commit signs the stashed draft and
        // relays it to the BUYER, who counter-signs in their own inbox.
        await gotoAsWallet(page, courier!.address, `/orders/${processId}?e2e=devnet`);
        await page.getByTestId('seller-auction-panel').waitFor({ state: 'visible', timeout: 30000 });
        const claimBtn = page.getByTestId('btn-claim-seller-auction');
        await expect(claimBtn, 'the auction is open to claim').toBeEnabled({ timeout: 30000 });
        await claimBtn.click();
        const commitBtn = page.getByTestId('btn-commit-seller-order');
        await expect(commitBtn, 'the claim landed; the courier commits the delivery order').toBeEnabled({ timeout: 60000 });
        await commitBtn.click();
        // The courier's sign point raises the agreement-preview modal — the
        // same pre-sign review every counter-sign walks. Confirm it.
        const previewModal = page.getByTestId('agreement-preview-modal');
        await previewModal.waitFor({ state: 'visible', timeout: 45000 });
        await page.getByTestId('preview-confirm').click();
        await page.getByTestId('seller-auction-sent').waitFor({ state: 'visible', timeout: 60000 });

        await acceptOrderInInboxUI(page, BUYER_ADDR, { expectedSeller: courier!.address });

        const extended = await publicClient.readContract({
            address: coreAddress, abi: CORE_PROCESS_VIEW_ABI, functionName: 'processes', args: [processId],
        });
        expect(extended[3]).toBe(2); // the claimed delivery order joined the process

        // ── 3. Merchant coordinates, courier delivers — the ONE generic rail ─
        await runDeliveryCoordination(page, {
            processId, merchant: merchant!.address, courier: courier!.address,
        });

        // ── 4. Buyer co-witnesses proximity (both orders), then resolves ────
        await walkClauseAttestations(page, {
            wallet: BUYER_ADDR, processId, clicks: 2, who: 'buyer',
        });

        const resolveBtn = page.getByTestId('capability-execute-resolve-process');
        await resolveBtn.waitFor({ state: 'visible', timeout: 30000 });
        await resolveBtn.click();

        await expect(page.getByTestId('order-status-pill')).toHaveText(/Completed/i, { timeout: 90000 });

        // Out-of-band settlement verification (mainnet-rehearsal discipline).
        const resolved = await publicClient.readContract({
            address: coreAddress, abi: CORE_PROCESS_VIEW_ABI, functionName: 'processes', args: [processId],
        });
        expect(Number(resolved[3])).toBe(0);
    });
});
