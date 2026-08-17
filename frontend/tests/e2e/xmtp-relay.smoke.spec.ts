/**
 * xmtp-relay.smoke.spec.ts — MAINTAINER-MANUAL smoke of the REAL XMTP relay.
 *
 * NOT part of any suite (playwright project `smoke` — run explicitly):
 *
 *     npx playwright test --project=smoke
 *
 * Preconditions: the standard devup stack (anvil + Kubo + deployed contracts
 * + at least one anchored assembly — a prior devnet suite run or
 * populate-test-data.mjs), plus INTERNET: the channel is @xmtp/browser-sdk
 * against XMTP's hosted `dev` network, exactly what production uses.
 *
 * How this stays the REAL path (the devnet suite deliberately mocks it):
 *  - Navigation carries NO `?e2e=` param, so `getHandoffChannel` selects
 *    the real XMTP transport — the in-memory mock is keyed on the e2e session.
 *  - The parties are DEVICE-UNIQUE wallets, not anvil accounts. Anvil's
 *    junk-mnemonic wallets are a GLOBAL COMMONS on XMTP's hosted dev network
 *    — every dev on earth shares those inboxes (a probe found 9 foreign
 *    installations on a "fresh" index), and foreign group state pins the MLS
 *    ratchet ("Ciphertext generation out of bounds"), which no app code can
 *    repair. Keys are generated once into `.smoke-profiles/keys.json`
 *    (gitignored) and REUSED across runs — a stable pair, like real usage.
 *  - Signatures come from a node-side viem signer bridged into the injected
 *    provider (fixtures/inject-ethereum-multi.js routes personal_sign /
 *    signTypedData / sendTransaction for announced local accounts to a
 *    `context.exposeFunction` handler) — XMTP's identity signature included.
 *    Chromium is Playwright's bundled browser; no extension wallet is needed.
 *  - The seller is onboarded IN-SPEC from chain state: `seedRegisteredMember`
 *    (the dispatch-race pattern) pins a catalogue + profile bound to the
 *    simplest anchored assembly; `anvil_setBalance` funds the registration
 *    deposit. Idempotent — re-runs route through updateProfile.
 *  - The `/settings` XMTP opt-in is flipped through the real settings form in
 *    EACH party's own browser context — separate contexts are load-bearing:
 *    XMTP's WASM store uses exclusive OPFS sync access handles, so two clients
 *    in one context corrupt each other (found by this smoke's first run).
 *
 * What it proves (punch-list block 6, the real-path smoke):
 *  1. `Client.create` succeeds against XMTP dev for both wallets (identity
 *     signature through the wallet bridge, WASM under the prod CSP).
 *  2. A commitment relayed buyer→seller over REAL XMTP arrives and surfaces
 *     as the seller's "Your turn" card — exactly ONE new card.
 *  3. Diagnostics for the open stream-sharing question (whether the /orders
 *     triple subscription — 2× usePendingCommitments + the header badge —
 *     shares one XMTP stream or opens three): the spec fails on page errors
 *     and prints every console warning/error for the maintainer to review.
 *     Run HEADED to watch: add `--headed`.
 */
