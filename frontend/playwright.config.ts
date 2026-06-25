import { defineConfig, devices } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// Load .env.local into process.env so devnet specs that read
// NEXT_PUBLIC_* addresses (PERMIT_TOKEN_ADDRESS, etc.) get fresh
// values from the latest ./deploy-local.sh run instead of hard-coded
// fallbacks. Next.js's dev server loads .env.local on its own; this
// makes the Playwright test process see the same values.
try {
    const envPath = path.resolve(__dirname, '.env.local');
    if (fs.existsSync(envPath)) {
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

const PLAYWRIGHT_PORT = Number(process.env.PLAYWRIGHT_PORT ?? '3100');
const PLAYWRIGHT_BASE_URL = `http://127.0.0.1:${PLAYWRIGHT_PORT}`;

// Web-server mode. Default = production (`next build` + `next start`):
// the dev server degrades after ~25 min of compile-on-demand (the
// seller-track-record tail-position pattern, 2026-06-11), and devnet is a
// mainnet rehearsal — participants hit a production build, not a dev
// server. The build (~90 s) inlines frontend/.env.local (contract
// addresses, NEXT_PUBLIC_ENABLE_TEST_HELPERS), so after a FORCE_REDEPLOY
// or an app-code edit, kill :3100 — a reused server keeps serving the
// build it started with. PLAYWRIGHT_WEB_MODE=dev restores the dev-server
// webServer for HMR-speed iteration on app code.
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
        // NEXT_DISTDIR isolates the e2e build (`.next-e2e`) from the developer's
        // interactive :3000 build (`.next`) so neither clobbers the other's cache.
        command:
            WEB_MODE === 'prod'
                ? `NEXT_DISTDIR=.next-e2e npm run build && NEXT_DISTDIR=.next-e2e PORT=${PLAYWRIGHT_PORT} npm run start`
                : `NEXT_DISTDIR=.next-e2e PORT=${PLAYWRIGHT_PORT} npm run dev`,
        url: PLAYWRIGHT_BASE_URL,
        reuseExistingServer: !process.env.CI,
        // prod mode runs a full `next build` (~90 s) before the server answers.
        timeout: WEB_MODE === 'prod' ? 300_000 : 120_000,
    },

    // Three projects, two concerns. The e2e suite is split along the
    // persisted pipeline's stage boundary so a COLD devnet runs in stage
    // order (alphabetical file order would run runtimes before the
    // scenarios that anchor what they consume):
    //
    //   `devnet-authoring` — stage 1+2: the scenario specs (author + anchor
    //     each assembly, idempotent on a non-fresh chain) and the
    //     sellers-onboarding wizard (also idempotent).
    //   `devnet-standalone` — self-contained acceptance specs (e.g.
    //     permissionless-clause) that register their own clause, author their
    //     own assembly, and onboard their own seller. They share NO seeded
    //     state, so they depend on NOTHING — never the authoring gate.
    //   `devnet` — the runtime specs that CONSUME the seeded anchors; depends
    //     on devnet-authoring, so the anchors exist first. Dev-loop note:
    //     a file-filtered run (`npx playwright test foo.devnet.spec.ts`)
    //     runs the FULL authoring project first — pass `--no-deps` to skip
    //     it when the chain is already anchored.
    //   `mobile` — the lone non-e2e browser project: responsive/viewport
    //     chrome that needs a real browser and jsdom can't render.
    //
    // UI logic that needs neither lives in Vitest (`tests/components/`,
    // `tests/lib/`); contracts live in Foundry. The former `mock` project
    // (UI tests against a fake backend) was retired 2026-05-20 — a
    // mock-backed test is not end-to-end.
    projects: [
        {
            name: 'devnet-authoring',
            testMatch: /(scenario-[a-z-]+|seed-assembly|sellers-onboarding)\.devnet\.spec\.ts$/,
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
            testMatch: /permissionless-clause\.devnet\.spec\.ts$/,
            fullyParallel: false,
            workers: 1,
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'devnet',
            testMatch: /\.devnet\.spec\.ts$/,
            testIgnore: /(scenario-[a-z-]+|seed-assembly|sellers-onboarding|permissionless-clause)\.devnet\.spec\.ts$/,
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
    ],
});
