/**
 * scenario-tradelens.devnet.spec.ts
 *
 * TRADELENS GENESIS ASSEMBLY — the design-canvas scenario leg (families
 * 6 freight + 7 cold-chain/regulated + 10 cross-border + recourse; the
 * settled composition lives in the project_tradelens_assembly memory;
 * /papers/after-tradelens is NARRATIVE, never spec).
 *
 * Six orders, importer-of-record as root buyer on every one (kernel star):
 *   order-0 root  shipper-of-record   cargo, incoterms, chain-of-custody,
 *                                     acceptance-criteria, applicable-law,
 *                                     arbitration-kleros, geolocation, modalities
 *   order-1 p:0   inspection service  merchant-process, acceptance-criteria
 *   order-2 p:0   freight forwarder   merchant-process, geolocation
 *   order-3 p:2   ocean carrier       courier-process, cold-chain, chain-of-custody,
 *                 (reefer)            emissions, freight-class, handoff,
 *                                     proximity-policy, geolocation
 *   order-4 p:3   customs agent       merchant-process, consent (affixed filing terms)
 *   order-5 p:4   inland carrier      courier-process, handoff, proximity-policy,
 *                                     geolocation
 *
 * The scenario leg drives the REAL designer UI all the way to the IPFS pin +
 * AssemblyRegistry anchor (persisted — the same publish a builder performs on
 * mainnet; idempotent by SHAPE discovery, never a slug), onboards + binds the
 * six sellers (catalogue-sourced cargo/cold-chain/freight-class/emissions
 * values on the items; the shipper's binding designates the five sub-order
 * counterparties — the per-clause commit-order cursor maps shared process
 * clauses to distinct wallets), and checks out as the buyer through SIGN +
 * relay with the derived total asserted. The runtime leg
 * (tradelens-runtime.devnet.spec.ts) consumes the anchored artifact and
 * carries the money legs.
 */
import { test, expect, gotoAsWallet } from './devnet-multi-test';
import { planSubOrderSellers } from '@figaro/sdk';
import { mnemonicToAccount } from 'viem/accounts';
import { createPublicClient, createWalletClient, http, parseAbi, parseUnits, type Hex } from 'viem';
import type { Page } from '@playwright/test';
import {
    LOCAL_ANVIL,
    RPC_URL,
    confirmAgreementPreviews,
    discoverAnchoredAssemblies,
    latestSellerProfileURI,
    pinJSONToIPFS,
    readLocalDeploymentConfig,
    resolveIpfsURI,
    seedRegisteredSeller,
    sellerProfileBindings,
    waitForConnected,
} from './devnet-helpers';
import { ANVIL_ACCOUNTS, ANVIL_KEYS } from '../anvilAccounts';

const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';
const key = (i: number) => mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: i });

// Buyer 14 (a buyer elsewhere too — buyers hold no seller profile, no clash).
// Sellers re-assert their profile idempotently each run (the suite-wide
// pattern on a persisted devnet — every wallet index is shared world-state).
const BUYER = ANVIL_ACCOUNTS[14] as Hex;
const SHIPPER = key(15);
const INSPECTOR = key(16);
const FORWARDER = key(17);
const CARRIER = key(18);
const CUSTOMS = key(20);
const INLAND = key(21);

const C = {
    cargo: 'figaro-cargo',
    incoterms: 'figaro-incoterms',
    custody: 'figaro-chain-of-custody',
    acceptance: 'figaro-acceptance-criteria',
    law: 'figaro-applicable-law',
    kleros: 'figaro-arbitration-kleros',
    geo: 'figaro-geolocation',
    modalities: 'figaro-modalities',
    merchant: 'figaro-merchant-process',
    courier: 'figaro-courier-process',
    coldChain: 'figaro-cold-chain',
    emissions: 'figaro-emissions',
    freightClass: 'figaro-freight-class',
    handoff: 'figaro-handoff',
    proximity: 'figaro-proximity-policy',
    consent: 'figaro-consent',
} as const;

// Per-order clause plan, keyed by draw order (root first). Parents encode the
// chain: 1←0, 2←0, 3←2, 4←3, 5←4.
const NODE_PLAN: Array<{ parent: number | null; clauses: string[] }> = [
    { parent: null, clauses: [C.cargo, C.incoterms, C.custody, C.acceptance, C.law, C.kleros, C.geo, C.modalities] },
    { parent: 0, clauses: [C.merchant, C.acceptance] },
    { parent: 0, clauses: [C.merchant, C.geo] },
    { parent: 2, clauses: [C.courier, C.coldChain, C.custody, C.emissions, C.freightClass, C.handoff, C.proximity, C.geo] },
    { parent: 3, clauses: [C.merchant, C.consent] },
    { parent: 4, clauses: [C.courier, C.handoff, C.proximity, C.geo] },
];

