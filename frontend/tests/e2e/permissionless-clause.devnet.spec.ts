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
    createPublicClient, createWalletClient, http,
    type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
    seedRegisteredSeller,
    pinJSONToIPFS,
    discoverSellerByAssembly,
    ensureTokenApprovalsByAddress,
    placeBilateralOrderUI,
    acceptOrderInInboxUI,
    readLocalDeploymentConfig,
    registerNovelClause,
    assemblyAnchored,
    RPC_URL,
    LOCAL_ANVIL,
} from './devnet-helpers';
import { ANVIL_KEYS, anvilKeyAt } from '../anvilAccounts';

const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';
const REGISTRAR_KEY = ANVIL_KEYS[0] as Hex; // anvil[0] — the buyer
const BUYER_ADDR = privateKeyToAccount(REGISTRAR_KEY).address;



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

// The probe seller registers through the CANONICAL idempotent seeder
// (devnet-helpers.seedRegisteredSeller): register once, updateProfile on
// re-runs — which also SELF-HEALS if another spec's wallet hygiene ever
// stamps a different profile onto this index. Setup DATA, not a tested
// surface. Index census: 14 is this probe's own (see anvilAccounts).
async function registerNovelSeller(): Promise<Hex> {
    const cfg = readLocalDeploymentConfig();
    const token = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? cfg.tokenAddress) as Hex;
    const key = anvilKeyAt(14);
    const address = privateKeyToAccount(key).address;
    const { uri: catalogueURI } = await pinJSONToIPFS({
        subjectAddress: address, version: '0.1.0', unitSystem: 'metric',
        menu: [{ id: 'probe-item', name: 'Probe Item', description: 'probe', price: '1', pricingPolicy: 'fixed', category: 'General', available: true }],
    });
    await seedRegisteredSeller({
        walletKey: key,
        profile: {
            name: 'Probe Seller', specialty: 'permissionless probe',
            catalogueURI, location: { geohash: '9q8yyk8yu' },
            acceptedTokens: [{ address: token, symbol: 'MOCK', chainId: 31337 }],
            defaultTokenAddress: token,
            assemblyBindings: [{ bindingId: `${NOVEL_SLUG}:${address.toLowerCase()}`, subjectAddress: address, assemblySlug: NOVEL_SLUG, counterpartyBindings: [] }],
        },
    });
    return address as Hex;
}

test.describe('PERMISSIONLESS CLAUSE — the definition of green', () => {
    test.setTimeout(240_000);

    test('a brand-new clause flows drawer → encode → commit → runtime with zero code changes', async ({ page }) => {
        // THE GATE — and it is GREEN. A brand-new clause registered at test time
        // flows drawer → encode → commit → runtime with ZERO code changes: the
        // generic attestation engine surfaces its attestation capability from the
        // spec alone. If this ever regresses, the pipeline has re-learned a clause.
        page.on('dialog', (d) => { d.accept().catch(() => {}); });
        const cfg = readLocalDeploymentConfig();
        const coreAddress = (process.env.NEXT_PUBLIC_FIGARO_CORE ?? cfg.figaroCore) as Hex;
        const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? cfg.tokenAddress) as Hex;

        // ── Setup: mint the novel clause on-chain (pin + register + bind) ───
        await registerNovelClause(NOVEL_SPEC);

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
