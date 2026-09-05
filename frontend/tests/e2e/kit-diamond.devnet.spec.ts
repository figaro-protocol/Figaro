/**
 * kit-diamond.devnet.spec.ts — the MULTI-PARENT topology (diamond), end to end.
 *
 * The one process shape no other e2e draws or runs: a DAG join. A lead sells
 * a kit assembled from two component suppliers, and a final leg depends on
 * BOTH branches — the leaf order carries TWO parents, drawn on the canvas
 * with the add-parent affordance (`select-add-parent-*`, this spec's NEW
 * coverage; every other scenario is a chain or a star).
 *
 *     root (lead)
 *       ├── B (component supplier)
 *       └── C (component supplier)
 *             └── D (final leg) — parents [B, C]   ← the diamond join
 *
 *   author   → the diamond is WRITTEN on the designer canvas: root, two subs
 *              drawn under it, a leaf drawn under B, then B's sibling C added
 *              as the leaf's SECOND parent via select-add-parent. The
 *              component suppliers (B, C) compose the merchant PROCESS ladder
 *              (the sovereign log a sub-order's seller advances — the clause
 *              that marks which KIND of off-chain seller the node needs, and
 *              the key the counterparty editor designates by); B additionally
 *              composes hand-off + the single-band proximity witness, C the
 *              emissions disclosure. The final leg (D) composes the courier
 *              PROCESS ladder + hand-off + proximity. Idempotent: discovered
 *              by SHAPE (4 orders, one with two committed parents, a
 *              courier-process leg, an emissions leg) on re-runs.
 *   bind     → the LEAD registers through the real wizard, binds the diamond,
 *              and designates seeded sellers per PROCESS clause:
 *              merchant-process → [Cardinal, Sterling] (the per-clause cursor
 *              hands B the first, C the second, by commit order),
 *              courier-process → [Harbor]. Each counterparty pins the
 *              assembly to its own profile (the even-surfacing rule).
 *   checkout → the buyer orders the kit from the lead: ONE place signs all
 *              FOUR orders through the same confirm gate; every sub priced
 *              live from its counterparty's own catalogue.
 *   accept   → walk order (root, B, C, D — the kernel's exact-match cumulative
 *              accumulator enforces the sequence): after every commit the
 *              exact bond-driven BALANCE deltas are asserted for every party,
 *              computed from the chain's own event values (the accumulator
 *              invariant itself is Foundry/Halmos/Certora-owned — not
 *              restated here; the DAG lives in the topology clause, never in
 *              the kernel).
 *   diamond  → the leaf's PINNED agreement commits BOTH parents' real order
 *              hashes in its topology section — the join, merkle-bound.
 *   resolve  → ONE signature settles all four orders atomically.
 *   audit    → financials render one statement per seller (all four) + the
 *              consolidation; the cash-flow log carries every kernel transfer
 *              (2 rows per commit + 2 per order at resolve = 16 exactly).
 *
 * Cast (scenario labels only — the kernel sees ordinary wallets):
 *   buyer      anvil[4]   (also buyer-assigned's buyer — specs run serially,
 *                          every assert is a delta)
 *   lead       anvil[17]  Kit Works (this spec's wizard seller)
 *   suppliers  DESIGNATED seeded sellers: Cardinal Couriers (anvil[8]),
 *              Harbor Provisions (anvil[11]), Sterling Goods (anvil[12]) —
 *              their catalogues price the sub-orders live.
 *
 * K3 note: cross-order sibling attest has no client plumbing — no sister-
 * clause pairing produces it, and no consumer leg reads it. The on-chain
 * attestAsSeller(role, target) surface remains (DESIGN_DECISIONS §2); a
 * cross-order verb, if ever needed, derives from a composed clause's spec —
 * never a hardcoded affordance.
 *
 * No evmSnapshot/evmRevert — devnet is a mainnet rehearsal; the gates are
 * idempotent and the run leaves its state on-chain for out-of-band checks.
 *
 * Requires Anvil + ./scripts/deploy-local.sh + populate-test-data + Kubo + :3100.
 */
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import { createPublicClient, defineChain, http, parseAbi, type Hex } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import {
    assertPinnedInIpfs,
    confirmAgreementPreviews,
    DELIVERY_CLAUSES,
    discoverAnchoredAssemblies,
    readLocalDeploymentConfig,
    memberProfileBindings,
    waitForConnected,
} from './devnet-helpers';
import { ANVIL_ACCOUNTS } from '../anvilAccounts';
import { CORE_ABI } from '@/lib/kernel/contracts';
import { calculateBonds } from '@figaro-protocol/sdk';
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