const CONSENT_DOC_TEXT =
    'Customs filing terms — the importer authorizes the agent to file entries on their behalf; the parties accept by signing the agreement root.';

const PRICES = { shipper: '7', inspector: '0.1', forwarder: '0.3', carrier: '0.6', customs: '0.2', inland: '0.25' } as const;
const EXPECTED_TOTAL =
    parseUnits(PRICES.shipper, 18) + parseUnits(PRICES.inspector, 18) + parseUnits(PRICES.forwarder, 18)
    + parseUnits(PRICES.carrier, 18) + parseUnits(PRICES.customs, 18) + parseUnits(PRICES.inland, 18);

const DEVICE = { lat: 51.9244, lon: 4.4777, destinationGeohash: 'u15pk4' } as const; // Rotterdam-ish

/** THE SHAPE — how every consumer recognizes this assembly on-chain without a
 *  slug: exactly six orders, one of them composing BOTH cold-chain AND
 *  chain-of-custody (the reefer carrier — no other anchored assembly does). */
async function findTradelensAssembly(): Promise<string | undefined> {
    const templates = await discoverAnchoredAssemblies();
    return templates.find((t) =>
        t.agreements.length === 6
        && t.agreements.some((o) => {
            const clauses = Object.keys(o.clauses ?? {});
            return clauses.includes(C.coldChain) && clauses.includes(C.custody);
        }),
    )?.slug;
}

/** A checkout-view general-clause field control, suffix-matched (the testid is
 *  `checkout-field-<orderId>-<clauseId>-<field>[-<option>]`; order ids vary). */
function checkoutFields(page: Page, clauseId: string, fieldPath: string) {
    return page.locator(`[data-testid^="checkout-field-"][data-testid$="-${clauseId}-${fieldPath}"]`);
}

/** Apply an action to EVERY order's control for a clause-field — several
 *  Tradelens orders share handoff/proximity/geolocation. */
async function forEachCheckoutField(
    page: Page,
    clauseId: string,
    fieldPath: string,
    action: (control: ReturnType<Page['locator']>) => Promise<void>,
) {
    const controls = checkoutFields(page, clauseId, fieldPath);
    const n = await controls.count();
    expect(n, `at least one checkout control for ${clauseId}.${fieldPath}`).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) await action(controls.nth(i));
}

