/**
 * crawl.stranger.spec.ts — the `stranger` project: the blind visitor.
 *
 * No test-signer flag, no injected provider, no `?e2e=` opt-in — the browser
 * context a real stranger has. The devnet suite is a producer's suite: every
 * spec drives a flow its authors built, so a defect only a consumer hits (a
 * broken href, a console error on a page no flow visits, a 404 behind a link)
 * is invisible to it. This spec closes that seam:
 *
 *  1. THE CRAWL — starting from `/` plus every href in the one nav source
 *     (`components/shared/navLinks.ts` — the mobile drawers mount on demand,
 *     so their anchors never sit in the desktop DOM; the source the drawers
 *     render from is the same census the mobile spec imports, and a dead nav
 *     route still 404s here), collect every same-origin href on each visited
 *     page (nav and footer included) and visit each route exactly once. Per
 *     page: HTTP status < 400, ZERO console errors and page errors
 *     (listeners attached before navigation; hydration awaited the way
 *     `waitForReactHydration` does), and a non-empty <main> or <h1>. A
 *     client-rendered page showing a loading shell is fine — the assertion
 *     is no errors, not content.
 *  2. COMPLETENESS — the static export's own route list (every `index.html`
 *     under the dist dir) is the census; EVERY route is visited, so the
 *     status/console gates run on all of them. The reachability bar follows
 *     the repo's own seams, each derived at test time, none stored here:
 *       - a route whose page declares `rel="canonical"` pointing at a
 *         DIFFERENT route is an inbound-compat alias (a moved paper's old
 *         address) — kept working for saved links, deliberately unlinked;
 *       - routes under `app/(app)` and `app/(tools)` are the wallet's and
 *         designer's runtime surfaces: the `(marketing)`/`(app)` split is
 *         wallet-scope, and the desktop header deliberately carries no
 *         second nav row (the rule `Header.tsx` states) — their links attach to object pages, connected
 *         chrome, and runtime state a cold disconnected visitor does not
 *         have. Unreached ones are reported as annotations, never failures;
 *       - every OTHER exported route (the marketing tier — the publication
 *         a stranger is invited to walk) MUST be reachable by clicking:
 *         one unreached is a failure.
 *  3. EXTERNAL HREFS — never visited; asserted https, and carrying
 *     rel="noopener noreferrer" wherever target="_blank".
 *  4. SAME-ORIGIN ASSETS (linked files, and the /sdk-api typedoc bundle —
 *     generated vendor HTML, not app routes) — status-checked once each,
 *     not crawled into.
 *
 * Runs against the same prod-mode webServer (static export on :3100) as
 * every other project: `npx playwright test --project=stranger`.
 */
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
    MARKETING_MAP,
    NAV_LINKS,
    NAV_LINKS_APP_DRAWER,
    NAV_LINKS_APP_PRIMARY,
    NAV_LINKS_MARKETING_DRAWER,
} from '../../components/shared/navLinks';
import { waitForReactHydration } from './test-helpers';

/** One defect the blind visitor hit, attributed to the page that produced it. */
interface Finding {
    route: string;
    kind: 'http-status' | 'console-error' | 'page-error' | 'hydration' | 'empty-page' | 'external-href' | 'asset';
    detail: string;
}

const NAV_TIMEOUT = 20_000;
/** Parallel tabs in the one shared context — the crawl's only batching knob. */
const CRAWL_WORKERS = 4;
/** Post-hydration settle so late console errors land on their own page. */
const SETTLE_MS = 250;

/**
 * Next's own HANDLED prefetch-abort, not a defect: navigating away while a
 * viewport prefetch is still in flight aborts the RSC-payload fetch
 * (`TypeError: Failed to fetch`) and Next falls back to a full browser
 * navigation — the crawler's immediate next `goto` is what aborts it.
 * Verified against the export before filtering: the named payload file
 * (`<route>/index.txt`) exists and serves 200. A payload that is genuinely
 * missing still fails the crawl — its 404 logs a separate "Failed to load
 * resource" console error this filter does not match.
 */
const RSC_PREFETCH_ABORT = /Failed to fetch RSC payload.*Falling back to browser navigation/s;

/**
 * Wait until React has attached to the page — the `waitForReactHydration`
 * approach (a `__reactFiber`/`__reactProps` key on a DOM node proves the
 * tree is live), generalized to no particular selector: the stranger does
 * not know each page's elements, so ANY hydrated element under the shell
 * counts. Returns an error string instead of throwing so the crawl records
 * the finding and keeps walking.
 */
