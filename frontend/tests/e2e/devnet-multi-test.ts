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
import { ensureWalletHasMockTokens, ANVIL_ACCOUNTS } from './test-helpers';
import { hexEqual } from '../../lib/shared/evm';

const multiInjectPath = path.resolve(__dirname, './fixtures/inject-ethereum-multi.js');

export { ANVIL_ACCOUNTS };
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
 * Pre-set the active EIP-1193 account on the default page fixture
 * BEFORE page scripts run, then navigate. The fixture has already
 * injected `inject-ethereum-multi.js` which exposes
 * `__FIGARO_SWITCH_ACCOUNT__`; this helper schedules another init
 * script that calls it with the target account, so wagmi mounts
 * already-connected to that account (rather than mounting as anvil[0]
 * and then receiving an `accountsChanged` event).
 *
 * Use this when a test exercises a wallet OTHER than the default
 * buyer (anvil[0]) — e.g. seller-side `/orders/[processId]`,
 * spectator views, or the merchant `/inbox`. Mirrors the inline
 * pattern from `inbox.devnet.spec.ts` lifted into a reusable helper.
 *
 * Defaults `waitUntil` to `domcontentloaded`; full `load` collides
 * with Next.js dev-server cold-compile races (see
 * `reference_e2e_flake_patterns.md` #7).
 */
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

/**
 * Pre-inject a CommitmentPayload into the mock CoordinationChannel's
 * localStorage so the seller's `/inbox` `subscribeAnyCommitmentPayload`
 * picks it up as a pending order when the page mounts. Simulates an
 * XMTP arrival in devnet mode (`?e2e=devnet` triggers the mock channel
 * per `lib/handoff/channel.ts:172-178`).
 *
 * Storage key + message shape mirror `lib/handoff/mockChannel.ts:23`
 * (`__FIGARO_COORDINATION_MOCK_MESSAGES__`) — when the inbox's
 * subscriber registers, `onAnyCommitmentPayload` replays
 * already-persisted COMMITMENT_PAYLOAD entries via queueMicrotask, so a
 * test that writes the entry BEFORE navigation sees the pending card
 * render on mount.
 *
 * The MerchantInbox subscriber filters by `payload.commitment.seller
 * === address` (MerchantInbox.tsx:174) — pass a `commitment` whose
 * `seller` matches the wallet the page is connected as.
 *
 * Phase 2 C1 will exercise this for real; Phase 0 only ships the
 * helper.
 */
export async function simulateXmtpCommitmentArrival(
    page: Page,
    opts: {
        orderId: string;
        /** JSON-serializable payload — the inbox's deserializer expects a
         *  CommitmentPayload (`useCommitmentFlow.ts:124-130`). The minimum
         *  fields the inbox checks are `commitment.buyer` and
         *  `commitment.seller`. */
        payload: Record<string, unknown>;
        /** Sender wallet (buyer in the typical flow). */
        senderIdentity: string;
    },
): Promise<void> {
    const MOCK_STORAGE_KEY = '__FIGARO_COORDINATION_MOCK_MESSAGES__';
    const message = {
        type: 'COMMITMENT_PAYLOAD' as const,
        orderId: opts.orderId,
        payloadJson: JSON.stringify(opts.payload),
        ts: Date.now(),
        senderIdentity: opts.senderIdentity,
    };

    await page.addInitScript(
        ({ storageKey, msg }) => {
            try {
                const raw = window.localStorage.getItem(storageKey);
                const existing = raw ? (JSON.parse(raw) as unknown[]) : [];
                window.localStorage.setItem(storageKey, JSON.stringify([...existing, msg]));
            } catch {
                // localStorage unavailable — silent; the test assertion
                // will fail downstream with a clearer signal than a
                // pre-page-load exception here.
            }
        },
        { storageKey: MOCK_STORAGE_KEY, msg: message },
    );
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
            if (typeof providerAccount !== 'string' || !hexEqual(providerAccount, addr)) {
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
