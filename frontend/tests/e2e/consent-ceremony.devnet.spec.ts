/**
 * consent-ceremony.devnet.spec.ts
 *
 * E2E coverage of /consent — the Figaro Beta informed-consent ceremony.
 * The page exercises figaro-consent-v1's EIP-712 typed-data shape via
 * `useSignTypedData`, pins the canonical document text + a PDF receipt
 * to IPFS, then redirects to /discover. No on-chain mutation — the
 * signature itself is the artifact.
 *
 * Closes the "every shipped clause has at least one e2e" gap for
 * figaro-consent-v1 at the beta-ceremony surface. A separate e2e
 * exercises consent-v1 as a commit-time clause inside an assembly.
 */
import { test, expect, ANVIL_ACCOUNTS, gotoAsWallet } from './devnet-multi-test';
import { waitForWalletConnected } from './test-helpers';

const buyer = ANVIL_ACCOUNTS[0];

test.describe('Figaro Beta consent ceremony (devnet)', () => {
    // Cold-cache budget: the post-sign path lazy-imports
    // @react-pdf/renderer + qrcode and pins twice to IPFS. On a fresh
    // Playwright-managed dev server the chunk compile alone is ~30-60s.
    test.setTimeout(180_000);

    test('buyer signs EIP-712 consent — recovered signer matches, CIDs pin, continue redirects to /discover', async ({ page }) => {
        // No localStorage seeding for the access code — readAccessCode reads
        // localStorage inline in the render path, so a pre-seeded value
        // produces a server/client hydration mismatch that severs Next.js
        // router navigation state. The ceremony's signing + pin + redirect
        // flow works the same with or without an access code; the watermark
        // is orthogonal to what this test covers.

        // ?e2e=devnet triggers ClientInit's auto-connect + window.__FIGARO_WALLET__
        // publish, which waitForWalletConnected polls on.
        await gotoAsWallet(page, buyer, '/consent?e2e=devnet');
        await waitForWalletConnected(page);

        // Pre-sign state — document text + keccak hash + signer row + Sign button.
        await expect(page.getByTestId('consent-page')).toBeVisible();
        await expect(page.getByTestId('consent-document-text')).toContainText(/Figaro/i);
        await expect(page.getByTestId('consent-document-hash')).toContainText(/^keccak256 0x[0-9a-f]{64}$/);
        await expect(page.getByTestId('consent-pre-sign')).toBeVisible();

        // Sign → transitions through `signing` → `pinning` → `post-sign`.
        // First-run cost: Next.js dev cold-compiles the lazy-loaded
        // consentReceiptPdf + qrcode chunks (`@react-pdf/renderer` is heavy),
        // and Kubo gets two pin calls (document text + PDF). 90s is the
        // realistic cold-cache budget.
        await page.getByTestId('btn-sign-consent').click();
        await expect(page.getByTestId('consent-post-sign')).toBeVisible({ timeout: 90_000 });

        // recoverTypedDataAddress on the page must round-trip to the connected wallet.
        const signer = (await page.getByTestId('consent-signer').textContent())?.trim() ?? '';
        expect(signer.toLowerCase()).toBe(buyer.toLowerCase());

        // Kubo returns CIDv0 (Qm…) for files by default. Either CID is null only on
        // a pin failure — assert both succeeded.
        await expect(page.getByTestId('consent-document-cid')).toContainText(/^(Qm|bafy)[1-9A-HJ-NP-Za-km-z]+/);
        await expect(page.getByTestId('consent-receipt-cid')).toContainText(/^(Qm|bafy)[1-9A-HJ-NP-Za-km-z]+/);

        // Onboarding modal opens on post-sign — dismiss before continuing.
        await expect(page.getByTestId('consent-onboarding-modal')).toBeVisible();
        await page.getByTestId('btn-onboarding-dismiss').click();
        await expect(page.getByTestId('consent-onboarding-modal')).not.toBeVisible();

        // Continue → sets the localStorage completion flag + redirects to /discover.
        // /discover is a cold compile on the Playwright-managed dev server;
        // allow up to 60s before declaring the navigation broken.
        await page.getByTestId('btn-continue-to-app').click();
        await expect(page).toHaveURL(/\/discover/, { timeout: 60_000 });
        const complete = await page.evaluate(() => window.localStorage.getItem('figaro-consent-complete'));
        expect(complete).toBe('1');
    });
});
