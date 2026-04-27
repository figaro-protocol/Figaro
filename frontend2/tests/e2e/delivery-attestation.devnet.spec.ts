import { expect } from '@playwright/test';
import { test, ANVIL_ACCOUNTS, openAsAccount } from './devnet-multi-test';
import {
    evmRevert,
    evmSnapshot,
    seedDeliveryScenario,
} from './devnet-helpers';

const DRIVER = ANVIL_ACCOUNTS[2];
const ONE_BY_ONE_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9p0N0xQAAAAASUVORK5CYII=',
    'base64',
);

let chainSnapshot: string;

test.beforeAll(async () => {
    chainSnapshot = await evmSnapshot();
});

test.afterAll(async () => {
    if (chainSnapshot) await evmRevert(chainSnapshot);
});

async function gotoAssemblyDevnet(page: import('@playwright/test').Page) {
    const response = await page.goto('/i/local-commerce?e2e=devnet', { waitUntil: 'load' });
    await page.getByTestId('role-btn-buyer').waitFor({ timeout: 30000 });
    return response;
}

async function selectProcessInAssembly(page: import('@playwright/test').Page, processId: string) {
    const card = page.getByTestId(`process-summary-${processId}`);
    await card.waitFor({ timeout: 60000 });
    await card.click();
    await page.waitForFunction(
        () => document.querySelectorAll('[data-testid^="topo-node-"]').length > 0,
        null,
        { timeout: 30000 },
    );
}

async function switchToRole(page: import('@playwright/test').Page, role: string) {
    const roleButton = page.getByTestId(`role-btn-${role}`);
    if (await roleButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await roleButton.click();
        await page.waitForTimeout(500);
    }
}

test.describe('Delivery attestation browser flow (devnet)', () => {
    test.setTimeout(180000);

    test('captures photo + GPS under production-style headers', async ({ context }) => {
        const scenario = await seedDeliveryScenario();
        const driverPage = await openAsAccount(context, DRIVER);

        await context.grantPermissions(['geolocation']);
        await context.setGeolocation({ latitude: 37.7749, longitude: -122.4194 });

        let ipfsAddCount = 0;
        await driverPage.route('http://127.0.0.1:5001/api/v0/add?**', async (route) => {
            ipfsAddCount += 1;
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ Hash: `bafybeigdyrzt${ipfsAddCount.toString().padStart(6, '0')}` }),
            });
        });

        const response = await gotoAssemblyDevnet(driverPage);
        expect(response?.headers()['permissions-policy']).toContain('geolocation=(self)');

        await selectProcessInAssembly(driverPage, scenario.processId);

        const deliveryNode = driverPage.getByTestId(`topo-node-${scenario.deliveryOrderHash}`);
        await expect(deliveryNode).toBeVisible({ timeout: 15000 });
        await deliveryNode.click();

        await switchToRole(driverPage, 'courier');

        const attestationPanel = driverPage.getByTestId('delivery-attestation-panel');
        await expect(attestationPanel).toBeVisible({ timeout: 15000 });

        await attestationPanel.getByRole('button', { name: 'Photo + GPS' }).click();
        await attestationPanel.getByTestId('input-photo-file').setInputFiles({
            name: 'delivery-proof.png',
            mimeType: 'image/png',
            buffer: ONE_BY_ONE_PNG,
        });
        await attestationPanel.getByTestId('input-attestation-notes').fill('left with building concierge');
        await attestationPanel.getByTestId('btn-capture-photo-gps').click();

        await expect(attestationPanel.getByTestId('attestation-result')).toBeVisible({ timeout: 15000 });
        await expect(attestationPanel.getByTestId('attestation-result')).toContainText('Attestation pinned to IPFS');
        await expect(attestationPanel.getByTestId('attestation-result')).toContainText('CID: bafy');
        await expect(attestationPanel.getByTestId('attestation-error')).toHaveCount(0);
        expect(ipfsAddCount).toBeGreaterThanOrEqual(2);

        await driverPage.close();
    });
});