/**
 * Extended Playwright test fixtures for multi-wallet devnet tests.
 *
 * Injects the multi-account EIP-1193 provider (inject-ethereum-multi.js) which
 * exposes window.__FIGARO_SWITCH_ACCOUNT__(address) for wallet switching.
 *
 * Usage in tests:
 *   import { test, expect, ANVIL_ACCOUNTS, switchAccount } from './devnet-multi-test';
 *
 *   test('seller accepts offer', async ({ page, context }) => {
 *       // page starts as account[0] (buyer)
 *       const sellerPage = await openAsAccount(context, ANVIL_ACCOUNTS[1]);
 *       ...
 *   });
 */
import path from 'path';
import { test as base, expect, Browser, BrowserContext, Page } from '@playwright/test';
import { ensureWalletHasMockTokens } from './test-helpers';

const multiInjectPath = path.resolve(__dirname, './fixtures/inject-ethereum-multi.js');

/** All five standard Anvil test accounts (index 0–4). */
export const ANVIL_ACCOUNTS = [
    '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', // [0] buyer (default)
    '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', // [1] seller1
    '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', // [2] seller2
    '0x90F79bf6EB2c4f870365E785982E1f101E93b906', // [3] seller3
    '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65', // [4] seller4
] as const;

export type AnvilAccount = typeof ANVIL_ACCOUNTS[number];

// Re-export expect for convenience
export { expect };

/**
 * Custom test fixture: injects the multi-account provider on the default page,
 * which starts as account[0] (buyer).
 */
export const test = base.extend<{ page: Page }>({
    page: async ({ page }, use) => {
        await page.addInitScript({ path: multiInjectPath });
        await use(page);
    },
});

/**
 * Open a NEW page in the given browser context pre-configured for a specific
 * Anvil account.  The page has the multi-wallet provider injected and the
 * active account set to `account` before any page scripts execute.
 *
 * Call `await page.goto(url)` after this to navigate.
 */
export async function openAsAccount(context: BrowserContext, account: string): Promise<Page> {
    const p = await context.newPage();
    // 1. Inject the multi-wallet provider (sets account to default [0] first)
    await p.addInitScript({ path: multiInjectPath });
    // 2. Override to the desired account before page scripts run
    await p.addInitScript((addr: string) => {
        // __FIGARO_SWITCH_ACCOUNT__ is exposed by inject-ethereum-multi.js
        // which runs first (scripts execute in registration order)
        if (typeof (window as any).__FIGARO_SWITCH_ACCOUNT__ === 'function') {
            (window as any).__FIGARO_SWITCH_ACCOUNT__(addr);
        }
    }, account);

    return p;
}

/**
 * Switch the active account on an already-loaded page.
 * wagmi picks up the change via the EIP-1193 `accountsChanged` event.
 *
 * After switching, the caller may need to wait for the UI to reflect the new
 * wallet (e.g. wait for connect button to disappear or address badge to update).
 */
export async function switchAccount(page: Page, account: string): Promise<void> {
    await page.evaluate((addr: string) => {
        (window as any).__FIGARO_SWITCH_ACCOUNT__(addr);
    }, account);

    await page.waitForFunction(
        (addr: string) => {
            const normalized = addr.toLowerCase();
            const providerAccount = (window as any).__FIGARO_GET_ACCOUNT__?.();
            if (typeof providerAccount !== 'string' || providerAccount.toLowerCase() !== normalized) {
                return false;
            }

            const balanceEl = document.querySelector('[data-testid="wallet-balance"]');
            const addressEl = balanceEl?.parentElement?.querySelector('.font-mono.truncate');
            return !!addressEl?.textContent?.toLowerCase().includes(normalized);
        },
        account,
        { timeout: 15000 }
    );

    await ensureWalletHasMockTokens(page);
}
