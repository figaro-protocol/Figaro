/**
 * freelancer-chain.devnet.spec.ts
 *
 * FREELANCE VALUE CHAIN — the reference assembly's named test
 * (assemblies/freelancer-value-chain.json; family 8b — a lead freelancer and
 * two contributors, each a co-equal bonded order in one process, every
 * deliverable traveling the encrypted content hand-off, one resolution).
 *
 * The spec CONSUMES the anchored reference (registry → IPFS, discovered by
 * shape: three orders, every one composing the content hand-off — no other
 * anchored assembly does), seeds its three sellers (the lead's binding
 * designates the contributors through the per-clause commit-order cursor),
 * and runs the chain end to end with every value leg from chain:
 *
 *   checkout  the client signs three orders (virtual modality, encrypted
 *             transfer on every deliverable), relays.
 *   accepts   lead then contributors accept on their own /orders; exact
 *             2P/2G bond deltas after each commit.
 *   delivery  the client requests each deliverable through the declared
 *             ecdh-content interaction; each freelancer delivers its
 *             artifact — encrypt → channel → stage-1 attestation in one
 *             gesture; every attestation verified on the coordinator.
 *   resolve   one signature pays the whole chain; net positions per wallet.
 *
 * A SECOND PASS rides the same chain with a contributor that lists in
 * another token: contributor-1's profile denominates its catalog in MPMT
 * while the lead and contributor-2 list in MOCK, and the venue quotes at a
 * non-unit rate (3:7, restored after):
 *
 *   checkout  the buyer picks MOCK, the one denomination; the checkout
 *             translates contributor-1's listed price into it from the
 *             venue's quote; the buyer signs all three orders.
 *   accepts   each seller countersigns at /sign in walk order; contributor-1
 *             reads its own listed price beside the amount it signs, and
 *             chooses to fund its bond from MPMT through the coordinator; the
 *             lead and contributor-2, listed in the denomination, see no
 *             translation.
 *   chain     every OrderCommitted carries its signed payment in MOCK, the
 *             cumulative value grows by each, the bonds are 2× payment and
 *             2× cumulative value; contributor-1's catalog price on IPFS is
 *             untouched; the funding leg MPMT → MOCK, read from its commit
 *             receipt through the SDK's `readFundingLegs`, is an edge in the
 *             value-flow graph; one resolve pays every seller in MOCK.
 */
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import {
    ATTESTATION_COORDINATOR_ABI,
    calculateBonds,
    parseOrderCommittedLogs,
    parseOrderResolvedLogs,
    parseProcessResolvedLogs,
} from '@figaro-protocol/sdk';
import { projectResolutionGraph, projectValueFlow, readFundingLegs } from '@figaro-protocol/sdk/derive';
import { mnemonicToAccount } from 'viem/accounts';
import { createPublicClient, createWalletClient, http, parseAbi, parseUnits, type Hex } from 'viem';
import {
    LOCAL_ANVIL,
    RPC_URL,
    authorizeFundingToken,
    confirmAgreementPreviews,
    discoverAnchoredAssemblies,
    latestMemberProfileURI,
    pinJSONToIPFS,
    readLocalDeploymentConfig,
    resolveIpfsURI,
    seedRegisteredMember,
    waitForConnected,
} from './devnet-helpers';
import { formatToken } from '@/lib/shared/utils';
import { CORE_ABI } from '@/lib/kernel/contracts';
import { truncateHex } from '@/lib/shared/formatHex';
import { ANVIL_ACCOUNTS, ANVIL_KEYS } from '../anvilAccounts';
import type { Page } from '@playwright/test';

const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';
const CONTENT_CLAUSE = 'figaro-content-handoff';
const ERC20_ABI = parseAbi([
    'function balanceOf(address) view returns (uint256)',
    'function mint(address to, uint256 amount) external',
]);
const VENUE_ABI = parseAbi([
    'function rateNumerator() view returns (uint256)',
    'function rateDenominator() view returns (uint256)',
    'function setRate(uint256 numerator, uint256 denominator)',
]);

const BUYER = ANVIL_ACCOUNTS[0] as Hex;
// Shared-world wallets, re-seeded unconditionally each run (the
// dispatch-race idempotency style — other specs re-assert their own).
// Indices 22-24: DEDICATED to this spec, past the populate-seeded sellers
// (5-12) and every other spec's self-seeded range. Self-seeding a
// populate-owned index (this spec once used 9/10/11 = Saffron/Pomodoro/Harbor)
// STOMPS the shared catalog that adopters like assembly-chain read
// read-only — the wallet-index-collision class. anvil runs --accounts 39.
const CHAIN_SELLERS: Array<{ index: number; label: string; item: string; price: string }> = [
    { index: 22, label: 'lead', item: 'Lead deliverable', price: '2' },
    { index: 23, label: 'contributor-1', item: 'Edit pass', price: '0.5' },
    { index: 24, label: 'contributor-2', item: 'Translation', price: '0.5' },
];
const EXPECTED_TOTAL = parseUnits('3', 18);

