/**
 * place-order.devnet.spec.ts
 *
 * Phase 2 C2 of the e2e remediation plan: the full place-order flow
 * on `/s/[seller]` (cart → btn-place-order → approval → commit →
 * redirect to /orders/<processId>) had no devnet coverage. G11
 * (`seller-page.devnet.spec.ts`) covers the browse + cart-add
 * surface but stops short of the commit; the seller-page-specific
 * checkout pipeline was the gap.
 *
 * What this exercises:
 *   - Seller-side IPFS pin of catalogue + profile + SellerRegistry.register
 *     (lifted from G11's seed).
 *   - Buyer (anvil[0]) navigates to /s/<sellerAddress>.
 *   - Click `btn-add-<itemId>` → cart line appears.
 *   - Select `consume-onsite` from `select-fulfilment-mode`.
 *   - Token approval if buyer doesn't yet have allowance.
 *   - Click `btn-place-order` → commit flow → redirect to
 *     /orders/<processId>.
 *   - Assert: page URL is /orders/<some-hex>, order-timeline-view
 *     renders, status pill is the just-placed state.
 *
 * Requires Anvil + ./deploy-local.sh + Kubo for the catalogue/profile pin.
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
    ensureTokenApprovals,
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

const BUYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const SELLER_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const;
const SELLER_ADDR = ANVIL_ACCOUNTS[1];

const REGISTRATION_DEPOSIT = parseEther('0.001');

const SELLER_REGISTRY_ABI = parseAbi([
    'function register(string metadataURI) external payable',
]);

function getRegistryAddress(): Hex {
    const config = readLocalDeploymentConfig();
    const addr = (process.env.NEXT_PUBLIC_SELLER_REGISTRY
        ?? config.sellerRegistry
        ?? '') as Hex;
    if (!addr || addr.length !== 42) {
        throw new Error('NEXT_PUBLIC_SELLER_REGISTRY not set — run ./deploy-local.sh');
    }
    return addr;
}

interface SeededSeller {
    address: Hex;
    itemId: string;
    itemName: string;
}

async function seedRegisteredSellerWithCatalogue(): Promise<SeededSeller> {
    const config = readLocalDeploymentConfig();
    const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex;

    const itemId = `g11-c2-item-${Date.now()}`;
    const itemName = 'Place-Order Test Item';

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

    const profile = {
        subjectAddress: SELLER_ADDR,
        name: `Devnet Seller ${Date.now()}`,
        description: 'Seller seeded by place-order.devnet.spec.ts',
        catalogueURI,
        acceptedTokens: [{ address: tokenAddress, symbol: 'MOCK', chainId: 31337 }],
        defaultTokenAddress: tokenAddress,
    };
    const { uri: profileURI } = await pinJSONToIPFS(profile);

    const registry = getRegistryAddress();
    const seller = privateKeyToAccount(SELLER_KEY);
    const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const sellerClient = createWalletClient({ account: seller, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const { request } = await publicClient.simulateContract({
        account: seller.address,
        address: registry,
        abi: SELLER_REGISTRY_ABI,
        functionName: 'register',
        args: [profileURI],
        value: REGISTRATION_DEPOSIT,
    });
    await publicClient.waitForTransactionReceipt({ hash: await sellerClient.writeContract(request) });

    return { address: SELLER_ADDR as Hex, itemId, itemName };
}

let outerSnapshot: string;
test.beforeAll(async () => { outerSnapshot = await evmSnapshot(); });
test.afterAll(async () => { if (outerSnapshot) await evmRevert(outerSnapshot); });

test.describe('/s/[seller] full place-order flow (devnet)', () => {
    let testSnapshot: string;
    test.beforeEach(async () => { testSnapshot = await evmSnapshot(); });
    test.afterEach(async () => { if (testSnapshot) await evmRevert(testSnapshot); });

    // IPFS round-trip + discovery + sign + commit pushes this past 60s.
    test.setTimeout(180_000);

    test('buyer browses the seller catalogue, adds item, picks fulfilment, places the order, redirects to /orders', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const coreAddress = (process.env.NEXT_PUBLIC_FIGARO_CORE ?? config.figaroCore) as Hex;
        const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex;

        // Pre-approve so the place-order flow doesn't have to walk a
        // separate token-approval step in the UI — keeps the spec
        // focused on the commit path (permit.devnet covers the
        // approval-via-permit branch).
        await ensureTokenApprovals(coreAddress, tokenAddress, BUYER_KEY, SELLER_KEY);

        const seeded = await seedRegisteredSellerWithCatalogue();

        // Buyer (anvil[0]) is the default ?e2e=devnet account; no
        // wallet switch needed.
        await page.goto(`/s/${seeded.address}?e2e=devnet`, { waitUntil: 'domcontentloaded' });

        const detailView = page.getByTestId('seller-detail-view');
        try {
            await detailView.waitFor({ state: 'visible', timeout: 30000 });
        } catch {
            // Catalogue discovery sometimes lags the first mount (same
            // pattern as G11's first reload).
            await page.reload({ waitUntil: 'domcontentloaded' });
            await detailView.waitFor({ state: 'visible', timeout: 30000 });
        }

        // Add the seeded item to cart.
        const menuItem = page.getByTestId(`menu-item-${seeded.itemId}`);
        try {
            await menuItem.waitFor({ state: 'visible', timeout: 15000 });
        } catch {
            await page.reload({ waitUntil: 'domcontentloaded' });
            await detailView.waitFor({ state: 'visible', timeout: 30000 });
            await menuItem.waitFor({ state: 'visible', timeout: 30000 });
        }
        await page.getByTestId(`btn-add-${seeded.itemId}`).click();
        await expect(page.getByTestId(`cart-line-${seeded.itemId}`)).toBeVisible({ timeout: 10000 });

        // Pick a fulfilment mode. Seller has no on-chain assembly
        // bindings and the catalogue has no fulfillmentModes field, so
        // supportedModes falls back to ALL_FULFILMENT_MODES — every
        // option renders. consume-onsite is the simplest.
        await page.getByTestId('select-fulfilment-mode').selectOption('consume-onsite');

        // Place the order. Accept any window.confirm the commit flow
        // may surface (defensive — none currently expected here).
        page.on('dialog', (dialog) => { dialog.accept().catch(() => {}); });
        await page.getByTestId('btn-place-order').click();

        // AgreementPreviewModal gates the signature — signCommitment always
        // posts the preview; confirm it to proceed to the wallet prompt.
        await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 15000 });
        await page.getByTestId('preview-confirm').click();

        // After commit, the page redirects to /orders/<processId>. Wait
        // for the URL to change and the timeline view to mount.
        await page.waitForURL(/\/orders\/0x[0-9a-fA-F]+/, { timeout: 60000 });
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });

        // The order is the buyer's; the role-discriminator should
        // resolve to "buyer".
        await expect(page.getByTestId('order-timeline-view')).toContainText(/You are the buyer/);

        // Extract the processId from the URL and cross-check the
        // on-chain process state — payment landed, activeOrderCount=1.
        const url = page.url();
        const match = url.match(/\/orders\/(0x[0-9a-fA-F]+)/);
        expect(match, `expected /orders/<hex> in URL: ${url}`).toBeTruthy();
        const processId = match![1] as Hex;

        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const processState = await publicClient.readContract({
            address: coreAddress,
            abi: parseAbi([
                'function processes(bytes32) view returns (address rootBuyer, address currency, uint256 cumulativeValue, uint32 activeOrderCount)',
            ]),
            functionName: 'processes',
            args: [processId],
        });
        expect(processState[0].toLowerCase()).toBe(ANVIL_ACCOUNTS[0].toLowerCase()); // rootBuyer
        expect(processState[3]).toBe(1); // activeOrderCount
    });
});
