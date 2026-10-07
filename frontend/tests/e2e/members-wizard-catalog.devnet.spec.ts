/**
 * members-wizard-catalog.devnet.spec.ts
 *
 * The member wizard's catalog and assemblies steps, driven as a person drives
 * them, each fact read back OUT-OF-BAND (chain events → the pinned documents on
 * IPFS), never from the screen that wrote it.
 *
 *   - CSV import: a CSV file is chosen on the Catalog step → the wizard shows
 *     the parsed rows → Review → publish → the pinned catalog document the
 *     member's profile points at carries those items.
 *   - Assemblies step: the rows come in a stable order — the registry's own,
 *     most recently anchored first — derived here from chain events, held
 *     through a toggle and a reload.
 *   - Update path: a catalog item edited after the wallet's profile is already
 *     published survives Review → publish — the pinned catalog and the seller
 *     page carry the edit, not the first publish's catalog.
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
import { sellerPageHref } from '@/lib/member/memberListing';
import { test, gotoAsWallet, ANVIL_ACCOUNTS } from './devnet-multi-test';
import type { Hex } from 'viem';
import { ASSEMBLY_REGISTRY_ABI } from '@figaro-protocol/sdk';
import { deriveAssemblySlug } from '@/lib/shared/assemblyTemplate';
import {
    discoverAnchoredAssemblies,
    latestMemberProfileURI,
    localPublicClient,
    pinJSONToIPFS,
    readLocalDeploymentConfig,
    referenceAssemblySlug,
    resolveIpfsURI,
    seedRegisteredMember,
} from './devnet-helpers';
import { ANVIL_KEYS } from '../anvilAccounts';

const WIZARD = ANVIL_ACCOUNTS[33] as Hex;
const WIZARD_KEY = ANVIL_KEYS[33] as Hex;
const WIZARD_NAME = 'Wizard Catalog Counter';

interface CatalogDoc { items: Array<{ id: string; name: string; price: string }> }

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
    const { uri: catalogURI } = await pinJSONToIPFS({
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
            description: 'Seeded by members-wizard-catalog.devnet.spec.ts',
            catalogURI,
            acceptedTokens: [{ address: token, symbol: 'MOCK', chainId: 31337 }],
            defaultTokenAddress: token,
            assemblyBindings: [{
                bindingId: 'wizard-catalog', subjectAddress: WIZARD, assemblySlug: slug, counterpartyBindings: [],
            }],
        },
    });
    return { itemName, slug };
}

/** The wallet's live catalog document, read from chain → IPFS. */
async function pinnedCatalog(): Promise<CatalogDoc> {
    const profileURI = await latestMemberProfileURI(WIZARD);
    expect(profileURI, 'the wallet has an anchored profile').toMatch(/^ipfs:\/\//);
    const profile = await (await fetch(resolveIpfsURI(profileURI!))).json() as { catalogURI?: string };
    expect(profile.catalogURI, 'the pinned profile carries a catalogURI').toMatch(/^ipfs:\/\//);
    return await (await fetch(resolveIpfsURI(profile.catalogURI!))).json() as CatalogDoc;
}

/** The slugs the Assemblies step must list, in the order it must list them,
 *  from the registry's events alone: every anchored assembly whose stake is
 *  still held, the most recently anchored first (a block's own logs keep their
 *  log order). */
async function expectedAssemblyOrder(): Promise<string[]> {
    const client = localPublicClient();
    const config = readLocalDeploymentConfig();
    const address = (process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY ?? config.assemblyRegistry) as Hex;
    const [registered, withdrawn] = await Promise.all([
        client.getContractEvents({ address, abi: ASSEMBLY_REGISTRY_ABI, eventName: 'AssemblyRegistered', fromBlock: 0n }),
        client.getContractEvents({ address, abi: ASSEMBLY_REGISTRY_ABI, eventName: 'DepositWithdrawn', fromBlock: 0n }),
    ]);
    const gone = new Set(withdrawn.map((e) => String(e.args.compositionHash).toLowerCase()));
    return registered
        .filter((e) => !gone.has(String(e.args.compositionHash).toLowerCase()))
        .map((e, i) => ({ e, i }))
        .sort((a, b) => Number(b.e.blockNumber! - a.e.blockNumber!) || a.i - b.i)
        .map(({ e }) => deriveAssemblySlug(e.args.compositionHash as Hex));
}

/** The slugs the Assemblies step lists right now, top to bottom. */
async function listedAssemblySlugs(page: Page): Promise<string[]> {
    const testids = await page.locator('[data-testid^="seller-assembly-row-"]')
        .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-testid') ?? ''));
    return testids.map((id) => id.slice('seller-assembly-row-'.length));
}

const next = (page: Page) => page.getByRole('button', { name: /^Next/ });

/** Walk the wizard from Identity to the Catalog step as the wizard wallet.
 *  The wizard re-walks every step for a registered wallet (its draft starts
 *  empty; publishing updates the profile in place), so identity and the
 *  binding are entered again. */
async function walkToCatalog(page: Page, slug: string): Promise<void> {
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
    await expect(page).toHaveURL(/\/members\/catalog/, { timeout: 30_000 });
}

/** Catalog → Review → publish. Resolves on the receipt heading. */
async function publishFromCatalog(page: Page): Promise<void> {
    await next(page).click();
    await expect(page).toHaveURL(/\/members\/agents/, { timeout: 30_000 });
    await next(page).click();
    await expect(page).toHaveURL(/\/members\/endpoints/, { timeout: 30_000 });
    await next(page).click();
    await page.waitForURL(/\/members\/review/, { timeout: 90_000 });
    await page.getByTestId('review-confirm-publish').click();
    await expect(page.getByRole('heading', { name: /Registered\.|Profile updated/i }))
        .toBeVisible({ timeout: 60_000 });
}

test.describe('member wizard — catalog and assemblies steps (devnet)', () => {
    test.setTimeout(240_000);

    test('CSV import: the parsed rows show, publish pins them in the catalog', async ({ page }) => {
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

        await walkToCatalog(page, slug);
        await page.getByTestId('catalog-csv-import').setInputFiles({
            name: 'catalog.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8'),
        });

        // The wizard shows the parsed rows: the count line and each row's fields.
        await expect(page.getByTestId('catalog-csv-imported')).toHaveText(/Imported 2 items from CSV/);
        for (const row of rows) {
            await expect(
                page.locator('[id^="item-"][id$="-name"]').evaluateAll(
                    (els, name) => els.some((el) => (el as HTMLInputElement).value === name), row.name),
            ).resolves.toBe(true);
        }

        await publishFromCatalog(page);

        // Out-of-band: the pinned catalog carries every imported row.
        const catalog = await pinnedCatalog();
        for (const row of rows) {
            const item = catalog.items.find((i) => i.name === row.name);
            expect(item, `the pinned catalog carries "${row.name}"`).toBeTruthy();
            expect(item!.price).toBe(row.price);
        }
    });

    test('update path: an item edited after the first publish survives Review → publish', async ({ page }) => {
        const runTag = Date.now().toString(36);
        const { slug } = await seedBaseline(runTag);
        const first = { name: `Update loaf ${runTag}`, price: '4' };
        const edited = { name: `Update loaf ${runTag} (edited)`, price: '5' };

        // Publish #1: the wallet is already registered, so this is updateProfile.
        await walkToCatalog(page, slug);
        await page.locator('[id^="item-"][id$="-name"]').first().fill(first.name);
        await page.locator('[id^="item-"][id$="-price"]').first().fill(first.price);
        await publishFromCatalog(page);
        expect((await pinnedCatalog()).items.map((i) => i.name), 'publish #1 pinned the first item')
            .toEqual([first.name]);

        // The member edits the item and publishes again. The draft is the
        // wizard's own — the receipt's "Continue" never ran — so the wizard
        // is re-entered where the member left it.
        await page.goto('/members/catalog', { waitUntil: 'domcontentloaded' });
        const nameField = page.locator('[id^="item-"][id$="-name"]').first();
        await expect(nameField).toHaveValue(first.name, { timeout: 30_000 });
        await nameField.fill(edited.name);
        await page.locator('[id^="item-"][id$="-price"]').first().fill(edited.price);
        await publishFromCatalog(page);

        // Out-of-band: the pinned catalog carries the EDIT.
        const catalog = await pinnedCatalog();
        expect(catalog.items.map((i) => i.name), 'publish #2 pinned the edited item').toEqual([edited.name]);
        expect(catalog.items[0].price).toBe(edited.price);

        // And the seller page — what a buyer reads — shows it.
        await page.goto(`${sellerPageHref(WIZARD)}&e2e=devnet`, { waitUntil: 'domcontentloaded' });
        const detail = page.getByTestId('member-detail-view');
        await detail.waitFor({ state: 'visible', timeout: 30_000 });
        await expect(detail).toContainText(edited.name, { timeout: 30_000 });
        await expect(detail.getByText(first.name, { exact: true }), 'the first publish\'s item is gone').toHaveCount(0);
    });

    test('assemblies step: the rows keep the registry\'s order through a toggle and a reload', async ({ page }) => {
        const { slug } = await seedBaseline(Date.now().toString(36));
        const expected = await expectedAssemblyOrder();
        expect(expected.length, 'assemblies are anchored — run populate-test-data').toBeGreaterThan(1);

        await gotoAsWallet(page, WIZARD, '/members/identity?e2e=devnet');
        await expect(page.locator('#profile-name')).toBeVisible({ timeout: 30_000 });
        await page.locator('#profile-name').fill(WIZARD_NAME);
        await page.getByRole('button', { name: /\+ MOCK$/ }).click();
        await page.locator('input[name="defaultTokenAddress"]').first().check();
        await next(page).click();
        await expect(page).toHaveURL(/\/members\/assemblies/, { timeout: 30_000 });

        // Every anchored assembly is a row, in the chain's order — never a
        // list that waits on its templates to settle into place.
        const rows = page.locator('[data-testid^="seller-assembly-row-"]');
        await expect(rows).toHaveCount(expected.length, { timeout: 30_000 });
        expect(await listedAssemblySlugs(page), 'rows follow the registry order').toEqual(expected);

        // Binding a row does not move it (a selected row stays where it was).
        const boundRow = page.getByTestId(`seller-assembly-row-${slug}`);
        await boundRow.locator('input[type="checkbox"]').first().check();
        await expect(boundRow.locator('input[type="checkbox"]').first()).toBeChecked();
        expect(await listedAssemblySlugs(page), 'a toggle leaves the order alone').toEqual(expected);

        // A reload restores the draft and the same order.
        await page.waitForFunction(
            (needle) => Object.keys(window.localStorage).some((k) => (window.localStorage.getItem(k) ?? '').includes(needle)),
            slug, { timeout: 15_000 },
        );
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(rows).toHaveCount(expected.length, { timeout: 30_000 });
        await expect(page.getByTestId(`seller-assembly-row-${slug}`).locator('input[type="checkbox"]').first())
            .toBeChecked({ timeout: 30_000 });
        expect(await listedAssemblySlugs(page), 'a reload leaves the order alone').toEqual(expected);
    });
});
