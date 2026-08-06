/**
 * booking-window.devnet.spec.ts
 *
 * BOOKING-WINDOW RATE PRICING — a contributor prices per HOUR and the payment
 * the buyer signs derives at checkout from the order's OWN committed time
 * window: rate × ceil(windowEnd − windowStart in hours). The quantity source
 * is `booking-window` (the time dual of `order-geodistance`), so the whole
 * figure is derivable and replayable from the agreement alone — no oracle, no
 * reference back to the mutable catalogue. The window is committed through the
 * `figaro-schedule` clause, filled at checkout via the iso-datetime picker.
 *
 * Self-contained (permissionless-clause discipline, mirroring rate-pricing):
 * the spec authors its own 2-order assembly (a fixed lead + a booked hourly
 * sub-order carrying figaro-schedule), onboards its own lead + hourly provider
 * THROUGH the wizard (the rate lives in the seller's CATALOGUE — pricing-policy
 * / rate-unit / rate-source), binds + designates through seller-edit, and
 * checks out as the buyer. Discovered from chain + IPFS by SHAPE; idempotent.
 *
 * Scope: through the buyer's SIGN + relay (the payment the buyer signs is the
 * deliverable) — the accept/resolve/audit legs run the same machinery
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
import type { Page } from '@playwright/test';

const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';

// Fresh wallets (anvil --accounts 22): a buyer no other spec uses (13), and two
// sellers past the range every other spec occupies (20, 21).
const BUYER = ANVIL_ACCOUNTS[13] as Hex;
const LEAD = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 20 }).address as Hex;
const PROVIDER = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 21 }).address as Hex;

const PROCESS_CLAUSE = 'figaro-merchant-process'; // the ladder the binding keys on
const SCHEDULE_CLAUSE = 'figaro-schedule';

// The booked window — the buyer's checkout fills (templates arrive value-free).
// datetime-local wall-clock (UTC); DatetimeFieldInput stores ISO 8601 UTC.
// 09:00 → 12:30 = 3.5 h → billed 4 started hours.
const WINDOW_START = '2026-07-22T09:00';
const WINDOW_END = '2026-07-22T12:30';
const HOURS = 3.5;
const BILLED_HOURS = Math.max(1, Math.ceil(HOURS));

// The provider's published rate: 0.5 per started hour.
const RATE = '0.5';
const EXPECTED_SUB_PAYMENT = parseEther(RATE) * BigInt(BILLED_HOURS);
const EXPECTED_TOTAL = parseEther('1') + EXPECTED_SUB_PAYMENT; // fixed lead 1 + booked session

async function waitForConnected(page: Page) {
    await page.waitForFunction(
        () => !Array.from(document.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Connect Wallet'),
        null,
        { timeout: 30000 },
    );
}

/** This scenario's assembly, recognized on-chain by SHAPE: exactly two orders,
 *  the sub-order carrying the process ladder AND figaro-schedule (the schedule
 *  clause is unique to this assembly — no seeded assembly composes it). */
async function findBookingAssembly(): Promise<string | undefined> {
    const templates = await discoverAnchoredAssemblies();
    return templates.find((t) => {
        if (t.agreements.length !== 2) return false;
        const keysets = t.agreements.map((o) => Object.keys(o.clauses ?? {}));
        const sub = keysets.find((k) => k.includes(PROCESS_CLAUSE) && k.includes(SCHEDULE_CLAUSE));
        const root = keysets.find((k) => !k.includes(SCHEDULE_CLAUSE));
        return !!sub && sub.length === 4 && !!root && root.length === 2;
    })?.slug;
}

/** Walk the registration wizard for a wallet — catalogue item per `product`,
 *  including the rate-pricing fields (the rate lives in the CATALOGUE) when
 *  `product.rate` is set. Idempotent: callers gate on a conformance check. */
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
        // The wizard's pricing-policy axis writes the rate into the catalogue.
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
    await expect(page).toHaveURL(/\/members\/agents/);
    await page.getByRole('button', { name: /^Next/ }).click();
    await page.waitForURL(/\/members\/review/, { timeout: 30000 });
    await page.getByTestId('review-confirm-publish').click();
    await expect(page.getByRole('heading', { name: /Registered\.|Profile updated/i }))
        .toBeVisible({ timeout: 60000 });
}

