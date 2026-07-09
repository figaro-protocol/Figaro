/**
 * clause-coverage.devnet.spec.ts — one rung per protocol clause no other e2e
 * drives (the punch-list per-clause coverage item; permissionless-clause IS the
 * harness, iterated).
 *
 * Every rung walks the SAME generic pipeline the acceptance test certifies —
 *
 *   drawer  → the target clause surfaces from the live ClauseRegistry → IPFS
 *   encode  → composing it (design-time field fills, catalogue-authored values,
 *             or a nested sub-clause tick) carries its section into the
 *             committed agreement, past the Layer-A sign gate
 *   commit  → a real bilateral order commits that agreement on-chain
 *   attest  → the seller advances the per-run PROBE clause's ladder through the
 *             ONE generic capability rail (the composition always carries the
 *             probe — its nonce-bearing id keeps the compositionHash unique on
 *             the persistent devnet, and it gives every rung the runtime leg)
 *   audit   → the audit package surfaces the target clause's committed leaf,
 *             labelled from its spec (title, field labels, valueLabels), and
 *             the hash verifier recomputes the merkle root over ALL leaves
 *
 * The target clauses are NOT registered by this spec — they are the protocol
 * clauses populate-test-data.mjs seeds (network pre-population, never a test).
 * The rung table's values are TEST INPUT (what a designer/seller would type),
 * not network data: sellers, catalogues, specs, and agreements are all read
 * from chain + IPFS through the real UI.
 *
 * Rungs settle no funds (no resolve): settlement + bond arithmetic are the
 * permissionless-clause acceptance test's assertions; a rung's scope is the
 * CLAUSE pipeline. Each rung leaves its committed process on-chain — devnet is
 * a mainnet rehearsal, no snapshot/revert.
 *
 * NOT covered here, by finding (see the punch-list):
 *  - figaro-consent — `documents` (required array-of-object) has NO fill
 *    surface: the drawer defers object-arrays to checkout, checkout has no
 *    clause-content form, and no affix surface exists — the Layer-A sign gate
 *    blocks any checkout composing it. Uncommittable through the UI today.
 *
 * Requires Anvil + ./scripts/deploy-local.sh + Kubo + the dev server (:3100).
 */
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import { createPublicClient, defineChain, http, parseAbi, type Hex } from 'viem';
import { privateKeyToAccount, mnemonicToAccount } from 'viem/accounts';
import { readLocalDeploymentConfig, assertPinnedInIpfs } from './devnet-helpers';
import { publishProbeAssembly } from './probeAssembly';
import { ANVIL_KEYS } from '../anvilAccounts';
import { CORE_ABI } from '@/lib/kernel/contracts';
import { calculateBonds } from '@figaro/core';
import type { Page } from '@playwright/test';

const ERC20_ABI = parseAbi(['function balanceOf(address) view returns (uint256)']);

const RPC_URL = 'http://127.0.0.1:8545';
const LOCAL_ANVIL = defineChain({
    id: 31337,
    name: 'Localhost',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
});
const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';

const BUYER = privateKeyToAccount(ANVIL_KEYS[0] as Hex).address; // anvil[0] — buyer + author + registrar
const seller = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 16 }); // anvil[16] — used by no other spec
const SELLER = seller.address;

/** The probe clause's first ladder stage label (from makeProbeSpec's valueLabels). */
const PROBE_FIRST_STAGE_LABEL = 'Probe opened';

/** One rung: how the target clause gets composed + filled, and what must
 *  surface in the audit. All selectors drive the REAL generic surfaces —
 *  drawer field editors (`drawer-field-<clauseId>-<field>[-<option>]`), the
 *  wizard's catalogue clause-values editor
 *  (`item-<uid>-clause-<clauseId>-<field>[-<option>]`), and the nested
 *  sub-clause tree (`drawer-nested-<hostField>-<clauseId>`). */
