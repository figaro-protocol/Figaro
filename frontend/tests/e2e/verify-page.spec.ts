/**
 * verify-page.spec.ts — browser-level coverage for the /verify page (mock).
 *
 * /verify is a pure-client-side hash verifier. Three modes:
 *   • Mode A — Agreement: paste an Agreement (cleartext OR redacted) → recompute merkle root.
 *   • Mode B — Section: paste a single AgreementSection → recompute leaf hash.
 *   • Mode C — Search: paste any hex hash → search locally-loaded orders + agreements.
 *
 * No wallet / no chain required for any of this (Mode C falls back to
 * "no match" when no orders are loaded). All modes work in ?e2e=mock.
 *
 * Coverage focus: the redaction primitives shipped 2026-04-28 — Mode A
 * accepts redacted-form Agreement JSON and shows the amber sealed-section
 * notice; Mode B is the selective-reveal entry point (paste cleartext,
 * compare against the leaf carried in the redacted form).
 */
import { test, expect } from '@playwright/test';
import {
    type Agreement,
    computeAgreementHash,
    computeSectionLeaf,
    redactSections,
} from '../../lib/core/agreementManifest';

const BUYER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as `0x${string}`;
const SELLER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as `0x${string}`;
const TOKEN = '0x5FbDB2315678afecb367f032d93F642f64180aa3' as `0x${string}`;

/** A small, deterministic cleartext Agreement used by every test below. */
function makeAgreement(): Agreement {
    return {
        version: 'a1',
        buyer: BUYER,
        seller: SELLER,
        sections: [
            {
                schema: 'figaro-commerce-v1',
                data: {
                    currency: TOKEN,
                    payment: '100000000000000000',
                    lineItems: [
                        { itemId: 'sku-1', name: 'Pizza margherita', quantity: 2, unitPrice: '30000000000000000' },
                        { itemId: 'sku-2', name: 'Tiramisu', quantity: 1, unitPrice: '40000000000000000' },
                    ],
                },
            },
            {
                schema: 'figaro-geo-v1',
                data: { originGeohash: 'u4pruydqqvj', destinationGeohash: 'u4pruydqqvk' },
            },
            {
                schema: 'figaro-fulfilment-v2',
                data: { modality: 'pickup', handoffPoint: 'face-to-face' },
            },
        ].sort((a, b) => a.schema.localeCompare(b.schema)),
    };
}

test.describe('/verify — Mode A (Agreement)', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/verify?e2e=mock', { waitUntil: 'load' });
        await page.getByTestId('verify-page').waitFor({ timeout: 15000 });
    });

    test('cleartext agreement: recomputes the merkle root and matches expected', async ({ page }) => {
        await page.getByTestId('verify-mode-agreement').click();
        const agreement = makeAgreement();
        const expected = computeAgreementHash(agreement);

        await page.getByTestId('verify-agreement-input').fill(JSON.stringify(agreement));
        await page.getByTestId('verify-agreement-expected').fill(expected);

        await expect(page.getByTestId('verify-result-computed')).toHaveText(expected.toLowerCase(), {
            ignoreCase: true,
            timeout: 5000,
        });
        await expect(page.getByTestId('verify-result-status')).toContainText('Matches expected hash');
        // No redacted-section notice on a cleartext agreement.
        await expect(page.getByTestId('verify-agreement-redacted-notice')).toHaveCount(0);
    });

    test('redacted agreement: same merkle root, amber notice lists sealed schemas', async ({ page }) => {
        await page.getByTestId('verify-mode-agreement').click();
        const cleartext = makeAgreement();
        const redacted = redactSections(cleartext, ['figaro-commerce-v1']);
        const expected = computeAgreementHash(cleartext);

        await page.getByTestId('verify-agreement-input').fill(JSON.stringify(redacted));
        await page.getByTestId('verify-agreement-expected').fill(expected);

        await expect(page.getByTestId('verify-result-computed')).toHaveText(expected.toLowerCase(), {
            ignoreCase: true,
            timeout: 5000,
        });
        await expect(page.getByTestId('verify-result-status')).toContainText('Matches expected hash');

        // Amber sealed-section notice surfaces with the redacted schemaId.
        const notice = page.getByTestId('verify-agreement-redacted-notice');
        await expect(notice).toBeVisible();
        await expect(notice).toContainText('1 section sealed');
        await expect(notice).toContainText('figaro-commerce-v1');
    });

    test('redacted agreement with multiple sealed sections lists all of them', async ({ page }) => {
        await page.getByTestId('verify-mode-agreement').click();
        const redacted = redactSections(makeAgreement(), ['figaro-commerce-v1', 'figaro-fulfilment-v2']);

        await page.getByTestId('verify-agreement-input').fill(JSON.stringify(redacted));

        const notice = page.getByTestId('verify-agreement-redacted-notice');
        await expect(notice).toBeVisible();
        await expect(notice).toContainText('2 sections sealed');
        await expect(notice).toContainText('figaro-commerce-v1');
        await expect(notice).toContainText('figaro-fulfilment-v2');
    });

    test('malformed JSON shows an error', async ({ page }) => {
        await page.getByTestId('verify-mode-agreement').click();
        await page.getByTestId('verify-agreement-input').fill('{ not valid json');

        await expect(page.getByTestId('verify-error')).toBeVisible();
    });

    test('redacted entry missing leaf field shows an error', async ({ page }) => {
        await page.getByTestId('verify-mode-agreement').click();
        const broken = {
            version: 'a1',
            buyer: BUYER,
            seller: SELLER,
            sections: [
                { schema: 'figaro-commerce-v1', redacted: true /* missing `leaf` */ },
            ],
        };
        await page.getByTestId('verify-agreement-input').fill(JSON.stringify(broken));
        await expect(page.getByTestId('verify-error')).toContainText('missing valid 0x-prefixed leaf');
    });
});

