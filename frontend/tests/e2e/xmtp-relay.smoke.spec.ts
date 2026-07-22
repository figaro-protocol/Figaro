/**
 * xmtp-relay.smoke.spec.ts — OPERATOR-MANUAL smoke of the REAL XMTP relay.
 *
 * NOT part of any suite (playwright project `smoke` — run explicitly):
 *
 *     npx playwright test --project=smoke
 *
 * Preconditions: the standard devup stack (anvil + Kubo + deployed contracts +
 * seeded sellers — a prior devnet suite run or populate-test-data.mjs), plus
 * INTERNET: the channel is @xmtp/browser-sdk against XMTP's hosted `dev`
 * network, exactly what production uses.
 *
 * How this stays the REAL path (the devnet suite deliberately mocks it):
 *  - Navigation carries NO `?e2e=` param, so `getCoordinationChannel` selects
 *    the real XMTP transport — the in-memory mock is keyed on the e2e session.
 *  - The wallet is the same anvil-backed injected provider the devnet suite
 *    uses (fixtures/inject-ethereum-multi.js): real EIP-191/712 signatures via
 *    anvil's unlocked accounts — XMTP's identity signature included. Chromium
 *    is Playwright's bundled browser; no extension wallet is needed.
 *  - The `/settings` XMTP opt-in is flipped through the real settings form in
 *    EACH party's own browser context — separate contexts are load-bearing:
 *    XMTP's WASM store uses exclusive OPFS sync access handles, so two clients
 *    in one context corrupt each other (found by this smoke's first run).
 *
 * What it proves (punch-list block 6, the real-path smoke):
 *  1. `Client.create` succeeds against XMTP dev for both wallets (identity
 *     signature through the wallet, WASM under the prod CSP).
 *  2. A commitment relayed buyer→seller over REAL XMTP arrives and surfaces
 *     as the seller's "Your turn" card — exactly ONE new card.
 *  3. Diagnostics for the open stream-sharing question (whether the /orders
 *     triple subscription — 2× usePendingCommitments + the header badge —
 *     shares one XMTP stream or opens three): the spec fails on page errors
 *     and prints every console warning/error for the operator to review.
 *     Run HEADED to watch: add `--headed`.
 */
import path from 'path';
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { test, expect, gotoAsWallet, newWalletPage, ANVIL_ACCOUNTS } from './devnet-multi-test';
import { discoverSellers, discoverAnchoredAssemblies, confirmAgreementPreviews, waitForConnected } from './devnet-helpers';

/** PERSISTENT profiles, one per party, reused ACROSS smoke runs — this is
 *  load-bearing, not convenience. XMTP's model is ONE installation per
 *  browser+origin, reused forever (the app's OPFS comment). A fresh context
 *  per run mints a new installation, revokes all others (dev housekeeping),
 *  and creates a new DM group every run — churn real usage never has, and it
 *  desyncs MLS group state ("Ciphertext generation out of bounds", run 6).
 *  Profiles live outside test-results/ (Playwright wipes that per run). */
const SMOKE_PROFILES_DIR = path.resolve(__dirname, '../../.smoke-profiles');

/** Console/page-error capture — the smoke's diagnostic channel. */
function watchPage(page: Page, label: string, errors: string[]) {
    page.on('pageerror', (err) => errors.push(`[${label}] pageerror: ${err.message}`));
    page.on('console', (msg) => {
        if (msg.type() === 'error' || msg.type() === 'warning') {
            // eslint-disable-next-line no-console
            console.log(`[smoke][${label}][console.${msg.type()}] ${msg.text()}`);
        }
    });
}

