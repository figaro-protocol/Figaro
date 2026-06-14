/**
 * permissionless-multiorder.devnet.spec.ts — THE MULTI-ORDER acceptance test.
 *
 * The single-order `permissionless-clause` spec proves a never-before-seen
 * clause flows drawer → encode → commit → runtime. This spec proves the next
 * thing the protocol claims: AT RUNTIME THE ASSEMBLY RUNS. A multi-node
 * assembly, authored at test time from clauses no code in this repo has ever
 * heard of, commits as a real N-order process, and the generic runtime engine
 * runs EVERY order's clause — each seller advances its own lifecycle through the
 * one clause-agnostic capability rail — then the buyer resolves atomically.
 *
 *   author  → a 2-node assembly (root + one sub-order), each node a DISTINCT
 *             novel runtime clause, NO proximity / NO hand-off (the assembly
 *             that does multi-order coordination with nothing physical between)
 *   onboard → a LEAD seller bound to the assembly (its profile names the
 *             contributor for the sub-order's clause) + a CONTRIBUTOR seller
 *   commit  → the buyer places ONE order from the lead; the profile-bound
 *             multi-node assembly commits BOTH orders (root + sub) atomically
 *   run     → each seller walks its order's novel clause ladder to completion
 *             through `capability-execute-submit-clause-attestation` — the SAME
 *             generic rail, no clause names, two different clauses
 *   resolve → the buyer resolves the process; activeOrderCount → 0
 *
 * Self-contained, like `permissionless-clause`: everything (both clauses, both
 * sellers, the assembly) is minted on the EXISTING chain at test time — no
 * redeploy, no seed, no fixtures, no roster, no hardcoded clause/seller/assembly
 * identity in any product surface. If a clause the codebase has never seen can
 * drive a multi-order assembly to atomic settlement, the runtime is open-world.
 *
 * Requires Anvil + ./scripts/devup.sh + Kubo + the dev server.
 */
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import {
    createPublicClient, createWalletClient, http,
    parseEther, type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
    seedRegisteredSeller,
    pinJSONToIPFS,
    discoverSellerByAssembly,
    ensureTokenApprovalsByAddress,
    acceptOrderInInboxUI,
    localPublicClient,
    CORE_PROCESS_VIEW_ABI,
    readLocalDeploymentConfig,
    registerNovelClause,
    assemblyAnchored,
    nodeIds,
    addSubOrder,
    RPC_URL,
    LOCAL_ANVIL,
} from './devnet-helpers';
import { ANVIL_KEYS, anvilKeyAt } from '../anvilAccounts';

const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';
const REGISTRAR_KEY = ANVIL_KEYS[0] as Hex; // anvil[0] — the buyer
const BUYER_ADDR = privateKeyToAccount(REGISTRAR_KEY).address;

const TOKEN_MINT_ABI = [
    { type: 'function', name: 'mint', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [] },
] as const;
// ── Two novel runtime clauses, NO hand-off. Each is a category-1 lifecycle with
//    its own enum ladder; nothing in the repo names either. The root carries
//    one, the sub-order the other — proving the generic rail runs two unrelated
//    clauses side by side in one process. ──────────────────────────────────────
const ROOT_CLAUSE_ID = 'figaro-probe-root';
const SUB_CLAUSE_ID = 'figaro-probe-sub';
const MULTI_SLUG = 'permissionless-multiorder';

const ROOT_SPEC = {
    clauseId: ROOT_CLAUSE_ID, version: 1,
    title: 'Permissionless probe — lead lifecycle',
    description: 'A brand-new runtime clause on the lead order. No hand-off, no proximity. Registered at test time to prove the runtime engine runs a multi-order assembly from specs alone.',
    categories: ['lifecycle'],
    fields: [{ name: 'eventType', type: 'enum', values: ['opened', 'fulfilled', 'closed'], required: true, description: 'Lead lifecycle event.' }],
    block: { tier: 'category-1', article: 'attestations', attestation: 'seller', mechanismKinds: ['coordinator'], moduleIds: [] },
};
const SUB_SPEC = {
    clauseId: SUB_CLAUSE_ID, version: 1,
    title: 'Permissionless probe — contributor lifecycle',
    description: 'A brand-new runtime clause on the contributor sub-order. A DIFFERENT ladder from the lead clause, no hand-off — the two run independently through the one generic rail.',
    categories: ['lifecycle'],
    fields: [{ name: 'eventType', type: 'enum', values: ['accepted', 'delivered'], required: true, description: 'Contributor lifecycle event.' }],
    block: { tier: 'category-1', article: 'attestations', attestation: 'seller', mechanismKinds: ['coordinator'], moduleIds: [] },
};