test.describe('BOOKING-WINDOW PRICING — a contributor prices per started hour of the committed window (devnet)', () => {
    test.setTimeout(420_000);

    test('the payment the buyer signs = rate × ceil(window hours), derived and shown at checkout', async ({ page }) => {
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });

        // ── AUTHOR (idempotent): a root order + a drawn sub-order carrying the
        //    process ladder + figaro-schedule (the window the rate derives from
        //    is the buyer's checkout fill; the clause is SELECTED here). ──
        let slug = await findBookingAssembly();
        if (!slug) {
            await page.addInitScript(() => {
                try {
                    window.localStorage.removeItem('figaro:designer:current');
                    window.localStorage.removeItem('figaro:designer:drafts');
                } catch { /* noop */ }
            });
            await page.goto('/builders/designer/new?fresh=1&e2e=devnet', { waitUntil: 'domcontentloaded' });
            await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
            await page.getByTestId('designer-saved-hint').waitFor({ timeout: 15000 });

            const orderNodes = page.locator('[data-testid^="order-node-"]:not([data-testid$="-delete"])');
            await expect(orderNodes).toHaveCount(1, { timeout: 10000 });
            const rootTestId = await orderNodes.first().getAttribute('data-testid');
            const rootId = rootTestId!.replace('order-node-', '');

            await orderNodes.first().click();
            await page.getByTestId('agreement-drawer').waitFor({ state: 'visible', timeout: 10000 });

            await page.getByTestId(`btn-add-suborder-${rootId}`).click();
            await expect(orderNodes).toHaveCount(2, { timeout: 10000 });
            const nodeIds = await orderNodes.evaluateAll((els) =>
                els.map((el) => el.getAttribute('data-testid')!.replace('order-node-', '')));
            const subId = nodeIds.find((id) => id !== rootId)!;

            await page.getByTestId(`drawer-node-tab-${subId}`).click();
            await page.getByTestId('drawer-tab-registry').click();
            await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });
            await page.getByTestId(`drawer-registry-clause-${PROCESS_CLAUSE}`).check();
            await page.getByTestId(`drawer-registry-clause-${SCHEDULE_CLAUSE}`).check();

            await page.getByTestId('designer-name-input').fill('Booked hourly session');
            await page.getByTestId('designer-summary-input').fill('A lead order plus one booked leg priced per started hour of its committed window.');
            await page.getByTestId('designer-description-input').fill('Booking-window scenario: the provider lists a per-hour rate; checkout derives the payment from the hours between the committed window bounds.');
            await expect(page.getByTestId('designer-review')).toBeEnabled({ timeout: 5000 });
            await page.getByTestId('designer-review').click();
            await page.waitForURL(/\/builders\/designer\/view\?slug=asm-/, { timeout: 15000 });
            const handle = page.url().match(/[?&]slug=(asm-[a-z0-9-]+)/)?.[1];
            expect(handle, 'review navigated to a draft handle').toBeTruthy();
            await page.goto(`/builders/designer/view?slug=${handle}&intent=publish&e2e=devnet`, { waitUntil: 'domcontentloaded' });
            const confirmBtn = page.getByTestId('review-confirm-publish');
            await confirmBtn.waitFor({ state: 'visible', timeout: 15000 });
            await waitForConnected(page);
            await confirmBtn.click();
            await page.getByTestId('assembly-publish-receipt').waitFor({ timeout: 60000 });

            slug = await findBookingAssembly();
            expect(slug, 'the published booking assembly is discoverable by shape').toBeTruthy();
        }

        // ── ONBOARD (idempotent): the lead (fixed price) binds + designates the
        //    provider; the provider (RATE item, booking-window source) binds. ──
        const leadConformant = async (): Promise<boolean> => {
            const bindings = await memberProfileBindings(LEAD);
            const binding = bindings.find((b) => b.assemblySlug === slug);
            return !!binding && (binding.counterpartyBindings ?? []).some(
                (cb) => cb.clauseId === PROCESS_CLAUSE
                    && cb.addresses.some((a) => a.toLowerCase() === PROVIDER.toLowerCase()),
            );
        };
        if (!(await leadConformant())) {
            await onboardSeller(page, {
                wallet: LEAD,
                name: 'Booking Test Group',
                specialty: 'test intake',
                geohash: '9q8yyk',
                assemblySlug: slug!,
                product: { name: 'Intake', price: '1' },
                designate: { clauseId: PROCESS_CLAUSE, counterparty: PROVIDER },
            });
            await expect.poll(leadConformant, {
                timeout: 60000, message: "the lead's pinned profile carries the binding + provider designation",
            }).toBe(true);
        }
        if (!(await memberProfileBindings(PROVIDER)).some((b) => b.assemblySlug === slug)) {
            await onboardSeller(page, {
                wallet: PROVIDER,
                name: 'Booking Test Consultancy',
                specialty: 'test consultancy',
                geohash: '9q8yyk',
                assemblySlug: slug!,
                product: {
                    name: 'Consultation',
                    price: RATE,
                    rate: { unit: 'hour', source: 'booking-window' },
                },
            });
            await expect.poll(async () =>
                (await memberProfileBindings(PROVIDER)).some((b) => b.assemblySlug === slug), {
                timeout: 60000, message: "the provider's pinned profile carries the binding",
            }).toBe(true);
        }

        // The provider's public page reads the item as a rate, not a price.
        await gotoAsWallet(page, BUYER, `/s/view?seller=${PROVIDER}&e2e=devnet`);
        await page.getByTestId('seller-detail-view').waitFor({ timeout: 30000 });
        await expect(
            page.getByText(`/ hour`).first(),
            "the provider's item displays as a rate per hour",
        ).toBeVisible({ timeout: 30000 });

        // ── CHECKOUT: the buyer orders from the lead. The booked leg derives
        //    LIVE: rate × ceil(hours between the committed window bounds). ──
        await gotoAsWallet(page, BUYER, `/s/view?seller=${LEAD}&e2e=devnet`);
        await page.getByTestId('seller-detail-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const addBtn = page.locator('[data-testid^="btn-add-"]').first();
        await addBtn.waitFor({ state: 'visible', timeout: 20000 });
        await addBtn.click();
        await page.getByTestId('btn-review-order').click();
        await page.getByTestId('checkout-view').waitFor({ timeout: 20000 });
        await waitForConnected(page);

        await expect(page.getByTestId('cart-contributor-breakdown'), 'checkout shows the two-contributor P&L')
            .toBeVisible({ timeout: 30000 });
        // The buyer authors the committed window HERE (via the iso-datetime
        // picker, follow-up 1); the rate derivation prices from these fills.
        await page.locator(`[data-testid^="checkout-field-"][data-testid$="-${SCHEDULE_CLAUSE}-windowStart"]`).first().fill(WINDOW_START);
        await page.locator(`[data-testid^="checkout-field-"][data-testid$="-${SCHEDULE_CLAUSE}-windowEnd"]`).first().fill(WINDOW_END);
        // The derivation line: raw hours → billed per started hour × the rate.
        const derivation = page.locator('[data-testid^="rate-derivation-"]');
        await expect(derivation, 'the rate derivation surfaces in the P&L').toBeVisible({ timeout: 30000 });
        await expect(derivation, `billed ${BILLED_HOURS} started hours`).toContainText(`billed ${BILLED_HOURS}`);
        await expect(derivation, 'the per-unit rate is named').toContainText(`/hour`);
        // The kit total = lead 1 + rate × ceil(hours), to the wei.
        await expect(page.getByTestId('cart-kit-total'), 'total = fixed lead + derived session')
            .toHaveText(new RegExp(`^${formatEther(EXPECTED_TOTAL).replace('.', '\\.')}0*$`), { timeout: 15000 });

        // ── SIGN: the buyer signs both orders and relays — the signed sub-order
        //    carries EXACTLY the derived figure (one resolveSubOrderPricing call
        //    priced display and commit). ──
        const place = page.getByTestId('btn-place-order');
        await expect(place, 'buyer connected + assembly bound → "Place order"').toHaveText(/Place order/, { timeout: 20000 });
        await place.click();
        await confirmAgreementPreviews(page, 2);
        await page.getByTestId('send-commitment-xmtp').click();
        await expect(page.getByTestId('commitment-xmtp-status'), 'the signed root is relayed to the lead')
            .toBeVisible({ timeout: 30000 });

        test.info().annotations.push({
            type: 'booking-window',
            description: `hours=${HOURS} billed=${BILLED_HOURS} rate=${RATE} subPayment=${formatEther(EXPECTED_SUB_PAYMENT)} total=${formatEther(EXPECTED_TOTAL)}`,
        });
    });
});
