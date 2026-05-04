import { Locator, Page, expect } from '@playwright/test';
import { canonicalizeAgreement, computeAgreementHash, type Agreement, type AgreementSection } from '../../lib/core/agreementManifest';

// ---------------------------------------------------------------------------
// Anvil test accounts (same mnemonic as devnet-multi-test.ts)
// ---------------------------------------------------------------------------

/** All five standard Anvil test accounts. Index 0 = buyer, 1-4 = sellers. */
export const ANVIL_ACCOUNTS = [
    '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', // [0] buyer
    '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', // [1] seller1
    '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', // [2] seller2
    '0x90F79bf6EB2c4f870365E785982E1f101E93b906', // [3] seller3
    '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65', // [4] seller4
] as const;

// Anvil default account[0] — matches inject-ethereum.js
export const DEVNET_ACCOUNT = ANVIL_ACCOUNTS[0];
export const DEFAULT_LOCAL_MOCK_TOKEN = '0x5FbDB2315678afecb367f032d93F642f64180aa3';

export async function clickWithRetry(locator: Locator, attempts = 5): Promise<void> {
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

export async function waitForDevnetWalletReady(page: Page) {
    await page.waitForFunction(
        () => {
            const bodyText = document.body.textContent || '';
            if (bodyText.includes('Connect wallet to view balances')) return false;

            const connectWalletButton = Array.from(document.querySelectorAll('button')).find(
                (button) => button.textContent?.trim() === 'Connect Wallet'
            );
            if (connectWalletButton) return false;

            const walletBalance = document.querySelector('[data-testid="wallet-balance"]');
            return walletBalance !== null;
        },
        null,
        { timeout: 30000 }
    );
}

export async function waitForWalletReady(page: Page): Promise<void> {
    await waitForDevnetWalletReady(page);
}

function selectorWithinScope(scopeTestId?: string, selector = '[data-testid="approval-status"]'): string {
    if (!scopeTestId) return selector;
    return `[data-testid="${scopeTestId}"] ${selector}`;
}

export async function waitForApprovalState(page: Page, scopeTestId?: string, timeout = 10000): Promise<void> {
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

export async function waitForCreateConfirm(page: Page): Promise<void> {
    // Tab-agnostic confirmation: order-node-* only appears on the Graph tab,
    // but the success paragraph and form reset happen on the Create Order tab
    // where submit was clicked. Treat any of these as success.
    await page.waitForFunction(
        () => {
            if (document.querySelectorAll('[data-testid^="order-node-"]').length > 0) return true;
            const bodyText = document.body.textContent || '';
            if (bodyText.includes('Commitment submitted successfully')) return true;
            if (bodyText.includes('Order confirmed on-chain')) return true;
            return false;
        },
        null,
        { timeout: 60000 }
    );
    await dismissConfirmationModal(page);
}

/**
 * Navigate to /discover (the buyer entry point) in mock mode and wait for
 * hydration. Use this in place of the old `gotoAssemblyMock(slug)` — the
 * `/i/[slug]` route was deleted 2026-05 in favour of purpose-shaped pages
 * (`/discover`, `/m/[merchant]`, `/orders`, `/inbox`).
 */
export async function gotoDiscoverMock(page: Page) {
    await page.goto('/discover?e2e=mock', { waitUntil: 'load' });
    await page.getByTestId('operator-card').first().waitFor({ timeout: 30000 });
    await page.waitForFunction(
        () => {
            const el = document.querySelector('[data-testid="operator-card"]');
            if (!el) return false;
            return Object.keys(el).some(k => k.startsWith('__reactFiber') || k.startsWith('__reactProps'));
        },
        { timeout: 5000 },
    ).catch(() => {});
}

/**
 * Navigate to /m/<merchantAddress> in mock mode. Used by buyer-shaped tests
 * that need the merchant detail surface (hero, menu, inline cart, place
 * order). Hydration wait keys off the merchant-detail-view testid.
 */
export async function gotoMerchantMock(page: Page, merchantAddress: string) {
    await page.goto(`/m/${merchantAddress}?e2e=mock`, { waitUntil: 'load' });
    await page.getByTestId('merchant-detail-view').waitFor({ timeout: 30000 });
    await page.waitForFunction(
        () => {
            const el = document.querySelector('[data-testid="merchant-detail-view"]');
            if (!el) return false;
            return Object.keys(el).some(k => k.startsWith('__reactFiber') || k.startsWith('__reactProps'));
        },
        { timeout: 5000 },
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

export async function gotoHome(page: Page, opts?: { mock?: boolean; devnet?: boolean }) {
    let url: string;
    if (opts?.mock) {
        url = '/terminal?e2e=mock';
    } else if (opts?.devnet) {
        // ?e2e=devnet triggers ClientInit auto-connect with the injected provider
        url = '/terminal?e2e=devnet';
    } else {
        url = '/terminal';
    }
    // If running in mock E2E mode, clear persisted app state to avoid rehydration races
    if (opts?.mock) {
        // Ensure script runs before any page scripts execute
        await page.addInitScript(() => {
            // Allow tests to simulate token allowances/approve
            // @ts-ignore
            window.__FIGARO_ALLOWANCES__ = window.__FIGARO_ALLOWANCES__ || {};
            // Mock approve function used by UI when running in E2E mock mode
            // @ts-ignore
            window.__FIGARO_MOCK_APPROVE__ = (token, amount) => {
                // store as lowercase address key
                // @ts-ignore
                window.__FIGARO_ALLOWANCES__[token.toLowerCase()] = amount;
                return Promise.resolve(true);
            };
        });
    }
    // Use 'load' instead of 'networkidle': in mock mode useProtocolFee polls
    // the RPC, keeping the network busy indefinitely and preventing networkidle
    // from ever firing.  The waitFor below is the real hydration guard.
    await page.goto(url, { waitUntil: 'load' });
    // Wait for Create Order heading to indicate hydration
    await page.getByTestId('create-order-heading').waitFor({ timeout: 15000 });

    if (opts?.devnet) {
        // Wait for the wallet to connect (ClientInit calls wagmi connect on mount).
        // The form remains disabled until required fields are filled, so wallet
        // readiness must be detected from connection-specific UI instead.
        await waitForDevnetWalletReady(page);

        await ensureWalletHasMockTokens(page);
    }
}

/**
 * Switch the terminal page to the Graph tab so OrderGraph renders (and
 * order-node-* elements become available). No-op if already active.
 */
export async function switchToGraphTab(page: Page): Promise<void> {
    const tab = page.getByRole('tab', { name: 'Graph' });
    if (!await tab.isVisible({ timeout: 1000 }).catch(() => false)) return;
    if ((await tab.getAttribute('aria-selected')) !== 'true') {
        await tab.click();
    }
    // OrderGraph is a `next/dynamic` import with ssr:false — the tabpanel
    // stays empty until the module resolves. Under parallel test load this
    // can lag past a subsequent waitForSelector. Wait for the ReactFlow
    // canvas (or the "no orders" placeholder) to appear before returning.
    await page.waitForFunction(
        () => {
            const panel = document.querySelector('#panel-graph');
            if (!panel) return false;
            return !!panel.querySelector('.react-flow, [data-testid="no-orders"], [data-testid^="order-node-"]');
        },
        null,
        { timeout: 15000 }
    ).catch(() => {});
}

/**
 * Switch to the Create Order tab (the default). Needed before interacting
 * with the order form or the OrderNodeSemanticCard (btn-add-suborder-* etc).
 */
export async function switchToOrdersTab(page: Page): Promise<void> {
    const tab = page.getByRole('tab', { name: 'Create Order' });
    if (!await tab.isVisible({ timeout: 1000 }).catch(() => false)) return;
    if ((await tab.getAttribute('aria-selected')) === 'true') return;
    await tab.click();
}

export async function fillCreateOrderForm(page: Page, counterparty: string, payment: string, origin?: string, destination?: string) {
    const counter = page.getByTestId('input-counterparty');
    await fillWithRetry(counter, counterparty);

    // Use default token if present
    const useDefault = page.getByTestId('btn-use-default-token');
    if (await useDefault.count()) await clickWithRetry(useDefault);
    const currencyInput = page.getByTestId('input-currency');
    if ((await currencyInput.inputValue().catch(() => '')) === '') {
        await fillWithRetry(currencyInput, DEFAULT_LOCAL_MOCK_TOKEN);
    }
    await expect(currencyInput).not.toHaveValue('', { timeout: 5000 });

    const pay = page.getByTestId('input-payment');
    await fillWithRetry(pay, payment);

    if (origin) {
        const o = page.getByTestId('manifest-input-origin');
        if (await o.count()) await fillWithRetry(o, origin);
    }

    if (destination) {
        const d = page.getByTestId('manifest-input-destination');
        if (await d.count()) await fillWithRetry(d, destination);
    }

    await page.waitForFunction(
        ({ expectedCounterparty, expectedPayment, expectedOrigin, expectedDestination }) => {
            const counterpartyInput = document.querySelector('[data-testid="input-counterparty"]') as HTMLInputElement | null;
            const paymentInput = document.querySelector('[data-testid="input-payment"]') as HTMLInputElement | null;
            const currencyInput = document.querySelector('[data-testid="input-currency"]') as HTMLInputElement | null;
            const originInput = document.querySelector('[data-testid="manifest-input-origin"]') as HTMLInputElement | null;
            const destinationInput = document.querySelector('[data-testid="manifest-input-destination"]') as HTMLInputElement | null;

            if (!counterpartyInput || counterpartyInput.value !== expectedCounterparty) return false;
            if (!paymentInput || paymentInput.value !== expectedPayment) return false;
            if (!currencyInput || !currencyInput.value.trim()) return false;
            if (expectedOrigin && (!originInput || originInput.value !== expectedOrigin)) return false;
            if (expectedDestination && (!destinationInput || destinationInput.value !== expectedDestination)) return false;

            return true;
        },
        {
            expectedCounterparty: counterparty,
            expectedPayment: payment,
            expectedOrigin: origin,
            expectedDestination: destination,
        },
        { timeout: 10000 }
    );
}

export async function submitFirstOrder(page: Page) {
    const submitBtn = page.getByTestId('btn-submit-order');
    // Button label is "Commit Order" (dual-signed commitment).
    // Click the submit button in all modes (mock and devnet).
    // In mock mode this triggers the useFigaroActions mock path which calls
    // setMockIsSuccess(true) → form reset → setMockApproved(false).
    // In devnet mode this opens the AgreementPreviewModal (pre-sign gate
    // landed in the Web2 audit Priority-4 fix); we auto-click "Confirm &
    // sign" to proceed to the wallet signing flow.
    // Callers are responsible for waiting for the resulting order node or
    // on-chain confirmation after this returns.
    await submitBtn.waitFor({ timeout: 30000 });
    await expect(submitBtn).toBeEnabled({ timeout: 15000 });
    await clickWithRetry(submitBtn);

    // Devnet pre-sign modal — only appears when a real signing flow runs.
    // Mock mode bypasses signing, so the modal won't show and we move on.
    const previewModal = page.getByTestId('agreement-preview-modal');
    try {
        await previewModal.waitFor({ state: 'visible', timeout: 5000 });
        await page.getByTestId('preview-confirm').click();
    } catch {
        // Modal didn't appear within 5s — mock mode or modal disabled.
    }
}

/**
 * Wait for firstOrder UI effects to land in devnet mode.
 *
 * The confirmation modal is a helpful signal when wagmi receipt polling is fast,
 * but it is not the protocol truth. Treat any of these as success:
 * 1. confirmation modal text appears
 * 2. create-order form resets after receipt processing
 * 3. order graph gains a node
 * 4. process list gains a wallet-visible order sub-item
 */
export async function waitForFirstOrderUiSync(page: Page, opts?: {
    previousNodeCount?: number;
    previousProcessOrderCount?: number;
}) {
    const previousNodeCount = opts?.previousNodeCount ?? 0;
    const previousProcessOrderCount = opts?.previousProcessOrderCount ?? 0;

    await page.waitForFunction(
        ({ nodeCount, processOrderCount }) => {
            const bodyText = document.body.textContent || '';
            if (bodyText.includes('Order confirmed on-chain!')) return true;

            const counterparty = document.querySelector('[data-testid="input-counterparty"]') as HTMLInputElement | null;
            const payment = document.querySelector('[data-testid="input-payment"]') as HTMLInputElement | null;
            if (counterparty && payment && counterparty.value === '' && payment.value === '') return true;

            const nodes = document.querySelectorAll('[data-testid^="order-node-"]').length;
            if (nodes > nodeCount) return true;

            const processOrders = document.querySelectorAll('[data-testid^="process-order-item-"]').length;
            if (processOrders > processOrderCount) return true;

            return false;
        },
        { nodeCount: previousNodeCount, processOrderCount: previousProcessOrderCount },
        { timeout: 60000 }
    );

    const okBtn = page.getByRole('button', { name: 'OK', exact: true });
    if (await okBtn.isVisible().catch(() => false)) {
        await okBtn.click({ timeout: 5000 }).catch(() => { });
        await okBtn.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => { });
    }
}

/** Dismiss the "Order confirmed on-chain!" modal if it is visible. */
export async function dismissConfirmationModal(page: Page) {
    const okBtn = page.getByRole('button', { name: 'OK', exact: true });
    if (await okBtn.isVisible().catch(() => false)) {
        await okBtn.click({ timeout: 5000 }).catch(() => { });
        await okBtn.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => { });
    }
}

/** Click the "+" button on the first Active order node to open the sub-order modal. */
export async function openSubOrderModal(page: Page) {
    // btn-add-suborder-* lives on OrderNodeSemanticCard, rendered in the
    // default "Create Order" tab — switch there if a graph-tab-focused test
    // left us elsewhere.
    const ordersTab = page.getByRole('tab', { name: 'Create Order' });
    if (await ordersTab.isVisible({ timeout: 1000 }).catch(() => false)) {
        if ((await ordersTab.getAttribute('aria-selected')) !== 'true') {
            await ordersTab.click();
        }
    }
    await page.locator('[data-testid^="btn-add-suborder-"]').first().waitFor({ timeout: 15000 });
    await page.locator('[data-testid^="btn-add-suborder-"]').first().click();
    // Wait for the modal to appear
    await page.getByTestId('suborder-modal').waitFor({ timeout: 10000 });
}

/** Fill the fields inside the sub-order modal (must be open first). */
export async function fillSubOrderModal(page: Page, seller: string, payment: string, origin?: string, destination?: string) {
    const modal = page.getByTestId('suborder-modal');
    await fillWithRetry(modal.getByTestId('suborder-input-counterparty'), seller);

    const useDefault = modal.getByTestId('suborder-btn-use-default-token');
    if (await useDefault.count()) await useDefault.click();

    await fillWithRetry(modal.getByTestId('suborder-input-payment'), payment);

    if (origin) await fillWithRetry(modal.getByTestId('manifest-input-origin'), origin);
    if (destination) await fillWithRetry(modal.getByTestId('manifest-input-destination'), destination);

    await page.waitForFunction(
        ({ expectedCounterparty, expectedPayment, expectedOrigin, expectedDestination }) => {
            const modalElement = document.querySelector('[data-testid="suborder-modal"]');
            if (!modalElement) return false;

            const counterpartyInput = modalElement.querySelector('[data-testid="suborder-input-counterparty"]') as HTMLInputElement | null;
            const paymentInput = modalElement.querySelector('[data-testid="suborder-input-payment"]') as HTMLInputElement | null;
            const originInput = modalElement.querySelector('[data-testid="manifest-input-origin"]') as HTMLInputElement | null;
            const destinationInput = modalElement.querySelector('[data-testid="manifest-input-destination"]') as HTMLInputElement | null;

            if (!counterpartyInput || counterpartyInput.value !== expectedCounterparty) return false;
            if (!paymentInput || paymentInput.value !== expectedPayment) return false;
            if (expectedOrigin && (!originInput || originInput.value !== expectedOrigin)) return false;
            if (expectedDestination && (!destinationInput || destinationInput.value !== expectedDestination)) return false;

            return true;
        },
        {
            expectedCounterparty: seller,
            expectedPayment: payment,
            expectedOrigin: origin,
            expectedDestination: destination,
        },
        { timeout: 10000 }
    );
}

/** Submit the sub-order modal (assumes modal is open, form filled, approved). */
export async function submitSubOrder(page: Page) {
    const modal = page.getByTestId('suborder-modal');
    const submitBtn = modal.getByTestId('suborder-btn-submit');
    await expect(submitBtn).toBeEnabled({ timeout: 10000 });
    // Use JS click: ManifestForm makes the SubOrderModal taller than the viewport,
    // so the submit button may be outside the visible area.
    await page.evaluate(() => {
        const m = document.querySelector('[data-testid="suborder-modal"]');
        const btn = m?.querySelector('[data-testid="suborder-btn-submit"]') as HTMLElement | null;
        btn?.click();
    });

    // Devnet pre-sign modal — sub-orders go through the same commit flow,
    // so the AgreementPreviewModal opens here too. Mock mode bypasses it.
    const previewModal = page.getByTestId('agreement-preview-modal');
    try {
        await previewModal.waitFor({ state: 'visible', timeout: 5000 });
        await page.getByTestId('preview-confirm').click();
    } catch {
        // Modal didn't appear within 5s — mock mode or modal disabled.
    }

    // Modal closing is the cross-tab signal that the sub-order was accepted.
    // (Previously this waited for order-node-* DOM count, which only exists on
    // the Graph tab — silently burning 30s on tests that submit from the
    // orders tab.)
    await modal.waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
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
        : '0x0000000000000000000000000000000000000000';

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
                schema: 'figaro-geo-v1',
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

/** @deprecated The live kernel has no Pending state. Use injectActiveOrder instead. */
export const injectPendingOrder = injectActiveOrder;

/**
 * @deprecated Orders are Active at commit time. No accept step needed.
 * Preserved as a no-op for backward compatibility during migration.
 */
export async function acceptOrderMock(page: Page, orderId: string): Promise<void> {
    // Orders are Active immediately after commit in mock mode — mockEmitOrder
    // is synchronous, so the store is already authoritative. If the Graph tab
    // is visible we verify the rendered node too; otherwise the DOM check is
    // a no-op and we trust the store.
    await page.waitForFunction(
        (id) => {
            const node = document.querySelector(`[data-testid="order-node-${id}"]`);
            if (!node) return true;
            return node.getAttribute('data-order-state') === 'active';
        },
        orderId,
        { timeout: 10000 }
    );
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