type ChainSeller = (typeof CHAIN_SELLERS)[number] & { address: Hex };
type ListedToken = { address: Hex; symbol: string };

/** Seed the three freelancers (unconditional re-assert): each catalog item
 *  is priced in the token `listsIn` names for that seller (its profile's
 *  default), every seller accepts every token in `accepted`, and the lead's
 *  binding designates the contributors — the per-clause cursor maps the
 *  content clause to [c1, c2] in commit order. Returns each seller's pinned
 *  catalog address. */
async function seedChainSellers(
    slug: string,
    sellers: ChainSeller[],
    accepted: ListedToken[],
    listsIn: (s: ChainSeller) => ListedToken,
): Promise<Map<string, string>> {
    const contributors = sellers.filter((s) => s.label !== 'lead');
    const catalogs = new Map<string, string>();
    for (const s of sellers) {
        const { uri: catalogURI } = await pinJSONToIPFS({
            subjectAddress: s.address,
            version: '1.0.0',
            unitSystem: 'metric' as const,
            items: [{
                id: `chain-${s.label}`,
                name: s.item,
                description: `${s.item} — freelancer-value-chain reference scenario`,
                price: s.price,
                category: 'digital',
                image: '🎨',
                available: true,
            }],
        });
        catalogs.set(s.address.toLowerCase(), catalogURI);
        const own = listsIn(s);
        await seedRegisteredMember({
            walletKey: ANVIL_KEYS[s.index] as Hex,
            profile: {
                name: `Chain ${s.label}`,
                description: `${s.label} — seeded by freelancer-chain.devnet.spec.ts`,
                catalogURI,
                acceptedTokens: [own, ...accepted.filter((t) => t.address.toLowerCase() !== own.address.toLowerCase())]
                    .map((t) => ({ address: t.address, symbol: t.symbol, chainId: 31337 })),
                defaultTokenAddress: own.address,
                assemblyBindings: [{
                    bindingId: `chain-${s.label}`,
                    subjectAddress: s.address,
                    assemblySlug: slug,
                    counterpartyBindings: s.label === 'lead'
                        ? [{ clauseId: CONTENT_CLAUSE, addresses: contributors.map((c) => c.address) }]
                        : [],
                }],
            },
        });
    }
    return catalogs;
}

/** The checkout particulars every order of the chain takes: virtual
 *  modality; encrypted transfer + jurisdiction geohashes on EVERY
 *  deliverable. */
async function fillChainCheckout(page: Page) {
    await page.locator('[data-testid^="checkout-field-"][data-testid$="-figaro-modalities-modality-virtual"]').first().check();
    const everyField = async (fieldPath: string, action: (c: ReturnType<typeof page.locator>) => Promise<void>) => {
        const controls = page.locator(`[data-testid^="checkout-field-"][data-testid$="-${fieldPath}"]`);
        const n = await controls.count();
        expect(n, `at least one control for ${fieldPath}`).toBeGreaterThan(0);
        for (let i = 0; i < n; i++) await action(controls.nth(i));
    };
    await everyField(`${CONTENT_CLAUSE}-contentHandoff-encrypted-transfer`, (c) => c.check());
    await everyField('figaro-geolocation-origin', (c) => c.fill('9q8yyk'));
    await everyField('figaro-geolocation-destination', (c) => c.fill('u15pk4'));
}

/** THE SHAPE: exactly three orders, every one composing the content
 *  hand-off — the freelancer-value-chain reference and nothing else. */
async function findChainAssembly(): Promise<string> {
    const t = (await discoverAnchoredAssemblies()).find((a) =>
        a.agreements.length === 3
        && a.agreements.every((o) => CONTENT_CLAUSE in (o.clauses ?? {})));
    expect(t, 'the freelancer-value-chain reference is anchored (assemblies/ — run populate-test-data)').toBeTruthy();
    return t!.slug;
}

