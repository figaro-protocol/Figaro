/**
 * Unified Playwright test fixture for shared specs that run in both mock
 * and devnet projects.
 *
 * Auto-detects mode from the active Playwright project name:
 *   - project "devnet" → injects window.ethereum provider, `figaroMode = 'devnet'`
 *   - any other project → no provider, `figaroMode = 'mock'`
 *
 * Usage:
 *   import { test, expect, COUNTERPARTY } from './figaro-test';
 *
 *   test('shared validation', async ({ page, figaroMode }) => {
 *       await gotoHome(page, { mock: figaroMode === 'mock', devnet: figaroMode === 'devnet' });
 *       await fillCreateOrderForm(page, COUNTERPARTY[figaroMode], '0.01');
 *       ...
 *   });
 */
import path from 'path';
import { test as base, expect, Page } from '@playwright/test';

export type FigaroMode = 'mock' | 'devnet';

const injectEthereumPath = path.resolve(__dirname, './fixtures/inject-ethereum.js');

export const test = base.extend<{ figaroMode: FigaroMode }>({
    figaroMode: async ({ }, use, testInfo) => {
        const mode: FigaroMode = testInfo.project.name === 'devnet' ? 'devnet' : 'mock';
        await use(mode);
    },
    page: async ({ page, figaroMode }, use) => {
        if (figaroMode === 'devnet') {
            await page.addInitScript({ path: injectEthereumPath });
        }
        await use(page);
    },
});

export { expect };

/** Mode-aware counterparty addresses for shared tests. */
export const COUNTERPARTY = {
    mock: '0x000000000000000000000000000000000000dEaD',
    devnet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', // Anvil account[1]
} as const;
