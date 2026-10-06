/**
 * members-wizard-catalogue.devnet.spec.ts
 *
 * The member wizard's catalogue and assemblies steps, driven as a person drives
 * them, each fact read back OUT-OF-BAND (chain events → the pinned documents on
 * IPFS), never from the screen that wrote it.
 *
 *   - CSV import: a CSV file is chosen on the Catalogue step → the wizard shows
 *     the parsed rows → Review → publish → the pinned catalogue document the
 *     member's profile points at carries those items.
 *
 * Wallet: anvil[33] — the one free index (see self-order.devnet.spec.ts). Each
 * test replaces the wallet's profile on entry (`seedRegisteredMember`), so the
 * wizard runs in update mode from a known baseline and a sibling self-seeder on
 * 33 self-heals. The wizard member is therefore already registered; the walk
 * ends in "Profile updated".
 *
 * Depends on populate-test-data (the pos reference anchored) and the Kubo
 * daemon. Iterate with `--no-deps` once the chain is anchored.
 */
import { expect, type Page } from '@playwright/test';
import { test, gotoAsWallet, ANVIL_ACCOUNTS } from './devnet-multi-test';
import type { Hex } from 'viem';
import {
    discoverAnchoredAssemblies,
    latestMemberProfileURI,
    pinJSONToIPFS,
    readLocalDeploymentConfig,
    referenceAssemblySlug,
    resolveIpfsURI,
    seedRegisteredMember,
} from './devnet-helpers';
import { ANVIL_KEYS } from '../anvilAccounts';

const WIZARD = ANVIL_ACCOUNTS[33] as Hex;
const WIZARD_KEY = ANVIL_KEYS[33] as Hex;
const WIZARD_NAME = 'Wizard Catalogue Counter';

interface CatalogueDoc { items: Array<{ id: string; name: string; price: string }> }

/** Replace the wizard wallet's profile with the known baseline: bound to the pos
 *  reference, one item. Returns the baseline item's name. */
async function seedBaseline(runTag: string): Promise<{ itemName: string; slug: string }> {
    const token = readLocalDeploymentConfig().tokenAddress as Hex;
    const slug = referenceAssemblySlug('pos.json');
    expect(
        (await discoverAnchoredAssemblies()).some((a) => a.slug === slug),
        'the pos reference (assemblies/pos.json) is anchored — run populate-test-data',
    ).toBe(true);
    const itemName = `Baseline loaf ${runTag}`;
    const { uri: catalogueURI } = await pinJSONToIPFS({
        subjectAddress: WIZARD,
        version: '1.0.0',
        unitSystem: 'metric' as const,
        items: [{
            id: `baseline-${runTag}`, name: itemName, description: 'The seeded baseline item.',
            price: '1', category: 'retail', image: '🧾', available: true,
        }],
    });
    await seedRegisteredMember({
        walletKey: WIZARD_KEY,
        profile: {
            name: WIZARD_NAME,
            description: 'Seeded by members-wizard-catalogue.devnet.spec.ts',
            catalogueURI,
            acceptedTokens: [{ address: token, symbol: 'MOCK', chainId: 31337 }],
            defaultTokenAddress: token,
            assemblyBindings: [{
                bindingId: 'wizard-catalogue', subjectAddress: WIZARD, assemblySlug: slug, counterpartyBindings: [],
            }],
        },
    });
    return { itemName, slug };
}

