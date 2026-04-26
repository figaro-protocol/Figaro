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
        await expect(page.getByPlaceholder('e.g. Tasty Burger')).toBeVisible({ timeout: 30000 });
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
        await page.getByPlaceholder('e.g. Tasty Burger').waitFor({ timeout: 30000 });

        await page.getByPlaceholder('e.g. Tasty Burger').fill('E2E Test Operator');
        await page.getByRole('button', { name: /register/i }).click();

        // IPFS mocked → wallet auto-sign → tx confirmed → success card
        await expect(page.getByText("You're registered.")).toBeVisible({ timeout: 60000 });
        await expect(page.getByRole('link', { name: 'Build your catalogue →' })).toBeVisible();
    });

    // 2. Active state (account[0] is registered + active from step 1)
    test('edit form shows Active operator status for the registered operator', async ({ page }) => {
        await gotoOperators(page);

        // Profile loads from chain — shows edit form in active mode
        await expect(page.getByText('Active operator')).toBeVisible({ timeout: 15000 });
        await expect(page.getByRole('button', { name: /update profile/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /^deactivate$/i })).toBeVisible();
    });

    // 3. Deactivate (account[0] is active from step 2)
    test('deactivates the operator from the danger zone', async ({ page }) => {
        await gotoOperators(page);
        await expect(page.getByText('Active operator')).toBeVisible({ timeout: 15000 });

        await page.getByRole('button', { name: /^deactivate$/i }).click();

        await expect(page.getByText('Operator inactive')).toBeVisible({ timeout: 60000 });
        await expect(page.getByRole('button', { name: /^reactivate$/i })).toBeVisible();
    });

    // 4. Reactivate (account[0] is inactive from step 3)
    test('reactivates the inactive operator', async ({ page }) => {
        await gotoOperators(page);
        await expect(page.getByText('Operator inactive')).toBeVisible({ timeout: 15000 });

        await page.getByRole('button', { name: /^reactivate$/i }).click();

        await expect(page.getByText('Active operator')).toBeVisible({ timeout: 60000 });
    });
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
        await page.getByPlaceholder('e.g. Tasty Burger').waitFor({ timeout: 30000 });
        // Catalogue URI field is pre-filled from the URL param
        // Note: `getByDisplayValue` is only on Locator in current @playwright/test typings,
        // not on Page. Use locator chain instead.
        await expect(page.locator('input').filter({ hasText: CATALOGUE_URI }).first()).toBeVisible();
    });
});