const BUYER = ANVIL_ACCOUNTS[4] as Hex;
const LEAD = {
    address: mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 17 }).address as Hex,
    name: 'Kit Works',
    specialty: 'kit assembly lead',
    geohash: '9q8yyk8z5',
    product: { name: 'Component kit', price: '1' },
};
// Seeded counterparties (their catalogues price the sub-orders live).
const SUPPLIER_B = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 8 }).address as Hex; // Cardinal Couriers
const SUPPLIER_D = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 11 }).address as Hex; // Harbor Provisions
const SUPPLIER_C = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 12 }).address as Hex; // Sterling Goods

const EMISSIONS_CLAUSE = 'figaro-emissions';
const TOPOLOGY_CLAUSE = 'figaro-topology';

/** The diamond's SHAPE on-chain: four orders, one committing TWO template
 *  parents, a courier-process final leg, an emissions leg. (The
 *  courier-process requirement also skips a mis-composed first anchoring
 *  attempt that persists on the devnet — an anchored assembly is immutable;
 *  a corrected composition is a NEW assembly, never an edit.) */
async function findDiamondAssembly(): Promise<string | undefined> {
    const templates = await discoverAnchoredAssemblies();
    return templates.find(
        (t) => t.agreements.length === 4
            && t.agreements.some((o) => {
                const topo = (o.clauses?.[TOPOLOGY_CLAUSE] ?? {}) as { parentOrderHashes?: unknown[] };
                return Array.isArray(topo.parentOrderHashes) && topo.parentOrderHashes.length === 2;
            })
            && t.agreements.some((o) => Object.keys(o.clauses ?? {}).includes(DELIVERY_CLAUSES.courier))
            && t.agreements.some((o) => Object.keys(o.clauses ?? {}).includes(EMISSIONS_CLAUSE)),
    )?.slug;
}