async function waitForAnyHydration(page: Page, timeout = 15_000): Promise<string | null> {
    try {
        await page.waitForFunction(
            () => {
                const els = document.querySelectorAll('main, main *, header, header *, h1');
                const limit = Math.min(els.length, 300);
                for (let i = 0; i < limit; i++) {
                    if (
                        Object.keys(els[i]).some(
                            (k) => k.startsWith('__reactFiber') || k.startsWith('__reactProps'),
                        )
                    ) {
                        return true;
                    }
                }
                return false;
            },
            undefined,
            { timeout },
        );
        return null;
    } catch {
        return `no element hydrated within ${timeout}ms — React never attached (the page likely errored during hydration)`;
    }
}

/** An anchor as the page carries it, before classification. */
interface RawLink {
    href: string;
    target: string | null;
    rel: string | null;
}

type Classified =
    | { kind: 'route'; route: string }
    | { kind: 'asset'; path: string }
    | { kind: 'external'; url: URL }
    | { kind: 'skip' };

/** Normalize a pathname to the crawl's visit key: decoded, no trailing slash. */
function normalizeRoute(pathname: string): string {
    let p: string;
    try {
        p = decodeURIComponent(pathname);
    } catch {
        p = pathname;
    }
    p = p.replace(/\/+$/, '');
    return p === '' ? '/' : p;
}

function classify(href: string, origin: string): Classified {
    if (!href || href.startsWith('#')) return { kind: 'skip' };
    let url: URL;
    try {
        url = new URL(href, origin + '/');
    } catch {
        // A malformed href is itself a finding — surface it as external so
        // the protocol check fails with the verbatim value.
        return { kind: 'external', url: new URL('invalid:' + encodeURIComponent(href)) };
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return { kind: 'external', url };
    if (url.origin !== origin) return { kind: 'external', url };
    const route = normalizeRoute(url.pathname);
    // Linked FILES and the typedoc bundle are status-checked, never crawled:
    // /sdk-api is generated vendor HTML (its internal link graph is typedoc's,
    // not the app's), and anything with an extension is a download, not a route.
    if (route.startsWith('/sdk-api') || route.startsWith('/_next') || /\.[a-z0-9]{2,5}$/i.test(route)) {
        return { kind: 'asset', path: route };
    }
    return { kind: 'route', route };
}

/**
 * The static export's own route census: every `index.html` under the dist
 * dir the webServer built (trailingSlash: true — directory-per-route).
 * `/404` (the not-found page — no link points at it by design) and the
 * typedoc bundle are not crawl targets.
 */
function exportedRoutes(distDir: string): string[] {
    const routes: string[] = [];
    const walk = (dir: string, rel: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                if (rel === '' && (entry.name === '_next' || entry.name === 'sdk-api')) continue;
                walk(path.join(dir, entry.name), `${rel}/${entry.name}`);
            } else if (entry.name === 'index.html' && rel !== '/404') {
                routes.push(rel === '' ? '/' : rel);
            }
        }
    };
    walk(distDir, '');
    return routes.sort();
}

/**
 * The routes the named parenthesized route groups own, derived from the app
 * tree at test time (`docs/FRONTEND.md`: the directory listing, not prose,
 * is the source of truth). Group segments never appear in the URL.
 */
function routesOfGroups(appDir: string, groups: string[]): Set<string> {
    const routes = new Set<string>();
    const walk = (dir: string, rel: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                const isGroup = entry.name.startsWith('(') && entry.name.endsWith(')');
                walk(path.join(dir, entry.name), isGroup ? rel : `${rel}/${entry.name}`);
            } else if (entry.name === 'page.tsx') {
                routes.add(rel === '' ? '/' : rel);
            }
        }
    };
    for (const group of groups) {
        const dir = path.join(appDir, group);
        if (fs.existsSync(dir)) walk(dir, '');
    }
    return routes;
}

/** The pathname a route's exported HTML declares as canonical, if any. */
function canonicalPathOf(distDir: string, route: string): string | null {
    let html: string;
    try {
        html = fs.readFileSync(path.join(distDir, route === '/' ? '' : route, 'index.html'), 'utf8');
    } catch {
        return null;
    }
    const match = html.match(/<link rel="canonical" href="([^"]+)"/);
    if (!match) return null;
    try {
        return normalizeRoute(new URL(match[1], 'https://placeholder.invalid/').pathname);
    } catch {
        return null;
    }
}

/** A crawl worker: one tab, its console/pageerror listeners attached once. */
interface Worker {
    page: Page;
    current: { route: string };
    visit(route: string): Promise<RawLink[]>;
}