// Register + bind via the shared third-party path (devnet-helpers
// `registerNovelClause`): the spec's own MockClauseValidator is deployed and
// bound atomically through ClauseRegistrationHelper — registering Layer A
// without a Layer C validator would leave every attestation reverting
// `ValidatorNotSet`.

/** Fund a seller wallet with the mock token so it can post bonds (MockERC20.mint
 *  is public). Setup DATA — every seller needs balance; idempotent top-up. */
async function fundToken(addr: Hex, amount: bigint): Promise<void> {
    const cfg = readLocalDeploymentConfig();
    const token = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? cfg.tokenAddress) as Hex;
    const pub = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const wallet = createWalletClient({ account: privateKeyToAccount(REGISTRAR_KEY), chain: LOCAL_ANVIL, transport: http(RPC_URL) });
    const { request } = await pub.simulateContract({
        account: BUYER_ADDR, address: token, abi: TOKEN_MINT_ABI, functionName: 'mint', args: [addr, amount],
    });
    await pub.waitForTransactionReceipt({ hash: await wallet.writeContract(request) });
}

/**
 * Register a seller at `addressIndex` with one catalogue item, through the
 * CANONICAL idempotent seeder (register once, updateProfile on re-runs —
 * self-healing if anything else ever stamped this index). Optionally bind it
 * to an assembly (the LEAD) with `counterpartyBindings` that name the
 * contributor for a sub-order's clause; a contributor is priced from a
 * `component` item. Setup DATA, the same profile shape the wizard pins.
 * Index census: 15/16 are this spec's own (see anvilAccounts).
 */
async function registerSeller(opts: {
    addressIndex: number;
    itemCategory: string;
    assemblySlug?: string;
    counterpartyBindings?: Array<{ clauseId: string; addresses: string[] }>;
}): Promise<Hex> {
    const cfg = readLocalDeploymentConfig();
    const token = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? cfg.tokenAddress) as Hex;
    const key = anvilKeyAt(opts.addressIndex);
    const address = privateKeyToAccount(key).address;
    const { uri: catalogueURI } = await pinJSONToIPFS({
        subjectAddress: address, version: '0.1.0', unitSystem: 'metric',
        menu: [{ id: `probe-item-${opts.addressIndex}`, name: `Probe Item ${opts.addressIndex}`, description: 'probe', price: '1', pricingPolicy: 'fixed', category: opts.itemCategory, available: true }],
    });
    await seedRegisteredSeller({
        walletKey: key,
        profile: {
            name: `Probe Seller ${opts.addressIndex}`, specialty: 'permissionless probe',
            catalogueURI, location: { geohash: '9q8yyk8yu' },
            acceptedTokens: [{ address: token, symbol: 'MOCK', chainId: 31337 }],
            defaultTokenAddress: token,
            assemblyBindings: opts.assemblySlug
                ? [{ bindingId: `${opts.assemblySlug}:${address.toLowerCase()}`, subjectAddress: address, assemblySlug: opts.assemblySlug, counterpartyBindings: opts.counterpartyBindings ?? [] }]
                : [],
        },
    });
    return address as Hex;
}