test.describe('REAL XMTP RELAY — buyer signs, relays over the hosted dev network, the seller\'s /orders receives (smoke)', () => {
    test.setTimeout(600_000);

    test('a commitment crosses real XMTP once — no duplicates, no page errors', async ({ baseURL }) => {
        // The profile must persist ONLY the XMTP identity (OPFS database).
        // Everything else it could persist is contamination: the HTTP cache
        // serves stale Next.js chunks across rebuilds (empty catalogue, run
        // 8), and app localStorage carries cart state between attempts —
        // so the disk cache is disabled and app storage cleared per launch.
        const launchProfile = async (name: string): Promise<BrowserContext> => {
            const ctx = await chromium.launchPersistentContext(
                path.join(SMOKE_PROFILES_DIR, name),
                { baseURL, args: ['--disk-cache-size=1'] },
            );
            const p = ctx.pages()[0] ?? await ctx.newPage();
            await p.goto('/', { waitUntil: 'domcontentloaded' });
            await p.evaluate(() => window.localStorage.clear());
            return ctx;
        };
        const buyerContext = await launchProfile('buyer');
        const page = await newWalletPage(buyerContext);
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });

        // ── Adopt a seeded seller from CHAIN state (no roster): any seller
        //    whose wallet anvil controls and whose profile binds an anchored
        //    assembly — the SIMPLEST such assembly (fewest orders). ──
        const anvilAddrs = new Set(ANVIL_ACCOUNTS.map((a) => a.toLowerCase()));
        const [sellers, assemblies] = await Promise.all([discoverSellers(), discoverAnchoredAssemblies()]);
        const orderCountBySlug = new Map(assemblies.map((a) => [a.slug, a.agreements.length]));
        let sellerAddr: `0x${string}` | undefined;
        let orderCount = Number.POSITIVE_INFINITY;
        for (const s of sellers) {
            if (!anvilAddrs.has(s.address.toLowerCase())) continue;
            for (const b of s.assemblyBindings) {
                const n = orderCountBySlug.get(b.assemblySlug);
                if (n !== undefined && n < orderCount) {
                    sellerAddr = s.address;
                    orderCount = n;
                }
            }
        }
        expect(sellerAddr, 'a seeded, anvil-controlled seller with a bound anchored assembly exists').toBeTruthy();
        // Index 19: unused by every other spec AND — load-bearing for the dev
        // network — a wallet pair with NO prior XMTP history. The churn era of
        // this smoke's early runs left the [0]↔seller inbox pair with several
        // half-dead DM groups on the hosted dev network (permanent state), and
        // the seller's ratchet view of that pair is pinned ("Ciphertext
        // generation out of bounds N", N advancing per run). A poisoned pair
        // cannot be repaired from here; a fresh pair is the honest baseline.
        const BUYER = ANVIL_ACCOUNTS[19] as `0x${string}`;
        expect(sellerAddr!.toLowerCase()).not.toBe(BUYER.toLowerCase());

        const errors: string[] = [];

        // ── SELLER first: /orders with the REAL transport. Loading this page
        //    creates the seller's XMTP identity (Client.create) — it must
        //    exist before the buyer can DM it — and mounts the triple
        //    subscription under observation.
        //
        //    OWN BROWSER CONTEXT, not a same-context tab: XMTP's WASM store
        //    lives in the origin-private file system, and OPFS sync access
        //    handles are EXCLUSIVE — two XMTP clients in one context fight
        //    over one database ("An error occurred while creating sync access
        //    handle", first smoke run 2026-07-22). The mock channel needed
        //    same-context tabs; the real transport needs the opposite. Each
        //    context has its own storage, so each party flips its own
        //    /settings opt-in. ──
        const sellerContext = await launchProfile('seller');
        const sellerPage = await newWalletPage(sellerContext);
        watchPage(sellerPage, 'seller', errors);
        await gotoAsWallet(sellerPage, sellerAddr!, '/settings');
        await sellerPage.getByTestId('settings-transport').selectOption('xmtp');
        await sellerPage.getByTestId('settings-save').click();
        await gotoAsWallet(sellerPage, sellerAddr!, '/orders');
        await waitForConnected(sellerPage);
        const yourTurnCards = sellerPage.getByTestId('order-your-turn-card');
        const baseline = await yourTurnCards.count();

        // ── BUYER: checkout on the adopted seller, sign every order, send
        //    the root over REAL XMTP. The buyer's context flips its own
        //    /settings opt-in (per-context storage). ──
        watchPage(page, 'buyer', errors);
        await gotoAsWallet(page, BUYER, '/settings');
        await page.getByTestId('settings-transport').selectOption('xmtp');
        await page.getByTestId('settings-save').click();
        await gotoAsWallet(page, BUYER, `/s/view?seller=${sellerAddr}`);
        await sellerPage.waitForTimeout(5000); // XMTP identity publication latency
        await page.getByTestId('seller-detail-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const addBtn = page.locator('[data-testid^="btn-add-"]').first();
        await addBtn.waitFor({ state: 'visible', timeout: 20000 });
        await addBtn.click();
        await page.getByTestId('btn-review-order').click();
        await page.getByTestId('checkout-view').waitFor({ timeout: 20000 });
        await waitForConnected(page);
        const place = page.getByTestId('btn-place-order');
        await expect(place, 'buyer connected + assembly bound → "Place order"').toHaveText(/Place order/, { timeout: 20000 });
        await place.click();
        await confirmAgreementPreviews(page, orderCount);
        await page.getByTestId('send-commitment-xmtp').click();
        // The status testid renders for BOTH the sent and the error state —
        // assert the success TEXT, so a send failure surfaces its message
        // here instead of sailing past a visible error paragraph.
        await expect(
            page.getByTestId('commitment-xmtp-status'),
            'the buyer\'s relay over REAL XMTP reports sent (a failure prints its error text here)',
        ).toContainText(/sent over XMTP/, { timeout: 120_000 });

        // ── SELLER receives: exactly ONE new "Your turn" card. The triple
        //    subscription delivering duplicates would surface as >1. Real
        //    network latency — poll generously. ──
        await expect
            .poll(async () => yourTurnCards.count(), {
                timeout: 180_000,
                message: 'the relayed commitment surfaces on the seller\'s /orders over real XMTP',
            })
            .toBe(baseline + 1);
        // Hold the page open long enough for a duplicate delivery to surface.
        await sellerPage.waitForTimeout(10_000);
        expect(await yourTurnCards.count(), 'no duplicate delivery from the triple subscription').toBe(baseline + 1);

        expect(errors, `no page errors on either side:\n${errors.join('\n')}`).toHaveLength(0);
        await sellerContext.close();
        await buyerContext.close();
    });
});
