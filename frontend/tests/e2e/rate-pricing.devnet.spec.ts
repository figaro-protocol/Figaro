/**
 * rate-pricing.devnet.spec.ts
 *
 * RATE-BASED PRICING (T6's last rung) — a contributor prices by RATE and the
 * payment the buyer signs derives at checkout: rate × the quantity resolved
 * from the order's OWN committed data. The quantity source here is
 * `order-geodistance` — the great-circle distance between the sub-order's
 * committed geolocation endpoints (authored on the designer canvas), billed
 * per STARTED km — so the whole figure is derivable and replayable from the
 * agreement alone, no oracle and no reference back to the mutable catalogue.
 *
 * Self-contained (permissionless-clause discipline): the spec authors its own
 * 2-order assembly, onboards its own lead + rate-priced hauler THROUGH the
 * wizard (driving the pricing-policy UI), binds + designates through
 * seller-edit, and checks out as the buyer. Everything discovered from
 * chain + IPFS by SHAPE; idempotent (content-addressed assembly,
 * conformance-checked bindings). No seeded state consumed.
 *
 * Scope: through the buyer's SIGN + relay (the payment the buyer signs is
 * the deliverable). The accept/resolve/audit legs run the same machinery
 * assembly-chain and local-commerce already certify.
 */
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import { mnemonicToAccount } from 'viem/accounts';
import { formatEther, parseEther, type Hex } from 'viem';
import {
    confirmAgreementPreviews,
    discoverAnchoredAssemblies,
    memberProfileBindings,
} from './devnet-helpers';
import { ANVIL_ACCOUNTS } from '../anvilAccounts';
import { geohashCentroidDistanceKm } from '@figaro/sdk/derive';
import type { Page } from '@playwright/test';

const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';

const BUYER = ANVIL_ACCOUNTS[3] as Hex; // anvil[3] — a buyer no other spec uses
const LEAD = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 14 }).address as Hex;
const HAULER = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 15 }).address as Hex;

const PROCESS_CLAUSE = 'figaro-courier-process'; // the transfer-ladder the binding keys on
const GEO_CLAUSE = 'figaro-geolocation';

// The committed endpoints — design-time values on the canvas. SF → Berkeley-ish,
// far enough apart that ceil(km) is a real multi-unit bill.
const ORIGIN_GEOHASH = '9q8yyk';
const DESTINATION_GEOHASH = '9q9p1d';

// The hauler's published rate: 0.01 per started km.
const RATE = '0.01';

// The expected derivation, computed with the SAME SDK geo math the runtime
// uses (the SDK's own tests pin the haversine/decode correctness; this spec
// pins that checkout actually derives payment = rate × ceil(km) from it).
const KM = geohashCentroidDistanceKm(ORIGIN_GEOHASH, DESTINATION_GEOHASH);
const BILLED_KM = Math.max(1, Math.ceil(KM));
const EXPECTED_SUB_PAYMENT = parseEther(RATE) * BigInt(BILLED_KM);
const EXPECTED_TOTAL = parseEther('1') + EXPECTED_SUB_PAYMENT; // lead meal 1 + hauled leg

