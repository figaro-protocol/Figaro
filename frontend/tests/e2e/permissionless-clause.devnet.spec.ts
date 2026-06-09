/**
 * permissionless-clause.devnet.spec.ts — THE acceptance test. The single
 * definition of "green" for the whole de-hardcoding migration.
 *
 * It registers a BRAND-NEW clause at test time — `figaro-probe-attest-v1`, a
 * category-1 runtime-attestable clause that NO code in this repo has ever heard
 * of — composes it into an assembly through the real designer, sets up a seller
 * bound to that assembly, drives a real bilateral commit, and then asserts the
 * full pipeline handled the novel clause WITH ZERO CODE CHANGES:
 *
 *   drawer  → the event-driven drawer surfaces it             (already permissionless)
 *   encode  → buildOrderAgreement carries its section          (generic passthrough)
 *   commit  → it survives checkout into the committed agreement
 *   runtime → the order page surfaces a capability to attest it (REQUIRES Phase 3)
 *
 * Until every stage passes, the protocol's clause pipeline hardcodes clause
 * knowledge and is NOT permissionless — so by definition nothing is green. This
 * test is RED today (the runtime capability engine `deriveProcessModelFromRuntime`
 * only emits capabilities for the hardcoded merchant/courier/ghg clauses); the
 * de-hardcoding phases drive it to green.
 *
 * Requires Anvil + ./scripts/devup.sh + Kubo + the dev server.
 */
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import {
    createPublicClient, createWalletClient, defineChain, http, keccak256, toHex,
    type Hex,
} from 'viem';
import { privateKeyToAccount, mnemonicToAccount } from 'viem/accounts';
import {
    pinJSONToIPFS,
    discoverSellerByAssembly,
    ensureTokenApprovalsByAddress,
    placeBilateralOrderUI,
    acceptOrderInInboxUI,
    readLocalDeploymentConfig,
} from './devnet-helpers';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337, name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});
const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';
const REGISTRAR_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex; // anvil[0]
const BUYER_ADDR = privateKeyToAccount(REGISTRAR_KEY).address;

const CLAUSE_REGISTRY_ABI = [
    { type: 'function', name: 'registered', stateMutability: 'view', inputs: [{ type: 'bytes32' }], outputs: [{ type: 'bool' }] },
    { type: 'function', name: 'registerClause', stateMutability: 'nonpayable',
      inputs: [{ name: 'clauseId', type: 'string' }, { name: 'version', type: 'uint64' }, { name: 'contentHash', type: 'bytes32' }, { name: 'metadataURI', type: 'string' }, { name: 'family', type: 'bytes32' }], outputs: [] },
] as const;

const SELLER_REGISTRY_ABI = [
    { type: 'function', name: 'register', stateMutability: 'payable', inputs: [{ name: 'metadataURI', type: 'string' }], outputs: [] },
] as const;

const ASSEMBLY_REGISTERED_ABI = [
    { type: 'event', name: 'AssemblyRegistered', inputs: [
        { name: 'slugHash', type: 'bytes32', indexed: true }, { name: 'author', type: 'address', indexed: true },
        { name: 'slug', type: 'string', indexed: false }, { name: 'contentHash', type: 'bytes32', indexed: false },
        { name: 'metadataURI', type: 'string', indexed: false } ] },
] as const;

async function assemblyAnchored(slug: string): Promise<boolean> {
    const cfg = readLocalDeploymentConfig();
    const registry = (process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY ?? cfg.assemblyRegistry) as Hex;
    const pub = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const events = await pub.getContractEvents({
        address: registry, abi: ASSEMBLY_REGISTERED_ABI, eventName: 'AssemblyRegistered',
        args: { slugHash: keccak256(toHex(slug)) }, fromBlock: 0n,
    });
    return events.length > 0;
}

