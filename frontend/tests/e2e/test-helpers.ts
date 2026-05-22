import { Locator, Page, expect } from '@playwright/test';
import { canonicalizeAgreement, computeAgreementHash, type Agreement, type AgreementSection } from '../../lib/core/agreementManifest';
import { ZERO_ADDRESS } from '../../lib/shared/evm';
import { ANVIL_ACCOUNTS, DEFAULT_LOCAL_MOCK_TOKEN } from '../anvilAccounts';

export { ANVIL_ACCOUNTS, DEFAULT_LOCAL_MOCK_TOKEN };

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

export async function fillWithRetry(locator: Locator, value: string, attempts = 5): Promise<void> {
    let lastError: unknown;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            await locator.waitFor({ state: 'visible', timeout: 15000 });
            await locator.fill(value);
            await expect(locator).toHaveValue(value, { timeout: 5000 });
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
 * account — use it after `gotoAsWallet` / `switchAccount`.
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

/** @deprecated Thin alias for {@link waitForWalletConnected} — new specs should call that directly. */
export async function waitForDevnetWalletReady(page: Page): Promise<void> {
    await waitForWalletConnected(page);
}

/** @deprecated Thin alias for {@link waitForWalletConnected}. */
export async function waitForWalletReady(page: Page): Promise<void> {
    await waitForWalletConnected(page);
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

export async function waitForApproved(page: Page, scopeTestId?: string, timeout = 30000): Promise<void> {
    const statusSelector = selectorWithinScope(scopeTestId);
    await page.waitForFunction(
        (selector: string) => document.querySelector(selector)?.textContent?.includes('Authorized') ?? false,
        statusSelector,
        { timeout }
    );
}

/**
 * Wait for at least `minCount` order-node-* nodes to render in the
 * process graph. Used after multi-order commits / injections where the
 * caller needs to know "all expected nodes have hydrated" before
 * asserting on their state.
 */
export async function waitForOrderNodeCount(
    page: Page,
    minCount: number,
    timeout = 10000,
): Promise<void> {
    await page.waitForFunction(
        (count: number) =>
            document.querySelectorAll('[data-testid^="order-node-"]').length >= count,
        minCount,
        { timeout },
    );
}

/** Canonical mock-mode test addresses. The mock kernel doesn't care
 *  about these (no signature verification); they're just stable
 *  identifiers for assertions. `figaro-test.ts` re-exports MOCK_BUYER
 *  as `COUNTERPARTY.mock` so shared tests can use it via the
 *  figaroMode-aware dispatch. */
export const MOCK_BUYER = '0x000000000000000000000000000000000000dEaD';
export const MOCK_SELLER = '0x000000000000000000000000000000000000b00b';

export async function approveIfNeeded(page: Page, scopeTestId?: string): Promise<void> {
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

export async function waitAndApproveIfNeeded(page: Page): Promise<void> {
    await approveIfNeeded(page);
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
 * `~/.claude/projects/-Users-adaliana-Figaro-Prototype2/memory/reference_e2e_flake_patterns.md`.
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

/**
 * Navigate to /inbox in mock mode (merchant entry point).
 */
export async function gotoInboxMock(page: Page) {
    await page.goto('/inbox?e2e=mock', { waitUntil: 'load' });
    await page.getByTestId('merchant-inbox').waitFor({ timeout: 30000 });
}

export async function clickByTestId(page: Page, testId: string) {
    await clickWithRetry(page.getByTestId(testId));
}




// ---------------------------------------------------------------------------
// Lifecycle helpers (acceptOffer / resolveProcess / withdraw — mock mode)
// ---------------------------------------------------------------------------

/**
 * Wait for the mock test harness (window.__FIGARO_MOCK__) to become available.
 * It is exposed by OrderGraph in a useEffect so it appears shortly after mount.
 */
export async function waitForMockHarness(page: Page): Promise<void> {
    await page.waitForFunction(
        () => typeof (window as any).__FIGARO_MOCK__ !== 'undefined',
        null,
        { timeout: 15000 }
    );
}

/**
 * Inject an Active order directly into the mock event store, bypassing the UI.
 * Orders are Active at commit time (dual-signed). No Pending state.
 *
 * Returns the order id string (stringified BigInt) so callers can reference the node.
 */
export async function injectActiveOrder(
    page: Page,
    opts: {
        processId: string;
        id?: string;           // bigint as string, defaults to Date.now()
        buyer?: string;
        seller?: string;
        payment?: string;      // bigint as string, defaults to '10000000000000000'
        currency?: string;
        manifest?: string;     // hex bytes, e.g. from encodeManifest
    }
): Promise<string> {
    await waitForMockHarness(page);
    const id = opts.id ?? String(Date.now() + Math.floor(Math.random() * 10000));
    const buyer = (opts.buyer ?? '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266') as `0x${string}`;
    const seller = (opts.seller ?? '0x70997970C51812dc3A010C7d01b50e0d17dc79C8') as `0x${string}`;
    const payment = opts.payment ?? '10000000000000000';
    const paymentBigInt = BigInt(payment);
    const orderCurrency = opts.currency && opts.currency.trim().length > 0
        ? opts.currency as `0x${string}`
        : ZERO_ADDRESS;

    let agreementHash = opts.manifest ?? '';
    let serializedAgreement: string | null = null;

    const manifestFields = parseMockManifestFields(opts.manifest);
    if (manifestFields) {
        const sections: AgreementSection[] = [
            {
                schema: 'figaro-commerce-v1',
                data: {
                    currency: orderCurrency,
                    payment,
                    lineItems: [],
                },
            },
            {
                schema: 'figaro-geo-v2',
                data: {
                    originGeohash: manifestFields.origin ?? '',
                    destinationGeohash: manifestFields.destination ?? '',
                    massGrams: manifestFields.massGrams,
                    volumeMl: manifestFields.volumeMl,
                    classOfService: manifestFields.classOfService ?? 'S',
                },
            },
            {
                schema: 'figaro-topology-v1',
                data: {
                    topologyMode: 'root',
                    parentOrderHashes: [],
                },
            },
        ].sort((left, right) => left.schema.localeCompare(right.schema));

        const agreement: Agreement = {
            version: 'a1',
            buyer,
            seller,
            sections,
        };

        agreementHash = computeAgreementHash(agreement);
        serializedAgreement = canonicalizeAgreement(agreement);
    }

    await page.evaluate(({ processId, id, buyer, seller, payment, currency, agreementHash, serializedAgreement }) => {
        if (agreementHash && serializedAgreement) {
            localStorage.setItem(`figaro:agreement:${agreementHash}`, serializedAgreement);
        }

        // OrderState.Active = 0. Note: `id` is stringified per the Order
        // interface in lib/core/store (id: string). Earlier versions of
        // this helper wrote BigInt, which works for testid coercion but
        // breaks any consumer that calls .slice / string methods on it
        // (e.g., the /financials page's shortHash helper).
        (window as any).__FIGARO_MOCK__.emitOrder({
            id: String(BigInt(id)),
            processId,
            buyer,
            seller,
            currency,
            agreementHash,
            cumulativeValue: BigInt(payment),
            payment: BigInt(payment),
            state: 0, // Active
            sellerBond: BigInt(payment) * 2n,
            buyerBond: BigInt(payment) * 2n,
            parentOrderIds: [],
            timestamp: Date.now(),
        });
    }, { processId: opts.processId, id, buyer, seller, payment, currency: orderCurrency, agreementHash, serializedAgreement });
    return id;
}

function decodeMockManifestText(manifest: string | undefined): string | null {
    if (!manifest || !manifest.startsWith('0x') || manifest.length <= 2) return null;

    try {
        return Buffer.from(manifest.slice(2), 'hex').toString('utf8').replace(/\0+$/g, '').trim() || null;
    } catch {
        return null;
    }
}

function parseMassToGrams(value: string | undefined): number {
    if (!value?.trim()) return 0;
    const normalized = value.trim().toLowerCase();
    const numeric = Number.parseFloat(normalized);
    if (!Number.isFinite(numeric)) return 0;
    if (normalized.includes('kg')) return Math.round(numeric * 1000);
    if (normalized.includes('lb')) return Math.round(numeric * 453.592);
    if (normalized.includes('oz')) return Math.round(numeric * 28.3495);
    return Math.round(numeric);
}

function parseVolumeToMl(value: string | undefined): number {
    if (!value?.trim()) return 0;
    const normalized = value.trim().toLowerCase();
    const numeric = Number.parseFloat(normalized);
    if (!Number.isFinite(numeric)) return 0;
    if (normalized.includes('gal')) return Math.round(numeric * 3785.41);
    if (normalized.includes('l') && !normalized.includes('ml')) return Math.round(numeric * 1000);
    return Math.round(numeric);
}

function parseMockManifestFields(manifest: string | undefined): {
    origin?: string;
    destination?: string;
    massGrams?: number;
    volumeMl?: number;
    classOfService?: string;
} | null {
    const decoded = decodeMockManifestText(manifest);
    if (!decoded) return null;

    if (!decoded.includes(':')) {
        const [origin, destination] = decoded.split('|').map((value) => value.trim()).filter(Boolean);
        if (!origin && !destination) return null;
        return { origin, destination };
    }

    const fields = decoded.split('|').reduce<Record<string, string>>((acc, entry) => {
        const [rawKey, ...rest] = entry.split(':');
        const key = rawKey?.trim().toLowerCase();
        const value = rest.join(':').trim();
        if (key && value) acc[key] = value;
        return acc;
    }, {});

    const origin = fields.o ?? fields.origin;
    const destination = fields.d ?? fields.destination;
    const massGrams = parseMassToGrams(fields.mass);
    const volumeMl = parseVolumeToMl(fields.vol ?? fields.volume);
    const classOfService = fields.class ?? fields.class_;

    if (!origin && !destination && !massGrams && !volumeMl && !classOfService) {
        return null;
    }

    return {
        origin,
        destination,
        massGrams: massGrams || undefined,
        volumeMl: volumeMl || undefined,
        classOfService,
    };
}

/**
 * Click the "Resolve Process" button in mock mode.
 * Waits for all visible order nodes to transition to Resolved.
 */
export async function resolveProcessMock(page: Page): Promise<void> {
    const btn = page.getByTestId('btn-resolve-process');
    await btn.waitFor({ timeout: 10000 });
    // executeTransactionCapabilityAction guards resolve-process behind a
    // window.confirm(). In Playwright, unhandled dialogs default to dismissed
    // and the handler returns early — auto-accept once per click.
    page.once('dialog', dialog => { void dialog.accept(); });
    await btn.click();
    // Wait until all order nodes report resolved state. If the Graph tab
    // isn't active the nodes aren't in the DOM — mockResolveProcess is
    // synchronous so the store is authoritative regardless.
    await page.waitForFunction(
        () => {
            const nodes = Array.from(document.querySelectorAll('[data-testid^="order-node-"]'));
            if (nodes.length === 0) return true;
            return nodes.every(n => n.getAttribute('data-order-state') === 'resolved');
        },
        null,
        { timeout: 10000 }
    );
}
