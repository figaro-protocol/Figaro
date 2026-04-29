/**
 * dispute-page.spec.ts — browser-level coverage for /dispute (mock).
 *
 * /dispute is the Figaro consent-dispute submission flow per §10 of the
 * Figaro Beta Informed Consent Agreement. The page packages a participant
 * (or Project Operator) claim into ERC-1497 Evidence + MetaEvidence and
 * submits it to the Kleros ArbitrableProxy.
 *
 * The mock harness does not connect a wallet, so this spec covers the
 * surfaces that work without one:
 *   - Initial render shows step 1 (select) with all input fields.
 *   - Stepper renders five labelled steps.
 *   - "Not configured" banner shows when Kleros env vars are absent
 *     (the default in mock mode).
 *   - Validation rejects invalid CIDs / hashes / signatures on step 1.
 *   - Well-formed inputs advance to step 2 (compose).
 *   - Compose step renders the role radios + cited-section dropdown +
 *     claim textarea with character counter.
 *   - Compose validation rejects too-short claim text.
 *   - Well-formed compose advances to step 3 (review) which surfaces
 *     the cited section + claim text + the "Sign claim" button.
 *
 * Steps 4-5 (sign claim → submit to Kleros) require a connected wallet;
 * those are out of scope for the mock harness and unit-tested at the
 * module level (consentDisputeEvidence.test.ts).
 */
import { test, expect } from '@playwright/test';

const VALID_HASH = '0x' + 'a'.repeat(64);
const VALID_SIG = '0x' + 'b'.repeat(130);
const VALID_ADDR = '0x' + '1'.repeat(40);
const VALID_CID = 'Qm' + '1'.repeat(44);
const VALID_CID_DOC = 'Qm' + '2'.repeat(44);

const VALID_CLAIM = (
    'The Project Operator distributed an audit-bundle PDF carrying my ' +
    'watermarked access code to a third party outside the beta cohort, ' +
    'in breach of §3.6 (artifact custody) and §3.4 (confidentiality of ' +
    'access materials). On 2026-04-15 a screenshot of my financials ' +
    'page surfaced in a public Discord channel, with the QR-code ' +
    'watermark intact and matching the access code I received in my ' +
    'beta invitation. The Operator has acknowledged the disclosure but ' +
    'has not provided a remediation plan; I am escalating to Kleros ' +
    'per §10. Evidence: receipt CID, document CID, and the screenshot ' +
    'URL are pinned alongside this claim.'
);

test.describe('/dispute — initial render (mock)', () => {
    test('renders header, stepper, and step 1 (select)', async ({ page }) => {
        await page.goto('/dispute?e2e=mock', { waitUntil: 'load' });
        await page.getByTestId('dispute-page').waitFor({ timeout: 15000 });

        await expect(page.getByRole('heading', { name: /Submit a consent dispute to Kleros/i })).toBeVisible();
        await expect(page.getByTestId('dispute-stepper')).toBeVisible();
        await expect(page.getByTestId('dispute-step-select')).toBeVisible();
        await expect(page.getByTestId('dispute-step-compose')).toBeVisible();
        await expect(page.getByTestId('dispute-step-review')).toBeVisible();
        await expect(page.getByTestId('dispute-step-submit')).toBeVisible();
        await expect(page.getByTestId('dispute-step-confirmation')).toBeVisible();

        await expect(page.getByTestId('dispute-select-step')).toBeVisible();
        await expect(page.getByTestId('dispute-input-receipt-cid')).toBeVisible();
        await expect(page.getByTestId('dispute-input-document-cid')).toBeVisible();
        await expect(page.getByTestId('dispute-input-document-hash')).toBeVisible();
        await expect(page.getByTestId('dispute-input-signature')).toBeVisible();
        await expect(page.getByTestId('dispute-input-signer')).toBeVisible();
    });

    test('shows "not configured" banner without Kleros env vars (mock default)', async ({ page }) => {
        await page.goto('/dispute?e2e=mock', { waitUntil: 'load' });
        await page.getByTestId('dispute-page').waitFor({ timeout: 15000 });

        // The mock harness does not wire NEXT_PUBLIC_KLEROS_ARBITRABLE_PROXY.
        await expect(page.getByTestId('dispute-not-configured')).toBeVisible();
    });
});