test.describe('/verify — Mode B (Section) for selective-reveal verification', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/verify?e2e=mock', { waitUntil: 'load' });
        await page.getByTestId('verify-page').waitFor({ timeout: 15000 });
        await page.getByTestId('verify-mode-section').click();
    });

    test('cleartext section: recomputed leaf matches the canonical computeSectionLeaf', async ({ page }) => {
        const agreement = makeAgreement();
        const commerce = agreement.sections.find((s) => s.schema === 'figaro-commerce-v1')!;
        const expectedLeaf = computeSectionLeaf(commerce);

        await page.getByTestId('verify-section-input').fill(JSON.stringify(commerce));
        await page.getByTestId('verify-section-expected').fill(expectedLeaf);

        await expect(page.getByTestId('verify-result-computed')).toHaveText(expectedLeaf.toLowerCase(), {
            ignoreCase: true,
            timeout: 5000,
        });
        await expect(page.getByTestId('verify-result-status')).toContainText('Matches expected hash');
    });

    test('selective-reveal flow: revealed cleartext + redacted entry leaf → match', async ({ page }) => {
        // The full distribution flow:
        //   1. Buyer redacts the agreement and sends it to a third party.
        //   2. Third party reads the redacted commerce entry's `leaf` field.
        //   3. Buyer later reveals the cleartext commerce section.
        //   4. Third party pastes cleartext into Mode B with the previously-known leaf as expected.
        //   5. Match → revealed cleartext is byte-equal to what the parties signed.
        const cleartext = makeAgreement();
        const redacted = redactSections(cleartext, ['figaro-commerce-v1']);
        const redactedCommerceEntry = redacted.sections.find((s) => s.schema === 'figaro-commerce-v1')!;
        const knownLeaf = (redactedCommerceEntry as { leaf: string }).leaf;

        // Recipient pastes the revealed cleartext section.
        const revealedCleartext = cleartext.sections.find((s) => s.schema === 'figaro-commerce-v1')!;
        await page.getByTestId('verify-section-input').fill(JSON.stringify(revealedCleartext));
        await page.getByTestId('verify-section-expected').fill(knownLeaf);

        await expect(page.getByTestId('verify-result-status')).toContainText('Matches expected hash');
    });

    test('tampered cleartext fails the match against the original leaf', async ({ page }) => {
        const cleartext = makeAgreement();
        const redacted = redactSections(cleartext, ['figaro-commerce-v1']);
        const knownLeaf = (redacted.sections.find((s) => s.schema === 'figaro-commerce-v1') as { leaf: string }).leaf;

        // Tampered cleartext: same schema, different lineItems.
        const tampered = {
            schema: 'figaro-commerce-v1',
            data: {
                currency: TOKEN,
                payment: '100000000000000000',
                lineItems: [
                    { itemId: 'evil', name: 'Evil pizza', quantity: 99, unitPrice: '1' },
                ],
            },
        };
        await page.getByTestId('verify-section-input').fill(JSON.stringify(tampered));
        await page.getByTestId('verify-section-expected').fill(knownLeaf);

        await expect(page.getByTestId('verify-result-status')).toContainText('Does not match expected hash');
    });
});

test.describe('/verify — Mode C (Search)', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/verify?e2e=mock', { waitUntil: 'load' });
        await page.getByTestId('verify-page').waitFor({ timeout: 15000 });
        await page.getByTestId('verify-mode-search').click();
    });

    test('a hash with no local match surfaces the no-hits hint', async ({ page }) => {
        const unknownHash = '0x' + 'de'.repeat(32);
        await page.getByTestId('verify-search-input').fill(unknownHash);
        await expect(page.getByTestId('verify-search-no-hits')).toBeVisible();
    });
});
