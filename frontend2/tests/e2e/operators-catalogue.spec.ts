/**
 * operators-catalogue.spec.ts
 *
 * Mock-mode tests for /operators/catalogue — the CatalogueBuilder route.
 * No wallet required. IPFS publish calls are intercepted with page.route()
 * so these tests run without a local IPFS node.
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

    test('renders the catalogue heading and description', async ({ page }) => {
        await expect(page.getByRole('heading', { name: 'Build your catalogue.' })).toBeVisible();
        await expect(page.getByText('Operator Registry').first()).toBeVisible();
        await expect(page.getByText('Define your service items, publish them to IPFS')).toBeVisible();
    });

    test('step indicator shows step 2 active and step 1 links back to /operators', async ({ page }) => {
        await expect(page.getByRole('link', { name: 'Register' })).toHaveAttribute('href', '/operators');
        await expect(page.getByText('Add catalogue', { exact: true })).toBeVisible();
    });
});

test.describe('/operators/catalogue — form', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/operators/catalogue', { waitUntil: 'load' });
        await page.getByPlaceholder('e.g. Tasty Burger Menu').waitFor({ timeout: 15000 });
    });

    test('renders with one default item row', async ({ page }) => {
        await expect(page.getByPlaceholder('e.g. Tasty Burger Menu')).toBeVisible();
        await expect(page.getByPlaceholder('e.g. Classic Burger')).toHaveCount(1);
        await expect(page.getByRole('button', { name: 'Add item' })).toBeVisible();
    });

    test('publish button is disabled when the form is empty', async ({ page }) => {
        await expect(page.getByRole('button', { name: 'Publish catalogue to IPFS' })).toBeDisabled();
    });

    test('publish button remains disabled with a catalogue name but no item name', async ({ page }) => {
        await page.getByPlaceholder('e.g. Tasty Burger Menu').fill('Test Menu');
        await expect(page.getByRole('button', { name: 'Publish catalogue to IPFS' })).toBeDisabled();
    });

    test('publish button remains disabled without a valid denomination token address', async ({ page }) => {
        await page.getByPlaceholder('e.g. Tasty Burger Menu').fill('Test Menu');
        await page.getByPlaceholder('e.g. Classic Burger').fill('Classic Burger');
        // No denomination token set — button must stay disabled
        await expect(page.getByRole('button', { name: 'Publish catalogue to IPFS' })).toBeDisabled();
    });

    test('publish button is enabled when all required fields are filled', async ({ page }) => {
        await page.getByPlaceholder('e.g. Tasty Burger Menu').fill('Test Menu');
        await page.getByPlaceholder('e.g. Classic Burger').fill('Classic Burger');
        await page.getByPlaceholder('0x… token address').fill('0x5FbDB2315678afecb367f032d93F642f64180aa3');

        await expect(page.getByRole('button', { name: 'Publish catalogue to IPFS' })).toBeEnabled({ timeout: 5000 });
    });

    test('Add item appends a new item row', async ({ page }) => {
        await expect(page.getByPlaceholder('e.g. Classic Burger')).toHaveCount(1);

        await page.getByRole('button', { name: 'Add item' }).click();

        await expect(page.getByPlaceholder('e.g. Classic Burger')).toHaveCount(2);
    });

    test('Remove item button removes the row', async ({ page }) => {
        await page.getByRole('button', { name: 'Add item' }).click();
        await expect(page.getByPlaceholder('e.g. Classic Burger')).toHaveCount(2);

        await page.getByRole('button', { name: 'Remove item' }).first().click();

        await expect(page.getByPlaceholder('e.g. Classic Burger')).toHaveCount(1);
    });
});

test.describe('/operators/catalogue — publish flow', () => {
    test('shows pinning status then published panel on success', async ({ page }) => {
        await mockIpfsRoute(page);
        await page.goto('/operators/catalogue', { waitUntil: 'load' });
        await page.getByPlaceholder('e.g. Tasty Burger Menu').waitFor({ timeout: 15000 });

        await page.getByPlaceholder('e.g. Tasty Burger Menu').fill('E2E Test Menu');
        await page.getByPlaceholder('e.g. Classic Burger').fill('Classic Burger');
        await page.getByPlaceholder('0x… token address').fill('0x5FbDB2315678afecb367f032d93F642f64180aa3');

        await page.getByRole('button', { name: 'Publish catalogue to IPFS' }).click();

        // Published panel appears after IPFS returns the CID
        await expect(page.getByText('Catalogue published.')).toBeVisible({ timeout: 15000 });
        await expect(page.getByText(MOCK_IPFS_URI)).toBeVisible();
    });

    test('published panel has a copy button and an "Update operator profile" link', async ({ page }) => {
        await mockIpfsRoute(page);
        await page.goto('/operators/catalogue', { waitUntil: 'load' });
        await page.getByPlaceholder('e.g. Tasty Burger Menu').waitFor({ timeout: 15000 });

        await page.getByPlaceholder('e.g. Tasty Burger Menu').fill('E2E Test Menu');
        await page.getByPlaceholder('e.g. Classic Burger').fill('Classic Burger');
        await page.getByPlaceholder('0x… token address').fill('0x5FbDB2315678afecb367f032d93F642f64180aa3');
        await page.getByRole('button', { name: 'Publish catalogue to IPFS' }).click();
        await expect(page.getByText('Catalogue published.')).toBeVisible({ timeout: 15000 });

        await expect(page.getByRole('button', { name: 'Copy' })).toBeVisible();

        const handoffLink = page.getByRole('link', { name: 'Update operator profile →' });
        await expect(handoffLink).toHaveAttribute(
            'href',
            `/operators?catalogueURI=${encodeURIComponent(MOCK_IPFS_URI)}`,
        );
    });

    test('Build another resets the form', async ({ page }) => {
        await mockIpfsRoute(page);
        await page.goto('/operators/catalogue', { waitUntil: 'load' });
        await page.getByPlaceholder('e.g. Tasty Burger Menu').waitFor({ timeout: 15000 });

        await page.getByPlaceholder('e.g. Tasty Burger Menu').fill('E2E Test Menu');
        await page.getByPlaceholder('e.g. Classic Burger').fill('Classic Burger');
        await page.getByPlaceholder('0x… token address').fill('0x5FbDB2315678afecb367f032d93F642f64180aa3');
        await page.getByRole('button', { name: 'Publish catalogue to IPFS' }).click();
        await expect(page.getByText('Catalogue published.')).toBeVisible({ timeout: 15000 });

        await page.getByRole('button', { name: 'Build another' }).click();

        await expect(page.getByPlaceholder('e.g. Tasty Burger Menu')).toBeVisible();
        await expect(page.getByPlaceholder('e.g. Tasty Burger Menu')).toHaveValue('');
    });
});