test.describe('FREELANCE VALUE CHAIN — three bonded deliverables over the encrypted hand-off, one resolution (devnet)', () => {
    test.setTimeout(600_000);

    test('client signs, freelancers bond and deliver, one resolve pays the chain', async ({ page }) => {
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });
        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const token = config.tokenAddress as Hex;
        const coordinator = config.attestationCoordinator as Hex;
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const balanceOf = (who: Hex) =>
            publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;

        const slug = await findChainAssembly();
        const sellers = CHAIN_SELLERS.map((s) => ({
            ...s,
            address: mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: s.index }).address as Hex,
        }));
        const lead = sellers[0];

        // ── SEED the three freelancers, every catalog in MOCK. ──
        const mock = { address: token, symbol: 'MOCK' };
        await seedChainSellers(slug, sellers, [mock], () => mock);

        // ── FUND everyone (permissionless devnet mint) + BASELINES. ──
        const minter = createWalletClient({
            account: mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 0 }), chain: LOCAL_ANVIL, transport: http(RPC_URL),
        });
        for (const who of [BUYER, ...sellers.map((s) => s.address)]) {
            const h = await minter.writeContract({
                address: token, abi: ERC20_ABI, functionName: 'mint', args: [who, parseUnits('1000', 18)],
            });
            await publicClient.waitForTransactionReceipt({ hash: h });
        }
        const base = new Map<string, bigint>();
        for (const who of [BUYER, core, ...sellers.map((s) => s.address)]) {
            base.set(who.toLowerCase(), await balanceOf(who));
        }

        // ── CHECKOUT: the client signs the three-order chain. ──
        await page.goto(`/s/view?seller=${lead.address}&e2e=devnet`, { waitUntil: 'domcontentloaded' });
        await page.getByTestId('member-detail-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const addBtn = page.locator('[data-testid^="btn-add-"]').first();
        await addBtn.waitFor({ state: 'visible', timeout: 20000 });
        await addBtn.click();
        await page.getByTestId('btn-review-order').click();
        await page.getByTestId('checkout-view').waitFor({ timeout: 20000 });
        await waitForConnected(page);
        await fillChainCheckout(page);
        await expect(page.getByTestId('checkout-view')).toContainText('3', { timeout: 20000 });
        const place = page.getByTestId('btn-place-order');
        await expect(place, 'client connected + assembly bound → "Place order"').toHaveText(/Place order/, { timeout: 20000 });
        await place.click();
        await confirmAgreementPreviews(page, 3);
        await page.getByTestId('buyer-share-panel').waitFor({ timeout: 60000 });
        await page.getByTestId('send-commitment-xmtp').click();
        await expect(page.getByTestId('commitment-xmtp-status')).toBeVisible({ timeout: 30000 });

        // ── ACCEPTS in commit order; exact bond deltas after each. ──
        const queryCommitted = () => publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: BUYER }, fromBlock: 0n,
        });
        const committedBefore = (await queryCommitted()).length;
        let expectedCumulative = 0n;
        let buyerBondSoFar = 0n;
        let escrowSoFar = 0n;
        let processId: `0x${string}` | undefined;
        for (const s of sellers) {
            const before = (await queryCommitted()).length;
            await gotoAsWallet(page, s.address, '/orders?e2e=devnet');
            await page.getByTestId('orders-list').waitFor({ timeout: 30000 });
            await waitForConnected(page);
            await page.getByTestId('order-your-turn-card').first().waitFor({ state: 'visible', timeout: 30000 });
            await page.getByTestId('btn-accept-order').first().click();
            await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
            await page.getByTestId('preview-confirm').click();
            await expect.poll(async () => (await queryCommitted()).length, {
                timeout: 60000, message: `${s.label}'s accept lands OrderCommitted`,
            }).toBe(before + 1);
            const events = await queryCommitted();
            const event = events[events.length - 1];
            expect(event.args.seller?.toLowerCase(), `${s.label} committed`).toBe(s.address.toLowerCase());
            if (!processId) processId = event.args.processId as `0x${string}`;
            else expect(event.args.processId, `${s.label} extends the SAME process`).toBe(processId);
            const payment = parseUnits(s.price, 18);
            expectedCumulative += payment;
            expect(event.args.payment, `${s.label}'s payment = its catalog price`).toBe(payment);
            expect(event.args.cumulativeValue, `cumulative after ${s.label}`).toBe(expectedCumulative);
            const bonds = calculateBonds(event.args.cumulativeValue!, event.args.payment!);
            buyerBondSoFar += bonds.buyerBond;
            escrowSoFar += bonds.buyerBond + bonds.sellerBond;
            const [b, sb, c] = await Promise.all([balanceOf(BUYER), balanceOf(s.address), balanceOf(core)]);
            expect(base.get(BUYER.toLowerCase())! - b, `after ${s.label}: buyer down by its bonds so far`).toBe(buyerBondSoFar);
            expect(base.get(s.address.toLowerCase())! - sb, `${s.label} bonds 2× cumulative value through its own link`).toBe(bonds.sellerBond);
            expect(c - base.get(core.toLowerCase())!, 'escrow holds every bond so far').toBe(escrowSoFar);
        }
        expect((await queryCommitted()).length, 'exactly three orders committed').toBe(committedBefore + 3);

        // ── DELIVERY: the client requests each deliverable; each freelancer
        //    answers through the ecdh-content ceremony — encrypt → channel →
        //    stage-1 attestation, verified on the coordinator. ──
        const attestationCount = async () => (await publicClient.getContractEvents({
            address: coordinator, abi: ATTESTATION_COORDINATOR_ABI, eventName: 'Attestation',
            args: { processId }, fromBlock: 0n,
        })).length;

        await gotoAsWallet(page, BUYER, `/orders/view?process=${processId}&e2e=devnet`);
        await waitForConnected(page);

        // ── RE-ASSERT CARDS name their order: the client is a party to all
        //    three orders, so it holds one re-assert card per order; each card
        //    names its order by position on the chain and seller. The expected
        //    names come from the process's OrderCommitted events, read fresh;
        //    the chain's cumulative value ranks the orders in commit order. ──
        const processOrders = (await queryCommitted())
            .filter((e) => e.args.processId === processId)
            .sort((a, b) => (a.args.cumulativeValue! < b.args.cumulativeValue! ? -1 : 1));
        expect(processOrders, 'the process holds exactly three orders').toHaveLength(3);
        const expectedOrderLabels = processOrders
            .map((e, i) => `Order ${i + 1} of 3 · seller ${truncateHex(e.args.seller!)}`)
            .sort();
        const reassertOrderLabels = page.getByTestId('capability-reassert-committed-sections')
            .getByTestId('capability-order-label');
        await expect(reassertOrderLabels, 'one re-assert card per order of the process').toHaveCount(3, { timeout: 30000 });
        expect((await reassertOrderLabels.allTextContents()).sort(),
            'each card names a distinct order: its position and its seller').toEqual(expectedOrderLabels);

        const panels = page.getByTestId('interaction-content-panel');
        await expect(panels.first(), 'the declared interaction mounts for the client').toBeVisible({ timeout: 30000 });
        await expect(panels, 'one content panel per deliverable').toHaveCount(3, { timeout: 30000 });
        for (let i = 0; i < 3; i++) {
            const request = panels.nth(i).getByTestId('interaction-content-request');
            await request.click();
            await expect(request).toContainText(/Requested/, { timeout: 30000 });
        }

        for (const [i, s] of sellers.entries()) {
            const before = await attestationCount();
            await gotoAsWallet(page, s.address, `/orders/view?process=${processId}&e2e=devnet`);
            await waitForConnected(page);
            const panel = page.getByTestId('interaction-content-panel').first();
            await expect(panel, `${s.label}'s own panel mounts`).toBeVisible({ timeout: 30000 });
            const fileInput = panel.getByTestId('interaction-content-file');
            await fileInput.waitFor({ state: 'visible', timeout: 30000 });
            await fileInput.setInputFiles({
                name: `${s.label}-deliverable.txt`,
                mimeType: 'text/plain',
                buffer: Buffer.from(`Deliverable ${i + 1} — ${s.item} for the freelance value chain.`),
            });
            await expect(
                panel.getByTestId('interaction-content-sent'),
                `${s.label}'s artifact delivers privately and the completion evidence anchors`,
            ).toBeVisible({ timeout: 60000 });
            await expect.poll(attestationCount, {
                timeout: 60000, message: `${s.label}'s stage-1 attestation lands on the coordinator`,
            }).toBe(before + 1);
        }

        // ── RESOLVE: one signature pays the whole chain. ──
        const resolvedBefore = (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'ProcessResolved', args: { buyer: BUYER }, fromBlock: 0n,
        })).length;
        await gotoAsWallet(page, BUYER, `/orders/view?process=${processId}&e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const resolveBtn = page.getByTestId('capability-execute-resolve-process');
        await expect(resolveBtn, 'the client can resolve the active process').toBeEnabled({ timeout: 30000 });
        await resolveBtn.click();
        await expect.poll(async () => (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'ProcessResolved', args: { buyer: BUYER }, fromBlock: 0n,
        })).length, { timeout: 60000, message: 'ProcessResolved lands on-chain' }).toBe(resolvedBefore + 1);

        // ── RESOLUTION: client −3, each freelancer +its price, escrow home. ──
        for (const s of sellers) {
            expect((await balanceOf(s.address)) - base.get(s.address.toLowerCase())!,
                `${s.label} net earned exactly its price`).toBe(parseUnits(s.price, 18));
        }
        expect(base.get(BUYER.toLowerCase())! - (await balanceOf(BUYER)), 'client net paid the chain total')
            .toBe(EXPECTED_TOTAL);
        expect(await balanceOf(core), 'FigaroCore escrow returned to its baseline')
            .toBe(base.get(core.toLowerCase())!);

        // ── AUDIT: three content-hand-off witness receipts, each DECODED. ──
        // The chain carries only the fingerprint (WS2); the attester published
        // the public-disposition preimage at the keccak-CID that fingerprint
        // derives, so the audit reader resolves, verifies, and renders the
        // values again — from network state, not calldata.
        await page.goto(`/audit/view?process=${processId}&e2e=devnet`, { waitUntil: 'domcontentloaded' });
        await page.getByTestId('audit-page').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const evidence = page.getByTestId('audit-clause-evidence');
        await evidence.waitFor({ state: 'visible', timeout: 30000 });
        await expect(
            evidence.locator(`[data-testid="audit-content-ref-${CONTENT_CLAUSE}-1"]`),
            'every deliverable\'s completion is receipted in the audit',
        ).toHaveCount(3, { timeout: 60000 });
        const contentWitness = evidence.locator(`[data-testid="audit-witness-${CONTENT_CLAUSE}-1"]`);
        await expect(
            contentWitness,
            'every deliverable\'s completion evidence decodes in the audit',
        ).toHaveCount(3, { timeout: 60000 });
        await expect(contentWitness.first().getByText('Delivered content hash')).toBeVisible();
    });

    test('a contributor listing in another token: the buyer picks one denomination, translates the listed price, each seller countersigns, the funding leg is an edge', async ({ page }) => {
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });
        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const mockToken = config.tokenAddress as Hex;      // MOCK — the lead's and contributor-2's listing token
        const otherToken = config.permitTokenAddress as Hex; // MPMT — contributor-1's listing token
        const swapCoordinator = config.witnessSwapAndCommitCoordinator as Hex;
        const venue = config.swapRouter as Hex;
        expect(core && mockToken && otherToken && swapCoordinator && venue,
            'full deployment record with a swap venue (run ./scripts/deploy-local.sh)').toBeTruthy();
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const balanceOf = (erc20: Hex, who: Hex) =>
            publicClient.readContract({ address: erc20, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;
        const minter = createWalletClient({
            account: mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 0 }), chain: LOCAL_ANVIL, transport: http(RPC_URL),
        });

        const slug = await findChainAssembly();
        const sellers = CHAIN_SELLERS.map((s) => ({
            ...s,
            address: mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: s.index }).address as Hex,
        }));
        const [lead, c1, c2] = sellers;

        // ── SEED: contributor-1 denominates its catalog in MPMT; the lead and
        //    contributor-2 in MOCK; every seller accepts both. ──
        const mock = { address: mockToken, symbol: 'MOCK' };
        const other = { address: otherToken, symbol: 'MPMT' };
        const catalogs = await seedChainSellers(slug, sellers, [mock, other], (s) => (s.label === c1.label ? other : mock));
        /** contributor-1's listed price, read out of band from its pinned
         *  profile and catalog (registry events → IPFS). */
        const c1Listing = async () => {
            const profileURI = await latestMemberProfileURI(c1.address);
            const profile = await (await fetch(resolveIpfsURI(profileURI!))).json() as { catalogURI: string; defaultTokenAddress: string };
            const catalog = await (await fetch(resolveIpfsURI(profile.catalogURI))).json() as { items: Array<{ id: string; price: string }> };
            return { catalogURI: profile.catalogURI, defaultToken: profile.defaultTokenAddress, item: catalog.items[0] };
        };
        const listedBefore = await c1Listing();
        expect(listedBefore.defaultToken.toLowerCase(), 'contributor-1 lists in MPMT').toBe(otherToken.toLowerCase());
        expect(listedBefore.catalogURI).toBe(catalogs.get(c1.address.toLowerCase()));

        // ── FUND (scenario pre-population, not the act under test): every
        //    party holds MOCK; contributor-1 also holds MPMT, the token it
        //    lists in, and funds its bond from it through the venue. ──
        for (const [erc20, who] of [[mockToken, BUYER], [mockToken, lead.address], [mockToken, c2.address], [mockToken, c1.address], [otherToken, c1.address]] as const) {
            const h = await minter.writeContract({ address: erc20, abi: ERC20_ABI, functionName: 'mint', args: [who, parseUnits('1000', 18)] });
            await publicClient.waitForTransactionReceipt({ hash: h });
        }

        // A non-unit venue rate (3 out per 7 in), restored after.
        const [rateNumBefore, rateDenBefore] = await Promise.all([
            publicClient.readContract({ address: venue, abi: VENUE_ABI, functionName: 'rateNumerator' }),
            publicClient.readContract({ address: venue, abi: VENUE_ABI, functionName: 'rateDenominator' }),
        ]);
        const setVenueRate = async (num: bigint, den: bigint) => {
            const h = await minter.writeContract({ address: venue, abi: VENUE_ABI, functionName: 'setRate', args: [num, den] });
            await publicClient.waitForTransactionReceipt({ hash: h });
        };
        await setVenueRate(3n, 7n);
        try {
            const queryCommitted = () => publicClient.getContractEvents({
                address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: BUYER }, fromBlock: 0n,
            });
            const committedBefore = (await queryCommitted()).length;
            const base = new Map<string, bigint>();
            for (const who of [BUYER, core, lead.address, c2.address, c1.address]) {
                base.set(`mock:${who.toLowerCase()}`, await balanceOf(mockToken, who));
            }
            const c1OtherBefore = await balanceOf(otherToken, c1.address);

            // ── CHECKOUT: the buyer picks MOCK; contributor-1's listed price is
            //    translated into it from the venue's exact-output quote. ──
            await gotoAsWallet(page, BUYER, `/s/view?seller=${lead.address}&e2e=devnet`);
            await page.getByTestId('member-detail-view').waitFor({ timeout: 30000 });
            await waitForConnected(page);
            const addBtn = page.locator('[data-testid^="btn-add-"]').first();
            await addBtn.waitFor({ state: 'visible', timeout: 20000 });
            await addBtn.click();
            await page.getByTestId('btn-review-order').click();
            await page.getByTestId('checkout-view').waitFor({ timeout: 20000 });
            await waitForConnected(page);
            await page.getByTestId('payment-token-picker').waitFor({ state: 'visible', timeout: 30000 });
            await page.getByTestId('payment-token-MOCK').check();
            await fillChainCheckout(page);

            const translation = page.locator('[data-testid^="payment-translation-listed-node:"]');
            await expect(translation, 'one listed price is in another token: contributor-1\'s').toHaveCount(1, { timeout: 30000 });
            await expect(translation).toHaveText(listedBefore.item.price);
            const key = (await translation.getAttribute('data-testid'))!.slice('payment-translation-listed-'.length);
            await expect(page.getByTestId(`payment-translation-quote-${key}`), 'the venue quote of the listed price renders')
                .toBeVisible({ timeout: 30000 });
            await expect(page.getByTestId(`payment-translation-source-${key}`), 'the quote names its venue').toContainText('devnet-mock');
            const quote = (await page.getByTestId(`payment-translation-quote-${key}`).innerText()).trim();
            const signed = (await page.getByTestId(`payment-translation-amount-${key}`).inputValue()).trim();
            expect(signed, 'the field holds the quote until the buyer changes it').toBe(quote);
            const listedAmount = parseUnits(listedBefore.item.price, 18);
            const translated = (listedAmount * 7n + 3n - 1n) / 3n;
            expect(quote, 'the quote is the venue\'s exact-output input for the listed amount').toBe(formatToken(translated, 18));

            const leadPayment = parseUnits(lead.price, 18);
            const c2Payment = parseUnits(c2.price, 18);
            const place = page.getByTestId('btn-place-order');
            await expect(place, 'the buyer connected + the translation stands → "Place order"').toHaveText(/Place order/, { timeout: 20000 });
            await place.click();
            await confirmAgreementPreviews(page, 3);
            await page.getByTestId('buyer-share-panel').waitFor({ timeout: 60000 });
            await page.getByTestId('send-commitment-xmtp').click();
            await expect(page.getByTestId('commitment-xmtp-status')).toBeVisible({ timeout: 30000 });

            // ── ACCEPTS at /sign in walk order. ──
            const signAs = async (s: ChainSeller, expectListed: { listed: string; signed: string } | null, funded: boolean) => {
                const before = (await queryCommitted()).length;
                await gotoAsWallet(page, s.address, '/sign?e2e=devnet');
                await waitForConnected(page);
                await page.getByTestId('agreement-review').waitFor({ state: 'visible', timeout: 60000 });
                if (expectListed) {
                    await expect(page.getByTestId('sign-listed-prices'), `${s.label} reads its listed price beside the amount`)
                        .toBeVisible({ timeout: 60000 });
                    await expect(page.getByTestId(`sign-listed-price-listed-chain-${s.label}`), 'its listed price, read from its catalog')
                        .toHaveText(expectListed.listed);
                    await expect(page.getByTestId(`sign-listed-price-signed-chain-${s.label}`), 'the amount the buyer signed')
                        .toHaveText(expectListed.signed);
                } else {
                    await expect(page.getByTestId('sign-listed-prices'), `${s.label} lists in the denomination: nothing is translated`)
                        .toHaveCount(0);
                }
                if (funded) {
                    // The seller's choice: the panel is collapsed while the
                    // bond is covered in the denomination; the toggle opens it
                    // and the bond is funded from MPMT.
                    await expect(page.getByTestId('seller-funding-toggle')).toHaveText(/Fund bond from another token/, { timeout: 30000 });
                    await page.getByTestId('seller-funding-toggle').click();
                    await page.getByTestId('swap-funding-panel').waitFor({ state: 'visible', timeout: 30000 });
                    await page.getByTestId(`funding-token-option-${otherToken.toLowerCase()}`).click();
                    await authorizeFundingToken(page);
                }
                const counterSign = page.getByTestId('btn-counter-sign');
                const approveBond = page.getByRole('button', { name: /Authorize Payment/ });
                await expect(counterSign.or(approveBond), 'either the authorize step or the counter-sign renders')
                    .toBeVisible({ timeout: 60000 });
                if (await approveBond.isVisible()) await approveBond.click();
                await expect(counterSign).toBeEnabled({ timeout: 60000 });
                await counterSign.click();
                await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
                if (funded) await expect(page.getByTestId('preview-swap'), 'the funding leg is surfaced in the confirm').toBeVisible();
                await page.getByTestId('preview-confirm').click();
                await expect.poll(async () => (await queryCommitted()).length, {
                    timeout: 60000, message: `${s.label}'s countersignature lands OrderCommitted`,
                }).toBe(before + 1);
                const events = await queryCommitted();
                const event = events[events.length - 1];
                expect(event.args.seller?.toLowerCase(), `${s.label} committed`).toBe(s.address.toLowerCase());
                const receipt = await publicClient.getTransactionReceipt({ hash: event.transactionHash });
                expect(receipt.status).toBe('success');
                expect(receipt.to?.toLowerCase(), funded ? 'the funded accept routes through the coordinator' : 'a plain accept goes direct to FigaroCore')
                    .toBe((funded ? swapCoordinator : core).toLowerCase());
                return { event, receipt };
            };
            const leadCommit = await signAs(lead, null, false);
            const c1Commit = await signAs(c1, { listed: listedBefore.item.price, signed: formatToken(translated, 18) }, true);
            const c2Commit = await signAs(c2, null, false);
            expect((await queryCommitted()).length, 'exactly three orders committed').toBe(committedBefore + 3);

            // ── CHAIN FACTS: one denomination, the signed payments, 2× bonds. ──
            const commits = [
                { s: lead, ...leadCommit, payment: leadPayment },
                { s: c1, ...c1Commit, payment: translated },
                { s: c2, ...c2Commit, payment: c2Payment },
            ];
            const processId = leadCommit.event.args.processId!;
            let cumulative = 0n;
            let buyerBonds = 0n;
            let escrow = 0n;
            for (const { s, event, payment } of commits) {
                expect(event.args.processId, `${s.label} is in the one process`).toBe(processId);
                expect((event.args.currency as string).toLowerCase(), `${s.label}'s order is in the one denomination`).toBe(mockToken.toLowerCase());
                expect(event.args.payment, `${s.label}'s payment is the amount the buyer signed, in MOCK`).toBe(payment);
                cumulative += payment;
                expect(event.args.cumulativeValue, `the cumulative value through ${s.label}`).toBe(cumulative);
                const bonds = calculateBonds(event.args.cumulativeValue!, event.args.payment!);
                expect(bonds.buyerBond, 'the buyer bonds twice the payment').toBe(2n * payment);
                expect(bonds.sellerBond, `${s.label} bonds twice the cumulative value`).toBe(2n * cumulative);
                buyerBonds += bonds.buyerBond;
                escrow += bonds.buyerBond + bonds.sellerBond;
            }
            const sellerBond = (i: number) => calculateBonds(commits[i].event.args.cumulativeValue!, commits[i].payment).sellerBond;
            expect(base.get(`mock:${BUYER.toLowerCase()}`)! - await balanceOf(mockToken, BUYER), 'the buyer locked its bonds in MOCK').toBe(buyerBonds);
            expect(await balanceOf(mockToken, core) - base.get(`mock:${core.toLowerCase()}`)!, 'the Core holds every bond in MOCK').toBe(escrow);
            expect(base.get(`mock:${lead.address.toLowerCase()}`)! - await balanceOf(mockToken, lead.address)).toBe(sellerBond(0));
            expect(base.get(`mock:${c2.address.toLowerCase()}`)! - await balanceOf(mockToken, c2.address)).toBe(sellerBond(2));

            // The funding leg, read from contributor-1's commit receipt through
            // the SDK reader: MPMT out of its own wallet, MOCK in, at the venue.
            const legs = readFundingLegs(c1Commit.receipt.logs, {
                buyer: c1Commit.event.args.buyer!, seller: c1Commit.event.args.seller!, currency: c1Commit.event.args.currency!,
            }, swapCoordinator);
            expect(legs, 'one funding leg in contributor-1\'s commit').toHaveLength(1);
            const [leg] = legs;
            expect(leg.venue.toLowerCase(), 'the venue is the router the coordinator holds').toBe(venue.toLowerCase());
            expect(leg.payload.party.toLowerCase()).toBe(c1.address.toLowerCase());
            expect(leg.payload.tokenIn.toLowerCase(), 'the leg leaves MPMT').toBe(otherToken.toLowerCase());
            expect(leg.payload.tokenOut.toLowerCase(), 'the leg enters the denomination').toBe(mockToken.toLowerCase());
            expect(leg.payload.amountOut >= sellerBond(1), 'the leg yields at least contributor-1\'s bond').toBe(true);
            expect(c1OtherBefore - await balanceOf(otherToken, c1.address), 'the leg spent what contributor-1\'s MPMT lost')
                .toBe(leg.payload.amountIn);
            expect(await balanceOf(mockToken, c1.address) - base.get(`mock:${c1.address.toLowerCase()}`)!,
                'contributor-1\'s MOCK moved only by what the leg yielded beyond its bond').toBe(leg.payload.amountOut - sellerBond(1));
            const [committedAll, resolvedAll, processResolvedAll] = await Promise.all([
                publicClient.getContractEvents({ address: core, abi: CORE_ABI, eventName: 'OrderCommitted', fromBlock: 0n }),
                publicClient.getContractEvents({ address: core, abi: CORE_ABI, eventName: 'OrderResolved', fromBlock: 0n }),
                publicClient.getContractEvents({ address: core, abi: CORE_ABI, eventName: 'ProcessResolved', fromBlock: 0n }),
            ]);
            type SdkLogs = Parameters<typeof parseOrderCommittedLogs>[0];
            const graph = projectValueFlow(projectResolutionGraph({
                orderCommitted: parseOrderCommittedLogs(committedAll as unknown as SdkLogs),
                orderResolved: parseOrderResolvedLogs(resolvedAll as unknown as SdkLogs),
                processResolved: parseProcessResolvedLogs(processResolvedAll as unknown as SdkLogs),
            }), legs);
            const edge = graph.edges.find((e) => e.basis === 'composition-derived');
            expect(edge, 'the funding leg is an edge between two denominations').toMatchObject({
                tokenIn: leg.payload.tokenIn, tokenOut: leg.payload.tokenOut,
                legCount: 1, volumeIn: leg.payload.amountIn, volumeOut: leg.payload.amountOut,
            });
            expect(graph.nodes.map((n) => n.token.toLowerCase())).toEqual(
                expect.arrayContaining([mockToken.toLowerCase(), otherToken.toLowerCase()]),
            );

            // contributor-1's catalog on IPFS is untouched: same address, same price.
            const listedAfter = await c1Listing();
            expect(listedAfter, 'the listed price in MPMT is what it was').toEqual(listedBefore);

            // ── RESOLVE: one signature pays every seller in MOCK. ──
            const resolvedBefore = (await publicClient.getContractEvents({
                address: core, abi: CORE_ABI, eventName: 'ProcessResolved', args: { buyer: BUYER }, fromBlock: 0n,
            })).length;
            const preResolve = new Map<string, bigint>();
            for (const { s } of commits) preResolve.set(s.address.toLowerCase(), await balanceOf(mockToken, s.address));
            await gotoAsWallet(page, BUYER, `/orders/view?process=${processId}&e2e=devnet`);
            await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
            await waitForConnected(page);
            const resolveBtn = page.getByTestId('capability-execute-resolve-process');
            await expect(resolveBtn, 'the buyer can resolve the process').toBeEnabled({ timeout: 30000 });
            await resolveBtn.click();
            await expect.poll(async () => (await publicClient.getContractEvents({
                address: core, abi: CORE_ABI, eventName: 'ProcessResolved', args: { buyer: BUYER }, fromBlock: 0n,
            })).length, { timeout: 60000, message: 'ProcessResolved lands on-chain' }).toBe(resolvedBefore + 1);
            for (const [i, { s, payment }] of commits.entries()) {
                expect(await balanceOf(mockToken, s.address) - preResolve.get(s.address.toLowerCase())!,
                    `${s.label} is paid its payment in MOCK and its bond refunded`).toBe(payment + sellerBond(i));
            }
            expect(base.get(`mock:${BUYER.toLowerCase()}`)! - await balanceOf(mockToken, BUYER), 'the buyer net paid the three payments')
                .toBe(leadPayment + translated + c2Payment);
            expect(await balanceOf(mockToken, core), 'FigaroCore returned to its baseline').toBe(base.get(`mock:${core.toLowerCase()}`)!);
        } finally {
            await setVenueRate(rateNumBefore, rateDenBefore);
        }
    });
});
