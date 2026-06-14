/**
 * place-order.devnet.spec.ts
 *
 * The full place-order flow on `/s/[seller]` → checkout: cart →
 * assembly-option selection → btn-place-order → bilateral relay →
 * seller counter-sign → on-chain commit. `seller-page.devnet.spec.ts`
 * covers the browse + cart-add surface; this spec owns the commit path.
 *
 * What this exercises:
 *   - Seller-side IPFS pin of catalogue + profile and the idempotent
 *     SellerRegistry registration (register, or updateProfile on re-runs).
 *     The profile BINDS the published `direct-sale` assembly — the
 *     assembly-driven checkout only enables place-order for a seller whose
 *     profile names a published assembly.
 *   - Buyer (anvil[0]) navigates to /s/<sellerAddress>, adds the item,
 *     selects the consume-onsite assembly option, places + relays the order.
 *   - Seller counter-signs in its inbox → on-chain bilateral commit.
 *   - Assert: the buyer's order page renders; rootBuyer + activeOrderCount
 *     verified on-chain out-of-band.
 *
 * PERSISTED, like mainnet: no chain snapshot/revert. Each run pins a fresh
 * profile/catalogue, updates the seller's registration, and leaves a new
 * committed (active) order behind — open orders are normal network state.
 *
 * Prerequisite: scenario-direct-sale has anchored the `direct-sale` assembly
 * on this devnet (the scenario specs run first).
 *
 * Requires Anvil + ./scripts/deploy-local.sh + Kubo.
 */
import { test, expect, ANVIL_ACCOUNTS, gotoAsWallet } from './devnet-multi-test';
import { createPublicClient, http, type Hex } from 'viem';
import {
    acceptOrderInInboxUI,
    ensureTokenApprovals,
    pinJSONToIPFS,
    placeBilateralOrderUI,
    readLocalDeploymentConfig,
    seedRegisteredSeller,
    CORE_PROCESS_VIEW_ABI,
    LOCAL_ANVIL,
    RPC_URL,
} from './devnet-helpers';
import { SCENARIO_SLUG } from './scenarioSlugs.mjs';
import { ANVIL_KEYS } from '../anvilAccounts';

const BUYER_KEY = ANVIL_KEYS[0];
const SELLER_KEY = ANVIL_KEYS[1];
const SELLER_ADDR = ANVIL_ACCOUNTS[1];

interface SeededSeller {
    address: Hex;
    itemId: string;
    itemName: string;
}

async function seedRegisteredSellerWithCatalogue(): Promise<SeededSeller> {
    const config = readLocalDeploymentConfig();
    const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex;

    const itemId = `place-order-item-${Date.now()}`;
    const itemName = 'Place-Order Test Item';

    // Spec-specific catalogue; the registration itself goes through the
    // canonical seeder (devnet-helpers.seedRegisteredSeller).
    const catalogue = {
        subjectAddress: SELLER_ADDR,
        version: '1.0.0',
        unitSystem: 'metric' as const,
        menu: [
            {
                id: itemId,
                name: itemName,
                description: 'Seeded by place-order.devnet.spec.ts',
                price: '0.01',
                category: 'Test',
                image: '🍕',
                available: true,
            },
        ],
    };
    const { uri: catalogueURI } = await pinJSONToIPFS(catalogue);

    await seedRegisteredSeller({
        walletKey: SELLER_KEY,
        profile: {
            name: `Devnet Seller ${Date.now()}`,
            description: 'Seller seeded by place-order.devnet.spec.ts',
            catalogueURI,
            acceptedTokens: [{ address: tokenAddress, symbol: 'MOCK', chainId: 31337 }],
            defaultTokenAddress: tokenAddress,
            // The checkout enables place-order only for a profile that binds a
            // PUBLISHED assembly — bind the persisted direct-sale (consume-onsite).
            assemblyBindings: [{
                bindingId: `direct-sale:${SELLER_ADDR.toLowerCase()}`,
                subjectAddress: SELLER_ADDR as `0x${string}`,
                assemblySlug: SCENARIO_SLUG['direct-sale'],
                counterpartyBindings: [],
            }],
        },
    });

    return { address: SELLER_ADDR as Hex, itemId, itemName };
}

test.describe('/s/[seller] full place-order flow (devnet)', () => {
    // IPFS round-trip + discovery + sign + commit pushes this past 60s.
    test.setTimeout(180_000);

    test('buyer browses the seller catalogue, adds item, picks the assembly option, places the order via the bilateral relay', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const coreAddress = (process.env.NEXT_PUBLIC_FIGARO_CORE ?? config.figaroCore) as Hex;
        const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex;

        // Pre-approve so the place-order flow doesn't have to walk a
        // separate token-approval step in the UI — keeps the spec
        // focused on the commit path. The approval-UX branch itself has
        // NO e2e coverage (a permit.devnet spec never existed; backlog
        // item). Both parties: the seller's bond is pulled when it
        // counter-signs in the inbox.
        await ensureTokenApprovals(coreAddress, tokenAddress, BUYER_KEY, SELLER_KEY);

        const seeded = await seedRegisteredSellerWithCatalogue();

        // Buyer (anvil[0]) places + relays the order through the UI; the
        // seller counter-signs in its inbox. A single-order buyer≠seller sale
        // is the real bilateral relay — no RPC auto-signing of the seller.
        await placeBilateralOrderUI(page, {
            seller: seeded.address,
            itemId: seeded.itemId,
            method: 'consume-onsite',
        });
        const processId = await acceptOrderInInboxUI(page, seeded.address);
        expect(processId).toMatch(/^0x[0-9a-fA-F]{64}$/);

        // The order is the buyer's; navigate there and confirm the role.
        await gotoAsWallet(page, ANVIL_ACCOUNTS[0], `/orders/${processId}?e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
        await expect(page.getByTestId('order-timeline-view')).toContainText(/You are the buyer/);

        // The buyer's order LIST surfaces the commit (manual review
        // 2026-06-12: /orders had zero e2e coverage).
        await gotoAsWallet(page, ANVIL_ACCOUNTS[0], '/orders?e2e=devnet');
        await expect(page.getByTestId(`buyer-order-row-${processId}`)).toBeVisible({ timeout: 30000 });

        // Cross-check the on-chain process state — payment landed,
        // activeOrderCount=1.
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const processState = await publicClient.readContract({
            address: coreAddress,
            abi: CORE_PROCESS_VIEW_ABI,
            functionName: 'processes',
            args: [processId],
        });
        expect(processState[0].toLowerCase()).toBe(ANVIL_ACCOUNTS[0].toLowerCase()); // rootBuyer
        expect(processState[3]).toBe(1); // activeOrderCount
    });
});
