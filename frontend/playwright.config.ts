import { defineConfig, devices } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// Load .env.local into process.env so devnet specs that read
// NEXT_PUBLIC_* addresses (PERMIT_TOKEN_ADDRESS, etc.) get fresh
// values from the latest ./deploy-local.sh run instead of hard-coded
// fallbacks. Next.js's dev server loads .env.local on its own; this
// makes the Playwright test process see the same values.
// E2E_CHAIN=sepolia — the PUBLIC rehearsal (the Sepolia smoke): the site is
// built against the committed Sepolia record + the public RPC + the same
// test-helper opt-in the devnet export carries, into its own dist dir and
// port; the test process reads the record, never .env.local (whose values
// are the devnet's). Everything else stays the devnet default.
const E2E_CHAIN = process.env.E2E_CHAIN === 'sepolia' ? 'sepolia' : 'devnet';
const SEPOLIA_ENV: Record<string, string> = {};
if (E2E_CHAIN === 'sepolia') {
    const record = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../deployments/11155111.json'), 'utf8')) as Record<string, string | number>;
    Object.assign(SEPOLIA_ENV, {
        NEXT_PUBLIC_CHAIN: 'sepolia',
        NEXT_PUBLIC_FIGARO_CORE: String(record.figaroCore),
        NEXT_PUBLIC_ATTESTATION_COORDINATOR: String(record.attestationCoordinator),
        NEXT_PUBLIC_CLAUSE_REGISTRY: String(record.clauseRegistry),
        NEXT_PUBLIC_MEMBERS_REGISTRY: String(record.membersRegistry),
        NEXT_PUBLIC_ASSEMBLY_REGISTRY: String(record.assemblyRegistry),
        NEXT_PUBLIC_FLORIN_TOKEN_ADDRESS: String(record.florinToken),
        NEXT_PUBLIC_USAGE_COUNTER: String(record.usageCounter),
        NEXT_PUBLIC_RPGF_MINTER: String(record.rpgfMinter),
        NEXT_PUBLIC_BATCH_VERIFIER: String(record.batchVerifier),
        NEXT_PUBLIC_DAO_TREASURY: String(record.daoTreasury),
        NEXT_PUBLIC_DEPLOYMENT_BLOCK: String(record.deploymentBlock ?? ''),
        // The PUBLIC, keyless read endpoint — never SEPOLIA_RPC_URL (the deploy
        // key's Infura endpoint: keyed, and rate-limited under a long run).
        NEXT_PUBLIC_RPC_URL: process.env.E2E_SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com',
        NEXT_PUBLIC_PERMIT2: String(record.permit2 ?? '0x000000000022D473030F116dDEE9F6B43aC78BA3'),
        // The swap-funded on-ramp (deployed alone onto the live stack 2026-08-18): the
        // coordinator, Uniswap SwapRouter02, and QuoterV2 — read from the record; absent
        // entries stay empty and the frontend gates the feature off (resolved-empty).
        NEXT_PUBLIC_WITNESS_SWAP_AND_COMMIT_COORDINATOR: String(record.witnessSwapAndCommitCoordinator ?? ''),
        NEXT_PUBLIC_SWAP_ROUTER: String(record.swapRouter ?? ''),
        NEXT_PUBLIC_SWAP_QUOTER: String(record.swapQuoter ?? ''),
        NEXT_PUBLIC_MULTISENDER: '0xD152f549545093347A162Dce210e7293f1452150',
        // The read chain of the deployed site: a dedicated gateway on the
        // site's pin service first when the deploy env names one, the public
        // gateway as fallback — so the smoke exercises the same chain visitors get.
        NEXT_PUBLIC_IPFS_GATEWAY_URL: process.env.NEXT_PUBLIC_IPFS_GATEWAY_URL || 'https://ipfs.io',
        NEXT_PUBLIC_IPFS_FALLBACK_GATEWAY_URL: process.env.NEXT_PUBLIC_IPFS_FALLBACK_GATEWAY_URL || '',
        // Testnet coordinates over XMTP's production network — the one mainnet uses.
        NEXT_PUBLIC_XMTP_ENV: 'production',
        NEXT_PUBLIC_IPFS_PIN_SERVICE_JWT: process.env.NEXT_PUBLIC_IPFS_PIN_SERVICE_JWT ?? process.env.IPFS_PIN_SERVICE_JWT ?? '',
        // `next build` reads frontend/.env.local on its own; its devnet EMPTY
        // values would otherwise inline as "" (`??` keeps an empty string) —
        // the pin-service base then posts to a relative URL and 404s. Set the
        // public-network values explicitly.
        NEXT_PUBLIC_IPFS_PIN_SERVICE_API: 'https://api.pinata.cloud',
        NEXT_PUBLIC_IPFS_API_URL: 'http://127.0.0.1:5001',
        NEXT_PUBLIC_ENABLE_TEST_HELPERS: 'true',
        NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1',
        // Devnet-only mocks stay unset on Sepolia — the frontend feature-gates absence.
        NEXT_PUBLIC_TOKEN_ADDRESS: '',
        NEXT_PUBLIC_PERMIT_TOKEN_ADDRESS: '',
        NEXT_PUBLIC_BATCH_RELAY_URL: '',
    });
    for (const [k, v] of Object.entries(SEPOLIA_ENV)) process.env[k] = v;
}
try {
    const envPath = path.resolve(__dirname, '.env.local');
    if (E2E_CHAIN === 'devnet' && fs.existsSync(envPath)) {
        for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eq = trimmed.indexOf('=');
            if (eq === -1) continue;
            const key = trimmed.slice(0, eq).trim();
            const value = trimmed.slice(eq + 1).trim();
            if (!process.env[key]) process.env[key] = value;
        }
    }
} catch {
    // .env.local missing is fine — fallback addresses kick in.
}

