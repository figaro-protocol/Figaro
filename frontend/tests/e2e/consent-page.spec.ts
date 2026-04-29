/**
 * consent-page.spec.ts — browser-level coverage for /consent (mock).
 *
 * /consent is the Figaro Beta informed-consent ceremony. EIP-712 typed-data
 * signing only — no on-chain transaction. The signature is the artifact;
 * the PDF receipt + IPFS CIDs are the durable evidence.
 *
 * The mock harness does not connect a wallet, so this spec covers the
 * surfaces that work without one:
 *   - Document text + version + keccak256 hash render correctly.
 *   - Pre-connect state shows when no wallet is connected.
 *   - The Watermark renders the access code (when supplied via ?code=).
 *   - The "no code" indicator renders when no code is present.
 *
 * The actual sign-then-pin path is gated on a connected wallet. Once a mock
 * wallet harness for /consent ships, extend this spec with a "post-sign"
 * scenario that exercises buildConsentReceiptPdfBlob + the IPFS pinning
 * code path. For now, that path is unit-tested at the module level.
 */
import { test, expect } from '@playwright/test';

const ACCESS_CODE = 'BETA-ABCD-1234';

test.describe('/consent — page render (mock)', () => {
    test('renders document text, version, keccak256 hash', async ({ page }) => {
        await page.goto('/consent?e2e=mock', { waitUntil: 'load' });

        await page.getByTestId('consent-page').waitFor({ timeout: 15000 });
        await expect(page.getByTestId('consent-document-card')).toBeVisible();
        await expect(page.getByTestId('consent-document-text')).toContainText(
            'FIGARO BETA INFORMED CONSENT AGREEMENT',
        );
        // Hash is rendered as `keccak256 0x...` — verify the bytes32 prefix.
        await expect(page.getByTestId('consent-document-hash')).toContainText(/0x[a-fA-F0-9]{64}/);
    });

    test('shows pre-connect card when no wallet is connected', async ({ page }) => {
        await page.goto('/consent?e2e=mock', { waitUntil: 'load' });
        await page.getByTestId('consent-page').waitFor({ timeout: 15000 });

        // Mock harness does not connect a wallet.
        await expect(page.getByTestId('consent-pre-connect')).toBeVisible();
        // Sign button is gated on connection — must NOT render in pre-connect.
        await expect(page.getByTestId('btn-sign-consent')).toHaveCount(0);
    });
});

test.describe('/consent — watermark', () => {
    test('renders "no code" indicator when no access code is set', async ({ page, context }) => {
        // Fresh context — no localStorage, no query param.
        await context.clearCookies();
        await page.goto('/consent?e2e=mock', { waitUntil: 'load' });
        await page.getByTestId('consent-page').waitFor({ timeout: 15000 });

        // The Watermark mounts via the (app) layout. With no code, the
        // missing indicator renders instead of the QR.
        await expect(page.getByTestId('watermark-missing')).toBeVisible({ timeout: 5000 });
    });

    test('persists access code from ?code= query param to localStorage', async ({ page }) => {
        await page.goto(`/consent?e2e=mock&code=${ACCESS_CODE}`, { waitUntil: 'load' });
        await page.getByTestId('consent-page').waitFor({ timeout: 15000 });

        // Watermark should render now (with the code persisted to storage).
        await expect(page.getByTestId('watermark')).toBeVisible({ timeout: 5000 });

        // localStorage should carry the full code.
        const stored = await page.evaluate(() =>
            window.localStorage.getItem('figaro-beta-access-code'),
        );
        expect(stored).toBe(ACCESS_CODE);

        // Reload without the query param — watermark stays (read from storage).
        await page.goto('/consent?e2e=mock', { waitUntil: 'load' });
        await page.getByTestId('consent-page').waitFor({ timeout: 15000 });
        await expect(page.getByTestId('watermark')).toBeVisible({ timeout: 5000 });
    });
});
