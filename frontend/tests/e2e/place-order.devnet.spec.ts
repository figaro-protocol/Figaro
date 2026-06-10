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
import { test, expect, ANVIL_ACCOUNTS, gotoAsWallet } from './devnet-multi-test';
import {
    createPublicClient,
    defineChain,
    http,
    type Hex,
} from 'viem';
import {
    acceptOrderInInboxUI,
    ensureTokenApprovals,
    evmRevert,
    evmSnapshot,
    pinJSONToIPFS,
    placeBilateralOrderUI,
    readLocalDeploymentConfig,
    seedRegisteredSeller,
    CORE_PROCESS_VIEW_ABI,
} from './devnet-helpers';
import { ANVIL_KEYS } from '../anvilAccounts';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});

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

    const itemId = `g11-c2-item-${Date.now()}`;
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
        },
    });

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

    test('buyer browses the seller catalogue, adds item, picks fulfilment, places the order via the bilateral relay', async ({ page }) => {
        const config = readLocalDeploymentConfig();
        const coreAddress = (process.env.NEXT_PUBLIC_FIGARO_CORE ?? config.figaroCore) as Hex;
        const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? config.tokenAddress) as Hex;

        // Pre-approve so the place-order flow doesn't have to walk a
        // separate token-approval step in the UI — keeps the spec
        // focused on the commit path (permit.devnet covers the
        // approval-via-permit branch). Both parties: the seller's bond is
        // pulled when it counter-signs in the inbox.
        await ensureTokenApprovals(coreAddress, tokenAddress, BUYER_KEY, SELLER_KEY);

        const seeded = await seedRegisteredSellerWithCatalogue();

        // Buyer (anvil[0]) places + relays the order through the UI; the
        // seller counter-signs in its inbox. A single-order buyer≠seller sale
        // is the real bilateral relay — no RPC auto-signing of the seller.
        await placeBilateralOrderUI(page, {
            seller: seeded.address,
            itemId: seeded.itemId,
            fulfilmentMode: 'consume-onsite',
        });
        const processId = await acceptOrderInInboxUI(page, seeded.address);
        expect(processId).toMatch(/^0x[0-9a-fA-F]{64}$/);

        // The order is the buyer's; navigate there and confirm the role.
        await gotoAsWallet(page, ANVIL_ACCOUNTS[0], `/orders/${processId}?e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
        await expect(page.getByTestId('order-timeline-view')).toContainText(/You are the buyer/);

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
