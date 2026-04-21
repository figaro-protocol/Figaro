import { test, expect } from './devnet-test';

test.describe('Builder routes (devnet)', () => {
    test('prototype route hydrates cleanly with an injected devnet wallet', async ({ page }) => {
        await page.goto('/builders/prototype/figaro-procurement?e2e=devnet', { waitUntil: 'load' });

        await page.waitForFunction(
            () => typeof (window as Window & { __FIGARO_DEVNET_CONNECT__?: () => void }).__FIGARO_DEVNET_CONNECT__ === 'function',
            null,
            { timeout: 20000 }
        );
        await page.evaluate(() => {
            (window as Window & { __FIGARO_DEVNET_CONNECT__?: () => void }).__FIGARO_DEVNET_CONNECT__?.();
        });

        await expect(page.getByRole('heading', { name: 'Figaro Procurement' })).toBeVisible({ timeout: 20000 });
        await expect(page.getByText('Derived Institution Snapshot')).toBeVisible();
        await expect(page.getByText('Visible mechanisms: core-orders')).toBeVisible();
        await expect(page.getByText(/Visible modules: .*process-graph/)).toBeVisible();
        await expect(page.getByText(/Visible modules: .*role-switcher/)).toBeVisible();
        await expect(page.getByText('Wallet Processes')).toBeVisible();
        await page.waitForFunction(
            () => {
                const bodyText = document.body.textContent || '';
                return bodyText.includes('Connect a wallet that has participated in a process to populate live process models.')
                    || bodyText.includes('Process') && bodyText.includes('Orders:');
            },
            null,
            { timeout: 20000 }
        );
        await expect(page.locator('header').getByRole('button', { name: /connect wallet/i })).not.toBeVisible({ timeout: 20000 });
    });

    test('authoring route loads cleanly during a devnet session', async ({ page }) => {
        await page.goto('/builders/authoring?e2e=devnet', { waitUntil: 'load' });

        await page.waitForFunction(
            () => typeof (window as Window & { __FIGARO_DEVNET_CONNECT__?: () => void }).__FIGARO_DEVNET_CONNECT__ === 'function',
            null,
            { timeout: 20000 }
        );
        await page.evaluate(() => {
            (window as Window & { __FIGARO_DEVNET_CONNECT__?: () => void }).__FIGARO_DEVNET_CONNECT__?.();
        });

        await expect(page.getByRole('heading', { name: 'Assembly Authoring Studio' })).toBeVisible({ timeout: 20000 });
        await expect(page.getByText('Workspace Write Plan')).toBeVisible();
        await expect(page.getByText('Registered Assemblies')).toBeVisible();
        await expect(page.locator('header').getByRole('button', { name: /connect wallet/i })).not.toBeVisible({ timeout: 20000 });
    });
});