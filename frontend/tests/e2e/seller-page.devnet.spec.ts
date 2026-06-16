/**
 * seller-page.devnet.spec.ts
 *
 * /s/[seller] is the buyer-facing catalogue page — branding hero,
 * menu grid, cart, place-order CTA. The page reads the seller's
 * profile + catalogue from IPFS via useRegisteredCatalogues and
 * mounts the cart against useCheckout.
 *
 * Seed flow (no UI wizard):
 *   1. Pin a SellerCatalogueMetadata JSON to local Kubo.
 *   2. Register/update the seller through the canonical idempotent
 *      seeder (devnet-helpers.seedRegisteredSeller) with a profile
 *      pointing at the catalogue. NO assembly binding — this page is
 *      browse-only and must render for a binding-less profile too.
 *   3. Open /s/<sellerAddress>?e2e=devnet from a buyer wallet.
 *
 * Assertions: the seller-detail-view shell renders for the seller
 * address, the menu item from the seeded catalogue appears, clicking
 * Add lands a cart line. The full place-order flow is owned by
 * place-order.devnet.spec.ts; what this spec protects is the
 * seller-page composition: IPFS-pinned profile + catalogue →
 * SellerDetailView's menu render → cart.
 *
 * PERSISTED, like mainnet: no chain snapshot/revert — each run re-pins
 * the profile/catalogue and updates the registration in place.
 *
 * Requires:
 *   - Anvil + ./scripts/deploy-local.sh
 *   - Kubo running on http://127.0.0.1:5001 with CORS configured for
 *     http://localhost:3100 (per CLAUDE.md "Docker-hosted services").
 */
import { test, expect, ANVIL_ACCOUNTS } from './devnet-multi-test';
import { type Hex } from 'viem';
import {
    pinJSONToIPFS,
    readLocalDeploymentConfig,
    seedRegisteredSeller,
} from './devnet-helpers';
import { ANVIL_KEYS } from '../anvilAccounts';

const SELLER_KEY = ANVIL_KEYS[1];
const SELLER_ADDR = ANVIL_ACCOUNTS[1];

interface SeededSeller {
    address: Hex;
    itemId: string;
    itemName: string;
}

/**
 * Pin a seller catalogue to the local Kubo and register/update the seller
 * on-chain via the canonical seeder. Returns the seeded menu item's id/name
 * so the test can locate it via testid.
 */
async function seedRegisteredSellerWithCatalogue(): Promise<SeededSeller> {
    const config = readLocalDeploymentConfig();
    const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex;

    const itemId = `seller-page-item-${Date.now()}`;
    const itemName = 'Devnet Test Item';

    const catalogue = {
        subjectAddress: SELLER_ADDR,
        version: '1.0.0',
        unitSystem: 'metric' as const,
        items: [
            {
                id: itemId,
                name: itemName,
                description: 'Seeded by seller-page.devnet.spec.ts',
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
            description: 'Seller seeded by seller-page.devnet.spec.ts',
            catalogueURI,
            acceptedTokens: [{ address: tokenAddress, symbol: 'MOCK', chainId: 31337 }],
            defaultTokenAddress: tokenAddress,
        },
    });

    return { address: SELLER_ADDR as Hex, itemId, itemName };
}

test.describe('/s/[seller] (devnet)', () => {
    // Discovery + IPFS round-trip pushes this past the 60s default.
    test.setTimeout(120_000);

    test('renders the seller view, lists the seeded catalogue item, and adds it to the cart', async ({ page }) => {
        const seeded = await seedRegisteredSellerWithCatalogue();

        // Buyer wallet is anvil[0] by default — connect via ?e2e=devnet.
        await page.goto(`/s/${seeded.address}?e2e=devnet`, { waitUntil: 'domcontentloaded' });

        // The page mounts SellerDetailView and queries
        // useRegisteredCatalogues, which iterates registered sellers
        // and fetches profile+catalogue from IPFS. First-mount race
        // with discovery: reload once if the menu hasn't rendered.
        const detailView = page.getByTestId('seller-detail-view');
        try {
            await detailView.waitFor({ state: 'visible', timeout: 30000 });
        } catch {
            await page.reload({ waitUntil: 'domcontentloaded' });
            await detailView.waitFor({ state: 'visible', timeout: 30000 });
        }

        await expect(detailView).toHaveAttribute('data-seller-address', seeded.address.toLowerCase());

        const menuItem = page.getByTestId(`menu-item-${seeded.itemId}`);
        try {
            await menuItem.waitFor({ state: 'visible', timeout: 15000 });
        } catch {
            // Catalogue fetch lagged behind the detail-view mount; one
            // more reload to give the discovery loop a fresh attempt.
            await page.reload({ waitUntil: 'domcontentloaded' });
            await detailView.waitFor({ state: 'visible', timeout: 30000 });
            await menuItem.waitFor({ state: 'visible', timeout: 30000 });
        }
        await expect(menuItem).toContainText(seeded.itemName);

        // Cart starts empty; clicking the Add button lands a cart line
        // for the seeded item.
        const addButton = page.getByTestId(`btn-add-${seeded.itemId}`);
        await addButton.waitFor({ state: 'visible', timeout: 10000 });
        await addButton.click();

        const cartLine = page.getByTestId(`cart-line-${seeded.itemId}`);
        await expect(cartLine).toBeVisible({ timeout: 10000 });
        await expect(cartLine).toContainText(seeded.itemName);
    });
});
