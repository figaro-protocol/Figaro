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
 *     `waitForReactHydration` does), and a non-empty <main> or <h1>, waited
 *     for until the navigation budget runs out, never judged after a fixed
 *     delay. A page of `app/(app)` or `app/(tools)` whose <main> holds
 *     nothing outside the wallet gate (`WalletGate`'s disconnected branch) is
 *     a finding: the wallet signs, it is never a login (docs/FRONTEND.md
 *     § "Wallet-provider scope per route").
 *     A page that names its subject in the address (`QueryParamPage`: a
 *     process id, a seller's wallet, a design's slug) renders nothing for a
 *     missing or malformed subject, by the open-world rule, and a visitor
 *     reaches it only by a link that names its subject. The crawl reads
 *     which pages these are, their `param` and their `validate`, from each
 *     page's own source (its `page.tsx` and the modules beside it that it
 *     imports); it keeps the query of every link to one, and never visits
 *     one bare. A process id is the newest one the chain's `OrderCommitted`
 *     logs name, and that visit must show the subject's heading and content;
 *     with no process on the chain the page is visited not at all and
 *     reported as skipped. A wallet or a slug is a fixture the network need
 *     not hold, and that visit is not judged by its content: a subject the
 *     network does not hold is absence, never a blank page. `/evidence-display` reads its subject
 *     from a link a forum composes (docs/FRONTEND.md, "Deliberate orphan");
 *     it is visited with that link's two required parameters.
 *  0. THE PRECONDITION — on the devnet, the chain the build reads answers
 *     before the crawl starts. A chain that is down makes every app page's
 *     read fail, and the browser logs each refused request as a console
 *     error: those are faults of the run, not of the site, so the run stops
 *     with one line instead.
 *  2. COMPLETENESS — the static export's own route list (every `index.html`
 *     under the dist dir) is the census, and the crawl fails when the export
 *     is missing; EVERY route is visited, so the
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
 *     not crawled into. A paper's PDF (`/papers/<slug>/<slug>.pdf`) is
 *     written after the export by `scripts/build-paper-pdfs.mjs`, which
 *     skips itself on the e2e harness build (`FIGARO_ALLOW_TEST_HELPERS=1`,
 *     never a deploy). When the export holds no paper PDF at all, the build
 *     skipped the step, and the PDF links are reported as an annotation,
 *     not checked; `npm run check:paper-pdfs` is the check of a real build.
 *  5. THE DOCS-SITE (`/docs/…`) — a separate build served under `/docs` on
 *     the same host, absent from this export: skipped, neither crawled nor
 *     status-checked; the docs-site's own build owns its routes.
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
import { exportDistDir, exportedRoutes } from './exportCensus';
import { E2E_CHAIN, RPC_URL, localPublicClient, readLocalDeploymentConfig, scanContractEvents } from './devnet-helpers';
import { ANVIL_ACCOUNTS } from '../anvilAccounts';
import { CORE_ABI } from '@/lib/core/contracts';

/** One defect the blind visitor hit, attributed to the page that produced it. */
interface Finding {
    route: string;
    kind: 'http-status' | 'console-error' | 'page-error' | 'hydration' | 'empty-page' | 'wallet-as-login' | 'external-href' | 'asset';
    detail: string;
}

/**
 * Where the subject of a `QueryParamPage` comes from, by the validator the
 * page names. A process id is read from the chain (`newestCommittedProcess`),
 * so the page has a subject the network holds and is judged by its heading.
 * A wallet is an Anvil account (`tests/anvilAccounts.ts`) and a slug a
 * well-formed name: the network need not hold either, so the page renders
 * what the network answers and is not judged by its content.
 */
type SubjectSource = { kind: 'chain-process' } | { kind: 'fixture'; value: string };
const SUBJECT_SOURCES: Record<string, SubjectSource> = {
    processIdParam: { kind: 'chain-process' },
    walletParam: { kind: 'fixture', value: ANVIL_ACCOUNTS[1] },
    slugParam: { kind: 'fixture', value: 'devnet-seed' },
};