// The novel clause — a runtime-attestable lifecycle with one enum ladder. Modeled
// on figaro-merchant-process-v1's shape, but a name nothing in the repo knows.
const NOVEL_CLAUSE_ID = 'figaro-probe-attest-v1';
const NOVEL_SLUG = 'permissionless-probe';
const NOVEL_SPEC = {
    clauseId: NOVEL_CLAUSE_ID,
    version: 1,
    title: 'Permissionless probe attestation',
    description: 'A brand-new runtime-attestable clause registered at test time to prove the clause pipeline is permissionless. Nothing in the repo hardcodes it.',
    categories: ['lifecycle'],
    fields: [
        { name: 'eventType', type: 'enum', values: ['opened', 'verified', 'closed'], required: true, description: 'Probe lifecycle event.' },
    ],
    block: { tier: 'category-1', drawerArticle: 'attestations', mechanismKinds: ['coordinator'], moduleIds: [] },
};

async function registerNovelClause(): Promise<void> {
    const cfg = readLocalDeploymentConfig();
    const registry = (process.env.NEXT_PUBLIC_CLAUSE_REGISTRY ?? cfg.clauseRegistry) as Hex;
    const pub = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const idHash = keccak256(toHex(NOVEL_CLAUSE_ID));
    if (await pub.readContract({ address: registry, abi: CLAUSE_REGISTRY_ABI, functionName: 'registered', args: [idHash] })) return;

    const canonical = JSON.stringify(NOVEL_SPEC);
    const { uri } = await pinJSONToIPFS(NOVEL_SPEC);
    const contentHash = keccak256(toHex(canonical));
    const family = keccak256(toHex(NOVEL_SPEC.categories[0]));
    const wallet = createWalletClient({ account: privateKeyToAccount(REGISTRAR_KEY), chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const { request } = await pub.simulateContract({
        account: privateKeyToAccount(REGISTRAR_KEY).address, address: registry, abi: CLAUSE_REGISTRY_ABI,
        functionName: 'registerClause', args: [NOVEL_CLAUSE_ID, 1n, contentHash, uri, family],
    });
    await pub.waitForTransactionReceipt({ hash: await wallet.writeContract(request) });
}

// Register a seller (anvil[14]) bound to the novel assembly with a catalogue item,
// the same profile shape populate-test-data pins. Setup DATA, not a tested surface.
async function registerNovelSeller(): Promise<Hex> {
    const cfg = readLocalDeploymentConfig();
    const sellerRegistry = (process.env.NEXT_PUBLIC_SELLER_REGISTRY ?? cfg.sellerRegistry) as Hex;
    const token = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? cfg.tokenAddress) as Hex;
    const account = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 14 });
    const catalogue = {
        subjectAddress: account.address, version: '0.1.0', unitSystem: 'metric',
        menu: [{ id: 'probe-item', name: 'Probe Item', description: 'probe', price: '1', pricingPolicy: 'fixed', category: 'General', available: true }],
    };
    const { uri: catalogueURI } = await pinJSONToIPFS(catalogue);
    const profile = {
        subjectAddress: account.address, name: 'Probe Seller', specialty: 'permissionless probe',
        catalogueURI, location: { geohash: '9q8yyk8yu' },
        acceptedTokens: [{ address: token, symbol: 'MOCK', name: 'Mock Token' }],
        defaultTokenAddress: token,
        assemblyBindings: [{ bindingId: `${NOVEL_SLUG}:${account.address.toLowerCase()}`, subjectAddress: account.address, assemblySlug: NOVEL_SLUG, counterpartyBindings: [] }],
    };
    const { uri: profileURI } = await pinJSONToIPFS(profile);
    const pub = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const wallet = createWalletClient({ account, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    try {
        const { request } = await pub.simulateContract({
            account: account.address, address: sellerRegistry, abi: SELLER_REGISTRY_ABI,
            functionName: 'register', args: [profileURI], value: 1000000000000000n,
        });
        await pub.waitForTransactionReceipt({ hash: await wallet.writeContract(request) });
    } catch (e) {
        if (!String(e).includes('AlreadyRegistered') && !String(e).includes('reverted')) throw e;
    }
    return account.address as Hex;
}

test.describe('PERMISSIONLESS CLAUSE — the definition of green', () => {
    test.setTimeout(240_000);

    test('a brand-new clause flows drawer → encode → commit → runtime with zero code changes', async ({ page }) => {
        // THE GATE. Expected-RED today: the novel clause flows drawer → encode →
        // commit, but the runtime capability engine (deriveProcessModelFromRuntime)
        // hardcodes clause knowledge, so it surfaces NO capability to attest it.
        // The de-hardcoding migration (project_backlog "De-hardcode ALL clause
        // knowledge") drives this to green. When it PASSES, Playwright reports an
        // unexpected pass — REMOVE this test.fail() then: the clause pipeline is
        // permissionless and "green" finally means what it should.
        test.fail();
        page.on('dialog', (d) => { d.accept().catch(() => {}); });
        const cfg = readLocalDeploymentConfig();
        const coreAddress = (process.env.NEXT_PUBLIC_FIGARO_CORE ?? cfg.figaroCore) as Hex;
        const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? cfg.tokenAddress) as Hex;

        // ── Setup: mint the novel clause on-chain (pin + register) ──────────
        await registerNovelClause();

        // Author + publish ONCE (persisted, like a real builder). On a re-run the
        // slug is already anchored, so skip straight to the runtime path.
        if (!(await assemblyAnchored(NOVEL_SLUG))) {
        // ── DRAWER: the event-driven drawer must surface the novel clause ───
        await page.goto('/builders/designer/new?fresh=1&e2e=devnet', { waitUntil: 'domcontentloaded' });
        await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
        await page.getByTestId('designer-saved-hint').waitFor({ timeout: 15000 });
        const orderNodes = page.locator('[data-testid^="order-node-"]:not([data-testid$="-delete"])');
        await expect(orderNodes).toHaveCount(1, { timeout: 10000 });
        await orderNodes.first().click();
        await page.getByTestId('agreement-drawer').waitFor({ state: 'visible', timeout: 10000 });
        await page.getByTestId('drawer-tab-registry').click();
        await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });

        const novelCheckbox = page.getByTestId(`drawer-registry-clause-${NOVEL_CLAUSE_ID}`);
        await expect(novelCheckbox, 'DRAWER: the event-driven drawer surfaces a never-before-seen clause').toHaveCount(1, { timeout: 20000 });
        await novelCheckbox.check();

        // Publish the 1-node assembly (slug "permissionless-probe").
        await page.getByTestId('designer-name-input').fill('Permissionless Probe');
        await expect(page.getByTestId('designer-review')).toBeEnabled({ timeout: 5000 });
        await page.getByTestId('designer-review').click();
        await page.waitForURL(new RegExp(`/builders/designer/view/${NOVEL_SLUG}`), { timeout: 15000 });
        await page.goto(`/builders/designer/view/${NOVEL_SLUG}?intent=publish&e2e=devnet`, { waitUntil: 'domcontentloaded' });
        const confirmBtn = page.getByTestId('review-confirm-publish');
        await confirmBtn.waitFor({ state: 'visible', timeout: 15000 });
        await page.waitForFunction(
            () => !Array.from(document.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Connect Wallet'),
            null, { timeout: 30000 });
        await confirmBtn.click();
        await expect(page.getByText(/Published\b/i).first()).toBeVisible({ timeout: 60000 });
        }

        // ── Setup: a seller bound to the novel assembly ─────────────────────
        const sellerAddr = await registerNovelSeller();
        await ensureTokenApprovalsByAddress(coreAddress, tokenAddress, BUYER_ADDR, sellerAddr);

        // ── ENCODE + COMMIT: buyer buys, seller accepts → bilateral commit ──
        const discovered = await discoverSellerByAssembly(NOVEL_SLUG);
        await placeBilateralOrderUI(page, { seller: discovered.address });
        const processId = await acceptOrderInInboxUI(page, discovered.address);
        expect(processId, 'COMMIT: a real bilateral commit landed').toMatch(/^0x[0-9a-fA-F]{64}$/);

        // ── RUNTIME PANEL: the seller's order page must surface a capability
        // to attest the novel clause. RED until the capability engine reads
        // runtime-attestable clauses generically from the spec (Phase 3). ────
        await gotoAsWallet(page, sellerAddr, `/orders/${processId}?e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ state: 'visible', timeout: 30000 });
        const novelCapability = page
            .locator('[data-testid^="capability-execute-"]')
            .filter({ hasText: /opened|probe|attest/i });
        await expect(
            novelCapability,
            'RUNTIME: the order page must let the seller attest the novel clause — RED until deriveProcessModelFromRuntime is clause-agnostic',
        ).toHaveCount(1, { timeout: 30000 });
    });
});
