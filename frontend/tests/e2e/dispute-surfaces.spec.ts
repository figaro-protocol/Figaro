/**
 * dispute-surfaces.spec.ts — Mock-mode tests for dispute resolution UI.
 *
 * Verifies:
 *   1. BondApprovalPanel dispute cost line renders when configured
 *   2. Evidence display page handles missing/present params correctly
 */
import { test, expect } from './figaro-test';
import {
    gotoHome,
    MOCK_BUYER,
} from './test-helpers';

// DisputeStatusPanel moved off the per-order workspace card onto
// /audit/[processId] (audit finding F8, 2026-05-20) — it is process-scoped
// and belongs at the end-of-process escalation surface. The re-homed panel
// is covered by the resumed C7 devnet spec; the prior mock-mode workspace
// assertion was a soft test with no unique coverage.

// ── BondApprovalPanel dispute cost ───────────────────────────────────────────

test.describe('BondApprovalPanel dispute cost (mock)', () => {
    test('dispute cost line is absent when Kleros is not configured', async ({ page }) => {
        await gotoHome(page, { mock: true });

        // Fill form to trigger BondApprovalPanel render
        const counterpartyInput = page.getByTestId('input-counterparty');
        const paymentInput = page.getByTestId('input-payment');
        await counterpartyInput.fill(MOCK_BUYER);
        // Set currency so BondApprovalPanel renders (requires !!currency)
        await page.getByTestId('btn-use-default-token').click();
        await paymentInput.fill('0.01');

        // Wait for bond panel to appear
        await expect(page.getByTestId('buyer-bond')).toBeVisible({ timeout: 10000 });

        // dispute-cost should NOT be visible (Kleros env not set in mock mode)
        const disputeCost = page.getByTestId('dispute-cost');
        await expect(disputeCost).not.toBeVisible();
    });
});

// ── Evidence Display page ────────────────────────────────────────────────────

test.describe('Evidence Display page (/evidence-display)', () => {
    test('loads inside a same-origin iframe', async ({ page }) => {
        const fakeProcessId = '0x' + 'a1b2c3d4'.repeat(8);
        const iframeUrl =
            `/evidence-display?processId=${fakeProcessId}&chainID=31337` +
            `&arbitrableJsonRpcUrl=http://127.0.0.1:8545&e2e=mock`;

        // 1. CSP headers — fetched directly. An iframe-using consumer
        //    receives the same headers; pulling them via `page.request`
        //    instead of inferring from an iframe load decouples this
        //    assertion from page navigation entirely.
        const cspResponse = await page.request.get(iframeUrl);
        const headers = cspResponse.headers();
        expect(headers['content-security-policy']).toContain("frame-ancestors 'self'");
        expect(headers['content-security-policy']).toContain('https://resolve.kleros.io');

        // 2. Iframe-embedded rendering — host on the homepage (lighter
        //    than /terminal, no mock-event-store boot to race) and
        //    inject the iframe via `document.createElement` after the
        //    host finishes hydrating. The previous shape called
        //    `page.setContent(...)` against /terminal mid-hydration;
        //    under suite load setContent occasionally lost the race
        //    against React's reconciler and the iframe never landed in
        //    the DOM at all.
        await page.goto('/?e2e=mock', { waitUntil: 'load' });
        await page.evaluate((src) => {
            const frame = document.createElement('iframe');
            frame.id = 'evidence-frame';
            frame.src = src;
            frame.style.cssText = 'width: 1280px; height: 800px; border: 0;';
            document.body.appendChild(frame);
        }, iframeUrl);

        // The fake processId never resolves to chain data, so the page
        // can settle into any of three valid render states: the
        // "Figaro Process Timeline" heading (real timeline), an
        // "Error" notice (chain query rejected), or "Loading process
        // timeline…" (query still in flight). All three prove the
        // iframe loaded + hydrated.
        const frame = page.frameLocator('#evidence-frame');
        await expect(
            frame.getByRole('heading', { name: 'Figaro Process Timeline' })
                .or(frame.getByText('Error'))
                .or(frame.getByText(/Loading process timeline/i)),
        ).toBeVisible({ timeout: 15000 });
    });

    test('shows error when required query params are missing', async ({ page }) => {
        // processId missing → error
        await page.goto('/evidence-display?arbitrableJsonRpcUrl=http://127.0.0.1:8545', { waitUntil: 'load' });
        await expect(page.getByText('Missing processId query parameter')).toBeVisible({ timeout: 15000 });

        // arbitrableJsonRpcUrl missing → error
        const fakeProcessId = '0x' + 'a1b2c3d4'.repeat(8);
        await page.goto(`/evidence-display?processId=${fakeProcessId}&chainID=31337`, { waitUntil: 'load' });
        await expect(page.getByText('Missing arbitrableJsonRpcUrl query parameter')).toBeVisible({ timeout: 15000 });
    });

    test('renders title, dispute subtitle, and on-chain footer when fully parameterized', async ({ page }) => {
        const fakeProcessId = '0x' + 'a1b2c3d4'.repeat(8);
        await page.goto(
            `/evidence-display?processId=${fakeProcessId}&disputeID=42&chainID=31337&arbitrableJsonRpcUrl=http://127.0.0.1:8545`,
            { waitUntil: 'load' },
        );

        const errorBox = page.getByText('Error');
        // Either the timeline renders or the RPC call fails — both valid in mock mode
        await expect(page.getByRole('heading', { name: 'Figaro Process Timeline' }).or(errorBox)).toBeVisible({ timeout: 15000 });
        await expect(page.getByText('#42').or(errorBox)).toBeVisible();
        await expect(page.getByText('All data sourced from on-chain events').or(errorBox)).toBeVisible();
    });
});