import fs from 'fs';
import path from 'path';
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { createWalletClient, http, parseAbi, parseUnits, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { makeLocalSignHandler } from './local-signer';
import { test, expect, gotoAsWallet, newWalletPage } from './devnet-multi-test';
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

/** PERSISTENT profiles, one per party, reused ACROSS smoke runs — this is
 *  load-bearing, not convenience. XMTP's model is ONE installation per
 *  browser+origin, reused forever (the app's OPFS comment). A fresh context
 *  per run mints a new installation, revokes all others (dev housekeeping),
 *  and creates a new DM group every run — churn real usage never has, and it
 *  desyncs MLS group state ("Ciphertext generation out of bounds", run 6).
 *  Profiles live outside test-results/ (Playwright wipes that per run), and
 *  each profile dir is keyed by its wallet address, so regenerating
 *  keys.json automatically starts from fresh XMTP stores. */
const SMOKE_PROFILES_DIR = path.resolve(__dirname, '../../.smoke-profiles');
const KEYS_PATH = path.join(SMOKE_PROFILES_DIR, 'keys.json');

/** The device-unique wallet pair: generated ONCE on this machine, persisted
 *  beside the profiles (gitignored), reused every run. Never derived from the
 *  anvil mnemonic — that is the shared-identity landmine this smoke exists to
 *  avoid. */
function loadOrCreateSmokeKeys(): { buyer: Hex; seller: Hex } {
    if (fs.existsSync(KEYS_PATH)) {
        return JSON.parse(fs.readFileSync(KEYS_PATH, 'utf8')) as { buyer: Hex; seller: Hex };
    }
    const keys = { buyer: generatePrivateKey(), seller: generatePrivateKey() };
    fs.mkdirSync(SMOKE_PROFILES_DIR, { recursive: true });
    fs.writeFileSync(KEYS_PATH, `${JSON.stringify(keys, null, 4)}\n`);
    return keys;
}

/** Fund a device-unique wallet with ETH (anvil cheatcode) — the seller pays
 *  the MembersRegistry registration deposit; both parties stay funded so no
 *  future gas-bearing step starts from zero. */
async function fundWithEth(address: Hex): Promise<void> {
    const res = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            jsonrpc: '2.0', id: 1, method: 'anvil_setBalance',
            params: [address, '0x8AC7230489E80000'], // 10 ETH
        }),
    });
    const body = await res.json() as { error?: { message?: string } };
    if (body.error) throw new Error(`anvil_setBalance failed: ${body.error.message}`);
}

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
        const keys = loadOrCreateSmokeKeys();
        const buyerAccount = privateKeyToAccount(keys.buyer);
        const sellerAccount = privateKeyToAccount(keys.seller);
        const BUYER = buyerAccount.address;
        const SELLER = sellerAccount.address;
        const signHandler = makeLocalSignHandler([buyerAccount, sellerAccount], LOCAL_ANVIL, RPC_URL);
        const localAccounts = [BUYER.toLowerCase(), SELLER.toLowerCase()];
        await Promise.all([fundWithEth(BUYER), fundWithEth(SELLER)]);

        // ── ONBOARD the smoke seller from chain state (no roster): bind the
        //    SIMPLEST anchored assembly (fewest orders — the seeded blank
        //    single-agreement composition when present). Node-side with the
        //    seller's own key; idempotent (re-runs route to updateProfile). ──
        const assemblies = await discoverAnchoredAssemblies();
        expect(assemblies.length, 'an anchored assembly exists — run the devnet suite or populate-test-data.mjs first').toBeGreaterThan(0);
        const assembly = assemblies.reduce((min, a) => (a.agreements.length < min.agreements.length ? a : min));
        const orderCount = assembly.agreements.length;
        const token = readLocalDeploymentConfig().tokenAddress;
        expect(token, 'NEXT_PUBLIC_TOKEN_ADDRESS resolves — run ./deploy-local.sh').toBeTruthy();
        // Checkout gates place-order on buyer solvency (payment + bond), and
        // MintTokens.s.sol funds anvil accounts only — mint to the
        // device-unique buyer (MockERC20.mint is permissionless on devnet;
        // the buyer pays its own gas from the ETH funding above).
        const buyerWallet = createWalletClient({ account: buyerAccount, chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        await buyerWallet.writeContract({
            address: token!,
            abi: parseAbi(['function mint(address to, uint256 amount) external']),
            functionName: 'mint',
            args: [BUYER, parseUnits('1000', 18)],
        });
        const { uri: catalogueURI } = await pinJSONToIPFS({
            subjectAddress: SELLER,
            version: '1.0.0',
            unitSystem: 'metric' as const,
            items: [{
                id: 'xmtp-smoke-relay',
                name: 'Relay smoke order',
                description: 'Single item the XMTP relay smoke checks out and relays.',
                price: '1',
                category: 'test',
                image: '📡',
                available: true,
            }],
        });
        await seedRegisteredMember({
            walletKey: keys.seller,
            profile: {
                name: 'XMTP Smoke Seller',
                description: 'Device-unique seller onboarded by xmtp-relay.smoke.spec.ts',
                catalogueURI,
                acceptedTokens: [{ address: token!, symbol: 'MOCK', chainId: 31337 }],
                defaultTokenAddress: token!,
                assemblyBindings: [{
                    bindingId: `xmtp-smoke-${SELLER.slice(2, 8).toLowerCase()}`,
                    subjectAddress: SELLER,
                    assemblySlug: assembly.slug,
                    counterpartyBindings: [],
                }],
            },
        });

        // The profile must persist ONLY the XMTP identity (OPFS database).
        // Everything else it could persist is contamination: the HTTP cache
        // serves stale Next.js chunks across rebuilds (empty catalogue, run
        // 8), and app localStorage carries cart state between attempts —
        // so the disk cache is disabled and app storage cleared per launch.
        const launchProfile = async (name: string, address: Hex): Promise<BrowserContext> => {
            const ctx = await chromium.launchPersistentContext(
                path.join(SMOKE_PROFILES_DIR, `${name}-${address.slice(2, 10).toLowerCase()}`),
                { baseURL, args: ['--disk-cache-size=1'] },
            );
            await ctx.exposeFunction('__FIGARO_LOCAL_SIGN__', signHandler);
            await ctx.addInitScript((addrs: string[]) => {
                (window as unknown as { __FIGARO_LOCAL_ACCOUNTS__: string[] }).__FIGARO_LOCAL_ACCOUNTS__ = addrs;
            }, localAccounts);
            const p = ctx.pages()[0] ?? await ctx.newPage();
            await p.goto('/', { waitUntil: 'domcontentloaded' });
            await p.evaluate(() => window.localStorage.clear());
            return ctx;
        };
        const buyerContext = await launchProfile('buyer', BUYER);
        const page = await newWalletPage(buyerContext);
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });

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
        const sellerContext = await launchProfile('seller', SELLER);
        const sellerPage = await newWalletPage(sellerContext);
        watchPage(sellerPage, 'seller', errors);
        await gotoAsWallet(sellerPage, SELLER, '/settings');
        await sellerPage.getByTestId('settings-transport').selectOption('xmtp');
        await sellerPage.getByTestId('settings-save').click();
        await gotoAsWallet(sellerPage, SELLER, '/orders');
        await waitForConnected(sellerPage);
        const yourTurnCards = sellerPage.getByTestId('order-your-turn-card');
        // Baseline AFTER the back-fill settles: `syncAll()` replays prior
        // smoke runs' relayed commitments from the network asynchronously
        // (localStorage was cleared), so a count taken at first paint could
        // inflate mid-test and read as a false delivery. Stable = unchanged
        // across one full sync sweep.
        let baseline = await yourTurnCards.count();
        for (;;) {
            await sellerPage.waitForTimeout(7_000);
            const n = await yourTurnCards.count();
            if (n === baseline) break;
            baseline = n;
        }

        // ── BUYER: checkout on the smoke seller, sign every order, send the
        //    root over REAL XMTP. The buyer's context flips its own /settings
        //    opt-in (per-context storage). ──
        watchPage(page, 'buyer', errors);
        await gotoAsWallet(page, BUYER, '/settings');
        await page.getByTestId('settings-transport').selectOption('xmtp');
        await page.getByTestId('settings-save').click();
        await gotoAsWallet(page, BUYER, `/s/view?seller=${SELLER}`);
        await sellerPage.waitForTimeout(5000); // XMTP identity publication latency
        await page.getByTestId('member-detail-view').waitFor({ timeout: 30000 });
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
