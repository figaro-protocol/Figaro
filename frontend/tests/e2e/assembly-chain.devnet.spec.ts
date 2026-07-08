/**
 * assembly-chain.devnet.spec.ts — the VALUE-ADDED-CHAIN acceptance test.
 *
 * The multi-order half of the acceptance bar (permissionless-clause is the
 * novel-clause half): write ANY scenario into an assembly, save it, have a
 * seller pin it to their profile, and run it as a buyer and x sellers —
 * THROUGH THE UI at every leg — with the process P&L externalized:
 *
 *   bind     → the LEAD seller registers through the real wizard, binding BOTH
 *              seeded assemblies and DESIGNATING its chain counterparties
 *              (courier + supplier wallets) on the chain assembly's binding;
 *              the courier + supplier each pin the chain assembly to their OWN
 *              profiles through the seller-edit surface — the even-surfacing
 *              rule (operator 2026-07-02) admits a seller's catalogue to every
 *              read (discovery, checkout pricing) only with an anchored
 *              binding, and a participating seller binding the assembly it
 *              participates in IS the designed conformance path
 *   checkout → the buyer picks the chain assembly from the seller's bound set
 *              (the multi-binding method picker), reviews the per-contributor
 *              breakdown (the P&L: pay X to lead, Y to courier, Z to supplier),
 *              and places ONE order — the buyer signs all THREE orders through
 *              the same confirm gate, sub-orders auto-relayed to their bound
 *              sellers, the root relayed from the share panel
 *   accept   → each of the three sellers accepts its OWN order on /orders, in
 *              walk order (root creates the process, subs extend it — the
 *              kernel's exact-match cumulative accumulator enforces the
 *              sequence); after EVERY commit the exact bond deltas are
 *              asserted for every party (buyer 2× payment per order, each
 *              seller 2× its cumulative value, escrow up by both)
 *   attest   → every seller advances its own process ladder through the ONE
 *              generic capability rail — each transfer attested, each event
 *              on the timeline (the evidentiary record)
 *   resolve  → the buyer resolves ONCE; the atomic settlement pays every
 *              party — each seller net +payment, buyer net −total, escrow
 *              back to baseline. One signature, a complete P&L settled.
 *   audit    → the audit package renders the full process: financials, a
 *              per-order line item for ALL THREE orders, the cash-flow log,
 *              and the clause-evidence documents
 *
 * Everything the spec consumes is DISCOVERED from chain + IPFS (the anchored
 * assemblies by their template shape, the lead's profile by its registry
 * events) — never a bundled roster. The lead's own identity + counterparty
 * designations are this test's INPUT DATA (an authoring act), exactly as
 * sellers-onboarding's wizard seller is. anvil[15] is used by no other spec;
 * the courier/supplier counterparties are the seeded Cardinal Couriers
 * (anvil[8]) and Harbor Provisions (anvil[11]) — pre-populated sellers whose
 * catalogues price the sub-orders live.
 *
 * No evmSnapshot/evmRevert — devnet is a mainnet rehearsal; the gate is
 * idempotent (skips when the lead's profile already carries the conformant
 * bindings) and the runtime leaves its state on-chain for out-of-band checks.
 *
 * Requires Anvil + ./scripts/deploy-local.sh + populate-test-data + Kubo + :3100.
 */
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import { createPublicClient, defineChain, http, parseAbi, parseEther, type Hex } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import {
    confirmAgreementPreviews,
    discoverAnchoredAssemblies,
    latestSellerProfileURI,
    readLocalDeploymentConfig,
    sellerProfileBindings,
} from './devnet-helpers';
import { ANVIL_ACCOUNTS } from '../anvilAccounts';
import { CORE_ABI } from '@/lib/kernel/contracts';
import { calculateBonds } from '@figaro/core';
import type { Page } from '@playwright/test';

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});
const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';

const ERC20_ABI = parseAbi(['function balanceOf(address) view returns (uint256)']);

const BUYER = ANVIL_ACCOUNTS[0] as Hex; // anvil[0] — the fixture's default buyer

