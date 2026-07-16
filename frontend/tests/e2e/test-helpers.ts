import { Page } from '@playwright/test';
import { ANVIL_ACCOUNTS } from '../anvilAccounts';

export { ANVIL_ACCOUNTS };

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
    try {
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
        );
    } catch {
        // THROW — never swallow. This helper previously ended in `.catch(() => {})`,
        // so a page that never hydrated returned success and the spec clicked a dead
        // button: the assertion after it either flaked or passed vacuously, and the
        // helper existing at all implied a guarantee it did not give. A hydration
        // timeout is a real failure — of the app, the selector, or the fixture — and
        // the caller must see it.
        const present = await page.locator(selector).count().catch(() => 0);
        throw new Error(
            `waitForReactHydration: "${selector}" did not hydrate within ${timeout}ms ` +
            `(${present} element(s) matched the selector in the DOM). ` +
            `${present === 0
                ? 'Nothing matched — the selector is wrong, or the page never rendered it.'
                : 'It rendered but React never attached — the page likely errored during hydration; check the browser console.'}`,
        );
    }
}