async function waitForConnected(page: Page) {
    await page.waitForFunction(
        () => !Array.from(document.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Connect Wallet'),
        null,
        { timeout: 30000 },
    );
}

/** This scenario's assembly, recognized on-chain by SHAPE: exactly two
 *  orders, the sub-order carrying the process ladder AND geolocation with
 *  exactly these committed endpoints (content-addressing makes re-runs land
 *  on the same slug). */
async function findRateAssembly(): Promise<string | undefined> {
    const templates = await discoverAnchoredAssemblies();
    // Discovery is STRUCTURAL (ruled 2026-07-14: templates are value-free by
    // construction — the geohashes are the buyer's checkout fills, so no
    // anchored value can identify the assembly). The rate shape: a two-node
    // chain whose hauled leg composes process + geo and NOTHING else beyond
    // the two mandatory folds (the delivery assembly's courier leg also
    // carries handoff + proximity → 6 keys, and its root carries merchant +
    // modalities → 4 keys; this shape is 4 and 2).
    return templates.find((t) => {
        if (t.agreements.length !== 2) return false;
        const keysets = t.agreements.map((o) => Object.keys(o.clauses ?? {}));
        const sub = keysets.find((k) => k.includes(PROCESS_CLAUSE) && k.includes(GEO_CLAUSE));
        const root = keysets.find((k) => !k.includes(PROCESS_CLAUSE));
        return !!sub && sub.length === 4 && !!root && root.length === 2;
    })?.slug;
}

/** Walk the registration wizard for a wallet — catalogue item per `product`,
 *  including the rate-pricing fields when `product.rate` is set. Idempotent:
 *  callers gate on a conformance check before invoking. */
async function onboardSeller(page: Page, opts: {
    wallet: Hex;
    name: string;
    specialty: string;
    geohash: string;
    assemblySlug: string;
    product: { name: string; price: string; rate?: { unit: string; source: string } };
    designate?: { clauseId: string; counterparty: Hex };
}) {
    await gotoAsWallet(page, opts.wallet, '/members/identity?e2e=devnet');
    await expect(page.locator('#profile-name')).toBeVisible({ timeout: 30000 });
    await page.locator('#profile-name').fill(opts.name);
    await page.locator('#profile-specialty').fill(opts.specialty);
    await page.locator('#profile-geohash').fill(opts.geohash);
    await page.getByRole('button', { name: /\+ MOCK$/ }).click();
    await page.locator('input[name="defaultTokenAddress"]').first().check();
    await page.getByRole('button', { name: /^Next/ }).click();
    await expect(page).toHaveURL(/\/members\/catalogue/);

    await page.locator('[id^="item-"][id$="-name"]').first().fill(opts.product.name);
    await page.locator('[id^="item-"][id$="-price"]').first().fill(opts.product.price);
    if (opts.product.rate) {
        // The wizard's pricing-policy axis: rate per unit, quantity from the
        // declared source — the UI this feature added.
        await page.locator('[data-testid^="item-"][data-testid$="-pricing-policy"]').first()
            .selectOption('rate');
        await page.locator('[data-testid^="item-"][data-testid$="-rate-unit"]').first()
            .fill(opts.product.rate.unit);
        await page.locator('[data-testid^="item-"][data-testid$="-rate-source"]').first()
            .selectOption(opts.product.rate.source);
    }
    await page.getByRole('button', { name: /^Next/ }).click();
    await expect(page).toHaveURL(/\/members\/assemblies/);

    const row = page.getByTestId(`seller-assembly-row-${opts.assemblySlug}`);
    await row.waitFor({ state: 'visible', timeout: 30000 });
    await row.locator('input[type="checkbox"]').first().check();
    if (opts.designate) {
        const counterparties = page.getByTestId(`seller-assembly-counterparties-${opts.assemblySlug}`);
        await counterparties.waitFor({ state: 'visible', timeout: 30000 });
        await counterparties
            .getByTestId(`counterparty-${opts.designate.clauseId}-input-0`)
            .fill(opts.designate.counterparty);
    }
    await page.getByRole('button', { name: /^Next/ }).click();
    await expect(page).toHaveURL(/\/members\/buyer/);
    await page.getByRole('button', { name: /^Next/ }).click();
    await expect(page).toHaveURL(/\/members\/agents/);
    await page.getByRole('button', { name: /^Next/ }).click();
    await expect(page).toHaveURL(/\/members\/endpoints/);
    await page.getByRole('button', { name: /^Next/ }).click();
    await page.waitForURL(/\/members\/review/, { timeout: 30000 });
    await page.getByTestId('review-confirm-publish').click();
    await expect(page.getByRole('heading', { name: /Registered\.|Profile updated/i }))
        .toBeVisible({ timeout: 60000 });
}

test.describe('RATE PRICING — a contributor prices per started km of the committed leg (devnet)', () => {
    test.setTimeout(420_000);

    test('the payment the buyer signs = rate × ceil(geodistance), derived and shown at checkout', async ({ page }) => {
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });

        // ── AUTHOR (idempotent): the 2-order composition — a root order and a
        //    drawn sub-order carrying the process ladder + the committed
        //    endpoints the rate will derive from. ──
        let slug = await findRateAssembly();
        if (!slug) {
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
            const rootTestId = await orderNodes.first().getAttribute('data-testid');
            const rootId = rootTestId!.replace('order-node-', '');

            await orderNodes.first().click();
            await page.getByTestId('agreement-drawer').waitFor({ state: 'visible', timeout: 10000 });

            // The hauled leg is DRAWN — a second co-equal order under the root.
            await page.getByTestId(`btn-add-suborder-${rootId}`).click();
            await expect(orderNodes).toHaveCount(2, { timeout: 10000 });
            const nodeIds = await orderNodes.evaluateAll((els) =>
                els.map((el) => el.getAttribute('data-testid')!.replace('order-node-', '')));
            const subId = nodeIds.find((id) => id !== rootId)!;

            await page.getByTestId(`drawer-node-tab-${subId}`).click();
            await page.getByTestId('drawer-tab-registry').click();
            await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });
            await page.getByTestId(`drawer-registry-clause-${PROCESS_CLAUSE}`).check();
            // Design time is STRUCTURAL (ruled 2026-07-14): the geolocation
            // clause is SELECTED here; the endpoints are the buyer's, at checkout.
            await page.getByTestId(`drawer-registry-clause-${GEO_CLAUSE}`).check();

            await page.getByTestId('designer-name-input').fill('Rate-priced haul');
            await page.getByTestId('designer-summary-input').fill('A lead order plus one hauled leg priced per started km of its committed endpoints.');
            await page.getByTestId('designer-description-input').fill('Rate-pricing scenario: the hauler lists a per-km rate; checkout derives the payment from the geodistance between the committed origin and destination.');
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

            slug = await findRateAssembly();
            expect(slug, 'the published rate assembly is discoverable by shape').toBeTruthy();
        }

        // ── ONBOARD (idempotent): the lead (fixed price) binds + designates
        //    the hauler; the hauler (RATE item, entered through the wizard's
        //    pricing-policy fields) binds the assembly it hauls for. ──
        const leadConformant = async (): Promise<boolean> => {
            const bindings = await memberProfileBindings(LEAD);
            const binding = bindings.find((b) => b.assemblySlug === slug);
            return !!binding && (binding.counterpartyBindings ?? []).some(
                (cb) => cb.clauseId === PROCESS_CLAUSE
                    && cb.addresses.some((a) => a.toLowerCase() === HAULER.toLowerCase()),
            );
        };
        if (!(await leadConformant())) {
            await onboardSeller(page, {
                wallet: LEAD,
                name: 'Rate Test Provisions',
                specialty: 'test provisions',
                geohash: ORIGIN_GEOHASH,
                assemblySlug: slug!,
                product: { name: 'Crate of provisions', price: '1' },
                designate: { clauseId: PROCESS_CLAUSE, counterparty: HAULER },
            });
            await expect.poll(leadConformant, {
                timeout: 60000, message: "the lead's pinned profile carries the binding + hauler designation",
            }).toBe(true);
        }
        if (!(await memberProfileBindings(HAULER)).some((b) => b.assemblySlug === slug)) {
            await onboardSeller(page, {
                wallet: HAULER,
                name: 'Rate Test Haulage',
                specialty: 'test haulage',
                geohash: ORIGIN_GEOHASH,
                assemblySlug: slug!,
                product: {
                    name: 'Haul',
                    price: RATE,
                    rate: { unit: 'km', source: 'order-geodistance' },
                },
            });
            await expect.poll(async () =>
                (await memberProfileBindings(HAULER)).some((b) => b.assemblySlug === slug), {
                timeout: 60000, message: "the hauler's pinned profile carries the binding",
            }).toBe(true);
        }

        // The hauler's public page reads the item as a rate, not a price.
        await gotoAsWallet(page, BUYER, `/s/view?seller=${HAULER}&e2e=devnet`);
        await page.getByTestId('member-detail-view').waitFor({ timeout: 30000 });
        await expect(
            page.getByText(`/ km`).first(),
            "the hauler's item displays as a rate per unit",
        ).toBeVisible({ timeout: 30000 });

        // ── CHECKOUT: the buyer orders from the lead. The P&L derives the
        //    hauled leg LIVE: rate × ceil(km between the committed endpoints),
        //    shown before anything is signed. ──
        await gotoAsWallet(page, BUYER, `/s/view?seller=${LEAD}&e2e=devnet`);
        await page.getByTestId('member-detail-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const addBtn = page.locator('[data-testid^="btn-add-"]').first();
        await addBtn.waitFor({ state: 'visible', timeout: 20000 });
        await addBtn.click();
        await page.getByTestId('btn-review-order').click();
        await page.getByTestId('checkout-view').waitFor({ timeout: 20000 });
        await waitForConnected(page);

        await expect(page.getByTestId('cart-contributor-breakdown'), 'checkout shows the two-contributor P&L')
            .toBeVisible({ timeout: 30000 });
        // The buyer authors the committed endpoints HERE (templates arrive
        // value-free); the rate derivation prices from these fills.
        await page.locator(`[data-testid^="checkout-field-"][data-testid$="-${GEO_CLAUSE}-origin"]`).first().fill(ORIGIN_GEOHASH);
        await page.locator(`[data-testid^="checkout-field-"][data-testid$="-${GEO_CLAUSE}-destination"]`).first().fill(DESTINATION_GEOHASH);
        // The derivation line: raw km → billed per started km × the rate.
        const derivation = page.locator('[data-testid^="rate-derivation-"]');
        await expect(derivation, 'the rate derivation surfaces in the P&L').toBeVisible({ timeout: 30000 });
        await expect(derivation, `billed ${BILLED_KM} started km`).toContainText(`billed ${BILLED_KM}`);
        await expect(derivation, 'the per-unit rate is named').toContainText(`/km`);
        // The kit total = lead 1 + rate × ceil(km), to the wei.
        await expect(page.getByTestId('cart-kit-total'), 'total = fixed lead + derived haul')
            .toHaveText(new RegExp(`^${formatEther(EXPECTED_TOTAL).replace('.', '\\.')}0*$`), { timeout: 15000 });

        // ── SIGN: the buyer signs both orders through the standard gate and
        //    relays — the signed sub-order carries EXACTLY the derived figure
        //    (the same resolveSubOrderPricing call priced display and commit). ──
        const place = page.getByTestId('btn-place-order');
        await expect(place, 'buyer connected + assembly bound → "Place order"').toHaveText(/Place order/, { timeout: 20000 });
        await place.click();
        await confirmAgreementPreviews(page, 2);
        await page.getByTestId('send-commitment-xmtp').click();
        await expect(page.getByTestId('commitment-xmtp-status'), 'the signed root is relayed to the lead')
            .toBeVisible({ timeout: 30000 });

        test.info().annotations.push({
            type: 'rate-derivation',
            description: `km=${KM.toFixed(3)} billed=${BILLED_KM} rate=${RATE} subPayment=${formatEther(EXPECTED_SUB_PAYMENT)} total=${formatEther(EXPECTED_TOTAL)}`,
        });
    });
});
