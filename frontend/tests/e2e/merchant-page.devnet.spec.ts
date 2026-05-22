/**
 * merchant-page.devnet.spec.ts
 *
 * /m/[merchant] is the buyer-facing catalogue page — branding hero,
 * menu grid, cart, place-order CTA. The page reads the operator's
 * profile + catalogue from IPFS via useRegisteredCatalogues and
 * mounts the cart against useCheckout. No devnet coverage existed
 * pre-2026-05-19.
 *
 * Seed flow (no UI wizard):
 *   1. Pin a OperatorCatalogueMetadata JSON to local Kubo.
 *   2. Pin an OperatorProfileMetadata JSON that points to the
 *      catalogue CID.
 *   3. Register the operator on-chain with the profile URI.
 *   4. Open /m/<merchantAddress>?e2e=devnet from a buyer wallet.
 *
 * Assertions: the merchant-detail-view shell renders for the operator
 * address, the menu item from the seeded catalogue appears, clicking
 * Add lands a cart line. The full place-order tx flow (approval +
 * commitment signing + redirect) is deferred — it's exercised by the
 * commit-side tests (commitment-share.devnet, lifecycle.devnet). What
 * this spec specifically protects is the merchant-page composition:
 * IPFS-pinned operator profile + catalogue → MerchantDetailView's
 * menu render → cart.
 *
 * Requires:
 *   - Anvil + ./deploy-local.sh
 *   - Kubo running on http://127.0.0.1:5001 with CORS configured for
 *     http://localhost:3100 (per CLAUDE.md "Docker-hosted services").
 */
import { test, expect, ANVIL_ACCOUNTS } from './devnet-multi-test';
import {
    createPublicClient,
    createWalletClient,
    defineChain,
    http,
    parseAbi,
    parseEther,
    type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
    evmRevert,
    evmSnapshot,
    pinJSONToIPFS,
    readLocalDeploymentConfig,
} from './devnet-helpers';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});

const MERCHANT_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;
const MERCHANT_ADDR = ANVIL_ACCOUNTS[1];

const REGISTRATION_DEPOSIT = parseEther('0.001');

const OPERATOR_REGISTRY_ABI = parseAbi([
    'function register(string metadataURI) external payable',
    'event OperatorRegistered(address indexed operator, string metadataURI)',
    'error AlreadyRegistered()',
]);

function getRegistryAddress(): Hex {
    const config = readLocalDeploymentConfig();
    const addr = (process.env.NEXT_PUBLIC_OPERATOR_REGISTRY
        ?? config.operatorRegistry
        ?? '') as Hex;
    if (!addr || addr.length !== 42) {
        throw new Error('NEXT_PUBLIC_OPERATOR_REGISTRY not set — run ./deploy-local.sh');
    }
    return addr;
}

interface SeededMerchant {
    address: Hex;
    profileURI: string;
    catalogueURI: string;
    itemId: string;
    itemName: string;
}

/**
 * Pins an operator profile + catalogue to the local Kubo and registers
 * the operator on-chain. Returns the URIs and the seeded menu item's
 * id/name so the test can locate it via testid.
 */
async function seedRegisteredMerchant(): Promise<SeededMerchant> {
    const config = readLocalDeploymentConfig();
    const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex;

    const itemId = `g11-item-${Date.now()}`;
    const itemName = 'Devnet Test Item';

    const catalogue = {
        subjectAddress: MERCHANT_ADDR,
        version: '1.0.0',
        unitSystem: 'metric' as const,
        menu: [
            {
                id: itemId,
                name: itemName,
                description: 'Seeded by merchant-page.devnet.spec.ts',
                price: '0.01',
                category: 'Test',
                image: '🍕',
                available: true,
            },
        ],
    };
    const { uri: catalogueURI } = await pinJSONToIPFS(catalogue);

    const profile = {
        subjectAddress: MERCHANT_ADDR,
        name: `Devnet Merchant ${Date.now()}`,
        description: 'Operator seeded by merchant-page.devnet.spec.ts',
        catalogueURI,
        acceptedTokens: [
            {
                address: tokenAddress,
                symbol: 'MOCK',
                chainId: 31337,
            },
        ],
        defaultTokenAddress: tokenAddress,
    };
    const { uri: profileURI } = await pinJSONToIPFS(profile);

    // ── Register on-chain ────────────────────────────────────────────
    const registry = getRegistryAddress();
    const merchant = privateKeyToAccount(MERCHANT_KEY);
    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const merchantClient = createWalletClient({ account: merchant, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const { request } = await publicClient.simulateContract({
        account: merchant.address,
        address: registry,
        abi: OPERATOR_REGISTRY_ABI,
        functionName: 'register',
        args: [profileURI],
        value: REGISTRATION_DEPOSIT,
    });
    await publicClient.waitForTransactionReceipt({ hash: await merchantClient.writeContract(request) });

    return {
        address: MERCHANT_ADDR as Hex,
        profileURI,
        catalogueURI,
        itemId,
        itemName,
    };
}

let outerSnapshot: string;
test.beforeAll(async () => { outerSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (outerSnapshot) await evmRevert(outerSnapshot); });

test.describe('/m/[merchant] (devnet)', () => {
    let testSnapshot: string;
    test.beforeEach(async () => { testSnapshot = await evmSnapshot(); });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    // Discovery + IPFS round-trip pushes this past the 60s default.
    test.setTimeout(120_000);

    test('renders the merchant view, lists the seeded catalogue item, and adds it to the cart', async ({ page }) => {
        const seeded = await seedRegisteredMerchant();

        // Buyer wallet is anvil[0] by default — connect via ?e2e=devnet.
        await page.goto(`/m/${seeded.address}?e2e=devnet`, { waitUntil: 'domcontentloaded' });

        // The page mounts MerchantDetailView and queries
        // useRegisteredCatalogues, which iterates registered operators
        // and fetches profile+catalogue from IPFS. First-mount race
        // with discovery: reload once if the menu hasn't rendered.
        const detailView = page.getByTestId('merchant-detail-view');
        try {
            await detailView.waitFor({ state: 'visible', timeout: 30000 });
        } catch {
            await page.reload({ waitUntil: 'domcontentloaded' });
            await detailView.waitFor({ state: 'visible', timeout: 30000 });
        }

        await expect(detailView).toHaveAttribute('data-merchant-address', seeded.address.toLowerCase());

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