interface ClauseRung {
    clauseId: string;
    /** Extra drawer work after ticking the target clause (design-time fills). */
    design?: (page: Page) => Promise<void>;
    /** Tick these host clauses BEFORE the target (nesting hosts, fold inputs). */
    composeFirst?: string[];
    /** The target's checkbox lives inside this nested container instead of the
     *  top-level registry list (`drawer-nested-<hostField>-<clauseId>`). */
    nestedUnder?: string;
    /** Wizard identity-step fills (profile-level fields, e.g. the divisor). */
    profile?: (page: Page) => Promise<void>;
    /** Catalogue-step fills on the wizard's first item (clause values and
     *  physical facts — the item's own master data). */
    catalogue?: (page: Page) => Promise<void>;
    /** Spec-derived texts that must surface in the audit clause evidence. */
    auditTexts: string[];
    /** Assertions on the committed leaf's data, from the pinned agreement. */
    leaf: (data: Record<string, unknown>) => void;
}

/** Design-time drawer field input (required scalar → text/number input). */
const drawerFill = (clauseId: string, field: string, value: string) =>
    async (page: Page) => page.getByTestId(`drawer-field-${clauseId}-${field}`).fill(value);
/** Design-time drawer enum radio / enum-array checkbox. */
const drawerPick = (clauseId: string, field: string, option: string) =>
    async (page: Page) => page.getByTestId(`drawer-field-${clauseId}-${field}-${option}`).check();
/** Wizard catalogue clause-values input (suffix-matched — the item uid is dynamic). */
const catalogueFill = (clauseId: string, field: string, value: string) =>
    async (page: Page) =>
        page.locator(`[data-testid$="-clause-${clauseId}-${field}"]`).first().fill(value);
const cataloguePick = (clauseId: string, field: string, option: string) =>
    async (page: Page) =>
        page.locator(`[data-testid$="-clause-${clauseId}-${field}-${option}"]`).first().check();

const all = (...steps: Array<(page: Page) => Promise<unknown>>) =>
    async (page: Page) => { for (const s of steps) await s(page); };