async function makeWorker(context: BrowserContext, findings: Finding[]): Promise<Worker> {
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(NAV_TIMEOUT);
    const current = { route: '(before first navigation)' };
    // Listeners BEFORE any navigation, once for the tab's whole life.
    page.on('console', (msg) => {
        if (msg.type() === 'error' && !RSC_PREFETCH_ABORT.test(msg.text())) {
            findings.push({ route: current.route, kind: 'console-error', detail: msg.text() });
        }
    });
    page.on('pageerror', (err) => {
        findings.push({ route: current.route, kind: 'page-error', detail: String(err) });
    });

    const visit = async (route: string): Promise<RawLink[]> => {
        current.route = route;
        let response;
        try {
            response = await page.goto(route, { waitUntil: 'load' });
        } catch (err) {
            findings.push({ route, kind: 'http-status', detail: `navigation failed: ${String(err).split('\n')[0]}` });
            return [];
        }
        const status = response?.status() ?? 0;
        if (status >= 400) {
            findings.push({ route, kind: 'http-status', detail: `HTTP ${status}` });
            return []; // the 404 page's links are not the app's link graph
        }
        const hydration = await waitForAnyHydration(page);
        if (hydration) findings.push({ route, kind: 'hydration', detail: hydration });
        await page.waitForTimeout(SETTLE_MS);

        // A loading shell is fine; a page with neither a non-empty <main>
        // nor an <h1> rendered nothing at all.
        const hasContent = await page.evaluate(() => {
            const main = document.querySelector('main');
            const h1 = document.querySelector('h1');
            return Boolean(main?.textContent?.trim() || h1?.textContent?.trim());
        });
        if (!hasContent) {
            findings.push({ route, kind: 'empty-page', detail: 'no non-empty <main> and no <h1> rendered' });
        }

        return page.evaluate(() =>
            Array.from(document.querySelectorAll('a[href]')).map((a) => ({
                href: a.getAttribute('href') ?? '',
                target: a.getAttribute('target'),
                rel: a.getAttribute('rel'),
            })),
        );
    };

    return { page, current, visit };
}

