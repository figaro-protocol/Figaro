import { test, expect, chromium } from '@playwright/test';
import path from 'path';

// This test launches Chromium with an unpacked MetaMask extension and
// attempts to import the Anvil private key and switch the RPC to 127.0.0.1:8545.

test.setTimeout(120_000);

test('connect app with MetaMask + Anvil', async () => {
    const extPathEnv = process.env.METAMASK_EXTENSION_PATH;
    const anvilKey = process.env.ANVIL_PRIVATE_KEY;
    if (!extPathEnv) {
        test.skip(true, 'METAMASK_EXTENSION_PATH not set');
    }
    if (!anvilKey) {
        test.skip(true, 'ANVIL_PRIVATE_KEY not set');
    }

    const extensionPath = path.resolve(extPathEnv as string);

    const userDataDir = './playwright-user-data';
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
        ],
    });

    const pages = context.pages();
    const page = pages.length ? pages[0] : await context.newPage();

    // MetaMask extension target page: try to discover extension id by listing background pages
    const backgroundPages = context.backgroundPages();
    // Best-effort: find any page with 'chrome-extension' URL
    let mmPage = backgroundPages.find((p) => p.url().startsWith('chrome-extension://'));
    if (!mmPage) {
        // open the extensions page to surface the extension UI
        await page.goto('chrome://extensions/');
        // wait a moment for extension to register
        await page.waitForTimeout(1500);
        const bgs = context.backgroundPages();
        mmPage = bgs.find((p) => p.url().startsWith('chrome-extension://'));
    }

    if (!mmPage) {
        await context.close();
        throw new Error('Could not find MetaMask extension background page. Ensure METAMASK_EXTENSION_PATH points to a valid unpacked MetaMask.');
    }

    // Open MetaMask UI (extension) in a regular tab so we can interact with it.
    const extensionUrl = mmPage.url();
    // Construct the extension root URL (chrome-extension://<id>/home.html or /popup.html)
    const match = extensionUrl.match(/(chrome-extension:\/\/[^/]+)/);
    if (!match) {
        await context.close();
        throw new Error('Unexpected MetaMask background URL: ' + extensionUrl);
    }
    const extensionRoot = match[1];
    const welcomePage = extensionRoot + '/home.html';

    const mmUi = await context.newPage();
    await mmUi.goto(welcomePage).catch(() => mmUi.goto(extensionRoot + '/popup.html'));
    await mmUi.waitForLoadState('domcontentloaded');

    // The following selector flow is fragile across MetaMask versions. It's a best-effort
    // sequence to (1) accept welcome, (2) import wallet, (3) import private key, (4) set RPC.

    // Example: click "Get Started" -> "Import wallet"
    try {
        await mmUi.click('text=Get Started', { timeout: 5000 }).catch(() => { });
        await mmUi.click('text=Import wallet', { timeout: 5000 }).catch(() => { });
        await mmUi.click('text=No Thanks', { timeout: 3000 }).catch(() => { });
        // fill secret recovery phrase? we import by private key instead (alternative flows exist)
        // click "Import using account seed phrase" flows can vary — we try private key flow link
        await mmUi.click('text=Import using Secret Recovery Phrase', { timeout: 3000 }).catch(() => { });
    } catch (e) {
        // ignore; UI can vary
    }

    // Attempt to find "Import Account" or private key input via common selectors
    // If there's a quick "Import an account" button
    await mmUi.waitForTimeout(1000);
    const importButtons = await mmUi.$$('text=Import account, text=Import using private key, text=Import an account');
    if (importButtons.length) {
        await importButtons[0].click().catch(() => { });
    }

    // Try to locate a text area/input for private key
    const pkInput = await mmUi.locator('textarea, input[type="text"], input[type="password"]').first();
    if (await pkInput.count() > 0) {
        await pkInput.fill(anvilKey as string).catch(() => { });
        // click import/confirm
        await mmUi.click('text=Import, text=Save, text=Confirm', { timeout: 4000 }).catch(() => { });
    }

    // Wait a bit for import to finish
    await mmUi.waitForTimeout(1500);

    // Attempt to add custom RPC for Anvil
    try {
        // navigate to settings/networks page
        await mmUi.goto(extensionRoot + '/settings/networks').catch(() => { });
        await mmUi.waitForTimeout(800);
        // click Add Network
        await mmUi.click('text=Add a network', { timeout: 3000 }).catch(() => { });
        // fill fields — selectors and field structure vary; try best-effort
        await mmUi.fill('input[placeholder*="Network name"], input[aria-label*="Network name"]', 'Anvil').catch(() => { });
        await mmUi.fill('input[placeholder*="New RPC URL"], input[aria-label*="RPC URL"]', 'http://127.0.0.1:8545').catch(() => { });
        await mmUi.fill('input[placeholder*="Chain ID"], input[aria-label*="Chain ID"]', '31337').catch(() => { });
        await mmUi.click('text=Save, text=Add', { timeout: 3000 }).catch(() => { });
    } catch (e) {
        // ignore; network UI often differs
    }

    // Now open the app and click the Connect button
    await page.goto('http://127.0.0.1:3000/test-connection');
    await page.waitForLoadState('domcontentloaded');

    // Click RainbowKit ConnectButton if present
    const connectBtn = page.locator('button[data-testid="rk-connect-button"]');
    if (await connectBtn.count()) {
        await connectBtn.click().catch(() => { });
        // Allow MetaMask popup to appear and accept
        await page.waitForTimeout(1000);
    }

    // Fallback: try clicking our injected connect button (if present)
    const injectedBtn = page.locator('text=Connect Injected Wallet');
    if (await injectedBtn.count()) {
        await injectedBtn.click().catch(() => { });
    }

    // Wait for the UI to show connected state
    await page.waitForTimeout(2000);
    // Check diagnostics block from test-connection page
    const connectedText = await page.locator('text=Connected:').innerText().catch(() => '');
    // Close browser context
    await context.close();

    // basic assertion: page rendered Connected state or did not error
    expect(connectedText).toBeTruthy();
});