/** A well-formed process id the network need not hold, for the forum's link below. */
const FIXTURE_PROCESS_ID = `0x${'5e'.repeat(32)}`;

/** The pages that read their subject from the address themselves, and the query a forum's link carries. */
const SELF_READ_SUBJECTS: Record<string, string> = {
    '/evidence-display': `processId=${FIXTURE_PROCESS_ID}&arbitrableJsonRpcUrl=${encodeURIComponent(RPC_URL)}`,
};

/**
 * The newest process the chain holds: the `processId` of the last
 * `OrderCommitted` the Core emitted, read out of band through the helpers'
 * chunked scan. A chain with no committed order yields the reason instead.
 */
async function newestCommittedProcess(): Promise<{ processId: string } | { reason: string }> {
    const core = readLocalDeploymentConfig().figaroCore;
    if (!core) return { reason: 'the deployment config names no FigaroCore to read processes from' };
    const committed = await scanContractEvents(localPublicClient(), { address: core, abi: CORE_ABI, eventName: 'OrderCommitted' });
    const newest = committed[committed.length - 1];
    if (!newest?.args.processId) return { reason: `the chain holds no OrderCommitted on FigaroCore ${core}` };
    return { processId: newest.args.processId };
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

/**
 * `subjects` names the pages that read their subject from the query: a link
 * to one keeps its query, so the page is visited with the subject the link
 * names. Every other link is visited by its path alone.
 */
function classify(href: string, origin: string, subjects: ReadonlySet<string> = new Set()): Classified {
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
    // The docs-site is a separate build, served under /docs on the same host
    // and never part of this export: a link into it (the Build menu's builder
    // documentation, the concept pages' "builder documentation") is neither
    // crawled nor status-checked here — the docs-site's own build owns its routes.
    if (route === '/docs' || route.startsWith('/docs/')) return { kind: 'skip' };
    // Linked FILES and the typedoc bundle are status-checked, never crawled:
    // /sdk-api is generated vendor HTML (its internal link graph is typedoc's,
    // not the app's), and anything with an extension is a download, not a route.
    if (route.startsWith('/sdk-api') || route.startsWith('/_next') || /\.[a-z0-9]{2,5}$/i.test(route)) {
        return { kind: 'asset', path: route };
    }
    if (subjects.has(route) && url.search) return { kind: 'route', route: route + url.search };
    return { kind: 'route', route };
}

/**
 * A page's own source: its `page.tsx` and every module it imports, by a
 * relative path, from its own route directory (a page may mount its
 * `QueryParamPage` in a client module beside it, as `/audit/view` does).
 */
function pageOwnSources(pageFile: string): string[] {
    const routeDir = path.dirname(path.resolve(pageFile));
    const seen = new Set<string>();
    const sources: string[] = [];
    const read = (file: string) => {
        if (seen.has(file)) return;
        seen.add(file);
        const source = fs.readFileSync(file, 'utf8');
        sources.push(source);
        for (const m of source.matchAll(/from\s+["'](\.\/[^"']+)["']/g)) {
            const base = path.resolve(path.dirname(file), m[1]);
            const resolved = [`${base}.tsx`, `${base}.ts`].find((f) => fs.existsSync(f));
            if (resolved && path.dirname(resolved) === routeDir) read(resolved);
        }
    };
    read(pageFile);
    return sources;
}

/** The parameter pages of the app and the subject each is visited with. */
interface SubjectPages {
    /** Every page whose subject rides in its query: `QueryParamPage`'s and `SELF_READ_SUBJECTS`. */
    routes: Set<string>;
    /** route → the query that names its subject, for each page that has one. */
    queries: Map<string, string>;
    /** The visit keys whose subject the crawl read from the chain: judged by their heading. */
    chainRead: Set<string>;
    /** route → why the page has no subject to be visited with. */
    skipped: Map<string, string>;
}

/**
 * The pages of `app/(app)` and `app/(tools)` that name their subject in the
 * address through `QueryParamPage`, read from each page's own source (its
 * `param` and its `validate`), each given a subject by `SUBJECT_SOURCES`; and
 * the pages that read their subject themselves (`SELF_READ_SUBJECTS`).
 */
function subjectPages(appDir: string, newest: { processId: string } | { reason: string }): SubjectPages {
    const out: SubjectPages = { routes: new Set(), queries: new Map(), chainRead: new Set(), skipped: new Map() };
    const walk = (dir: string, rel: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                const isGroup = entry.name.startsWith('(') && entry.name.endsWith(')');
                walk(path.join(dir, entry.name), isGroup ? rel : `${rel}/${entry.name}`);
            } else if (entry.name === 'page.tsx') {
                const sources = pageOwnSources(path.join(dir, entry.name));
                const uses = sources.flatMap((s) => s.match(/<QueryParamPage\b[^>]*>/g) ?? []);
                if (uses.length === 0) continue;
                const parsed = uses.map((u) => u.match(/\bparam="(\w+)"\s+validate=\{(\w+)\}/));
                if (parsed.some((m) => !m) || new Set(uses).size > 1) {
                    throw new Error(`${rel}: the crawl reads one QueryParamPage with a literal param and validate, and found ${uses.join(' | ')}`);
                }
                const [, param, validate] = parsed[0]!;
                const source = SUBJECT_SOURCES[validate];
                if (source === undefined) throw new Error(`${rel}: QueryParamPage validates with ${validate}, which has no entry in SUBJECT_SOURCES`);
                out.routes.add(rel);
                if (source.kind === 'fixture') {
                    out.queries.set(rel, `${param}=${encodeURIComponent(source.value)}`);
                } else if ('processId' in newest) {
                    const query = `${param}=${newest.processId}`;
                    out.queries.set(rel, query);
                    out.chainRead.add(`${rel}?${query}`);
                } else {
                    out.skipped.set(rel, `its ${param} is a process id, and ${newest.reason}`);
                }
            }
        }
    };
    for (const group of ['(app)', '(tools)']) walk(path.join(appDir, group), '');
    for (const [route, query] of Object.entries(SELF_READ_SUBJECTS)) {
        if (!routesOfGroups(appDir, ['(app)', '(tools)']).has(route)) throw new Error(`${route} is no longer a page of the app`);
        out.routes.add(route);
        out.queries.set(route, query);
    }
    return out;
}

