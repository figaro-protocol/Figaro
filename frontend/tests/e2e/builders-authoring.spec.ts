import { expect, test } from '@playwright/test';

test.describe('Builder authoring route', () => {
    test('clones, edits, validates, and exports an assembly draft', async ({ page }) => {
        await page.goto('/builders/authoring?e2e=mock', { waitUntil: 'load' });

        await expect(page.getByRole('heading', { name: 'Assembly Authoring Studio' })).toBeVisible({ timeout: 15000 });

        await page.getByTestId('authoring-clone-select').selectOption('figaro-procurement');
        await page.getByTestId('authoring-clone-button').click();

        await expect(page.getByTestId('authoring-name-input')).toHaveValue('Figaro Procurement');

        await page.getByTestId('authoring-name-input').fill('Figaro Returns');
        await page.getByTestId('authoring-slug-input').fill('figaro-returns');

        await expect(page.getByText('/builders/prototype/figaro-returns', { exact: true })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Figaro Returns' })).toBeVisible();

        await page.getByTestId('authoring-blank-button').click();
        const discardPrompt = page.getByTestId('discard-draft-confirmation');
        await expect(discardPrompt).toBeVisible();
        await page.getByTestId('discard-draft-cancel-button').click();
        await expect(discardPrompt).toHaveCount(0);
        await expect(page.getByTestId('authoring-name-input')).toHaveValue('Figaro Returns');

        await page.getByTestId('assembly-section-roles').fill('[');
        await expect(page.getByText('Draft has pending JSON parse errors.')).toBeVisible();
        await expect(page.getByText('JSON parse error', { exact: true })).toBeVisible();
        await expect(page.getByText('Blocked', { exact: true })).toBeVisible();

        await page.getByTestId('authoring-clone-button').click();
        await expect(page.getByTestId('discard-draft-confirmation')).toBeVisible();
        await page.getByTestId('discard-draft-confirm-button').click();
        await expect(page.getByText('Draft has pending JSON parse errors.')).toHaveCount(0);
        // Sticky validation panel overlaps left-column buttons; use JS clicks
        await page.evaluate(() => {
            const btns = [...document.querySelectorAll('button')].filter(b => b.textContent?.trim() === 'Load into Studio');
            btns[1]?.click();
        });
        await expect(page.getByTestId('authoring-name-input')).toHaveValue('Figaro Procurement');
        await page.evaluate(() => {
            const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Unregister Only');
            btn?.click();
        });
        const confirmation = page.getByTestId('unregister-confirmation');
        await expect(confirmation).toBeVisible();
        await expect(confirmation.getByText(/Remove .* from the registered assembly set\./)).toBeVisible();
        await page.evaluate(() => {
            const btn = document.querySelector('[data-testid="unregister-cancel-button"]') as HTMLElement | null;
            btn?.click();
        });
        await expect(page.getByTestId('unregister-confirmation')).toHaveCount(0);
        await expect(page.getByText('Workspace Write Plan')).toBeVisible();
        await expect(page.getByText('Assembly document path:')).toBeVisible();

        const downloadPromise = page.waitForEvent('download');
        await page.evaluate(() => {
            const btn = document.querySelector('[data-testid="authoring-export-button"]') as HTMLElement | null;
            btn?.click();
        });
        const download = await downloadPromise;

        expect(download.suggestedFilename()).toBe('figaro-procurement.reference.json');
    });
});