test.describe('TRADELENS SCENARIO — six bonded value-adders, authored on the canvas, anchored, bound, signed (devnet)', () => {
    test.setTimeout(600_000);

    test('the composition publishes once, the six sellers bind, and the buyer signs the whole chain', async ({ page, context }) => {
        page.on('dialog', (dialog) => { void dialog.accept().catch(() => {}); });
        await context.grantPermissions(['geolocation']);
        await context.setGeolocation({ latitude: DEVICE.lat, longitude: DEVICE.lon });

        // ── AUTHOR (idempotent): discover by shape; absent → the real canvas. ──
        let slug = await findTradelensAssembly();
        if (!slug) {
            await page.addInitScript(() => {
                try {
                    window.localStorage.removeItem('figaro:designer:current');
                    window.localStorage.removeItem('figaro:designer:drafts');
                } catch { /* noop */ }
            });
            await page.goto('/builders/designer/new?fresh=1&e2e=devnet', { waitUntil: 'domcontentloaded' });
            await page.getByTestId('designer-canvas-toolbar').waitFor({ timeout: 30000 });
            await page.getByTestId('designer-saved-hint').waitFor({ timeout: 15000 });

            const orderNodes = page.locator('[data-testid^="order-node-"]:not([data-testid$="-delete"])');
            await expect(orderNodes).toHaveCount(1, { timeout: 10000 });
            const nodeIds: string[] = [
                (await orderNodes.first().getAttribute('data-testid'))!.replace('order-node-', ''),
            ];
            const currentIds = async () => orderNodes.evaluateAll((els) =>
                els.map((el) => el.getAttribute('data-testid')!.replace('order-node-', '')));

            // Draw the five sub-orders in plan order — each add's new id is the
            // set difference, recorded so plan index i ↔ nodeIds[i].
            await orderNodes.first().click();
            await page.getByTestId('agreement-drawer').waitFor({ state: 'visible', timeout: 10000 });
            for (let i = 1; i < NODE_PLAN.length; i++) {
                const parentId = nodeIds[NODE_PLAN[i].parent!];
                const before = new Set(await currentIds());
                await page.getByTestId(`btn-add-suborder-${parentId}`).click();
                await expect(orderNodes).toHaveCount(before.size + 1, { timeout: 10000 });
                const after = await currentIds();
                nodeIds.push(after.find((id) => !before.has(id))!);
            }

            // Compose each node's clauses through the drawer's registry tab.
            for (let i = 0; i < NODE_PLAN.length; i++) {
                await page.getByTestId(`drawer-node-tab-${nodeIds[i]}`).click();
                await page.getByTestId('drawer-tab-registry').click();
                await page.getByTestId('drawer-section-registry').waitFor({ state: 'visible', timeout: 5000 });
                for (const clauseId of NODE_PLAN[i].clauses) {
                    await page.getByTestId(`drawer-registry-clause-${clauseId}`).check();
                }
                if (NODE_PLAN[i].clauses.includes(C.consent)) {
                    // The customs agent's filing terms — affixed through the
                    // repeater (pin → keccak anchor; the only fill path).
                    await page.getByTestId('drawer-field-figaro-consent-documents-add').click();
                    await page.getByTestId('drawer-field-figaro-consent-documents-0-documentHash-affix')
                        .setInputFiles({
                            name: 'customs-filing-terms.txt',
                            mimeType: 'text/plain',
                            buffer: Buffer.from(CONSENT_DOC_TEXT),
                        });
                    await page.getByTestId('drawer-field-figaro-consent-documents-0-documentHash')
                        .waitFor({ state: 'visible', timeout: 30000 });
                    await page.getByTestId('drawer-field-figaro-consent-documents-0-documentVersion').fill('1.0');
                    await page.getByTestId('drawer-field-figaro-consent-documents-0-documentTitle').fill('Customs filing terms');
                }
            }

            await page.getByTestId('designer-name-input').fill('Containerised import chain');
            await page.getByTestId('designer-summary-input').fill('Six bonded value-adders move a reefer container from shipper to consignee.');
            await page.getByTestId('designer-description-input').fill('The TradeLens perimeter as a permissionless bonded composition: shipper, pre-shipment inspection, freight forwarder, reefer ocean carrier, customs agent, and destination inland carrier — each independently bonded, settled atomically by the importer-of-record.');
            await expect(page.getByTestId('designer-review')).toBeEnabled({ timeout: 5000 });
            await page.getByTestId('designer-review').click();
            await page.waitForURL(/\/builders\/designer\/view\?slug=asm-/, { timeout: 15000 });
            const handle = page.url().match(/[?&]slug=(asm-[a-z0-9-]+)/)?.[1];
            expect(handle, 'review navigated to a draft handle').toBeTruthy();
            await page.goto(`/builders/designer/view?slug=${handle}&intent=publish&e2e=devnet`, { waitUntil: 'domcontentloaded' });
            const confirmBtn = page.getByTestId('review-confirm-publish');
            await confirmBtn.waitFor({ state: 'visible', timeout: 15000 });
            await waitForConnected(page);
            await confirmBtn.click();
            await page.getByTestId('assembly-publish-receipt').waitFor({ timeout: 60000 });

            slug = await findTradelensAssembly();
            expect(slug, 'the published Tradelens assembly is discoverable by shape').toBeTruthy();
        }

        // ── ONBOARD + BIND the six sellers (idempotent re-assert). The shipper's
        //    binding designates the sub-order counterparties: the per-clause
        //    cursor maps merchant-process → [inspector, forwarder, customs] and
        //    courier-process → [carrier, inland] in commit order. ──
        const token = readLocalDeploymentConfig().tokenAddress!;
        expect(token, 'NEXT_PUBLIC_TOKEN_ADDRESS resolves — run ./deploy-local.sh').toBeTruthy();
        const seed = async (
            who: { address: Hex }, keyIndex: number, name: string, itemName: string, price: string,
            itemProps?: Record<string, unknown>,
            counterpartyBindings: Array<{ clauseId: string; addresses: string[] }> = [],
        ) => {
            const { uri: catalogueURI } = await pinJSONToIPFS({
                subjectAddress: who.address,
                version: '1.0.0',
                unitSystem: 'metric' as const,
                items: [{
                    id: `tradelens-${itemName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
                    name: itemName,
                    description: `${itemName} — Tradelens scenario leg`,
                    price,
                    category: 'freight',
                    image: '🚢',
                    available: true,
                    ...(itemProps ?? {}),
                }],
            });
            await seedRegisteredSeller({
                walletKey: ANVIL_KEYS[keyIndex] as Hex,
                profile: {
                    name,
                    description: `${name} — seeded by scenario-tradelens.devnet.spec.ts`,
                    catalogueURI,
                    acceptedTokens: [{ address: token, symbol: 'MOCK', chainId: 31337 }],
                    defaultTokenAddress: token,
                    assemblyBindings: [{
                        bindingId: `tradelens-${who.address.slice(2, 8).toLowerCase()}`,
                        subjectAddress: who.address,
                        assemblySlug: slug!,
                        counterpartyBindings,
                    }],
                },
            });
        };

        const shipperConformant = async () => {
            const bindings = await sellerProfileBindings(SHIPPER.address as Hex);
            const b = bindings.find((x) => x.assemblySlug === slug);
            if (!b || !(b.counterpartyBindings ?? []).some((cb) => cb.clauseId === C.merchant && cb.addresses.length === 3)) return false;
            // The cargo master data must ride the ITEM level (massGrams /
            // volumeMl) — the channel figaro-cargo folds from at checkout; a
            // clauseValues copy does NOT fold. Re-seed a stale catalogue.
            const profileURI = await latestSellerProfileURI(SHIPPER.address as Hex);
            if (!profileURI) return false;
            const profile = await (await fetch(resolveIpfsURI(profileURI))).json() as { catalogueURI?: string };
            if (!profile.catalogueURI) return false;
            const catalogue = await (await fetch(resolveIpfsURI(profile.catalogueURI))).json() as { items?: Array<{ massGrams?: number }> };
            return (catalogue.items ?? []).some((i) => (i.massGrams ?? 0) > 0);
        };
        if (!(await shipperConformant())) {
            await seed(SHIPPER, 15, 'Meridian Exports', 'Containerised cargo (invoice)', PRICES.shipper,
                { massGrams: 12_000_000, volumeMl: 33_000_000 },
                [
                    { clauseId: C.merchant, addresses: [INSPECTOR.address, FORWARDER.address, CUSTOMS.address] },
                    { clauseId: C.courier, addresses: [CARRIER.address, INLAND.address] },
                ]);
            await seed(INSPECTOR, 16, 'Veritas Inspection', 'Pre-shipment inspection', PRICES.inspector);
            await seed(FORWARDER, 17, 'Atlas Forwarding', 'Freight coordination', PRICES.forwarder);
            await seed(CARRIER, 18, 'Boreal Lines', 'Reefer ocean freight', PRICES.carrier, {
                clauseValues: {
                    [C.coldChain]: { tempClass: 'refrigerated', tempMinC: 2, tempMaxC: 8, recordingIntervalSeconds: 900 },
                    [C.freightClass]: { nmfcClass: '85' },
                },
            });
            await seed(CUSTOMS, 20, 'Portside Customs Agents', 'Customs entry filing', PRICES.customs);
            await seed(INLAND, 21, 'Delta Drayage', 'Destination drayage', PRICES.inland);
            await expect.poll(shipperConformant, {
                timeout: 60000, message: "the shipper's pinned profile carries the binding + five designations",
            }).toBe(true);
        }

        // ── FUND the buyer (solvency gate: payment + bond in MOCK). ──
        const publicClient = createPublicClient({ chain: LOCAL_ANVIL, transport: http(RPC_URL) });
        const minter = createWalletClient({
            account: mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 0 }), chain: LOCAL_ANVIL, transport: http(RPC_URL),
        });
        const mintHash = await minter.writeContract({
            address: token, abi: parseAbi(['function mint(address to, uint256 amount) external']),
            functionName: 'mint', args: [BUYER, parseUnits('1000', 18)],
        });
        await publicClient.waitForTransactionReceipt({ hash: mintHash });

        // ── The binding cursor, asserted out-of-band before the UI leg: every
        //    sub-order's seller must resolve, in commit order, from the
        //    shipper's designations — a cursor mismatch stalls checkout with
        //    no visible error, so fail HERE with names instead. ──
        const anchored = (await discoverAnchoredAssemblies()).find((t) => t.slug === slug)!;
        const shipperBindings = await sellerProfileBindings(SHIPPER.address as Hex);
        const plan = planSubOrderSellers({
            assemblyTemplate: anchored as never,
            counterpartyBindings: (shipperBindings.find((b) => b.assemblySlug === slug)?.counterpartyBindings ?? [])
                .map((cb) => ({ clauseId: cb.clauseId, addresses: cb.addresses as `0x${string}`[] })),
        });
        expect(plan.map((p) => p.seller?.toLowerCase()), 'five sub-order sellers resolve in commit order').toEqual([
            INSPECTOR.address, FORWARDER.address, CARRIER.address, CUSTOMS.address, INLAND.address,
        ].map((a) => a.toLowerCase()));

        page.on('pageerror', (err) => console.log(`[tradelens][pageerror] ${err.message}`));
        page.on('console', (msg) => {
            if (msg.type() === 'error') console.log(`[tradelens][console.error] ${msg.text()}`);
        });

        // ── CHECKOUT: the importer-of-record signs the whole chain. ──
        await gotoAsWallet(page, BUYER, `/s/view?seller=${SHIPPER.address}&e2e=devnet`);
        await page.getByTestId('seller-detail-view').waitFor({ timeout: 30000 });
        await waitForConnected(page);
        const addBtn = page.locator('[data-testid^="btn-add-"]').first();
        await addBtn.waitFor({ state: 'visible', timeout: 20000 });
        await addBtn.click();
        await page.getByTestId('btn-review-order').click();
        await page.getByTestId('checkout-view').waitFor({ timeout: 20000 });
        await waitForConnected(page);

        // Transaction particulars — the buyer's checkout fills (templates arrive
        // value-free; catalogue-sourced cargo/cold-chain/freight-class/emissions
        // values folded from the items, never filled here).
        await checkoutFields(page, C.modalities, 'modality-delivery').first().check();
        await checkoutFields(page, C.incoterms, 'incotermsRule-CIF').first().check();
        await checkoutFields(page, C.incoterms, 'incotermsNamedPlace').first().fill('Port of Rotterdam');
        await checkoutFields(page, C.custody, 'custodyScheme').first()
            .fill('ISO 17712 high-security bolt seal on ISO 6346 container');
        await checkoutFields(page, C.acceptance, 'acceptanceBasis').first()
            .fill('AQL 2.5 per ISO 2859-1 against PO 4711');
        // The applicable-law spec commits a compact law tag (pattern
        // ^[A-Za-z][A-Za-z0-9-]{1,15}$ — no spaces): the jurisdiction label,
        // not prose.
        await checkoutFields(page, C.law, 'applicableLaw').first().fill('England-Wales');
        await checkoutFields(page, C.kleros, 'klerosCourt-general').first().check();
        // The emissions methodology is committed at signing by the parties —
        // not catalogue-sourced (no block.catalogueSourced on the spec).
        await forEachCheckoutField(page, C.emissions, 'standard', (c) => c.fill('EN 16258'));
        await forEachCheckoutField(page, C.handoff, 'handoff-face-to-face', (c) => c.check());
        await forEachCheckoutField(page, C.proximity, 'bands-zone-wifi', (c) => c.check());
        // Geolocation on several orders: device-assist the origin, type the
        // destination on each.
        await forEachCheckoutField(page, C.geo, 'originGeohash-device', (c) => c.click());
        await forEachCheckoutField(page, C.geo, 'originGeohash', async (c) => {
            await expect(c).toHaveValue(/^[0-9b-hj-km-np-z]+$/, { timeout: 10000 });
        });
        await forEachCheckoutField(page, C.geo, 'destinationGeohash', (c) => c.fill(DEVICE.destinationGeohash));
        // Second custody instance (the carrier's leg) + second acceptance
        // instance (the inspector's basis) — fill every remaining required
        // free-text control the suffix scan finds beyond the first.
        await forEachCheckoutField(page, C.custody, 'custodyScheme', async (c) => {
            if ((await c.inputValue()) === '') await c.fill('ISO 17712 high-security bolt seal on ISO 6346 container');
        });
        await forEachCheckoutField(page, C.acceptance, 'acceptanceBasis', async (c) => {
            if ((await c.inputValue()) === '') await c.fill('AQL 2.5 per ISO 2859-1 against PO 4711');
        });

        // The derived chain total the buyer signs — six fixed items.
        await expect(page.getByTestId('checkout-view')).toContainText('8.45', { timeout: 20000 });

        const place = page.getByTestId('btn-place-order');
        await expect(place, 'buyer connected + assembly bound → "Place order"').toHaveText(/Place order/, { timeout: 20000 });
        await place.click();
        try {
            await confirmAgreementPreviews(page, 6);
        } catch (cause) {
            // The sign gate rejects silently into a transient toast — surface
            // whatever error text the page holds before rethrowing.
            const alerts = await page.locator('[role="alert"], [data-testid*="error"]').allTextContents();
            const modalOpen = await page.getByTestId('agreement-preview-modal').isVisible().catch(() => false);
            console.log(`[tradelens][stall] modalOpen=${modalOpen} alerts=${JSON.stringify(alerts)}`);
            throw cause;
        }
        await page.getByTestId('buyer-share-panel').waitFor({ timeout: 60000 });
        expect(EXPECTED_TOTAL).toBe(parseUnits('8.45', 18));
    });
});
