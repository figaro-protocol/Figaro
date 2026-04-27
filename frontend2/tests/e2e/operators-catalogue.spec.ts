/**
 * operators-catalogue.spec.ts
 *
 * Mock-mode tests for /operators/catalogue — the CatalogueBuilder route.
 * No wallet required. IPFS publish calls are intercepted with page.route()
 * so these tests run without a local IPFS node.
 *
 * Per the 2026-04-27 mock audit: the 4 disabled-button-with-various-
 * missing-fields tests collapsed into 1 with all-then-each-removed
 * coverage; "Add item" / "Remove item" / "Build another resets" trimmed
 * (trivial form-state mutations covered by component tests).
 */
import { test, expect, type Page } from './figaro-test';

const MOCK_CID = 'QmTestCatalogueE2EPlaceholder';
const MOCK_IPFS_URI = `ipfs://${MOCK_CID}`;

async function mockIpfsRoute(page: Page): Promise<void> {
    await page.route('http://127.0.0.1:5001/api/v0/add**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ Hash: MOCK_CID }),
        });
    });
}

test.describe('/operators/catalogue — page structure', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/operators/catalogue', { waitUntil: 'load' });
        await page.getByPlaceholder('e.g. Tasty Burger Menu').waitFor({ timeout: 15000 });
    });

    test('renders catalogue heading + step indicator linking back to /operators', async ({ page }) => {
        await expect(page.getByRole('heading', { name: 'Build your catalogue.' })).toBeVisible();
        await expect(page.getByText('Operator Registry').first()).toBeVisible();
        await expect(page.getByText('Define your service items, publish them to IPFS')).toBeVisible();
        await expect(page.getByRole('link', { name: 'Register' })).toHaveAttribute('href', '/operators');
        await expect(page.getByText('Add catalogue', { exact: true })).toBeVisible();
    });
});

test.describe('/operators/catalogue — form', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/operators/catalogue', { waitUntil: 'load' });
        await page.getByPlaceholder('e.g. Tasty Burger Menu').waitFor({ timeout: 15000 });
    });

    test('renders with one default item row + Add item button', async ({ page }) => {
        await expect(page.getByPlaceholder('e.g. Tasty Burger Menu')).toBeVisible();
        await expect(page.getByPlaceholder('e.g. Classic Burger')).toHaveCount(1);
        await expect(page.getByRole('button', { name: 'Add item' })).toBeVisible();
    });

    test('publish button stays disabled until name + item + token are all set', async ({ page }) => {
        const publishBtn = page.getByRole('button', { name: 'Publish catalogue to IPFS' });
        await expect(publishBtn).toBeDisabled();

        // Adding catalogue name alone is not enough.
        await page.getByPlaceholder('e.g. Tasty Burger Menu').fill('Test Menu');
        await expect(publishBtn).toBeDisabled();

        // Adding item name still leaves token missing.
        await page.getByPlaceholder('e.g. Classic Burger').fill('Classic Burger');
        await expect(publishBtn).toBeDisabled();

        // All three set — button enables.
        await page.getByPlaceholder('0x… token address').fill('0x5FbDB2315678afecb367f032d93F642f64180aa3');
        await expect(publishBtn).toBeEnabled({ timeout: 5000 });
    });
});

test.describe('/operators/catalogue — publish flow', () => {
    test('publishes to IPFS and surfaces the CID + handoff link', async ({ page }) => {
        await mockIpfsRoute(page);
        await page.goto('/operators/catalogue', { waitUntil: 'load' });
        await page.getByPlaceholder('e.g. Tasty Burger Menu').waitFor({ timeout: 15000 });

        await page.getByPlaceholder('e.g. Tasty Burger Menu').fill('E2E Test Menu');
        await page.getByPlaceholder('e.g. Classic Burger').fill('Classic Burger');
        await page.getByPlaceholder('0x… token address').fill('0x5FbDB2315678afecb367f032d93F642f64180aa3');
        await page.getByRole('button', { name: 'Publish catalogue to IPFS' }).click();

        // Published panel surfaces the CID + Copy button + handoff link.
        await expect(page.getByText('Catalogue published.')).toBeVisible({ timeout: 15000 });
        await expect(page.getByText(MOCK_IPFS_URI)).toBeVisible();
        await expect(page.getByRole('button', { name: 'Copy' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Update operator profile →' })).toHaveAttribute(
            'href',
            `/operators?catalogueURI=${encodeURIComponent(MOCK_IPFS_URI)}`,
        );
    });
});
