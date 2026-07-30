/**
 * freelancer-chain.devnet.spec.ts
 *
 * FREELANCE VALUE CHAIN — the reference assembly's named test
 * (assemblies/freelancer-value-chain.json; family 8b — a lead freelancer and
 * two contributors, each a co-equal bonded order in one process, every
 * deliverable travelling the encrypted content hand-off, one settlement).
 *
 * The spec CONSUMES the anchored reference (registry → IPFS, discovered by
 * shape: three orders, every one composing the content hand-off — no other
 * anchored assembly does), seeds its three sellers (the lead's binding
 * designates the contributors through the per-clause commit-order cursor),
 * and runs the chain end to end with every money leg from chain:
 *
 *   checkout  the client signs three orders (virtual modality, encrypted
 *             transfer on every deliverable), relays.
 *   accepts   lead then contributors accept on their own /orders; exact
 *             2P/2G bond deltas after each commit.
 *   delivery  the client requests each deliverable through the declared
 *             ecdh-content interaction; each freelancer delivers its
 *             artifact — encrypt → channel → stage-1 attestation in one
 *             gesture; every attestation verified on the coordinator.
 *   resolve   one signature pays the whole chain; net settlement per wallet.
 */
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import { calculateBonds } from '@figaro/sdk';
import { mnemonicToAccount } from 'viem/accounts';
import { createPublicClient, createWalletClient, http, parseAbi, parseUnits, type Hex } from 'viem';
import {
    LOCAL_ANVIL,
    RPC_URL,
    confirmAgreementPreviews,
    discoverAnchoredAssemblies,
    pinJSONToIPFS,
    readLocalDeploymentConfig,
    seedRegisteredMember,
    waitForConnected,
} from './devnet-helpers';
import { CORE_ABI } from '@/lib/kernel/contracts';
import { ANVIL_ACCOUNTS, ANVIL_KEYS } from '../anvilAccounts';

const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';
const CONTENT_CLAUSE = 'figaro-content-handoff';
const ERC20_ABI = parseAbi([
    'function balanceOf(address) view returns (uint256)',
    'function mint(address to, uint256 amount) external',
]);
const ATTESTATION_EVENT_ABI = parseAbi([
    'event Attestation(bytes32 indexed orderHash, bytes32 indexed processId, address indexed attester, bytes32 clauseId, uint8 stage, bytes32 contentRef)',
]);

const BUYER = ANVIL_ACCOUNTS[0] as Hex;
// Shared-world wallets, re-seeded unconditionally each run (the
// dispatch-race idempotency style — other specs re-assert their own).
// Indices 22-24: DEDICATED to this spec, past the populate-seeded sellers
// (5-12) and every other spec's self-seeded range. Self-seeding a
// populate-owned index (this spec once used 9/10/11 = Saffron/Pomodoro/Harbor)
// STOMPS the shared catalogue that adopters like assembly-chain read
// read-only — the wallet-index-collision class. anvil runs --accounts 34.
const CHAIN_SELLERS: Array<{ index: number; label: string; item: string; price: string }> = [
    { index: 22, label: 'lead', item: 'Lead deliverable', price: '2' },
    { index: 23, label: 'contributor-1', item: 'Edit pass', price: '0.5' },
    { index: 24, label: 'contributor-2', item: 'Translation', price: '0.5' },
];
const EXPECTED_TOTAL = parseUnits('3', 18);

/** THE SHAPE: exactly three orders, every one composing the content
 *  hand-off — the freelancer-value-chain reference and nothing else. */
async function findChainAssembly(): Promise<string> {
    const t = (await discoverAnchoredAssemblies()).find((a) =>
        a.agreements.length === 3
        && a.agreements.every((o) => CONTENT_CLAUSE in (o.clauses ?? {})));
    expect(t, 'the freelancer-value-chain reference is anchored (assemblies/ — run populate-test-data)').toBeTruthy();
    return t!.slug;
}

