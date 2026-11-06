/**
 * Extended Playwright test fixtures for multi-wallet devnet tests.
 *
 * Injects the multi-account EIP-1193 provider (inject-ethereum-multi.js) which
 * exposes window.__FIGARO_SWITCH_ACCOUNT__(address) for wallet switching.
 *
 * Usage in tests:
 *   import { test, expect, ANVIL_ACCOUNTS, gotoAsWallet } from './devnet-multi-test';
 *
 *   test('seller accepts offer', async ({ page }) => {
 *       // page starts as account[0] (buyer)
 *       await gotoAsWallet(page, ANVIL_ACCOUNTS[1].address, '/orders');
 *       ...
 *   });
 */
import fs from 'fs';
import path from 'path';
import { test as base, expect, Browser, BrowserContext, Page } from '@playwright/test';
import { ANVIL_ACCOUNTS } from './test-helpers';

const multiInjectPath = path.resolve(__dirname, './fixtures/inject-ethereum-multi.js');

export { ANVIL_ACCOUNTS };
type AnvilAccount = typeof ANVIL_ACCOUNTS[number];

// Re-export expect for convenience
export { expect };

/**
 * Custom test fixture: injects the multi-account provider on the default page,
 * which starts as account[0] (buyer).
 */
export const test = base.extend<{ page: Page }>({
    page: async ({ page }, use) => {
        await page.addInitScript({ path: multiInjectPath });
        attachConsoleCapture(page);
        await use(page);
    },
});

/**
 * Opt-in browser-console capture for a failing flow: with
 * `FIGARO_E2E_CONSOLE=<file>` set, every console message and page error the
 * page emits is appended to that file, prefixed by the test title, so a hang
 * that the UI shows as "Submitting…" can be read from the page's own words.
 * The listeners go on the page object the fixture hands out, which is the
 * one `gotoAsWallet` navigates, so a wallet switch loses nothing.
 */
function attachConsoleCapture(page: Page): void {
    const file = process.env.FIGARO_E2E_CONSOLE;
    if (!file) return;
    const title = base.info().title;
    const write = (line: string) => fs.appendFileSync(file, `[${title}] ${line}\n`);
    page.on('console', (m) => write(`console.${m.type()}: ${m.text()}`));
    page.on('pageerror', (e) => write(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => write(`requestfailed: ${r.method()} ${r.url()} ${r.failure()?.errorText ?? ''}`));
}



/**
 * Pre-set the active EIP-1193 account on the default page fixture
 * BEFORE page scripts run, then navigate. The fixture has already
 * injected `inject-ethereum-multi.js` which exposes
 * `__FIGARO_SWITCH_ACCOUNT__`; this helper schedules another init
 * script that calls it with the target account, so wagmi mounts
 * already-connected to that account (rather than mounting as anvil[0]
 * and then receiving an `accountsChanged` event).
 *
 * Use this when a test exercises a wallet OTHER than the default
 * buyer (anvil[0]) — e.g. seller-side `/orders/view`,
 * spectator views, or the seller's `/orders` view. Mirrors an inline
 * pattern lifted into a reusable helper.
 *
 * Defaults `waitUntil` to `domcontentloaded`; full `load` collides
 * with Next.js dev-server cold-compile races (see
 * `reference_e2e_flake_patterns.md` #7).
 */
/**
 * A SECOND tab in the SAME browser context — shares origin + localStorage
 * (the mock coordination bus), with the multi-account provider injected so
 * `gotoAsWallet` works on it. Concurrent-party specs (the dispatch race)
 * keep one tab per wallet alive simultaneously.
 */
export async function newWalletPage(context: BrowserContext): Promise<Page> {
    const p = await context.newPage();
    await p.addInitScript({ path: multiInjectPath });
    return p;
}

export async function gotoAsWallet(
    page: Page,
    walletAddress: string,
    path: string,
    opts: { waitUntil?: 'load' | 'domcontentloaded' } = {},
): Promise<void> {
    await page.addInitScript((addr: string) => {
        if (typeof (window as any).__FIGARO_SWITCH_ACCOUNT__ === 'function') {
            (window as any).__FIGARO_SWITCH_ACCOUNT__(addr);
        }
    }, walletAddress);
    await page.goto(path, { waitUntil: opts.waitUntil ?? 'domcontentloaded' });
}