test.describe('KIT DIAMOND — a DAG join: one buyer, four orders, two parents on the leaf (devnet)', () => {
    test.setTimeout(480_000);

    test('canvas diamond (select-add-parent) → 4-order checkout → walk-order accepts (exact cumulative bonds) → atomic resolve → full audit', async ({ page }) => {
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });

        const config = readLocalDeploymentConfig();
        const core = config.figaroCore as Hex;
        const token = config.tokenAddress as Hex;
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const balanceOf = (who: Hex) =>
            publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;

        // ── AUTHOR (idempotent): draw the diamond on the real canvas. ──
        let kitSlug = await findDiamondAssembly();
        if (!kitSlug) {
            await page.addInitScript(() => {
                try {
                    window.localStorage.removeItem('figaro:designer:current');
                    window.localStorage.removeItem('figaro:designer:drafts');
                } catch { /* noop */ }
            });
            await page.goto('/assemblies/designer/new?fresh=1&e2e=devnet', { waitUntil: 'domcontentloaded' });
            await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
            await page.getByTestId('designer-saved-hint').waitFor({ timeout: 15000 });

            const orderNodes = page.locator('[data-testid^="order-node-"]:not([data-testid$="-delete"])');
            await expect(orderNodes).toHaveCount(1, { timeout: 10000 });
            const idsOf = () => orderNodes.evaluateAll((els) =>
                els.map((el) => el.getAttribute('data-testid')!.replace('order-node-', '')));
            const [rootId] = await idsOf();

            // Draw B and C under the root, then D under B.
            await page.getByTestId(`btn-add-suborder-${rootId}`).click();
            await expect(orderNodes).toHaveCount(2, { timeout: 10000 });
            const bId = (await idsOf()).find((id) => id !== rootId)!;
            await page.getByTestId(`btn-add-suborder-${rootId}`).click();
            await expect(orderNodes).toHaveCount(3, { timeout: 10000 });
            const cId = (await idsOf()).find((id) => id !== rootId && id !== bId)!;
            await page.getByTestId(`btn-add-suborder-${bId}`).click();
            await expect(orderNodes).toHaveCount(4, { timeout: 10000 });
            const dId = (await idsOf()).find((id) => ![rootId, bId, cId].includes(id))!;

            // THE JOIN — the new coverage: C becomes D's SECOND parent via the
            // add-parent affordance. The canvas rejects self-loops, duplicates,
            // and cycles; a sibling join is legal and completes the diamond.
            await page.getByTestId(`select-add-parent-${dId}`).selectOption(cId);

            // Compose the branches. B and D: hand-off + the single-band
            // proximity witness; C: the emissions disclosure.
            const openNode = async (nodeId: string) => {
                await page.getByTestId(`drawer-node-tab-${nodeId}`).click();
                await page.getByTestId('drawer-tab-registry').click();
                await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });
            };
            // Design time is STRUCTURAL (ruled 2026-07-14): select the clauses
            // and the nesting; the mode/band CHOICES are the buyer's, at checkout.
            const composeHandoffProximity = async () => {
                await page.getByTestId(`drawer-registry-clause-${DELIVERY_CLAUSES.handoff}`).check();
                await page
                    .getByTestId(`drawer-nested-handoff-${DELIVERY_CLAUSES.proximity}`)
                    .getByTestId(`drawer-registry-clause-${DELIVERY_CLAUSES.proximity}`)
                    .check();
            };
            await orderNodes.first().click();
            await page.getByTestId('agreement-drawer').waitFor({ state: 'visible', timeout: 10000 });
            // B — component supplier: merchant PROCESS ladder (the designation
            // key) + hand-off + the proximity witness.
            await openNode(bId);
            await page.getByTestId(`drawer-registry-clause-${DELIVERY_CLAUSES.merchant}`).check();
            await composeHandoffProximity();
            // C — component supplier: merchant PROCESS ladder + emissions.
            await openNode(cId);
            await page.getByTestId(`drawer-registry-clause-${DELIVERY_CLAUSES.merchant}`).check();
            await page.getByTestId(`drawer-registry-clause-${EMISSIONS_CLAUSE}`).check();
            // D — the final leg: courier PROCESS ladder + hand-off + proximity.
            await openNode(dId);
            await page.getByTestId(`drawer-registry-clause-${DELIVERY_CLAUSES.courier}`).check();
            await composeHandoffProximity();

            // Editorial identity + publish.
            await page.getByTestId('designer-name-input').fill('Kit assembly (diamond)');
            await page.getByTestId('designer-summary-input').fill('A kit from two component suppliers; the final leg depends on both branches.');
            await page.getByTestId('designer-description-input').fill('Multi-parent topology: the leaf order carries two parents — the DAG join the kernel never sees, committed in the topology clause.');
            await expect(page.getByTestId('designer-review')).toBeEnabled({ timeout: 5000 });
            await page.getByTestId('designer-review').click();
            await page.waitForURL(/\/assemblies\/designer\/view\/?\?slug=asm-/, { timeout: 15000 });
            const handle = page.url().match(/[?&]slug=(asm-[a-z0-9-]+)/)?.[1];
            expect(handle, 'review navigated to a draft handle').toBeTruthy();
            await page.goto(`/assemblies/designer/view?slug=${handle}&intent=publish&e2e=devnet`, { waitUntil: 'domcontentloaded' });
            const confirmBtn = page.getByTestId('review-confirm-publish');
            await confirmBtn.waitFor({ state: 'visible', timeout: 15000 });
            await waitForConnected(page);
            await confirmBtn.click();
            await page.getByTestId('assembly-publish-receipt').waitFor({ timeout: 60000 });
            const receiptSlug = (await page.getByTestId('receipt-slug').textContent())?.trim();
            expect(receiptSlug, 'publish receipt shows the content slug').toMatch(/^asm-/);
            kitSlug = await findDiamondAssembly();
            expect(kitSlug, 'the published diamond is discoverable by shape').toBe(receiptSlug);
        }

        // ── BIND (idempotent): the lead registers through the wizard, binds the
        //    diamond, and designates the seeded counterparties per clause. ──
        type ProfileBindings = Awaited<ReturnType<typeof memberProfileBindings>>;
        const isConformant = (bindings: ProfileBindings): boolean => {
            const b = bindings.find((x) => x.assemblySlug === kitSlug);
            const designated = (clauseId: string, addr: Hex) =>
                (b?.counterpartyBindings ?? []).some(
                    (cb) => cb.clauseId === clauseId && cb.addresses.some((a) => a.toLowerCase() === addr.toLowerCase()),
                );
            return !!b
                && designated(DELIVERY_CLAUSES.merchant, SUPPLIER_B)
                && designated(DELIVERY_CLAUSES.merchant, SUPPLIER_C)
                && designated(DELIVERY_CLAUSES.courier, SUPPLIER_D);
        };
        if (!isConformant(await memberProfileBindings(LEAD.address))) {
            await gotoAsWallet(page, LEAD.address, '/members');
            await page.goto('/members/identity', { waitUntil: 'domcontentloaded' });
            await expect(page.locator('#profile-name')).toBeVisible({ timeout: 30000 });
            await page.locator('#profile-name').fill(LEAD.name);
            await page.locator('#profile-specialty').fill(LEAD.specialty);
            await page.locator('#profile-geohash').fill(LEAD.geohash);
            await page.getByRole('button', { name: /\+ MOCK$/ }).click();
            await page.locator('input[name="defaultTokenAddress"]').first().check();
            await page.getByRole('button', { name: /^Next/ }).click();
            await expect(page).toHaveURL(/\/members\/assemblies/);

            const row = page.getByTestId(`seller-assembly-row-${kitSlug}`);
            await row.waitFor({ state: 'visible', timeout: 30000 });
            await row.locator('input[type="checkbox"]').first().check();
            // The counterparty editor keys on the sub-orders' PROCESS clauses
            // (the sovereign-log clause marks which KIND of off-chain seller a
            // node needs): TWO merchant-process nodes (B, C — the per-clause
            // cursor hands them out by commit order) and ONE courier-process
            // node (D).
            const counterparties = page.getByTestId(`seller-assembly-counterparties-${kitSlug}`);
            await counterparties.waitFor({ state: 'visible', timeout: 30000 });
            await counterparties.getByTestId(`counterparty-${DELIVERY_CLAUSES.merchant}-input-0`).fill(SUPPLIER_B);
            // A second address row appears via the editor's "+ Add another";
            // ORDER is significant — the per-clause cursor hands B the first
            // address, C the second, by commit order.
            await counterparties.getByTestId(`counterparty-${DELIVERY_CLAUSES.merchant}-add`).click();
            await counterparties.getByTestId(`counterparty-${DELIVERY_CLAUSES.merchant}-input-1`).fill(SUPPLIER_C);
            await counterparties.getByTestId(`counterparty-${DELIVERY_CLAUSES.courier}-input-0`).fill(SUPPLIER_D);
            await page.getByRole('button', { name: /^Next/ }).click();
            await expect(page).toHaveURL(/\/members\/catalogue/);
            await page.locator('[id^="item-"][id$="-name"]').first().fill(LEAD.product.name);
            await page.locator('[id^="item-"][id$="-price"]').first().fill(LEAD.product.price);
            await page.getByRole('button', { name: /^Next/ }).click();
            await expect(page).toHaveURL(/\/members\/buyer/);
            await page.getByRole('button', { name: /^Next/ }).click();
            await expect(page).toHaveURL(/\/members\/agents/);
            await page.getByRole('button', { name: /^Next/ }).click();
            await expect(page).toHaveURL(/\/members\/endpoints/);
            await page.getByRole('button', { name: /^Next/ }).click();
            await page.waitForURL(/\/members\/review/, { timeout: 30000 });
            await page.getByTestId('review-confirm-publish').click();
            await expect(page.getByRole('heading', { name: /Registered\.|Profile updated/i })).toBeVisible({ timeout: 60000 });
            expect(
                isConformant(await memberProfileBindings(LEAD.address)),
                'the pinned lead profile carries the binding + all three designations',
            ).toBe(true);
        }

        // Each counterparty pins the assembly it participates in (even-surfacing).
        const ensureBound = async (seller: Hex, label: string) => {
            if ((await memberProfileBindings(seller)).some((b) => b.assemblySlug === kitSlug)) return;
            await gotoAsWallet(page, seller, '/members/edit/assemblies?e2e=devnet');
            const r = page.getByTestId(`seller-assembly-row-${kitSlug}`);
            await r.waitFor({ state: 'visible', timeout: 30000 });
            await r.locator('input[type="checkbox"]').first().check();
            await page.getByRole('button', { name: 'Save changes' }).click();
            await expect.poll(async () =>
                (await memberProfileBindings(seller)).some((b) => b.assemblySlug === kitSlug), {
                timeout: 60000, message: `${label}'s re-pinned profile carries the diamond binding`,
            }).toBe(true);
        };
        await ensureBound(SUPPLIER_B, 'supplier B');
        await ensureBound(SUPPLIER_C, 'supplier C');
        await ensureBound(SUPPLIER_D, 'supplier D');

        // ── BASELINES (deltas, never absolutes). ──
        const committedBefore = (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: BUYER }, fromBlock: 0n,
        })).length;
        const [buyer0, lead0, b0, c0, d0, core0] = await Promise.all([
            balanceOf(BUYER), balanceOf(LEAD.address), balanceOf(SUPPLIER_B),
            balanceOf(SUPPLIER_C), balanceOf(SUPPLIER_D), balanceOf(core),
        ]);

        // ── CHECKOUT: one place signs all FOUR orders through the confirm gate. ──
        await gotoAsWallet(page, BUYER, `/s/view?seller=${LEAD.address}&e2e=devnet`);
        await page.getByTestId('member-detail-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const addBtn = page.locator('[data-testid^="btn-add-"]').first();
        await addBtn.waitFor({ state: 'visible', timeout: 20000 });
        await addBtn.click();
        await page.getByTestId('btn-review-order').click();
        await page.getByTestId('checkout-view').waitFor({ timeout: 20000 });
        const methodSelect = page.getByTestId('select-method');
        if (await methodSelect.isVisible().catch(() => false)) {
            await methodSelect.selectOption(kitSlug!);
        }
        await expect(
            page.getByTestId('cart-contributor-breakdown'),
            'the P&L renders one row per contributor, each priced from its own catalogue',
        ).toBeVisible({ timeout: 30000 });
        // The buyer authors every node's transaction particulars: TWO nodes
        // compose hand-off + proximity (B and D), one composes emissions (C) —
        // fill EVERY matching control, per node (templates arrive value-free).
        const checkAllFields = async (suffix: string) => {
            const controls = page.locator(`[data-testid^="checkout-field-"][data-testid$="${suffix}"]`);
            const n = await controls.count();
            for (let i = 0; i < n; i++) await controls.nth(i).check();
        };
        await checkAllFields(`-${DELIVERY_CLAUSES.handoff}-handoff-face-to-face`);
        await checkAllFields(`-${DELIVERY_CLAUSES.proximity}-bands-zone-wifi`);
        await page.locator(`[data-testid^="checkout-field-"][data-testid$="-${EMISSIONS_CLAUSE}-standard"]`).first().fill('ISO 14064');
        const place = page.getByTestId('btn-place-order');
        await expect(place).toHaveText(/Place order/, { timeout: 20000 });
        await place.click();
        await confirmAgreementPreviews(page, 4);
        await page.getByTestId('send-commitment-xmtp').click();
        await expect(page.getByTestId('commitment-xmtp-status')).toBeVisible({ timeout: 30000 });

        // ── ACCEPTS in walk order (root, B, C, D). Amounts from chain events. ──
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
            return event;
        };

        const rootEvent = await acceptAs(LEAD.address, 'lead');
        const processId = rootEvent.args.processId!;
        const rootBonds = calculateBonds(rootEvent.args.cumulativeValue!, rootEvent.args.payment!);
        {
            const [b, l, k] = await Promise.all([balanceOf(BUYER), balanceOf(LEAD.address), balanceOf(core)]);
            expect(buyer0 - b, 'after root: buyer down by its buyer bond').toBe(rootBonds.buyerBond);
            expect(lead0 - l, 'after root: lead down by its seller bond').toBe(rootBonds.sellerBond);
            expect(k - core0, 'after root: escrow up by both bonds').toBe(rootBonds.buyerBond + rootBonds.sellerBond);
        }

        const bEvent = await acceptAs(SUPPLIER_B, 'supplier B');
        expect(bEvent.args.processId, 'B extends the SAME process').toBe(processId);
        const bBonds = calculateBonds(bEvent.args.cumulativeValue!, bEvent.args.payment!);

        const cEvent = await acceptAs(SUPPLIER_C, 'supplier C');
        expect(cEvent.args.processId, 'C extends the SAME process').toBe(processId);
        const cBonds = calculateBonds(cEvent.args.cumulativeValue!, cEvent.args.payment!);

        // The LEAF: its seller bonds 2× the ENTIRE upstream value — the
        // cumulative accumulator is linear; the diamond never reaches the kernel.
        const dEvent = await acceptAs(SUPPLIER_D, 'supplier D (the leaf)');
        expect(dEvent.args.processId, 'D extends the SAME process').toBe(processId);
        const total = rootEvent.args.payment! + bEvent.args.payment! + cEvent.args.payment! + dEvent.args.payment!;
        const dBonds = calculateBonds(dEvent.args.cumulativeValue!, dEvent.args.payment!);
        {
            const [b, dd, k] = await Promise.all([balanceOf(BUYER), balanceOf(SUPPLIER_D), balanceOf(core)]);
            expect(buyer0 - b, 'after the leaf: buyer down by all four buyer bonds')
                .toBe(rootBonds.buyerBond + bBonds.buyerBond + cBonds.buyerBond + dBonds.buyerBond);
            expect(d0 - dd, 'after the leaf: its seller down by the cumulative-scaled bond').toBe(dBonds.sellerBond);
            expect(k - core0, 'the escrow holds every bond in the diamond').toBe(
                rootBonds.buyerBond + rootBonds.sellerBond + bBonds.buyerBond + bBonds.sellerBond
                + cBonds.buyerBond + cBonds.sellerBond + dBonds.buyerBond + dBonds.sellerBond,
            );
        }
        expect((await queryCommitted()).length, 'exactly four orders committed').toBe(committedBefore + 4);

        // ── THE DIAMOND, merkle-bound: the leaf's pinned agreement commits
        //    BOTH parents' REAL order hashes in its topology section. ──
        await gotoAsWallet(page, BUYER, `/orders/view?process=${processId}&e2e=devnet`);
        await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
        const dAgreementUri = await page.evaluate(
            (key) => window.localStorage.getItem(key),
            `figaro:agreement-uri:${dEvent.args.agreementHash}`,
        );
        expect(dAgreementUri, "the leaf's committed agreement has a network (IPFS) locator").toMatch(/^ipfs:\/\//);
        const dCid = dAgreementUri!.replace(/^ipfs:\/\//, '');
        await assertPinnedInIpfs(dCid);
        const ipfsApi = process.env.NEXT_PUBLIC_IPFS_API_URL ?? 'http://127.0.0.1:5001';
        const dAgreement = await (await fetch(`${ipfsApi}/api/v0/cat?arg=${dCid}`, { method: 'POST' })).json() as {
            sections: { clause: string; data: Record<string, unknown> }[];
        };
        const topoSection = dAgreement.sections.find((s) => s.clause === TOPOLOGY_CLAUSE);
        const parents = ((topoSection?.data.parentOrderHashes ?? []) as string[]).map((h) => h.toLowerCase());
        expect(parents, 'the leaf commits exactly TWO parents').toHaveLength(2);
        expect(
            parents.sort(),
            "the leaf's parents are B and C's real order hashes — the diamond join, merkle-bound",
        ).toEqual([bEvent.args.orderHash!.toLowerCase(), cEvent.args.orderHash!.toLowerCase()].sort());

        // ── RESOLVE: ONE signature settles the whole diamond atomically. ──
        const resolvedBefore = (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'ProcessResolved', args: { buyer: BUYER }, fromBlock: 0n,
        })).length;
        const resolveBtn = page.getByTestId('capability-execute-resolve-process');
        await waitForConnected(page);
        await expect(resolveBtn, 'the buyer can resolve the active process').toBeEnabled({ timeout: 30000 });
        await resolveBtn.click();
        await expect.poll(async () => (await publicClient.getContractEvents({
            address: core, abi: CORE_ABI, eventName: 'ProcessResolved', args: { buyer: BUYER }, fromBlock: 0n,
        })).length, { timeout: 60000, message: 'ProcessResolved lands on-chain' }).toBe(resolvedBefore + 1);

        // ── SETTLEMENT: every party paid by the one signature. ──
        const [buyerF, leadF, bF, cF, dF, coreF] = await Promise.all([
            balanceOf(BUYER), balanceOf(LEAD.address), balanceOf(SUPPLIER_B),
            balanceOf(SUPPLIER_C), balanceOf(SUPPLIER_D), balanceOf(core),
        ]);
        expect(buyer0 - buyerF, 'buyer net paid exactly the diamond total').toBe(total);
        expect(leadF - lead0, 'lead net earned exactly its payment').toBe(rootEvent.args.payment!);
        expect(bF - b0, 'supplier B net earned exactly its payment').toBe(bEvent.args.payment!);
        expect(cF - c0, 'supplier C net earned exactly its payment').toBe(cEvent.args.payment!);
        expect(dF - d0, 'the leaf seller net earned exactly its payment').toBe(dEvent.args.payment!);
        expect(coreF, 'FigaroCore escrow returned to its baseline').toBe(core0);

        // ── AUDIT: the full four-order record. ──
        await page.goto(`/audit/view?process=${processId}&e2e=devnet`, { waitUntil: 'domcontentloaded' });
        await page.getByTestId('audit-page').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        await expect(page.getByTestId('financials-view')).toBeVisible({ timeout: 30000 });
        await expect(
            page.locator('[data-testid="document-financial-statements-seller"]'),
            'one financial-statements document per seller (lead + three suppliers)',
        ).toHaveCount(4, { timeout: 30000 });
        const cashflowRows = page.locator('[data-testid="document-lines-financial-statements-process"] tbody tr');
        await expect(cashflowRows, 'one cash-flow row per kernel transfer (4 orders × 4)').toHaveCount(16, { timeout: 30000 });
        const evidence = page.getByTestId('audit-clause-evidence');
        await evidence.waitFor({ state: 'visible', timeout: 30000 });
        for (const text of ['Commerce terms', 'Order topology', 'Emissions disclosure', 'Proximity-verification policy']) {
            await expect(
                evidence.getByText(text).first(),
                `the "${text}" evidence leaf surfaces in the audit`,
            ).toBeVisible({ timeout: 30000 });
        }
    });
});