const RUNGS: ClauseRung[] = [
    {
        clauseId: 'figaro-applicable-law',
        // The spec constrains applicableLaw to a shaped jurisdiction token
        // (pattern ^[A-Za-z][A-Za-z0-9-]{1,15}$; prose fails the Layer-A gate);
        // convention per the field description is ISO 3166-2 — 'US-NY'.
        design: drawerFill('figaro-applicable-law', 'applicableLaw', 'US-NY'),
        auditTexts: ['Applicable law and forum', 'US-NY'],
        leaf: (data) => expect(data.applicableLaw).toBe('US-NY'),
    },
    {
        clauseId: 'figaro-arbitration-kleros',
        design: drawerPick('figaro-arbitration-kleros', 'klerosCourt', 'blockchain-technical'),
        auditTexts: ['Kleros decentralized arbitration', 'Blockchain — Technical'],
        leaf: (data) => {
            expect(data.klerosCourt).toBe('blockchain-technical');
            // The spec's declared default backfills the omitted field at encode
            // time (withSpecDefaults) — registry-sourced, never frontend copy.
            expect(data.klerosMinJurors).toBe(3);
        },
    },
    {
        // Catalogue-sourced: the seller authors the values on the catalogue
        // ITEM (the wizard's spec-driven clause-values editor); checkout folds
        // them onto the composed leaf.
        clauseId: 'figaro-cold-chain',
        catalogue: all(
            cataloguePick('figaro-cold-chain', 'tempClass', 'frozen'),
            catalogueFill('figaro-cold-chain', 'tempMinC', '-25'),
            catalogueFill('figaro-cold-chain', 'tempMaxC', '-18'),
        ),
        auditTexts: ['Cold chain', 'Frozen (≤ -18 °C)'],
        leaf: (data) => {
            expect(data.tempClass).toBe('frozen');
            expect(data.tempMinC).toBe(-25);
            expect(data.tempMaxC).toBe(-18);
        },
    },
    {
        // The DERIVATION path, end to end: the seller declares a dim-weight
        // divisor on the profile and physical facts on the catalogue item;
        // checkout derives billed = max(gross 500 g, volumetric
        // ceil(300×200×150 mm³ ÷ 5000) = 1800 g) onto the composed dimweight
        // leaf — nothing is authored at design time.
        clauseId: 'figaro-dimweight',
        composeFirst: ['figaro-cargo'],
        profile: async (page) => page.locator('#profile-dimweight-divisor').fill('5000'),
        catalogue: async (page) => {
            await page.locator('[id^="item-"][id$="-mass"]').first().fill('500');
            await page.locator('[id^="item-"][id$="-volume"]').first().fill('1000');
            await page.locator('[id^="item-"][id$="-length"]').first().fill('300');
            await page.locator('[id^="item-"][id$="-width"]').first().fill('200');
            await page.locator('[id^="item-"][id$="-height"]').first().fill('150');
        },
        auditTexts: ['Dimensional weight', '1800'],
        leaf: (data) => {
            expect(data.billedMassGrams).toBe(1800);
            expect(data.divisor).toBe(5000);
        },
    },
    {
        clauseId: 'figaro-freight-class',
        catalogue: cataloguePick('figaro-freight-class', 'nmfcClass', '70'),
        auditTexts: ['Freight class', 'Class 70 — 15–22.5 lb/ft³'],
        leaf: (data) => expect(data.nmfcClass).toBe('70'),
    },
    {
        clauseId: 'figaro-ghg',
        design: drawerFill('figaro-ghg', 'standard', 'GHG Protocol Product Standard'),
        auditTexts: ['GHG emissions disclosure', 'GHG Protocol Product Standard'],
        leaf: (data) => expect(data.standard).toBe('GHG Protocol Product Standard'),
    },
    {
        clauseId: 'figaro-hazmat',
        catalogue: all(
            catalogueFill('figaro-hazmat', 'unNumber', 'UN1263'),
            catalogueFill('figaro-hazmat', 'properShippingName', 'Paint'),
            cataloguePick('figaro-hazmat', 'hazardClass', '3'),
            cataloguePick('figaro-hazmat', 'packingGroup', 'II'),
        ),
        auditTexts: ['Dangerous goods (hazmat)', 'Flammable liquids', 'UN1263'],
        leaf: (data) => {
            expect(data.unNumber).toBe('UN1263');
            expect(data.properShippingName).toBe('Paint');
            expect(data.hazardClass).toBe('3');
            expect(data.packingGroup).toBe('II');
        },
    },
    {
        // Nested sub-clause: proximity-policy nests under the handoff FIELD
        // (clauseNestsUnder), so it is reachable only inside its host's
        // sub-clause tree — reconstructed from the spec, never hardcoded.
        clauseId: 'figaro-proximity-policy',
        composeFirst: ['figaro-handoff'],
        nestedUnder: 'handoff',
        design: all(
            drawerPick('figaro-handoff', 'handoff', 'locker'),
            drawerPick('figaro-proximity-policy', 'bands', 'zone-wifi'),
            drawerPick('figaro-proximity-policy', 'bands', 'contact-nfc'),
        ),
        auditTexts: ['Proximity-verification policy', 'Zone (Wi-Fi), Contact (NFC)', 'Hand-off point'],
        leaf: (data) => expect(data.bands).toEqual(['zone-wifi', 'contact-nfc']),
    },
];

