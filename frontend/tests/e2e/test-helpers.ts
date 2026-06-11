import { Locator, Page, expect } from '@playwright/test';
import { canonicalizeAgreement, computeAgreementHash, type Agreement, type AgreementSection } from '../../lib/core/agreement';
import { ZERO_ADDRESS } from '../../lib/shared/evm';
import { ANVIL_ACCOUNTS, DEFAULT_LOCAL_MOCK_TOKEN } from '../anvilAccounts';

export { ANVIL_ACCOUNTS,  };

async function clickWithRetry(locator: Locator, attempts = 5): Promise<void> {
    let lastError: unknown;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            await locator.waitFor({ state: 'visible', timeout: 15000 });
            await locator.click();
            return;
        } catch (error) {
            lastError = error;
            await locator.page().waitForTimeout(250);
        }
    }

    throw lastError;
}


function parseDisplayedBalance(text: string | null | undefined): number {
    if (!text) return 0;
    const numeric = Number.parseFloat(text.replace(/[^0-9.]/g, ''));
    return Number.isFinite(numeric) ? numeric : 0;
}

export async function ensureWalletHasMockTokens(page: Page, minimumBalance = 1) {
    const balanceEl = page.getByTestId('wallet-balance');
    await expect(balanceEl).toBeVisible({ timeout: 15000 });

    const currentBalance = parseDisplayedBalance(await balanceEl.innerText().catch(() => '0'));
    if (currentBalance >= minimumBalance) return;

    const mintButton = page.getByTestId('btn-mint-tokens');
    await mintButton.waitFor({ timeout: 15000 });
    await clickWithRetry(mintButton);

    await page.waitForFunction(
        (minBalance) => {
            const el = document.querySelector('[data-testid="wallet-balance"]');
            const text = el?.textContent || '';
            const numeric = Number.parseFloat(text.replace(/[^0-9.]/g, ''));
            return Number.isFinite(numeric) && numeric >= minBalance;
        },
        minimumBalance,
        { timeout: 30000 }
    );
}

/**
 * Canonical wallet-readiness wait — DOM-free and page-agnostic.
 *
 * Reads `window.__FIGARO_WALLET__`, which `ClientInit` publishes live from
 * wagmi's own `useAccount()` / `useChainId()` in `?e2e=devnet` mode. This
 * is the single primitive for "the injected wallet is connected": it does
 * NOT scrape the header for a `wallet-balance` element, so it works on
 * every route regardless of what chrome the page renders.
 *
 * Pass `expectedAddress` to also assert wagmi connected as that specific
 * account — use it after `gotoAsWallet`.
 */
export async function waitForWalletConnected(
    page: Page,
    expectedAddress?: string,
    opts: { timeout?: number } = {},
): Promise<void> {
    await page.waitForFunction(
        (expected: string | null) => {
            const state = window.__FIGARO_WALLET__;
            if (!state || !state.isConnected || !state.address) return false;
            if (!expected) return true;
            return state.address.toLowerCase() === expected.toLowerCase();
        },
        expectedAddress ?? null,
        { timeout: opts.timeout ?? 30000 },
    );
}



function selectorWithinScope(scopeTestId?: string, selector = '[data-testid="approval-status"]'): string {
    if (!scopeTestId) return selector;
    return `[data-testid="${scopeTestId}"] ${selector}`;
}

async function waitForApprovalState(page: Page, scopeTestId?: string, timeout = 10000): Promise<void> {
    const statusSelector = selectorWithinScope(scopeTestId);
    try {
        await page.waitForFunction((selector: string) => {
            const el = document.querySelector(selector);
            if (!el) return true;
            const text = el.textContent || '';
            return text.includes('Authorized') || text.includes('Authorization needed');
        }, statusSelector, { timeout });
    } catch {
        return;
    }
}

async function waitForApproved(page: Page, scopeTestId?: string, timeout = 30000): Promise<void> {
    const statusSelector = selectorWithinScope(scopeTestId);
    await page.waitForFunction(
        (selector: string) => document.querySelector(selector)?.textContent?.includes('Authorized') ?? false,
        statusSelector,
        { timeout }
    );
}


async function approveIfNeeded(page: Page, scopeTestId?: string): Promise<void> {
    await waitForApprovalState(page, scopeTestId);
    const scope = scopeTestId ? page.getByTestId(scopeTestId) : page;
    const approvalStatus = scope.getByTestId('approval-status');
    if (!await approvalStatus.count()) return;
    const statusText = await approvalStatus.innerText().catch(() => '');
    if (!statusText.includes('Authorization needed')) return;
    const approveBtn = scope.getByTestId('approve-button');
    if (!await approveBtn.count()) return;
    await approveBtn.click();
    await waitForApproved(page, scopeTestId, 60000);
}


/**
 * Wait for a React-rendered element to be hydrated. The signal is the
 * presence of a `__reactFiber` / `__reactProps` key on the DOM node;
 * React attaches these during hydration, so their presence proves the
 * element's event handlers are active and the element is ready to
 * receive synthetic clicks.
 *
 * Use this before clicking any `"use client"` button that was reached
 * via `goto` (which only waits for the `load` event, not hydration).
 * Pre-hydration clicks land focus on the button but don't fire the
 * React `onClick` — a common flake pattern documented in
 * `~/.claude/projects/-Users-adaliana-Figaro/memory/reference_e2e_flake_patterns.md`.
 */
export async function waitForReactHydration(
    page: Page,
    selector: string,
    timeout = 10000,
): Promise<void> {
    await page.waitForFunction(
        (sel: string) => {
            const el = document.querySelector(sel);
            if (!el) return false;
            return Object.keys(el).some(
                (k) => k.startsWith('__reactFiber') || k.startsWith('__reactProps'),
            );
        },
        selector,
        { timeout },
    ).catch(() => {});
}
