import { defineConfig, devices } from '@playwright/test';

const PLAYWRIGHT_PORT = Number(process.env.PLAYWRIGHT_PORT ?? '3000');
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