// ── This test's own INPUT DATA (an authoring act, like sellers-onboarding's
//    wizard seller): the lead's identity, and the wallets the lead designates
//    to fill the chain's sub-orders. anvil[15]: outside the buyer range and
//    every other spec's seller set. The counterparties are seeded sellers —
//    their catalogues price the sub-orders live at checkout.
const LEAD = {
    address: mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 15 }).address as Hex,
    name: 'Chain Lead Kitchen',
    specialty: 'delivery chain lead',
    geohash: '9q8yyk8z1',
    product: { name: 'Family dinner box', price: '1' },
};
const COURIER = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 8 }).address as Hex; // Cardinal Couriers
const SUPPLIER = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 11 }).address as Hex; // Harbor Provisions

// The chain assembly's sub-order process clauses — the designation keys the
// lead fills in the counterparty editor (scenario input, mirrored from the
// seeded template's shape).
const COURIER_CLAUSE = 'figaro-courier-process';
const SUPPLIER_CLAUSE = 'figaro-merchant-process';

/** Wait for ClientInit's devnet auto-connect (the "Connect Wallet" button goes). */
async function waitForConnected(page: Page) {
    await page.waitForFunction(
        () => !Array.from(document.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Connect Wallet'),
        null,
        { timeout: 30000 },
    );
}

test.describe('VALUE-ADDED CHAIN — one buyer binds three sellers; one resolve pays every party (devnet)', () => {
    test.setTimeout(420_000);

    test('bind → picker checkout → walk-order accepts (exact bonds) → atomic resolve (exact settlement) → full audit', async ({ page }) => {
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });

        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const token = config.tokenAddress as Hex;
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const balanceOf = (who: Hex) =>
            publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;

        // ── DISCOVER from chain + IPFS (never a roster): resolve every anchored
        //    assembly's template and pick the two by SHAPE — the multi-order
        //    chain (a sub-order carrying the courier process clause) and the
        //    earliest single-order assembly (the seed; anchored before any
        //    probe run could add another). ──
        const templates = await discoverAnchoredAssemblies();
        const chain = templates.find(
            (t) => t.agreements.length === 3
                && t.agreements.some((o) => Object.keys(o.clauses ?? {}).includes(COURIER_CLAUSE)),
        );
        expect(chain, 'the seeded three-order chain assembly is anchored (run populate-test-data)').toBeTruthy();
        const single = templates.find((t) => t.agreements.length === 1);
        expect(single, 'a single-order assembly is anchored (the seed)').toBeTruthy();
        const chainSlug = chain!.slug;
        const singleSlug = single!.slug;

        // ── GATE (idempotent): the LEAD binds both assemblies + designates the
        //    chain counterparties THROUGH THE WIZARD. Mainnet semantics: register
        //    once, persist — skip when the lead's latest profile already carries
        //    the conformant bindings. ──
        type ProfileBindings = Awaited<ReturnType<typeof sellerProfileBindings>>;
        const isConformant = (bindings: ProfileBindings): boolean => {
            const chainBinding = bindings.find((b) => b.assemblySlug === chainSlug);
            const designated = (clauseId: string, addr: Hex) =>
                (chainBinding?.counterpartyBindings ?? []).some(
                    (cb) => cb.clauseId === clauseId
                        && cb.addresses.some((a) => a.toLowerCase() === addr.toLowerCase()),
                );
            return !!chainBinding
                && bindings.some((b) => b.assemblySlug === singleSlug)
                && designated(COURIER_CLAUSE, COURIER)
                && designated(SUPPLIER_CLAUSE, SUPPLIER);
        };
        const conformant = isConformant(await sellerProfileBindings(LEAD.address));

        if (!conformant) {
            await gotoAsWallet(page, LEAD.address, '/sellers');
            await page.goto('/sellers/identity', { waitUntil: 'domcontentloaded' });
            await expect(page.locator('#profile-name')).toBeVisible({ timeout: 30000 });
            await page.locator('#profile-name').fill(LEAD.name);
            await page.locator('#profile-specialty').fill(LEAD.specialty);
            await page.locator('#profile-geohash').fill(LEAD.geohash);
            await page.getByRole('button', { name: /\+ MOCK$/ }).click();
            await page.locator('input[name="defaultTokenAddress"]').first().check();
            await page.getByRole('button', { name: /^Next/ }).click();
            await expect(page).toHaveURL(/\/sellers\/catalogue/);

            await page.locator('[id^="item-"][id$="-name"]').first().fill(LEAD.product.name);
            await page.locator('[id^="item-"][id$="-price"]').first().fill(LEAD.product.price);
            await page.getByRole('button', { name: /^Next/ }).click();
            await expect(page).toHaveURL(/\/sellers\/assemblies/);

            // Bind BOTH: the single-order assembly (so checkout offers a CHOICE —
            // the multi-binding method picker) and the chain assembly.
            const singleRow = page.getByTestId(`seller-assembly-row-${singleSlug}`);
            await singleRow.waitFor({ state: 'visible', timeout: 30000 });
            await singleRow.locator('input[type="checkbox"]').first().check();
            const chainRow = page.getByTestId(`seller-assembly-row-${chainSlug}`);
            await chainRow.waitFor({ state: 'visible', timeout: 30000 });
            await chainRow.locator('input[type="checkbox"]').first().check();

            // Designate the chain counterparties — the wallets the lead trusts to
            // fill the courier + supplier sub-orders. The editor surfaces per
            // required process clause once the chain row is checked (its template
            // resolved from IPFS).
            const counterparties = page.getByTestId(`seller-assembly-counterparties-${chainSlug}`);
            await counterparties.waitFor({ state: 'visible', timeout: 30000 });
            await counterparties.getByTestId(`counterparty-${COURIER_CLAUSE}-input-0`).fill(COURIER);
            await counterparties.getByTestId(`counterparty-${SUPPLIER_CLAUSE}-input-0`).fill(SUPPLIER);

            await page.getByRole('button', { name: /^Next/ }).click();
            await expect(page).toHaveURL(/\/sellers\/agents/);
            await page.getByRole('button', { name: /^Next/ }).click();
            await page.waitForURL(/\/sellers\/review/, { timeout: 30000 });
            await page.getByTestId('review-confirm-publish').click();
            await expect(page.getByRole('heading', { name: /Registered\.|Profile updated/i }))
                .toBeVisible({ timeout: 60000 });

            // The published profile — chain-verified out-of-band, not from the UI.
            const uriAfter = await latestSellerProfileURI(LEAD.address);
            expect(uriAfter, 'the lead profile is anchored on SellerRegistry').toMatch(/^ipfs:\/\//);
            expect(
                isConformant(await sellerProfileBindings(LEAD.address)),
                'the pinned profile carries both bindings + the chain counterparty designations',
            ).toBe(true);
        }

        // ── GATE, second half (idempotent): the courier + supplier PIN the chain
        //    assembly to their own profiles through the seller-edit surface. The
        //    even-surfacing rule admits a seller's catalogue to every read
        //    (discovery, checkout counterparty pricing) only with an anchored
        //    binding — a participating seller binds the assembly it participates
        //    in. Verified out-of-band from the registry events + IPFS. ──
        const ensureBound = async (seller: Hex, label: string) => {
            if ((await sellerProfileBindings(seller)).some((b) => b.assemblySlug === chainSlug)) return;
            await gotoAsWallet(page, seller, '/sellers/edit/assemblies?e2e=devnet');
            const row = page.getByTestId(`seller-assembly-row-${chainSlug}`);
            await row.waitFor({ state: 'visible', timeout: 30000 });
            await row.locator('input[type="checkbox"]').first().check();
            await page.getByRole('button', { name: 'Save changes' }).click();
            await expect.poll(async () =>
                (await sellerProfileBindings(seller)).some((b) => b.assemblySlug === chainSlug), {
                timeout: 60000, message: `${label}'s re-pinned profile carries the chain binding`,
            }).toBe(true);
        };
        await ensureBound(COURIER, 'courier');
        await ensureBound(SUPPLIER, 'supplier');

        // ── BASELINES for every party, captured BEFORE any commit pulls bonds.
        //    Deltas (never absolutes) — robust to prior runs on the persisted devnet. ──
        const committedBefore = (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: BUYER }, fromBlock: 0n,
        })).length;
        const [buyer0, lead0, courier0, supplier0, core0] = await Promise.all([
            balanceOf(BUYER), balanceOf(LEAD.address), balanceOf(COURIER), balanceOf(SUPPLIER), balanceOf(core),
        ]);

        // ── CHECKOUT: the buyer orders from the lead, PICKS the chain assembly
        //    (the seller offers two), reviews the P&L breakdown, and places —
        //    signing all three orders through the same confirm gate. ──
        await gotoAsWallet(page, BUYER, `/s/${LEAD.address}?e2e=devnet`);
        await page.getByTestId('seller-detail-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const addBtn = page.locator('[data-testid^="btn-add-"]').first();
        await addBtn.waitFor({ state: 'visible', timeout: 20000 });
        await addBtn.click();
        await page.getByTestId('btn-review-order').click();
        await page.getByTestId('checkout-view').waitFor({ timeout: 20000 });

        // The multi-binding method picker: the seller offers BOTH assemblies; the
        // buyer's selection — not a coded default — decides the process shape.
        const methodSelect = page.getByTestId('select-method');
        await expect(methodSelect, 'a two-binding profile offers the buyer the method choice').toBeVisible({ timeout: 30000 });
        await methodSelect.selectOption(chainSlug);

        // The P&L, externalized BEFORE signing: one row per contributor, each
        // priced live from that contributor's own catalogue (lead 1 + courier 1 +
        // supplier 1), and the buyer's total lock = 2× the chain total.
        const breakdown = page.getByTestId('cart-contributor-breakdown');
        await expect(breakdown, 'checkout shows the per-contributor breakdown').toBeVisible({ timeout: 30000 });
        await expect(page.getByTestId('cart-kit-total'), 'the chain total sums every contributor')
            .toHaveText(/^3(\.0*)?$/, { timeout: 15000 });
        await expect(page.getByTestId('checkout-locked-total'), 'the buyer locks 2× the chain total')
            .toHaveText(/^6(\.0*)?$/, { timeout: 15000 });

        const place = page.getByTestId('btn-place-order');
        await expect(place, 'buyer connected + assembly picked → "Place order"').toHaveText(/Place order/, { timeout: 20000 });
        await place.click();

        // The buyer signs ALL THREE orders through the SAME pre-sign gate every
        // order uses (no checkout bypass): the walk signs + relays each sub-order
        // to its bound seller first, the root last (its relay is the share panel).
        // One confirm per distinct displayed agreementHash — modal instances can
        // replace each other faster than a hidden-state observation.
        await confirmAgreementPreviews(page, 3);
        await page.getByTestId('send-commitment-xmtp').click();
        await expect(page.getByTestId('commitment-xmtp-status')).toBeVisible({ timeout: 30000 });

        // ── ACCEPTS in walk order: root creates the process; each sub extends it
        //    (the kernel's exact-match cumulative accumulator enforces the
        //    sequence). Each seller accepts its OWN order on /orders; after each
        //    commit the exact bond deltas are asserted for EVERY party. ──
        const queryCommitted = () => publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: BUYER }, fromBlock: 0n,
        });
        const acceptAs = async (seller: Hex, label: string) => {
            const before = (await queryCommitted()).length;
            await gotoAsWallet(page, seller, '/orders?e2e=devnet');
            await page.getByTestId('orders-list').waitFor({ timeout: 30000 });
            await waitForConnected(page);
            await page.getByTestId('order-your-turn-card').first().waitFor({ state: 'visible', timeout: 30000 });
            await page.getByTestId('btn-accept-order').first().click();
            await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
            await page.getByTestId('preview-confirm').click();
            await expect.poll(async () => (await queryCommitted()).length, {
                timeout: 60000, message: `${label}'s accept lands OrderCommitted on-chain`,
            }).toBe(before + 1);
            const events = await queryCommitted();
            const event = events[events.length - 1];
            const receipt = await publicClient.getTransactionReceipt({ hash: event.transactionHash });
            expect(receipt.status, `${label}'s commit transaction succeeded`).toBe('success');
            expect(event.args.seller?.toLowerCase(), `${label}'s order committed against ${label}`)
                .toBe(seller.toLowerCase());
            test.info().annotations.push({
                type: 'OrderCommitted',
                description: `${label}: order=${event.args.orderHash} payment=${event.args.payment} cumulativeValue=${event.args.cumulativeValue} tx=${event.transactionHash}`,
            });
            return event;
        };

        // Root — the lead. Creates the process at cumulative 1.
        const rootEvent = await acceptAs(LEAD.address, 'lead');
        const processId = rootEvent.args.processId!;
        expect(rootEvent.args.payment, 'root payment = the lead catalogue price').toBe(parseEther('1'));
        expect(rootEvent.args.cumulativeValue, 'root cumulative = its own payment').toBe(parseEther('1'));
        {
            const { buyerBond, sellerBond } = calculateBonds(rootEvent.args.cumulativeValue!, rootEvent.args.payment!);
            const [b, l, c] = await Promise.all([balanceOf(BUYER), balanceOf(LEAD.address), balanceOf(core)]);
            expect(buyer0 - b, 'after root: buyer down by its buyer bond').toBe(buyerBond);
            expect(lead0 - l, 'after root: lead down by its seller bond').toBe(sellerBond);
            expect(c - core0, 'after root: escrow up by both bonds').toBe(buyerBond + sellerBond);
        }

        // First sub — the courier. Extends the process to cumulative 2; the
        // courier bonds against the CUMULATIVE upstream value, not just its own cut.
        const courierEvent = await acceptAs(COURIER, 'courier');
        expect(courierEvent.args.processId, 'the courier order extends the SAME process').toBe(processId);
        expect(courierEvent.args.payment, "courier payment = the courier's own catalogue price").toBe(parseEther('1'));
        expect(courierEvent.args.cumulativeValue, 'courier cumulative = root + courier').toBe(parseEther('2'));
        const rootBonds = calculateBonds(rootEvent.args.cumulativeValue!, rootEvent.args.payment!);
        {
            const { buyerBond, sellerBond } = calculateBonds(courierEvent.args.cumulativeValue!, courierEvent.args.payment!);
            const [b, c2, c] = await Promise.all([balanceOf(BUYER), balanceOf(COURIER), balanceOf(core)]);
            expect(buyer0 - b, 'after courier: buyer down by both buyer bonds').toBe(rootBonds.buyerBond + buyerBond);
            expect(courier0 - c2, 'after courier: courier down by its cumulative-scaled bond').toBe(sellerBond);
            expect(c - core0, 'after courier: escrow up by all four bonds')
                .toBe(rootBonds.buyerBond + rootBonds.sellerBond + buyerBond + sellerBond);
        }

        // Second sub — the supplier. Extends to cumulative 3.
        const supplierEvent = await acceptAs(SUPPLIER, 'supplier');
        expect(supplierEvent.args.processId, 'the supplier order extends the SAME process').toBe(processId);
        expect(supplierEvent.args.payment, "supplier payment = the supplier's own catalogue price").toBe(parseEther('1'));
        expect(supplierEvent.args.cumulativeValue, 'supplier cumulative = root + courier + supplier').toBe(parseEther('3'));
        const courierBonds = calculateBonds(courierEvent.args.cumulativeValue!, courierEvent.args.payment!);
        const supplierBonds = calculateBonds(supplierEvent.args.cumulativeValue!, supplierEvent.args.payment!);
        {
            const [b, s, c] = await Promise.all([balanceOf(BUYER), balanceOf(SUPPLIER), balanceOf(core)]);
            expect(buyer0 - b, 'after supplier: buyer down by all three buyer bonds')
                .toBe(rootBonds.buyerBond + courierBonds.buyerBond + supplierBonds.buyerBond);
            expect(supplier0 - s, 'after supplier: supplier down by its cumulative-scaled bond').toBe(supplierBonds.sellerBond);
            expect(c - core0, 'after supplier: escrow holds every bond in the chain').toBe(
                rootBonds.buyerBond + rootBonds.sellerBond
                + courierBonds.buyerBond + courierBonds.sellerBond
                + supplierBonds.buyerBond + supplierBonds.sellerBond,
            );
        }
        expect((await queryCommitted()).length, 'exactly three orders committed').toBe(committedBefore + 3);

        // ── RUNTIME ATTESTATIONS: each transfer attested, each event on the
        //    timeline — every seller advances its own process ladder through the
        //    ONE generic capability rail (no clause named on the page). This is
        //    the evidentiary record; the audit's clause-evidence renders a
        //    process clause's section from these attestation events. ──
        const attestAs = async (
            seller: Hex, stageLabel: string, expectedOnTimeline: number, label: string,
        ) => {
            await gotoAsWallet(page, seller, `/orders/${processId}?e2e=devnet`);
            await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
            await waitForConnected(page);
            const attest = page.getByTestId('capability-execute-submit-clause-attestation').first();
            await expect(attest, `${label}'s generic attest capability surfaces`).toBeVisible({ timeout: 30000 });
            await expect(attest).toBeEnabled({ timeout: 30000 });
            await attest.click();
            await expect(
                page.getByTestId('order-timeline').getByText(stageLabel),
                `${label}'s "${stageLabel}" event lands on the timeline`,
            ).toHaveCount(expectedOnTimeline, { timeout: 60000 });
        };
        await attestAs(LEAD.address, 'Preparation started', 1, 'lead');
        await attestAs(COURIER, 'En route to pickup', 1, 'courier');
        // The supplier's order carries the same process clause as the root, so
        // its first stage label already sits on the timeline once — the
        // supplier's attestation makes it two.
        await attestAs(SUPPLIER, 'Preparation started', 2, 'supplier');

        // ── RESOLVE: buyer dominance — ONE signature settles the whole chain
        //    atomically. ──
        const resolvedBefore = (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'ProcessResolved', args: { buyer: BUYER }, fromBlock: 0n,
        })).length;
        await gotoAsWallet(page, BUYER, `/orders/${processId}?e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const resolveBtn = page.getByTestId('capability-execute-resolve-process');
        await expect(resolveBtn, 'the buyer can resolve the active process').toBeEnabled({ timeout: 30000 });
        await resolveBtn.click();
        await expect.poll(async () => (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'ProcessResolved', args: { buyer: BUYER }, fromBlock: 0n,
        })).length, { timeout: 60000, message: 'ProcessResolved lands on-chain' }).toBe(resolvedBefore + 1);

        // ── SETTLEMENT (the whole point): the atomic resolve pays EVERY party —
        //    each seller net +its payment, the buyer net −the chain total, the
        //    escrow back to its baseline. A complete P&L, settled by one signature. ──
        const [buyerF, leadF, courierF, supplierF, coreF] = await Promise.all([
            balanceOf(BUYER), balanceOf(LEAD.address), balanceOf(COURIER), balanceOf(SUPPLIER), balanceOf(core),
        ]);
        expect(buyer0 - buyerF, 'buyer net paid exactly the chain total').toBe(parseEther('3'));
        expect(leadF - lead0, 'lead net earned exactly its payment').toBe(parseEther('1'));
        expect(courierF - courier0, 'courier net earned exactly its payment').toBe(parseEther('1'));
        expect(supplierF - supplier0, 'supplier net earned exactly its payment').toBe(parseEther('1'));
        expect(coreF, 'FigaroCore escrow returned to its baseline').toBe(core0);

        // ── AUDIT: the package renders the FULL process — a financial statement
        //    per seller (all THREE), the consolidation, the cash-flow log, and the
        //    evidence documents (the committed clause leaves of the chain). ──
        await page.goto(`/audit/${processId}?e2e=devnet`, { waitUntil: 'domcontentloaded' });
        await page.getByTestId('audit-page').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        await expect(page.getByTestId('financials-view'), 'the audit renders the process financials')
            .toBeVisible({ timeout: 30000 });
        await expect(
            page.locator('[data-testid="document-financial-statements-seller"]'),
            'one financial-statements document per seller (lead, courier, supplier)',
        ).toHaveCount(3, { timeout: 30000 });
        await expect(
            page.getByTestId('document-financial-statements-process'),
            'the consolidated statement renders',
        ).toBeVisible({ timeout: 30000 });
        await expect(
            page.locator('[data-testid="document-lines-financial-statements-process"] tbody tr').first(),
            'the on-chain events surface in the cash-flow log',
        ).toBeVisible({ timeout: 30000 });

        // Evidence documents: the chain's committed clause leaves surface by
        // their registered spec titles — the structural leaves, the coordination
        // declaration, both process ladders, and the sellers' recorded
        // attestation stages (read from the event log, never a local cache).
        const evidence = page.getByTestId('audit-clause-evidence');
        await evidence.waitFor({ state: 'visible', timeout: 30000 });
        for (const title of [
            'Commerce terms',
            'Order topology',
            'Modalities',
            'Merchant internal process events',
            'Courier internal process events',
            'Preparation started',
            'En route to pickup',
        ]) {
            await expect(
                evidence.getByText(title).first(),
                `the "${title}" evidence leaf surfaces in the audit`,
            ).toBeVisible({ timeout: 30000 });
        }
    });
});
