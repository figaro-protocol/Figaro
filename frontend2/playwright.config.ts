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
        command: `PORT=${PLAYWRIGHT_PORT} npm run dev`,
        url: PLAYWRIGHT_BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },

    projects: [
        {
            name: 'mock',
            testMatch: /(?<!\.devnet|\.mobile)\.spec\.ts$/,
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'mock-mobile',
            testMatch: /\.mobile\.spec\.ts$/,
            // Pixel 5 uses Chromium — WebKit (iPhone 13) is unsupported on macOS 13.
            // Tests verify responsive layout, not browser engine — Chromium is correct.
            use: { ...devices['Pixel 5'] },
        },
        {
            name: 'devnet',
            testMatch: /\.(devnet|shared)\.spec\.ts$/,
            fullyParallel: false,
            workers: 1,
            use: { ...devices['Desktop Chrome'] },
        },
    ],
});
