import { Page } from '@playwright/test';
import { ANVIL_ACCOUNTS } from '../anvilAccounts';

export { ANVIL_ACCOUNTS };

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