const PLAYWRIGHT_PORT = Number(process.env.PLAYWRIGHT_PORT ?? (E2E_CHAIN === 'sepolia' ? '3200' : '3100'));
const DIST_DIR = E2E_CHAIN === 'sepolia' ? '.next-e2e-sepolia' : '.next-e2e';
const BUILD_ENV_PREFIX = Object.entries(SEPOLIA_ENV).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ');
const PLAYWRIGHT_BASE_URL = `http://127.0.0.1:${PLAYWRIGHT_PORT}`;

// Web-server mode. Default = production (`next build` → static export, served
// by `serve`): the dev server degrades after ~25 min of compile-on-demand (the
// seller-track-record tail-position pattern, 2026-06-11), and devnet is a
// mainnet rehearsal — participants hit the exported production artifact, not a
// dev server. `output: 'export'` (next.config.mjs) writes the static site into
// the build dir (`.next-e2e` here, isolated from the dev :3000 `.next`), which
// `serve` then hosts — there is no `next start` under a static export. The
// build (~90 s) inlines frontend/.env.local (contract addresses,
// NEXT_PUBLIC_ENABLE_TEST_HELPERS), so after a FORCE_REDEPLOY or an app-code
// edit, kill :3100 — a reused server keeps serving the build it started with.
// PLAYWRIGHT_WEB_MODE=dev restores the dev-server webServer for HMR-speed
// iteration on app code.
const WEB_MODE = process.env.PLAYWRIGHT_WEB_MODE === 'dev' ? 'dev' : 'prod';

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 60_000,
    expect: { timeout: 10_000 },
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: 1,
    workers: process.env.CI ? 1 : undefined,
    reporter: [['html', { open: 'never' }]],

    use: {
        baseURL: PLAYWRIGHT_BASE_URL,
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },

    webServer: {
        // NEXT_DISTDIR isolates the e2e static export (`.next-e2e`) from the
        // developer's interactive :3000 dev build (`.next`) so neither clobbers
        // the other. In prod mode `next build` emits the static site into
        // `.next-e2e`, which `serve` hosts (no `next start` under output:export);
        // clean-URL resolution maps `/s/view` → `.next-e2e/s/view/index.html`
        // (trailingSlash: true — the directory-per-route export shape).
        command:
            WEB_MODE === 'prod'
                // `serve:export` (scripts/serve-export.mjs), NOT `npx serve`: serve
                // leaks a file descriptor per aborted prefetch and crashes on
                // macOS's per-process fd cap (kern.maxfilesperproc = 10240) with an
                // unhandled EMFILE mid-suite, taking every later test down with
                // CONNECTION_REFUSED. Our server destroys each file stream on
                // response close, so fds are released and no request can crash it.
                // FIGARO_ALLOW_TEST_HELPERS=1 opts this e2e build out of the
                // next.config.mjs production test-flag guard (finding 4): the
                // suite legitimately needs ?e2e=mock in a prod build; a real
                // deploy never sets this escape.
                // The dist dir is WIPED first, every run: rebuilding into an existing
                // .next-e2e after source renames corrupts it (PageNotFoundError:
                // /_document — three occurrences on 2026-08-06), and the build is
                // full-cost either way.
                ? `rm -rf ${DIST_DIR} && ${BUILD_ENV_PREFIX} FIGARO_ALLOW_TEST_HELPERS=1 NEXT_DISTDIR=${DIST_DIR} npm run build && SERVE_DIR=${DIST_DIR} PORT=${PLAYWRIGHT_PORT} npm run serve:export`
                : `rm -rf ${DIST_DIR} && ${BUILD_ENV_PREFIX} NEXT_DISTDIR=${DIST_DIR} PORT=${PLAYWRIGHT_PORT} npm run dev`,
        url: PLAYWRIGHT_BASE_URL,
        reuseExistingServer: !process.env.CI,
        // prod mode runs a full `next build` (~90 s) before the server answers.
        timeout: WEB_MODE === 'prod' ? 300_000 : 120_000,
    },

    // The e2e suite is split along the persisted pipeline's stage boundary
    // so a COLD devnet runs in stage order (alphabetical file order would
    // run consumers before the producer — checkout-assembly-choice sorts
    // before members-onboarding):
    //
    //   `devnet-authoring` — the members-onboarding wizard (idempotent). Its
    //     REAL product: the wizard seller (anvil[13]) registered and bound to
    //     the seed assembly, which checkout-assembly-choice, sign-countersign,
    //     swap-funded-checkout, and verification-coverage all trade with.
    //     Everything ELSE (clauses, anchored assemblies, sellers anvil[5-12])
    //     is PRE-POPULATED by frontend/scripts/populate-test-data.mjs, which
    //     `test:e2e:devnet` runs before Playwright — seeding is never a test.
    //   `devnet-standalone` — self-contained acceptance specs (e.g.
    //     permissionless-clause) that register their own clause, author their
    //     own assembly, and onboard their own seller. They share NO seeded
    //     state, so they depend on NOTHING — never the authoring gate.
    //   `devnet` — the runtime specs; depends on devnet-authoring so the
    //     wizard seller exists first. Dev-loop note: a file-filtered run
    //     (`npx playwright test foo.devnet.spec.ts`) runs the FULL authoring
    //     project first — pass `--no-deps` to skip it when the chain is
    //     already anchored.
    //   `mobile` — the lone non-e2e browser project: responsive/viewport
    //     chrome that needs a real browser and jsdom can't render.
    //
    // UI logic that needs neither lives in Vitest (`tests/components/`,
    // `tests/lib/`); contracts live in Foundry. There is no mock-backed
    // browser project and never will be: a test against a fake backend is
    // not end-to-end.
    projects: [
        {
            name: 'devnet-authoring',
            testMatch: /members-onboarding\.devnet\.spec\.ts$/,
            fullyParallel: false,
            workers: 1,
            use: { ...devices['Desktop Chrome'] },
        },
        {
            // Self-contained acceptance specs that author + run + audit their OWN
            // full cycle (register their own clause, author their own assembly,
            // onboard their own seller). They share NO seeded state and depend on
            // NOTHING — so they must NOT pull the devnet-authoring gate.
            name: 'devnet-standalone',
            testMatch: /(permissionless-clause|clause-coverage|assembly-withdraw|clause-authoring)\.devnet\.spec\.ts$/,
            fullyParallel: false,
            workers: 1,
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'devnet',
            testMatch: /\.devnet\.spec\.ts$/,
            testIgnore: /(members-onboarding|permissionless-clause|clause-coverage|assembly-withdraw|clause-authoring)\.devnet\.spec\.ts$/,
            dependencies: ['devnet-authoring'],
            fullyParallel: false,
            workers: 1,
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'mobile',
            testMatch: /\.mobile\.spec\.ts$/,
            // Pixel 5 uses Chromium — WebKit (iPhone 13) is unsupported on macOS 13.
            // Tests verify responsive layout, not browser engine — Chromium is correct.
            use: { ...devices['Pixel 5'] },
        },
        {
            // MAINTAINER-MANUAL smokes — NEVER part of any suite run. Explicitly:
            //     npx playwright test --project=smoke
            // These exercise REAL external transports the devnet suite
            // deliberately mocks (the XMTP hosted `dev` network) — they need
            // internet plus the standard devup stack, and their pass/fail is
            // an maintainer observation, not a CI gate.
            name: 'smoke',
            testMatch: /\.smoke\.spec\.ts$/,
            fullyParallel: false,
            workers: 1,
            use: { ...devices['Desktop Chrome'] },
        },
        {
            // MAINTAINER-MANUAL — the PUBLIC rehearsal:
            //     E2E_CHAIN=sepolia SMOKE_SELLER_KEY=… SMOKE_BUYER_KEY=… \
            //       npx playwright test --project=sepolia
            // Drives the live Sepolia contracts through the real UI with the
            // local-key signer bridge (no unlocked accounts off Anvil), asserting
            // every step out-of-band from Sepolia. Costs real testnet ETH + USDC:
            // the spec preflights both wallets and names what to fund. Without
            // E2E_CHAIN=sepolia the same spec rehearses on the devnet (self-funded).
            name: 'sepolia',
            testMatch: /\.sepolia\.spec\.ts$/,
            fullyParallel: false,
            workers: 1,
            retries: 0,
            use: { ...devices['Desktop Chrome'] },
        },
    ],
});