test.describe('The stranger: the blind visitor', () => {
    test('crawls every route and href from / — no console error, no 404, every exported route reached', async ({ context, baseURL }) => {
        test.setTimeout(20 * 60_000);
        expect(baseURL, 'the config supplies baseURL').toBeTruthy();
        const origin = new URL(baseURL!).origin;

        const findings: Finding[] = [];
        const visited = new Set<string>();
        const queue: string[] = [];
        const enqueue = (route: string) => {
            if (!visited.has(route)) {
                visited.add(route);
                queue.push(route);
            }
        };
        const assets = new Set<string>();
        /** external href → the pages carrying it + the worst attributes seen */
        const externals = new Map<string, { pages: Set<string>; url: URL; blankWithoutRel: boolean }>();

        const workers = await Promise.all(
            Array.from({ length: CRAWL_WORKERS }, () => makeWorker(context, findings)),
        );

        const ingest = (fromRoute: string, links: RawLink[]) => {
            for (const link of links) {
                const c = classify(link.href, origin);
                if (c.kind === 'route') enqueue(c.route);
                else if (c.kind === 'asset') assets.add(c.path);
                else if (c.kind === 'external') {
                    const key = c.url.href;
                    const entry = externals.get(key) ?? { pages: new Set<string>(), url: c.url, blankWithoutRel: false };
                    entry.pages.add(fromRoute);
                    if (link.target === '_blank') {
                        const rel = (link.rel ?? '').toLowerCase();
                        if (!rel.includes('noopener') || !rel.includes('noreferrer')) entry.blankWithoutRel = true;
                    }
                    externals.set(key, entry);
                }
            }
        };

        enqueue('/');
        // The nav is part of the crawl: the mobile drawers mount on demand,
        // so their anchors are absent from the desktop DOM — seed from the
        // one nav source the drawers render from (the same import
        // navigation.mobile.spec.ts uses). A dead nav route still 404s here.
        for (const link of [
            ...NAV_LINKS,
            ...NAV_LINKS_APP_PRIMARY,
            ...NAV_LINKS_APP_DRAWER,
            ...NAV_LINKS_MARKETING_DRAWER,
            ...MARKETING_MAP.flatMap((section) => section.links),
        ]) {
            const c = classify(link.href, origin);
            if (c.kind === 'route') enqueue(c.route);
        }
        while (queue.length > 0) {
            const batch = queue.splice(0, workers.length);
            const results = await Promise.all(batch.map((route, i) => workers[i].visit(route)));
            batch.forEach((route, i) => ingest(route, results[i]));
        }

        // A broken link collector must not pass vacuously: the site is far
        // bigger than this floor (≈95 app routes + ≈190 working-groups tags).
        expect(visited.size, 'the transitive crawl reached a real route set').toBeGreaterThan(50);

        // ── Completeness: the export's own census vs. what crawling reached ──
        const distDir = path.resolve(
            __dirname,
            '../..',
            process.env.E2E_CHAIN === 'sepolia' ? '.next-e2e-sepolia' : '.next-e2e',
        );
        const unreachable: string[] = [];
        if (fs.existsSync(distDir)) {
            const unreached = exportedRoutes(distDir).filter((r) => !visited.has(r));
            // Still gate every unreached route — a stranger can land on any of
            // them from a shared URL, so status/console/content run either way.
            for (let i = 0; i < unreached.length; i += workers.length) {
                const batch = unreached.slice(i, i + workers.length);
                const results = await Promise.all(batch.map((route, j) => workers[j].visit(route)));
                batch.forEach((route, j) => ingest(route, results[j]));
            }
            // The reachability bar, by the repo's own seams (spec header §2):
            // aliases and wallet-scope runtime surfaces are reported, never
            // failed; a marketing-tier route nothing links is a failure.
            const runtimeTiers = routesOfGroups(path.resolve(__dirname, '../../app'), ['(app)', '(tools)']);
            const aliases: string[] = [];
            const walletScoped: string[] = [];
            for (const route of unreached) {
                const canonical = canonicalPathOf(distDir, route);
                if (canonical !== null && canonical !== route) aliases.push(`${route} (canonical: ${canonical})`);
                else if (runtimeTiers.has(route)) walletScoped.push(route);
                else unreachable.push(route);
            }
            for (const [type, list] of [
                ['unlinked inbound-compat aliases', aliases],
                ['wallet-scope surfaces with no cold-visitor link (visited directly; connected chrome and runtime state own their links)', walletScoped],
            ] as const) {
                if (list.length > 0) test.info().annotations.push({ type, description: list.join(', ') });
            }
        }

        // ── Same-origin linked assets: status only, one request each ──
        for (const asset of assets) {
            const response = await workers[0].page.request.get(origin + asset);
            if (response.status() >= 400) {
                findings.push({ route: asset, kind: 'asset', detail: `linked file answers HTTP ${response.status()}` });
            }
        }

        // ── External hrefs: never visited; https + rel discipline only ──
        for (const { pages, url, blankWithoutRel } of externals.values()) {
            const at = `on ${[...pages].slice(0, 3).join(', ')}${pages.size > 3 ? ` (+${pages.size - 3} more)` : ''}`;
            if (url.protocol !== 'https:') {
                findings.push({ route: at, kind: 'external-href', detail: `non-https external href ${url.href}` });
            }
            if (blankWithoutRel) {
                findings.push({ route: at, kind: 'external-href', detail: `target="_blank" without rel="noopener noreferrer": ${url.href}` });
            }
        }

        expect.soft(
            unreachable,
            `marketing-tier routes the static export ships that NO chain of same-origin hrefs from / or the nav reaches — invisible to a stranger who only clicks:\n  ${unreachable.join('\n  ')}`,
        ).toEqual([]);

        const lines = findings.map((f) => `[${f.kind}] ${f.route} — ${f.detail}`);
        expect(
            lines,
            `the blind crawl of ${visited.size} routes surfaced ${lines.length} finding(s):\n  ${lines.join('\n  ')}`,
        ).toEqual([]);
    });

    // The first-paint experience must not require a wallet: the connect
    // affordance renders, is clickable, and clicking it with NO provider in
    // the page produces no console error (wagmi's injected connector simply
    // finds nothing — a handled condition, never a thrown one).
    test('connect after first paint: the affordance works without a provider', async ({ page }) => {
        const errors: string[] = [];
        page.on('console', (msg) => {
            if (msg.type() === 'error') errors.push(msg.text());
        });
        page.on('pageerror', (err) => errors.push(String(err)));

        const response = await page.goto('/orders', { waitUntil: 'load' });
        expect(response?.status(), '/orders answers').toBeLessThan(400);

        // The stranger precondition, asserted rather than assumed.
        expect(
            await page.evaluate(() => (window as { ethereum?: unknown }).ethereum === undefined),
            'no injected provider exists in this context',
        ).toBe(true);

        await waitForReactHydration(page, '[data-testid="connect-wallet"]');
        // The two sanctioned placements (ConnectWallet's own doc comment) —
        // the header and the WalletGate body — BOTH render for the
        // disconnected stranger; click the in-content one.
        await expect(page.getByTestId('connect-wallet')).toHaveCount(2);
        const connect = page.getByTestId('wallet-gate').getByTestId('connect-wallet');
        await expect(connect).toBeVisible();
        await expect(connect).toBeEnabled();

        await connect.click();
        await page.waitForTimeout(500);

        // Still standing after the click: the page rendered, the affordance
        // remains (nothing connected — there is nothing to connect with),
        // and the click errored nowhere.
        await expect(page.locator('main')).toBeVisible();
        await expect(connect).toBeVisible();
        expect(errors, `the disconnected first paint + connect click logged: ${errors.join(' | ')}`).toEqual([]);
    });
});