/** Wait for ClientInit's devnet auto-connect (the "Connect Wallet" button goes). */
async function waitForConnected(page: Page) {
    await page.waitForFunction(
        () => !Array.from(document.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Connect Wallet'),
        null,
        { timeout: 30000 },
    );
}

test.describe('PER-CLAUSE COVERAGE — every protocol clause flows the generic pipeline (devnet)', () => {
    test.setTimeout(360_000);

    for (const rung of RUNGS) {
        test(`${rung.clauseId}: drawer → encode → commit → attest → audit through the generic pipeline`, async ({ page }) => {
            page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });

            const config = readLocalDeploymentConfig();
            const core = config.figaroCore as Hex;
            const token = config.tokenAddress as Hex;
            const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
            const balanceOf = (who: Hex) =>
                publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;

            // ── DRAWER + ENCODE: author the rung's assembly on the REAL canvas —
            //    the per-run probe (uniqueness + the runtime leg) plus the TARGET
            //    clause, surfaced from the live registry and filled through the
            //    generic field editors. ──
            await page.addInitScript(() => {
                try {
                    window.localStorage.removeItem('figaro:designer:current');
                    window.localStorage.removeItem('figaro:designer:drafts');
                } catch { /* noop */ }
            });
            const probe = await publishProbeAssembly(page, {
                summary: `Per-clause coverage rung: ${rung.clauseId}.`,
                description: `Single-node assembly composing ${rung.clauseId} alongside the per-run probe clause.`,
                compose: async (p) => {
                    for (const host of rung.composeFirst ?? []) {
                        await p.getByTestId(`drawer-registry-clause-${host}`).check();
                    }
                    const checkbox = rung.nestedUnder
                        ? p
                            .getByTestId(`drawer-nested-${rung.nestedUnder}-${rung.clauseId}`)
                            .getByTestId(`drawer-registry-clause-${rung.clauseId}`)
                        : p.getByTestId(`drawer-registry-clause-${rung.clauseId}`);
                    await expect(
                        checkbox,
                        `the drawer surfaces ${rung.clauseId} from the live registry (drawer leg)`,
                    ).toHaveCount(1, { timeout: 20000 });
                    await checkbox.check();
                    if (rung.design) await rung.design(p);
                },
            });

            // ── BIND: onboard anvil[16] through the REAL wizard — one catalogue
            //    item (plus the rung's catalogue-authored clause values) and
            //    EXACTLY this rung's assembly bound (earlier rungs' bindings are
            //    unchecked so checkout is unambiguous). ──
            await gotoAsWallet(page, SELLER, '/sellers');
            await page.goto('/sellers/identity', { waitUntil: 'domcontentloaded' });
            await expect(page.locator('#profile-name')).toBeVisible({ timeout: 30000 });
            await page.locator('#profile-name').fill('Coverage Seller');
            await page.locator('#profile-specialty').fill('per-clause coverage');
            await page.locator('#profile-geohash').fill('9q8yyk8yu');
            if (rung.profile) await rung.profile(page);
            await page.getByRole('button', { name: /\+ MOCK$/ }).click();
            await page.locator('input[name="defaultTokenAddress"]').first().check();
            await page.getByRole('button', { name: /^Next/ }).click();
            await expect(page).toHaveURL(/\/sellers\/catalogue/);

            await page.locator('[id^="item-"][id$="-name"]').first().fill('Coverage item');
            await page.locator('[id^="item-"][id$="-price"]').first().fill('1');
            if (rung.catalogue) await rung.catalogue(page);
            await page.getByRole('button', { name: /^Next/ }).click();
            await expect(page).toHaveURL(/\/sellers\/assemblies/);

            // Unbind everything a prior rung left checked, then bind MY assembly.
            const checkedRows = page.locator('[data-testid^="seller-assembly-row-"] input[type="checkbox"]:checked');
            while ((await checkedRows.count()) > 0) await checkedRows.first().uncheck();
            const myRow = page.locator('[data-testid^="seller-assembly-row-"]').filter({ hasText: probe.name });
            await myRow.first().waitFor({ state: 'visible', timeout: 30000 });
            await myRow.first().locator('input[type="checkbox"]').first().check();
            await page.getByRole('button', { name: /^Next/ }).click();
            await expect(page).toHaveURL(/\/sellers\/agents/);
            await page.getByRole('button', { name: /^Next/ }).click();
            await page.waitForURL(/\/sellers\/review/, { timeout: 30000 });
            await page.getByTestId('review-confirm-publish').click();
            await expect(page.getByRole('heading', { name: /Registered\.|Profile updated/i })).toBeVisible({ timeout: 60000 });

            // ── COMMIT: buyer orders, signs (the Layer-A gate validates the
            //    target clause's section here), relays; seller accepts. ──
            const committedBefore = (await publicClient.getContractEvents({
                address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: BUYER }, fromBlock: 0n,
            })).length;
            // Bond-escrow baseline in the payment token, BEFORE the commit
            // pulls bonds. Deltas (not absolutes) are asserted, so this is
            // robust to whatever residue prior rungs left on the persistent
            // devnet. This is the money leg: the chain is the point.
            const [buyerBefore, sellerBefore, coreBefore] = await Promise.all([
                balanceOf(BUYER), balanceOf(SELLER), balanceOf(core),
            ]);
            await gotoAsWallet(page, BUYER, `/s/${SELLER}?e2e=devnet`);
            await page.getByTestId('seller-detail-view').waitFor({ timeout: 30000 });
            await waitForConnected(page);
            const addBtn = page.locator('[data-testid^="btn-add-"]').first();
            await addBtn.waitFor({ state: 'visible', timeout: 20000 });
            await addBtn.click();
            await page.getByTestId('btn-review-order').click();
            await page.getByTestId('checkout-view').waitFor({ timeout: 20000 });
            const place = page.getByTestId('btn-place-order');
            await expect(place, 'buyer connected + order ready → "Place order"').toHaveText(/Place order/, { timeout: 20000 });
            await place.click();
            await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
            await page.getByTestId('preview-confirm').click();
            await page.getByTestId('buyer-share-panel').waitFor({ timeout: 60000 });
            await page.getByTestId('send-commitment-xmtp').click();
            await expect(page.getByTestId('commitment-xmtp-status')).toBeVisible({ timeout: 30000 });

            await gotoAsWallet(page, SELLER, '/orders?e2e=devnet');
            await page.getByTestId('orders-list').waitFor({ timeout: 30000 });
            await waitForConnected(page);
            await page.getByTestId('order-your-turn-card').first().waitFor({ state: 'visible', timeout: 30000 });
            await page.getByTestId('btn-accept-order').first().click();
            await page.getByTestId('agreement-preview-modal').waitFor({ state: 'visible', timeout: 30000 });
            await page.getByTestId('preview-confirm').click();

            const queryCommitted = () => publicClient.getContractEvents({
                address: core, abi: CORE_ABI, eventName: 'OrderCommitted', args: { buyer: BUYER }, fromBlock: 0n,
            });
            await expect.poll(async () => (await queryCommitted()).length, {
                timeout: 60000, message: 'a new OrderCommitted lands on-chain',
            }).toBe(committedBefore + 1);
            const committed = await queryCommitted();
            const event = committed[committed.length - 1];
            expect(event.args.seller?.toLowerCase(), 'committed against the coverage seller').toBe(SELLER.toLowerCase());
            const processId = event.args.processId!;
            const receipt = await publicClient.getTransactionReceipt({ hash: event.transactionHash });
            expect(receipt.status, 'the commit transaction succeeded').toBe('success');

            // ── Funds actually moved: buyer↓ buyerBond, seller↓ sellerBond,
            //    FigaroCore escrow↑ both — the asymmetric-bonding mechanism,
            //    read from the token contract, not the UI. (Rungs don't
            //    resolve — full-cycle settlement is permissionless-clause's
            //    assertion; the lock IS the commit's on-chain effect.) ──
            const { buyerBond, sellerBond } = calculateBonds(event.args.cumulativeValue!, event.args.payment!);
            const [buyerAfter, sellerAfter, coreAfter] = await Promise.all([
                balanceOf(BUYER), balanceOf(SELLER), balanceOf(core),
            ]);
            expect(buyerBefore - buyerAfter, 'buyer balance decreased by the buyer bond').toBe(buyerBond);
            expect(sellerBefore - sellerAfter, 'seller balance decreased by the seller bond').toBe(sellerBond);
            expect(coreAfter - coreBefore, 'FigaroCore escrow increased by both bonds').toBe(buyerBond + sellerBond);

            // ── ATTEST (runtime leg): the seller advances the probe's ladder
            //    through the ONE generic capability rail. ──
            await gotoAsWallet(page, SELLER, `/orders/${processId}?e2e=devnet`);
            await page.getByTestId('order-timeline-view').waitFor({ timeout: 30000 });
            await waitForConnected(page);
            const attest = page.getByTestId('capability-execute-submit-clause-attestation').first();
            await expect(attest, 'the rail surfaces the probe attest capability').toBeVisible({ timeout: 30000 });
            await expect(attest).toBeEnabled({ timeout: 30000 });
            await attest.click();
            await expect(
                page.getByTestId('order-timeline').getByText(PROBE_FIRST_STAGE_LABEL),
                'the probe attestation renders on the timeline, its label read from the spec',
            ).toBeVisible({ timeout: 60000 });

            // ── AUDIT: the target clause's committed leaf surfaces, labelled
            //    from its spec, and the merkle root over ALL leaves matches the
            //    on-chain agreementHash. ──
            await page.goto(`/audit/${processId}?e2e=devnet`, { waitUntil: 'domcontentloaded' });
            await page.getByTestId('audit-page').waitFor({ timeout: 30000 });
            await waitForConnected(page);
            const evidence = page.getByTestId('audit-clause-evidence');
            await evidence.waitFor({ state: 'visible', timeout: 30000 });
            await expect(evidence.getByText('Commerce terms'), 'the commerce leaf value surfaces').toBeVisible({ timeout: 30000 });
            for (const text of rung.auditTexts) {
                await expect(
                    evidence.getByText(text).first(),
                    `the audit surfaces "${text}" for ${rung.clauseId}, read from its registered spec`,
                ).toBeVisible({ timeout: 15000 });
            }

            // The committed tree, from the network SSoT: fetch the agreement the
            // audit resolves (IPFS, pinned), assert the target leaf's DATA, then
            // drive the hash verifier (Mode A) to tie every leaf to the chain.
            const agreementHash = event.args.agreementHash as `0x${string}`;
            const agreementUri = await page.evaluate(
                (key) => window.localStorage.getItem(key),
                `figaro:agreement-uri:${agreementHash}`,
            );
            expect(agreementUri, 'the committed agreement has a network (IPFS) locator').toMatch(/^ipfs:\/\//);
            const agreementCid = agreementUri!.replace(/^ipfs:\/\//, '');
            await assertPinnedInIpfs(agreementCid);
            const ipfsApi = process.env.NEXT_PUBLIC_IPFS_API_URL ?? 'http://127.0.0.1:5001';
            const agreementJson = await (await fetch(`${ipfsApi}/api/v0/cat?arg=${agreementCid}`, { method: 'POST' })).text();
            const agreement = JSON.parse(agreementJson) as {
                sections: { clause: string; data: Record<string, unknown> }[];
            };
            const leafClauses = agreement.sections.map((s) => s.clause);
            expect(leafClauses, 'the committed merkle tree carries the structural, probe, and target leaves')
                .toEqual(expect.arrayContaining([
                    'figaro-commerce', 'figaro-topology', probe.clauseId,
                    ...(rung.composeFirst ?? []), rung.clauseId,
                ]));
            const targetLeaf = agreement.sections.find((s) => s.clause === rung.clauseId);
            expect(targetLeaf, `the ${rung.clauseId} section is a committed leaf`).toBeTruthy();
            rung.leaf(targetLeaf!.data);

            await page.getByTestId('verify-mode-agreement').click();
            await page.getByTestId('verify-agreement-input').fill(agreementJson);
            await page.getByTestId('verify-agreement-expected').fill(agreementHash);
            await expect(
                page.getByTestId('verify-result-computed'),
                'the audit recomputes a merkle root from the IPFS agreement',
            ).toBeVisible({ timeout: 15000 });
            await expect(
                page.getByTestId('verify-result-status'),
                'the recomputed root over every leaf matches the on-chain agreementHash',
            ).toHaveText(/Matches expected hash/, { timeout: 15000 });
        });
    }
});
