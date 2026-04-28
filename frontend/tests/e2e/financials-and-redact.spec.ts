/**
 * financials-and-redact.spec.ts — browser-level coverage for
 *   • /financials/[processId] consolidated process-financials page
 *   • DownloadAuditBundleButton redact-line-items toggle
 *
 * Both surfaces shipped 2026-04-27 (Phases A→D) and 2026-04-28 (Step 2 of
 * line-item privacy) without any e2e coverage. This file fills that gap.
 *
 * The redact toggle is the user-facing entry point for Option B selective
 * disclosure: buyer downloads a redacted PDF that hides line-item detail
 * but preserves the agreement merkle root (recipient verifies via /verify
 * Mode A). Selective reveal happens later via /verify Mode B.
 *
 * All tests run in ?e2e=mock — no wallet / no chain. The mock harness
 * seeds an order + agreement directly into the in-browser store.
 */
import { test, expect } from '@playwright/test';
import { gotoHome, injectActiveOrder, ANVIL_ACCOUNTS } from './test-helpers';

const BUYER = ANVIL_ACCOUNTS[0];
const SELLER = ANVIL_ACCOUNTS[1];
const TOKEN = '0x5FbDB2315678afecb367f032d93F642f64180aa3';

/** Build a deterministic 32-byte hex processId for a test. The name is
 *  hashed into the leading bytes via a tiny FNV-style mixer so different
 *  test cases get distinct ids without colliding under fullyParallel. */
function processIdFor(name: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < name.length; i++) {
        h = Math.imul(h ^ name.charCodeAt(i), 0x01000193) >>> 0;
    }
    const tag = h.toString(16).padStart(8, '0');
    // 64 hex chars (32 bytes), all valid 0-9a-f
    return '0x' + tag + 'a'.repeat(64 - tag.length);
}

/** Encode a minimal `origin|destination` manifest payload as hex bytes —
 *  matches the simple format `parseMockManifestFields` accepts and triggers
 *  the in-browser agreement-store write inside `injectActiveOrder`. */
function manifestHex(origin: string, destination: string): string {
    const text = `${origin}|${destination}`;
    const hex = Array.from(new TextEncoder().encode(text))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    return `0x${hex}`;
}

/** Seed an order + agreement on /terminal (where __FIGARO_MOCK__ is set up
 *  and the mockEventStore module is loaded), then SPA-navigate to /financials.
 *  Full page-reload via `page.goto('/financials/...')` would clear the
 *  in-memory store; clicking the ProcessList financials link preserves it. */
async function seedAndNavigateToFinancials(
    page: import('@playwright/test').Page,
    processId: string,
): Promise<void> {
    await gotoHome(page, { mock: true });
    await injectActiveOrder(page, {
        processId,
        buyer: BUYER,
        seller: SELLER,
        currency: TOKEN,
        // A non-empty manifest triggers agreement-store seeding inside
        // injectActiveOrder — this is what DownloadAuditBundleButton needs
        // to find a loadable agreement.
        manifest: manifestHex('u4pruydqqvj', 'u4pruydqqvk'),
    });
    // ProcessList lives on the terminal "processes" tab. Switch to it so
    // the per-process financials link renders. The tab button has
    // id="tab-processes" + role="tab" rather than a data-testid.
    await page.locator('#tab-processes').click();
    // Click the per-process financials link. SPA navigation preserves the
    // mockEventStore module-level _orders array; a full page-reload via
    // page.goto() would clear it.
    const linkTestId = `process-financials-link-${processId.slice(0, 10)}`;
    await page.getByTestId(linkTestId).waitFor({ timeout: 10000 });
    await page.getByTestId(linkTestId).click();
    await page.getByTestId('financials-page').waitFor({ timeout: 15000 });
}

