/**
 * operators-onboarding.devnet.spec.ts
 *
 * Devnet tests for /operators — operator registration and lifecycle.
 *
 * Requires: Anvil + deploy-local.sh completed (OperatorRegistry deployed).
 * IPFS publish is intercepted via page.route() so a local IPFS node is NOT required.
 *
 * The lifecycle describe block runs serially; chain state accumulates across
 * tests so each step starts from the state left by the previous step.
 */
import { expect, type Page } from '@playwright/test';
import { test } from './devnet-multi-test';
import { evmSnapshot, evmRevert } from './devnet-helpers';

const MOCK_CID = 'QmOperatorE2EDevnetPlaceholder';

async function mockIpfsRoute(page: Page): Promise<void> {
    await page.route('http://127.0.0.1:5001/api/v0/add**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ Hash: MOCK_CID }),
        });
    });
}

async function gotoOperators(page: Page): Promise<void> {
    await mockIpfsRoute(page);
    await page.goto('/operators?e2e=devnet', { waitUntil: 'load' });
}

test.describe.configure({ mode: 'serial' });

let rootSnapshot: string;
test.beforeAll(async () => {
    rootSnapshot = await evmSnapshot();
});
test.afterAll(async () => {
    if (rootSnapshot) await evmRevert(rootSnapshot);
});

// ── Wallet connection ─────────────────────────────────────────────────────────

test.describe('/operators — wallet connected (devnet)', () => {
    test('shows the registration form when wallet is connected', async ({ page }) => {
        await gotoOperators(page);

        // Registration form shows — wallet connected, not yet registered
        await expect(page.getByPlaceholder('e.g. your service name')).toBeVisible({ timeout: 30000 });
        await expect(page.getByText('Connect your wallet to continue')).not.toBeVisible();
    });
});

// ── Registration → deactivate → reactivate (sequential chain) ─────────────────

test.describe('/operators — registration lifecycle (devnet)', () => {
    test.setTimeout(120000);

    let suiteSnapshot: string;
    test.beforeAll(async () => {
        suiteSnapshot = await evmSnapshot();
    });
    test.afterAll(async () => {
        if (suiteSnapshot) await evmRevert(suiteSnapshot);
    });

    // 1. Register (account[0] starts unregistered)
    test('registers a new operator and shows success state', async ({ page }) => {
        await gotoOperators(page);
        await page.getByPlaceholder('e.g. your service name').waitFor({ timeout: 30000 });

        await page.getByPlaceholder('e.g. your service name').fill('E2E Test Operator');
        await page.getByRole('button', { name: /register/i }).click();

        // IPFS mocked → wallet auto-sign → tx confirmed → success card
        await expect(page.getByText("You're registered.")).toBeVisible({ timeout: 60000 });
        await expect(page.getByRole('link', { name: 'Build your catalogue →' })).toBeVisible();
    });

    // updateProfile / withdraw devnet tests are not yet covered here; they
    // hit the wallet-auto-sign flow the same way as register. Lifecycle
    // flags (deactivate / reactivate) do not exist on the contract.
});

// ── Catalogue URI handoff ─────────────────────────────────────────────────────

test.describe('/operators — catalogue URI handoff (devnet)', () => {
    const CATALOGUE_URI = 'ipfs://QmHandoffTestCatalogue';

    test('pre-fills catalogue URI input from the catalogueURI URL param', async ({ page }) => {
        await mockIpfsRoute(page);
        await page.goto(
            `/operators?e2e=devnet&catalogueURI=${encodeURIComponent(CATALOGUE_URI)}`,
            { waitUntil: 'load' },
        );

        // Form renders (wallet connected)
        await page.getByPlaceholder('e.g. your service name').waitFor({ timeout: 30000 });
        // Catalogue URI field is pre-filled from the URL param. `hasText`
        // matches DOM textContent, not input value, so we must check the
        // value directly. The input value is the same string we passed via
        // ?catalogueURI=...
        const catalogueInput = page.locator(`input[value="${CATALOGUE_URI}"]`);
        await expect(catalogueInput).toBeVisible({ timeout: 10000 });
    });
});
