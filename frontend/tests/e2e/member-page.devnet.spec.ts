/**
 * member-page.devnet.spec.ts
 *
 * /s/view is the buyer-facing catalogue page — branding hero,
 * menu grid, cart, place-order CTA. The page reads the seller's
 * profile + catalogue from IPFS via useRegisteredCatalogues and
 * mounts the cart against useCheckout.
 *
 * Seed flow (no UI wizard):
 *   1. Pin a MemberCatalogueMetadata JSON to local Kubo.
 *   2. Register/update the seller through the canonical idempotent
 *      seeder (devnet-helpers.seedRegisteredMember) with a profile
 *      pointing at the catalogue AND binding an assembly DISCOVERED
 *      from the AssemblyRegistry (frontend/scripts/populate-test-data.mjs anchors
 *      them before Playwright runs). The surfacing rule is applied EVENLY (maintainer
 *      2026-07-02): a seller without ≥1 anchored binding is absent on
 *      /discover, /s, and checkout alike — browse-only is retired.
 *   3. Open /s/view?seller=<sellerAddress>?e2e=devnet from a buyer wallet.
 *
 * Assertions: the seller-detail-view shell renders for the seller
 * address, the menu item from the seeded catalogue appears, clicking
 * Add lands a cart line. The full place-order flow is owned by
 * place-order.devnet.spec.ts; what this spec protects is the
 * seller-page composition: IPFS-pinned profile + catalogue →
 * MemberDetailView's menu render → cart.
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
import { createPublicClient, defineChain, http, type Hex } from 'viem';
import {
    pinJSONToIPFS,
    readLocalDeploymentConfig,
    seedRegisteredMember,
} from './devnet-helpers';
import { ANVIL_KEYS } from '../anvilAccounts';
import { ASSEMBLY_REGISTRY_ABI } from '@figaro/sdk';
import { deriveAssemblySlug } from '@/lib/shared/assemblyTemplate';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});

/** Discover an anchored assembly slug from chain (never a roster) — the
 *  seeded profile must bind one to satisfy the even surfacing rule. */
async function discoverAnchoredAssemblySlug(): Promise<string> {
    const config = readLocalDeploymentConfig();
    const registry = (process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY
        ?? config.assemblyRegistry ?? '') as Hex;
    if (!registry || registry.length !== 42) {
        throw new Error('NEXT_PUBLIC_ASSEMBLY_REGISTRY not set — run ./deploy-local.sh');
    }
    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const events = await publicClient.getContractEvents({
        address: registry,
        abi: ASSEMBLY_REGISTRY_ABI,
        eventName: 'AssemblyRegistered',
        fromBlock: 0n,
    });
    if (events.length === 0) {
        throw new Error('no anchored assemblies on this devnet — run frontend/scripts/populate-test-data.mjs first');
    }
    return deriveAssemblySlug(events[events.length - 1].args.compositionHash as `0x${string}`);
}

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
async function seedRegisteredMemberWithCatalogue(): Promise<SeededSeller> {
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
                description: 'Seeded by member-page.devnet.spec.ts',
                price: '0.01',
                category: 'Test',
                image: '🍕',
                available: true,
            },
        ],
    };
    const { uri: catalogueURI } = await pinJSONToIPFS(catalogue);

    const anchoredSlug = await discoverAnchoredAssemblySlug();
    await seedRegisteredMember({
        walletKey: SELLER_KEY,
        profile: {
            name: `Devnet Seller ${Date.now()}`,
            description: 'Seller seeded by member-page.devnet.spec.ts',
            catalogueURI,
            acceptedTokens: [{ address: tokenAddress, symbol: 'MOCK', chainId: 31337 }],
            defaultTokenAddress: tokenAddress,
            assemblyBindings: [{
                bindingId: `seller-page-binding-${Date.now()}`,
                subjectAddress: SELLER_ADDR as Hex,
                assemblySlug: anchoredSlug,
                counterpartyBindings: [],
            }],
        },
    });

    return { address: SELLER_ADDR as Hex, itemId, itemName };
}

test.describe('/s/view (devnet)', () => {
    // Discovery + IPFS round-trip pushes this past the 60s default.
    test.setTimeout(120_000);

    test('renders the seller view, lists the seeded catalogue item, and adds it to the cart', async ({ page }) => {
        const seeded = await seedRegisteredMemberWithCatalogue();

        // Buyer wallet is anvil[0] by default — connect via ?e2e=devnet.
        await page.goto(`/s/view?seller=${seeded.address}&e2e=devnet`, { waitUntil: 'domcontentloaded' });

        // The page mounts MemberDetailView and queries
        // useRegisteredCatalogues, which iterates registered sellers and
        // fetches profile+catalogue from IPFS. NO reload fallbacks: the
        // seeding awaited its receipts and pins before navigation, so the
        // first mount MUST discover the seller — a reload here would mask a
        // real discovery bug (the loop that used to sit here did exactly
        // that; removed 2026-07-20, punch-list e2e hygiene).
        const detailView = page.getByTestId('member-detail-view');
        await detailView.waitFor({ state: 'visible', timeout: 30000 });

        await expect(detailView).toHaveAttribute('data-seller-address', seeded.address.toLowerCase());

        const catalogueItem = page.getByTestId(`catalogue-item-${seeded.itemId}`);
        await catalogueItem.waitFor({ state: 'visible', timeout: 30000 });
        await expect(catalogueItem).toContainText(seeded.itemName);

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