test.describe('/dispute — step 1 (select) validation', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/dispute?e2e=mock', { waitUntil: 'load' });
        await page.getByTestId('dispute-page').waitFor({ timeout: 15000 });
    });

    test('rejects invalid receipt CID', async ({ page }) => {
        await page.getByTestId('dispute-input-receipt-cid').fill('not-a-cid');
        await page.getByTestId('dispute-input-document-cid').fill(VALID_CID_DOC);
        await page.getByTestId('dispute-input-document-hash').fill(VALID_HASH);
        await page.getByTestId('dispute-input-signature').fill(VALID_SIG);
        await page.getByTestId('dispute-input-signer').fill(VALID_ADDR);
        await page.getByTestId('dispute-input-signed-at').fill('2026-04-01T12:00:00Z');

        await page.getByTestId('btn-dispute-select-next').click();

        await expect(page.getByTestId('dispute-select-error')).toContainText(/Receipt CID/i);
        await expect(page.getByTestId('dispute-select-step')).toBeVisible();
    });

    test('rejects invalid document hash', async ({ page }) => {
        await page.getByTestId('dispute-input-receipt-cid').fill(VALID_CID);
        await page.getByTestId('dispute-input-document-cid').fill(VALID_CID_DOC);
        await page.getByTestId('dispute-input-document-hash').fill('0xnope');
        await page.getByTestId('dispute-input-signature').fill(VALID_SIG);
        await page.getByTestId('dispute-input-signer').fill(VALID_ADDR);
        await page.getByTestId('dispute-input-signed-at').fill('2026-04-01T12:00:00Z');

        await page.getByTestId('btn-dispute-select-next').click();

        await expect(page.getByTestId('dispute-select-error')).toContainText(/Document hash/i);
    });

    test('advances to compose with well-formed inputs', async ({ page }) => {
        await page.getByTestId('dispute-input-receipt-cid').fill(VALID_CID);
        await page.getByTestId('dispute-input-document-cid').fill(VALID_CID_DOC);
        await page.getByTestId('dispute-input-document-hash').fill(VALID_HASH);
        await page.getByTestId('dispute-input-signature').fill(VALID_SIG);
        await page.getByTestId('dispute-input-signer').fill(VALID_ADDR);
        await page.getByTestId('dispute-input-signed-at').fill('2026-04-01T12:00:00Z');

        await page.getByTestId('btn-dispute-select-next').click();

        await expect(page.getByTestId('dispute-compose-step')).toBeVisible();
        await expect(page.getByTestId('dispute-claim-text')).toBeVisible();
    });
});

test.describe('/dispute — step 2 (compose)', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/dispute?e2e=mock', { waitUntil: 'load' });
        await page.getByTestId('dispute-page').waitFor({ timeout: 15000 });

        // Bootstrap into compose step
        await page.getByTestId('dispute-input-receipt-cid').fill(VALID_CID);
        await page.getByTestId('dispute-input-document-cid').fill(VALID_CID_DOC);
        await page.getByTestId('dispute-input-document-hash').fill(VALID_HASH);
        await page.getByTestId('dispute-input-signature').fill(VALID_SIG);
        await page.getByTestId('dispute-input-signer').fill(VALID_ADDR);
        await page.getByTestId('dispute-input-signed-at').fill('2026-04-01T12:00:00Z');
        await page.getByTestId('btn-dispute-select-next').click();
        await page.getByTestId('dispute-compose-step').waitFor();
    });

    test('renders role radios + cited-section dropdown + claim textarea', async ({ page }) => {
        await expect(page.getByTestId('dispute-role-participant')).toBeVisible();
        await expect(page.getByTestId('dispute-role-operator')).toBeVisible();
        await expect(page.getByTestId('dispute-cited-section')).toBeVisible();
        await expect(page.getByTestId('dispute-claim-text')).toBeVisible();
        await expect(page.getByTestId('dispute-claim-length')).toBeVisible();
    });

    test('rejects too-short claim text', async ({ page }) => {
        await page.getByTestId('dispute-claim-text').fill('too short');
        await page.getByTestId('btn-dispute-compose-next').click();

        await expect(page.getByTestId('dispute-compose-error')).toContainText(/at least/i);
        await expect(page.getByTestId('dispute-compose-step')).toBeVisible();
    });

    test('advances to review with well-formed claim text', async ({ page }) => {
        await page.getByTestId('dispute-claim-text').fill(VALID_CLAIM);
        await page.getByTestId('btn-dispute-compose-next').click();

        await expect(page.getByTestId('dispute-review-step')).toBeVisible();
        await expect(page.getByTestId('dispute-review-claim-text')).toContainText(VALID_CLAIM);
    });

    test('Other-section freeform input renders when Other is selected', async ({ page }) => {
        await page.getByTestId('dispute-cited-section').selectOption('Other');
        await expect(page.getByTestId('dispute-cited-section-freeform')).toBeVisible();
    });
});

test.describe('/dispute — step 3 (review)', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/dispute?e2e=mock', { waitUntil: 'load' });
        await page.getByTestId('dispute-page').waitFor({ timeout: 15000 });

        await page.getByTestId('dispute-input-receipt-cid').fill(VALID_CID);
        await page.getByTestId('dispute-input-document-cid').fill(VALID_CID_DOC);
        await page.getByTestId('dispute-input-document-hash').fill(VALID_HASH);
        await page.getByTestId('dispute-input-signature').fill(VALID_SIG);
        await page.getByTestId('dispute-input-signer').fill(VALID_ADDR);
        await page.getByTestId('dispute-input-signed-at').fill('2026-04-01T12:00:00Z');
        await page.getByTestId('btn-dispute-select-next').click();

        await page.getByTestId('dispute-claim-text').fill(VALID_CLAIM);
        await page.getByTestId('btn-dispute-compose-next').click();
        await page.getByTestId('dispute-review-step').waitFor();
    });

    test('surfaces sign-claim button (gated on wallet) and back-nav', async ({ page }) => {
        await expect(page.getByTestId('btn-dispute-sign-claim')).toBeVisible();
        // Mock has no wallet — sign button should be disabled.
        await expect(page.getByTestId('btn-dispute-sign-claim')).toBeDisabled();
        await expect(page.getByTestId('btn-dispute-review-back')).toBeVisible();
    });

    test('back nav returns to compose preserving inputs', async ({ page }) => {
        await page.getByTestId('btn-dispute-review-back').click();
        await expect(page.getByTestId('dispute-compose-step')).toBeVisible();
        // Claim text round-trips
        await expect(page.getByTestId('dispute-claim-text')).toHaveValue(VALID_CLAIM);
    });
});
