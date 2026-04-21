/**
 * Custom Playwright test that injects a window.ethereum provider pointing at
 * Anvil before any page scripts run. Import `test` and `expect` from this
 * module instead of '@playwright/test' in all *.devnet.spec.ts files.
 *
 * This is the ONLY place the injector path is referenced — update it here if
 * the fixture file moves.
 */
import path from 'path';
import { test as base, expect, Page } from '@playwright/test';

const injectEthereumPath = path.resolve(__dirname, './fixtures/inject-ethereum.js');

// Override the built-in `page` fixture to inject window.ethereum before any
// page scripts load. All *.devnet.spec.ts files should import from here.
export const test = base.extend<{ page: Page }>({
    page: async ({ page }, use) => {
        // Inject the EIP-1193 provider that proxies to Anvil via /rpc
        await page.addInitScript({ path: injectEthereumPath });
        await use(page);
    },
});

export { expect };