/** The route a visit key names: its path without the query. */
const pathOfVisit = (key: string): string => key.split('?')[0];

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

/** What a visit judges beyond status, console and hydration. */
interface VisitRules {
    /** The page must show content: a non-empty <main> or <h1>. */
    content: boolean;
    /** The page names a subject the chain holds: its <main> must show an <h1> past the loading line, and more text than the <h1>. */
    subjectHeading: boolean;
    /** The page is the wallet's (`app/(app)`, `app/(tools)`): its <main> must hold more than the wallet gate. */
    walletTier: boolean;
}

/** A crawl worker: one tab, its console/pageerror listeners attached once. */
interface Worker {
    page: Page;
    current: { route: string };
    visit(route: string, rules: VisitRules): Promise<RawLink[]>;
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

    const visit = async (route: string, rules: VisitRules): Promise<RawLink[]> => {
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

        // Content is waited for, not sampled after a delay: a page that reads
        // the network renders as its reads land. A page with neither a
        // non-empty <main> nor an <h1> by the end of the budget rendered nothing.
        if (rules.content) {
            const hasContent = await page
                .waitForFunction(() => {
                    const main = document.querySelector('main');
                    const h1 = document.querySelector('h1');
                    return Boolean(main?.textContent?.trim() || h1?.textContent?.trim());
                }, undefined, { timeout: NAV_TIMEOUT })
                .then(() => true, () => false);
            if (!hasContent) {
                findings.push({ route, kind: 'empty-page', detail: `no non-empty <main> and no <h1> within ${NAV_TIMEOUT}ms` });
            }
        }
        if (rules.subjectHeading) {
            const hasSubject = await page
                .waitForFunction(() => {
                    const main = document.querySelector('main');
                    const heading = main?.querySelector('h1')?.textContent?.trim() ?? '';
                    const body = main?.textContent?.trim() ?? '';
                    return heading !== '' && heading !== 'Loading…' && body.length > heading.length;
                }, undefined, { timeout: NAV_TIMEOUT })
                .then(() => true, () => false);
            if (!hasSubject) {
                findings.push({ route, kind: 'empty-page', detail: `a subject the chain holds, and no <h1> past the loading line with content beside it in <main> within ${NAV_TIMEOUT}ms` });
            }
        }
        // Late console errors land on their own page before the next navigation.
        await page.waitForTimeout(SETTLE_MS);

        // The wallet signs; it is never a login. A wallet-tier page whose
        // <main> holds nothing but the wallet gate withholds its reads.
        if (rules.walletTier) {
            const outsideGate = await page.evaluate(() => {
                const main = document.querySelector('main');
                if (!main) return '';
                const copy = main.cloneNode(true) as HTMLElement;
                copy.querySelectorAll('[data-testid="wallet-gate"]').forEach((gate) => gate.remove());
                return copy.textContent?.trim() ?? '';
            });
            const hasGate = await page.locator('main [data-testid="wallet-gate"]').count();
            if (hasGate > 0 && outsideGate === '') {
                findings.push({ route, kind: 'wallet-as-login', detail: 'the page shows nothing but the wallet gate to a visitor with no wallet' });
            }
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

        // ── The precondition (spec header §0) ──
        if (E2E_CHAIN === 'devnet') {
            const answer = await context.request
                .post(RPC_URL, { data: { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] } })
                .then((r) => r.ok(), () => false);
            expect(answer, `the chain the build reads (${RPC_URL}) does not answer: start it (scripts/devup.sh) before the crawl`).toBe(true);
        }

        // The census and the app's own source, both read before the crawl.
        const distDir = exportDistDir();
        expect(fs.existsSync(distDir), `the static export is missing at ${distDir}: the webServer builds it`).toBe(true);
        const appDir = path.resolve(__dirname, '../../app');
        const runtimeTiers = routesOfGroups(appDir, ['(app)', '(tools)']);
        const subjects = subjectPages(appDir, await newestCommittedProcess());
        const rulesFor = (key: string): VisitRules => ({
            content: !subjects.routes.has(pathOfVisit(key)),
            subjectHeading: subjects.chainRead.has(key),
            walletTier: runtimeTiers.has(pathOfVisit(key)),
        });

        const findings: Finding[] = [];
        const visited = new Set<string>();
        const queue: string[] = [];
        /**
         * The visit a key stands for. A parameter page (its subject rides in
         * its query, read from its source by `subjectPages`) is never visited
         * bare, since a visitor reaches it only by a link that names its
         * subject: it is visited with the subject its validator's source gives
         * (a process id from the chain, a fixture wallet or slug), and a page
         * with no subject is visited not at all and reported as skipped.
         */
        const visitKeyOf = (key: string): string | null => {
            const route = pathOfVisit(key);
            if (key !== route || !subjects.routes.has(route)) return key;
            const query = subjects.queries.get(route);
            return query === undefined ? null : `${route}?${query}`;
        };
        const enqueue = (key: string) => {
            const visit = visitKeyOf(key);
            if (visit !== null && !visited.has(visit)) {
                visited.add(visit);
                queue.push(visit);
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
                const c = classify(link.href, origin, subjects.routes);
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
            ...MARKETING_MAP.flatMap((clauseEntry) => clauseEntry.links),
        ]) {
            const c = classify(link.href, origin, subjects.routes);
            if (c.kind === 'route') enqueue(c.route);
        }
        while (queue.length > 0) {
            const batch = queue.splice(0, workers.length);
            const results = await Promise.all(batch.map((route, i) => workers[i].visit(route, rulesFor(route))));
            batch.forEach((route, i) => ingest(route, results[i]));
        }

        // A broken link collector must not pass vacuously: the site is far
        // bigger than this floor (≈95 app routes + ≈190 working-groups tags).
        expect(visited.size, 'the transitive crawl reached a real route set').toBeGreaterThan(50);

        // ── Completeness: the export's own census vs. what crawling reached ──
        const unreachable: string[] = [];
        {
            const reached = new Set([...visited].map(pathOfVisit));
            const unreached = exportedRoutes(distDir).filter((r) => !reached.has(r));
            // Still gate every unreached route — a stranger can land on any of
            // them from a shared URL, so status/console/content run either way;
            // a parameter page is visited with its subject (`visitKeyOf`), and
            // so is one the links reached only with another subject.
            const censusVisits = [...new Set([...unreached, ...subjects.routes].map(visitKeyOf))]
                .filter((k): k is string => k !== null && !visited.has(k));
            for (let i = 0; i < censusVisits.length; i += workers.length) {
                const batch = censusVisits.slice(i, i + workers.length);
                batch.forEach((key) => visited.add(key));
                const results = await Promise.all(batch.map((key, j) => workers[j].visit(key, rulesFor(key))));
                batch.forEach((key, j) => ingest(key, results[j]));
            }
            // A parameter page with no subject was visited by no key: it is
            // reported as skipped, with its reason, and never counted a pass.
            if (subjects.skipped.size > 0) {
                const skipped = [...subjects.skipped].map(([route, reason]) => `${route}: ${reason}`);
                for (const line of skipped) console.log(`[skipped] ${line}`);
                test.info().annotations.push({ type: 'parameter pages skipped: no subject to visit them with', description: skipped.join('; ') });
            }
            // The reachability bar, by the repo's own seams (spec header §2):
            // aliases and wallet-scope runtime surfaces are reported, never
            // failed; a marketing-tier route nothing links is a failure.
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
        // A paper's PDF is written after the export, and the harness build
        // skips that step (spec header §4): an export holding no paper PDF at
        // all is such a build, and its PDF links are reported, not checked.
        const PAPER_PDF = /^\/papers\/([^/]+)\/\1\.pdf$/;
        const papersDir = path.join(distDir, 'papers');
        const exportHasPaperPdfs = fs.existsSync(papersDir) && fs.readdirSync(papersDir, { withFileTypes: true })
            .some((d) => d.isDirectory() && fs.existsSync(path.join(papersDir, d.name, `${d.name}.pdf`)));
        const unwrittenPdfs = exportHasPaperPdfs ? [] : [...assets].filter((a) => PAPER_PDF.test(a));
        if (unwrittenPdfs.length > 0) {
            test.info().annotations.push({
                type: 'paper PDFs not checked: this export holds none, so its build skipped the PDF step (npm run check:paper-pdfs checks a real build)',
                description: unwrittenPdfs.join(', '),
            });
        }
        for (const asset of assets) {
            if (unwrittenPdfs.includes(asset)) continue;
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
        // disconnected stranger. On /orders the WalletGate body is the
        // control beside the one line that says the list is one address's
        // and none is named; click that in-content one.
        await expect(page.getByTestId('connect-wallet')).toHaveCount(2);
        await expect(page.getByTestId('orders-no-address')).toContainText('These are the orders of one address');
        const connect = page.getByTestId('orders-no-address').getByTestId('connect-wallet');
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