test.describe('PERMISSIONLESS MULTI-ORDER — the assembly RUNS at runtime', () => {
    test.setTimeout(420_000);

    test('a 2-node assembly of two never-seen clauses commits, runs each order, and resolves atomically', async ({ page }) => {
        page.on('dialog', (d) => { d.accept().catch(() => {}); });
        const cfg = readLocalDeploymentConfig();
        const coreAddress = (process.env.NEXT_PUBLIC_FIGARO_CORE ?? cfg.figaroCore) as Hex;
        const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ?? cfg.tokenAddress) as Hex;
        const publicClient = localPublicClient();

        // ── Setup: mint both novel clauses on-chain ─────────────────────────
        await registerNovelClause(ROOT_SPEC);
        await registerNovelClause(SUB_SPEC);

        // ── Author the 2-node assembly ONCE (persisted). Root carries the lead
        //    clause; the click-authored sub-order carries the contributor clause.
        if (!(await assemblyAnchored(MULTI_SLUG))) {
            await page.goto('/builders/designer/new?fresh=1&e2e=devnet', { waitUntil: 'domcontentloaded' });
            await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
            await page.getByTestId('designer-saved-hint').waitFor({ timeout: 15000 });
            const orderNodes = page.locator('[data-testid^="order-node-"]:not([data-testid$="-delete"])');
            await expect(orderNodes).toHaveCount(1, { timeout: 10000 });
            const [root] = await nodeIds(page);
            const sub = await addSubOrder(page, root);
            await expect(orderNodes).toHaveCount(2, { timeout: 10000 });

            // Compose a DISTINCT novel clause on each node via the per-node drawer.
            await page.getByTestId(`order-node-${root}`).click();
            await page.getByTestId('agreement-drawer').waitFor({ state: 'visible', timeout: 10000 });
            await page.getByTestId(`drawer-node-tab-${root}`).click();
            await page.getByTestId('drawer-tab-registry').click();
            await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });
            const rootBox = page.getByTestId(`drawer-registry-clause-${ROOT_CLAUSE_ID}`);
            await expect(rootBox, 'DRAWER surfaces the never-seen lead clause').toHaveCount(1, { timeout: 20000 });
            await rootBox.check();

            await page.getByTestId(`drawer-node-tab-${sub}`).click();
            await page.getByTestId('drawer-tab-registry').click();
            const subBox = page.getByTestId(`drawer-registry-clause-${SUB_CLAUSE_ID}`);
            await expect(subBox, 'DRAWER surfaces the never-seen contributor clause').toHaveCount(1, { timeout: 20000 });
            await subBox.check();

            await page.getByTestId('designer-name-input').fill('Permissionless Multiorder');
            await expect(page.getByTestId('designer-review')).toBeEnabled({ timeout: 5000 });
            await page.getByTestId('designer-review').click();
            await page.waitForURL(new RegExp(`/builders/designer/view/${MULTI_SLUG}`), { timeout: 15000 });
            await page.goto(`/builders/designer/view/${MULTI_SLUG}?intent=publish&e2e=devnet`, { waitUntil: 'domcontentloaded' });
            const confirmBtn = page.getByTestId('review-confirm-publish');
            await confirmBtn.waitFor({ state: 'visible', timeout: 15000 });
            await page.waitForFunction(
                () => !Array.from(document.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Connect Wallet'),
                null, { timeout: 30000 });
            await confirmBtn.click();
            await expect(page.getByText(/Published\b/i).first()).toBeVisible({ timeout: 60000 });
        }

        // ── Onboard the contributor first (the lead's binding names it), then
        //    the lead bound to the assembly with the sub-order's clause → it. ──
        const contributorAddr = await registerSeller({ addressIndex: 16, itemCategory: 'component' });
        const leadAddr = await registerSeller({
            addressIndex: 15, itemCategory: 'General', assemblySlug: MULTI_SLUG,
            counterpartyBindings: [{ clauseId: SUB_CLAUSE_ID, addresses: [contributorAddr] }],
        });
        await fundToken(leadAddr, parseEther('1000000'));
        await fundToken(contributorAddr, parseEther('1000000'));
        await ensureTokenApprovalsByAddress(coreAddress, tokenAddress, BUYER_ADDR, leadAddr, contributorAddr);

        // ── COMMIT: the buyer places one order from the lead; the profile-bound
        //    2-node assembly commits BOTH orders (root + sub) atomically. ─────
        const discovered = await discoverSellerByAssembly(MULTI_SLUG);
        expect(discovered.address.toLowerCase()).toBe(leadAddr.toLowerCase());

        await page.goto(`/s/${leadAddr}?e2e=devnet`, { waitUntil: 'domcontentloaded' });
        const detailView = page.getByTestId('seller-detail-view');
        await detailView.waitFor({ state: 'visible', timeout: 30000 });
        const addButton = page.locator('[data-testid^="btn-add-"]').first();
        await addButton.waitFor({ state: 'visible', timeout: 30000 });
        await addButton.click();
        await expect(page.locator('[data-testid^="cart-line-"]').first()).toBeVisible({ timeout: 10000 });
        // Browse → checkout: the seller page is browse-only; commit lives on checkout.
        await page.getByTestId('btn-review-order').click();
        await page.getByTestId('checkout-view').waitFor({ state: 'visible', timeout: 30000 });
        await page.getByTestId('btn-place-order').click();
        // No pre-sign modal — the inline agreement terms ARE the review. The buyer
        // funds every order up front: place-order signs + relays each sub-order
        // onto the coordination channel, then surfaces the root in the
        // buyer-share-panel. The buyer relays the root; each seller counter-signs
        // its OWN order in their inbox — the genuine bilateral relay, no
        // auto-counter-sign. Kernel commit order → the LEAD accepts first (root
        // creates the process), then the CONTRIBUTOR (sub extends it).
        await page.getByTestId('buyer-share-panel').waitFor({ state: 'visible', timeout: 60000 });
        await page.getByTestId('send-commitment-xmtp').click();
        await expect(page.getByTestId('commitment-xmtp-status')).toContainText(/sent over XMTP/i, { timeout: 45000 });
        const processId = await acceptOrderInInboxUI(page, leadAddr);
        await acceptOrderInInboxUI(page, contributorAddr);

        const committed = await publicClient.readContract({
            address: coreAddress, abi: CORE_PROCESS_VIEW_ABI, functionName: 'processes', args: [processId],
        });
        expect(committed[0].toLowerCase(), 'rootBuyer is the buyer').toBe(BUYER_ADDR.toLowerCase());
        expect(committed[3], 'both orders (root + sub) committed active').toBe(2);

        // ── RUN: each seller walks its order's novel clause to completion through
        //    the ONE generic rail — two different clauses, no clause names. ────
        const walkLadder = async (sellerAddr: Hex, ladderLen: number, who: string) => {
            await gotoAsWallet(page, sellerAddr, `/orders/${processId}?e2e=devnet`);
            await page.getByTestId('order-timeline-view').waitFor({ state: 'visible', timeout: 30000 });
            const railBtn = page.getByTestId('capability-execute-submit-clause-attestation');
            for (let i = 0; i < ladderLen; i++) {
                await expect(railBtn, `${who}: generic rail surfaces stage ${i + 1}/${ladderLen}`).toBeEnabled({ timeout: 90000 });
                await railBtn.click();
            }
            // UI reaction: the clause's ladder is fully attested → its capability retires.
            await expect(railBtn, `${who}: rail retires once the novel clause is fully run`).toHaveCount(0, { timeout: 90000 });
        };
        await walkLadder(leadAddr, ROOT_SPEC.fields[0].values.length, 'lead');
        await walkLadder(contributorAddr, SUB_SPEC.fields[0].values.length, 'contributor');

        // ── RESOLVE: the buyer resolves → atomic settlement of BOTH orders. ──
        await gotoAsWallet(page, BUYER_ADDR, `/orders/${processId}?e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ state: 'visible', timeout: 30000 });
        const resolveBtn = page.getByTestId('capability-execute-resolve-process');
        await resolveBtn.waitFor({ state: 'visible', timeout: 30000 });
        await resolveBtn.click();
        await expect(page.getByTestId('order-status-pill')).toHaveText(/Completed/i, { timeout: 90000 });

        // Out-of-band: both orders really settled on-chain (a confirmation OF the UI).
        const resolved = await publicClient.readContract({
            address: coreAddress, abi: CORE_PROCESS_VIEW_ABI, functionName: 'processes', args: [processId],
        });
        expect(Number(resolved[3]), 'atomic settlement zeroed the active order count').toBe(0);
    });
});