/** The wallet's live catalogue document, read from chain → IPFS. */
async function pinnedCatalogue(): Promise<CatalogueDoc> {
    const profileURI = await latestMemberProfileURI(WIZARD);
    expect(profileURI, 'the wallet has an anchored profile').toMatch(/^ipfs:\/\//);
    const profile = await (await fetch(resolveIpfsURI(profileURI!))).json() as { catalogueURI?: string };
    expect(profile.catalogueURI, 'the pinned profile carries a catalogueURI').toMatch(/^ipfs:\/\//);
    return await (await fetch(resolveIpfsURI(profile.catalogueURI!))).json() as CatalogueDoc;
}

const next = (page: Page) => page.getByRole('button', { name: /^Next/ });

/** Walk the wizard from Identity to the Catalogue step as the wizard wallet.
 *  The wizard re-walks every step for a registered wallet (its draft starts
 *  empty; publishing updates the profile in place), so identity and the
 *  binding are entered again. */
async function walkToCatalogue(page: Page, slug: string): Promise<void> {
    await gotoAsWallet(page, WIZARD, '/members/manage?e2e=devnet');
    await page.waitForFunction(
        () => (document.body.textContent || '').includes('View public profile')
            || window.location.pathname.startsWith('/members/identity'),
        null, { timeout: 60_000 },
    );
    await page.goto('/members/identity', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#profile-name')).toBeVisible({ timeout: 30_000 });
    await page.locator('#profile-name').fill(WIZARD_NAME);
    await page.getByRole('button', { name: /\+ MOCK$/ }).click();
    await page.locator('input[name="defaultTokenAddress"]').first().check();
    await next(page).click();
    await expect(page).toHaveURL(/\/members\/assemblies/, { timeout: 30_000 });

    const row = page.getByTestId(`seller-assembly-row-${slug}`);
    await row.waitFor({ state: 'visible', timeout: 30_000 });
    await row.locator('input[type="checkbox"]').first().check();
    await next(page).click();
    await expect(page).toHaveURL(/\/members\/buyer/, { timeout: 30_000 });
    await next(page).click();
    await expect(page).toHaveURL(/\/members\/catalogue/, { timeout: 30_000 });
}

/** Catalogue → Review → publish. Resolves on the receipt heading. */
async function publishFromCatalogue(page: Page): Promise<void> {
    await next(page).click();
    await expect(page).toHaveURL(/\/members\/agents/, { timeout: 30_000 });
    await next(page).click();
    await expect(page).toHaveURL(/\/members\/endpoints/, { timeout: 30_000 });
    await next(page).click();
    await page.waitForURL(/\/members\/review/, { timeout: 30_000 });
    await page.getByTestId('review-confirm-publish').click();
    await expect(page.getByRole('heading', { name: /Registered\.|Profile updated/i }))
        .toBeVisible({ timeout: 60_000 });
}

test.describe('member wizard — catalogue and assemblies steps (devnet)', () => {
    test.setTimeout(240_000);

    test('CSV import: the parsed rows show, publish pins them in the catalogue', async ({ page }) => {
        const runTag = Date.now().toString(36);
        const { slug } = await seedBaseline(runTag);
        const rows = [
            { name: `CSV rye ${runTag}`, price: '2.5', description: 'imported', category: 'bakery' },
            { name: `CSV "seeded" bun ${runTag}`, price: '3', description: 'has, a comma', category: 'bakery' },
        ];
        const csv = [
            'name,price,description,category',
            ...rows.map((r) => [r.name.replace(/"/g, '""'), r.price, r.description, r.category]
                .map((v) => `"${v}"`).join(',')),
        ].join('\n');

        await walkToCatalogue(page, slug);
        await page.getByTestId('catalogue-csv-import').setInputFiles({
            name: 'catalogue.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8'),
        });

        // The wizard shows the parsed rows: the count line and each row's fields.
        await expect(page.getByTestId('catalogue-csv-imported')).toHaveText(/Imported 2 items from CSV/);
        for (const row of rows) {
            await expect(
                page.locator('[id^="item-"][id$="-name"]').evaluateAll(
                    (els, name) => els.some((el) => (el as HTMLInputElement).value === name), row.name),
            ).resolves.toBe(true);
        }

        await publishFromCatalogue(page);

        // Out-of-band: the pinned catalogue carries every imported row.
        const catalogue = await pinnedCatalogue();
        for (const row of rows) {
            const item = catalogue.items.find((i) => i.name === row.name);
            expect(item, `the pinned catalogue carries "${row.name}"`).toBeTruthy();
            expect(item!.price).toBe(row.price);
        }
    });
});