test.describe('FREELANCE VALUE CHAIN — three bonded deliverables over the encrypted hand-off, one settlement (devnet)', () => {
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
        const [lead, ...contributors] = sellers;

        // ── SEED the three freelancers (unconditional re-assert): the lead's
        //    binding designates the contributors — the per-clause cursor maps
        //    the content clause to [c1, c2] in commit order. ──
        for (const s of sellers) {
            const { uri: catalogueURI } = await pinJSONToIPFS({
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
            await seedRegisteredMember({
                walletKey: ANVIL_KEYS[s.index] as Hex,
                profile: {
                    name: `Chain ${s.label}`,
                    description: `${s.label} — seeded by freelancer-chain.devnet.spec.ts`,
                    catalogueURI,
                    acceptedTokens: [{ address: token, symbol: 'MOCK', chainId: 31337 }],
                    defaultTokenAddress: token,
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
        await page.getByTestId('seller-detail-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const addBtn = page.locator('[data-testid^="btn-add-"]').first();
        await addBtn.waitFor({ state: 'visible', timeout: 20000 });
        await addBtn.click();
        await page.getByTestId('btn-review-order').click();
        await page.getByTestId('checkout-view').waitFor({ timeout: 20000 });
        await waitForConnected(page);
        // Particulars: virtual modality; encrypted transfer + jurisdiction
        // geohashes on EVERY deliverable.
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
            expect(event.args.payment, `${s.label}'s payment = its catalogue price`).toBe(payment);
            expect(event.args.cumulativeValue, `cumulative after ${s.label}`).toBe(expectedCumulative);
            const bonds = calculateBonds(event.args.cumulativeValue!, event.args.payment!);
            buyerBondSoFar += bonds.buyerBond;
            escrowSoFar += bonds.buyerBond + bonds.sellerBond;
            const [b, sb, c] = await Promise.all([balanceOf(BUYER), balanceOf(s.address), balanceOf(core)]);
            expect(base.get(BUYER.toLowerCase())! - b, `after ${s.label}: buyer down by its bonds so far`).toBe(buyerBondSoFar);
            expect(base.get(s.address.toLowerCase())! - sb, `${s.label} bonds 2× cumulative upstream value`).toBe(bonds.sellerBond);
            expect(c - base.get(core.toLowerCase())!, 'escrow holds every bond so far').toBe(escrowSoFar);
        }
        expect((await queryCommitted()).length, 'exactly three orders committed').toBe(committedBefore + 3);

        // ── DELIVERY: the client requests each deliverable; each freelancer
        //    answers through the ecdh-content ceremony — encrypt → channel →
        //    stage-1 attestation, verified on the coordinator. ──
        const attestationCount = async () => (await publicClient.getContractEvents({
            address: coordinator, abi: ATTESTATION_EVENT_ABI, eventName: 'Attestation',
            args: { processId }, fromBlock: 0n,
        })).length;

        await gotoAsWallet(page, BUYER, `/orders/view?process=${processId}&e2e=devnet`);
        await waitForConnected(page);
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

        // ── SETTLEMENT: client −3, each freelancer +its price, escrow home. ──
        for (const s of sellers) {
            expect((await balanceOf(s.address)) - base.get(s.address.toLowerCase())!,
                `${s.label} net earned exactly its price`).toBe(parseUnits(s.price, 18));
        }
        expect(base.get(BUYER.toLowerCase())! - (await balanceOf(BUYER)), 'client net paid the chain total')
            .toBe(EXPECTED_TOTAL);
        expect(await balanceOf(core), 'FigaroCore escrow returned to its baseline')
            .toBe(base.get(core.toLowerCase())!);

        // ── AUDIT: three decoded content-hand-off witnesses in the bundle. ──
        await page.goto(`/audit/view?process=${processId}&e2e=devnet`, { waitUntil: 'domcontentloaded' });
        await page.getByTestId('audit-page').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const evidence = page.getByTestId('audit-clause-evidence');
        await evidence.waitFor({ state: 'visible', timeout: 30000 });
        await expect(
            evidence.locator(`[data-testid="audit-witness-${CONTENT_CLAUSE}-1"]`),
            'every deliverable\'s completion evidence decodes in the audit',
        ).toHaveCount(3, { timeout: 60000 });
    });
});