test.describe('/financials/[processId] — page render', () => {
    test('renders the page header + process id + DownloadAuditBundleButton for a seeded process', async ({ page }) => {
        const processId = processIdFor('renders');
        await seedAndNavigateToFinancials(page, processId);

        // Process id surfaces in the header.
        await expect(page.getByTestId('financials-process-id')).toHaveText(processId);
        // The /verify cross-link is present (closes the loop on selective reveal).
        await expect(page.getByTestId('financials-verify-link')).toBeVisible();
        // The download button is rendered AND enabled (orders.length > 0 + agreement loaded).
        await expect(page.getByTestId('download-audit-bundle')).toBeVisible();
        await expect(page.getByTestId('download-audit-bundle-button')).toBeEnabled();
    });

    test('renders an empty notice when no orders exist for the processId', async ({ page }) => {
        // No seeding — go straight to a random process id.
        await page.goto(`/financials/${processIdFor('emptyproc')}?e2e=mock`, { waitUntil: 'load' });
        await page.getByTestId('financials-page').waitFor({ timeout: 15000 });
        await expect(page.getByTestId('financials-empty')).toBeVisible();
    });
});

test.describe('DownloadAuditBundleButton — redact toggle UI', () => {
    test('default: toggle is off, button reads "Download audit bundle (PDF)", no redact note', async ({ page }) => {
        const processId = processIdFor('toggleOff');
        await seedAndNavigateToFinancials(page, processId);

        await expect(page.getByTestId('download-audit-bundle-redact-checkbox')).not.toBeChecked();
        await expect(page.getByTestId('download-audit-bundle-button')).toHaveText(
            'Download audit bundle (PDF)',
        );
        await expect(page.getByTestId('download-audit-bundle-redact-note')).toHaveCount(0);
    });

    test('toggling redact ON: button text switches, explanation note appears, label gains 🔒 sealed', async ({ page }) => {
        const processId = processIdFor('toggleOn');
        await seedAndNavigateToFinancials(page, processId);

        await page.getByTestId('download-audit-bundle-redact-checkbox').check();

        await expect(page.getByTestId('download-audit-bundle-redact-checkbox')).toBeChecked();
        await expect(page.getByTestId('download-audit-bundle-button')).toHaveText(
            'Download redacted bundle (PDF)',
        );
        const note = page.getByTestId('download-audit-bundle-redact-note');
        await expect(note).toBeVisible();
        await expect(note).toContainText('hide line-item detail');
        // The toggle label gains an inline "🔒 sealed" indicator when on.
        await expect(page.getByTestId('download-audit-bundle-redact-toggle')).toContainText('sealed');
    });

    test('toggling redact OFF after ON returns to the default label and hides the note', async ({ page }) => {
        const processId = processIdFor('toggleOnOff');
        await seedAndNavigateToFinancials(page, processId);

        const checkbox = page.getByTestId('download-audit-bundle-redact-checkbox');
        await checkbox.check();
        await checkbox.uncheck();

        await expect(checkbox).not.toBeChecked();
        await expect(page.getByTestId('download-audit-bundle-button')).toHaveText(
            'Download audit bundle (PDF)',
        );
        await expect(page.getByTestId('download-audit-bundle-redact-note')).toHaveCount(0);
    });
});

test.describe('DownloadAuditBundleButton — actual PDF download', () => {
    // PDF rendering does a lazy ~400 kB chunk fetch + react-pdf render.
    // Generous timeout. If this becomes flaky in CI, downgrade to a UI-only
    // assertion and trust the unit tests on extractor behaviour.
    test.setTimeout(120_000);

    test('default download produces a file named audit-bundle-<id>.pdf', async ({ page }) => {
        const processId = processIdFor('downloadDefault');
        await seedAndNavigateToFinancials(page, processId);

        const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
        await page.getByTestId('download-audit-bundle-button').click();
        const download = await downloadPromise;

        const filename = download.suggestedFilename();
        // processId.slice(0, 10) = "0x" + 8 hex chars.
        expect(filename).toMatch(/^audit-bundle-0x[0-9a-f]{8}\.pdf$/);
        expect(filename).not.toContain('redacted');
    });

    test('redacted download produces a file named audit-bundle-<id>-redacted.pdf', async ({ page }) => {
        const processId = processIdFor('downloadRedact');
        await seedAndNavigateToFinancials(page, processId);

        await page.getByTestId('download-audit-bundle-redact-checkbox').check();

        const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
        await page.getByTestId('download-audit-bundle-button').click();
        const download = await downloadPromise;

        const filename = download.suggestedFilename();
        expect(filename).toMatch(/^audit-bundle-0x[0-9a-f]{8}-redacted\.pdf$/);
    });
});
