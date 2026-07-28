/**
 * tradelensScenario.ts — the Tradelens genesis scenario's shared vocabulary,
 * used by BOTH legs of the e2e pair (scenario-tradelens author/publish/sign;
 * tradelens-runtime accept/witness/resolve). The settled composition lives in
 * the project_tradelens_assembly memory; /papers/after-tradelens is
 * narrative, never spec.
 *
 * Wallets: buyer = anvil[14]; the six sellers re-assert their profiles
 * idempotently each run (every index is shared world-state on the persisted
 * devnet). The shipper's binding designates the five sub-order counterparties
 * — the per-clause commit-order cursor maps merchant-process →
 * [inspector, forwarder, customs] and courier-process → [carrier, inland].
 */
import { expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';
import { mnemonicToAccount } from 'viem/accounts';
import { parseUnits, type Hex } from 'viem';
import {
    discoverAnchoredAssemblies,
    latestSellerProfileURI,
    pinJSONToIPFS,
    resolveIpfsURI,
    seedRegisteredSeller,
    sellerProfileBindings,
} from './devnet-helpers';
import { ANVIL_ACCOUNTS, ANVIL_KEYS } from '../anvilAccounts';

const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';
const key = (i: number) => mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: i });

export const TRADELENS_BUYER = ANVIL_ACCOUNTS[14] as Hex;
export const SHIPPER = key(15);
export const INSPECTOR = key(16);
export const FORWARDER = key(17);
export const CARRIER = key(18);
export const CUSTOMS = key(20);
export const INLAND = key(21);

export const C = {
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

/** Catalogue prices per seller — fixed items; the chain total is their sum.
 *  COMMIT order (root first, then topological): shipper, inspector,
 *  forwarder, carrier, customs, inland. */
export const PRICES = {
    shipper: '7', inspector: '0.1', forwarder: '0.3',
    carrier: '0.6', customs: '0.2', inland: '0.25',
} as const;
export const COMMIT_ORDER: Array<{ who: { address: Hex }; label: keyof typeof PRICES }> = [
    { who: SHIPPER, label: 'shipper' },
    { who: INSPECTOR, label: 'inspector' },
    { who: FORWARDER, label: 'forwarder' },
    { who: CARRIER, label: 'carrier' },
    { who: CUSTOMS, label: 'customs' },
    { who: INLAND, label: 'inland' },
];
export const EXPECTED_TOTAL = Object.values(PRICES)
    .reduce((s, p) => s + parseUnits(p, 18), 0n);

export const DEVICE = { lat: 51.9244, lon: 4.4777, destinationGeohash: 'u15pk4' } as const;

/** THE SHAPE — how every consumer recognizes the assembly on-chain without a
 *  slug: exactly six orders, one composing BOTH cold-chain AND
 *  chain-of-custody (the reefer carrier — no other anchored assembly does). */
export async function findTradelensAssembly(): Promise<string | undefined> {
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
    action: (control: Locator) => Promise<void>,
) {
    const controls = checkoutFields(page, clauseId, fieldPath);
    const n = await controls.count();
    expect(n, `at least one checkout control for ${clauseId}.${fieldPath}`).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) await action(controls.nth(i));
}

/** The buyer's transaction particulars — every general-clause fill the
 *  six-order chain needs (templates arrive value-free; catalogue-sourced
 *  cargo/cold-chain/freight-class values fold from the items, never here). */
export async function fillTradelensCheckout(page: Page): Promise<void> {
    await checkoutFields(page, C.modalities, 'modality-delivery').first().check();
    await checkoutFields(page, C.incoterms, 'incotermsRule-CIF').first().check();
    await checkoutFields(page, C.incoterms, 'incotermsNamedPlace').first().fill('Port of Rotterdam');
    await checkoutFields(page, C.custody, 'custodyScheme').first()
        .fill('ISO 17712 high-security bolt seal on ISO 6346 container');
    await checkoutFields(page, C.acceptance, 'acceptanceBasis').first()
        .fill('AQL 2.5 per ISO 2859-1 against PO 4711');
    // A compact law TAG (the spec's format pattern) — the jurisdiction label,
    // not prose.
    // applicable-law + arbitration are DESIGNER-authored assembly terms
    // (design.fills, ruled 2026-07-28) — nothing for the buyer to fill.
    // The emissions methodology is committed at signing by the parties — not
    // catalogue-sourced (no block.checkout.catalogueFills on the spec).
    await forEachCheckoutField(page, C.emissions, 'standard', (c) => c.fill('EN 16258'));
    await forEachCheckoutField(page, C.handoff, 'handoff-face-to-face', (c) => c.check());
    await forEachCheckoutField(page, C.proximity, 'bands-zone-wifi', (c) => c.check());
    await forEachCheckoutField(page, C.geo, 'originGeohash-device', (c) => c.click());
    await forEachCheckoutField(page, C.geo, 'originGeohash', async (c) => {
        await expect(c).toHaveValue(/^[0-9b-hj-km-np-z]+$/, { timeout: 10000 });
    });
    await forEachCheckoutField(page, C.geo, 'destinationGeohash', (c) => c.fill(DEVICE.destinationGeohash));
    // Second instances (the carrier's custody leg, the inspector's acceptance
    // basis) — fill every remaining required free-text control.
    await forEachCheckoutField(page, C.custody, 'custodyScheme', async (c) => {
        if ((await c.inputValue()) === '') await c.fill('ISO 17712 high-security bolt seal on ISO 6346 container');
    });
    await forEachCheckoutField(page, C.acceptance, 'acceptanceBasis', async (c) => {
        if ((await c.inputValue()) === '') await c.fill('AQL 2.5 per ISO 2859-1 against PO 4711');
    });
}

/** Onboard + bind the six sellers (idempotent re-assert): pinned catalogue
 *  per seller (cargo master data on the shipper's ITEM — the fold channel;
 *  catalogue-sourced cold-chain + freight-class on the carrier's), the
 *  shipper's binding carrying the five counterparty designations. */
export async function seedTradelensSellers(slug: string, token: Hex): Promise<void> {
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
                description: `${itemName} — Tradelens scenario`,
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
                description: `${name} — seeded by the Tradelens scenario pair`,
                catalogueURI,
                acceptedTokens: [{ address: token, symbol: 'MOCK', chainId: 31337 }],
                defaultTokenAddress: token,
                assemblyBindings: [{
                    bindingId: `tradelens-${who.address.slice(2, 8).toLowerCase()}`,
                    subjectAddress: who.address,
                    assemblySlug: slug,
                    counterpartyBindings,
                }],
            },
        });
    };

    const conformant = async (): Promise<boolean> => {
        const bindings = await sellerProfileBindings(SHIPPER.address as Hex);
        const b = bindings.find((x) => x.assemblySlug === slug);
        if (!b || !(b.counterpartyBindings ?? []).some((cb) => cb.clauseId === C.merchant && cb.addresses.length === 3)) return false;
        // The cargo master data must ride the ITEM level (massGrams/volumeMl)
        // — the channel figaro-cargo folds from; a clauseValues copy does NOT
        // fold. Re-seed a stale catalogue.
        const profileURI = await latestSellerProfileURI(SHIPPER.address as Hex);
        if (!profileURI) return false;
        const profile = await (await fetch(resolveIpfsURI(profileURI))).json() as { catalogueURI?: string };
        if (!profile.catalogueURI) return false;
        const catalogue = await (await fetch(resolveIpfsURI(profile.catalogueURI))).json() as { items?: Array<{ massGrams?: number }> };
        return (catalogue.items ?? []).some((i) => (i.massGrams ?? 0) > 0);
    };

    if (await conformant()) return;
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
    await expect.poll(conformant, {
        timeout: 60000, message: "the shipper's pinned profile carries the binding + five designations + the item-level cargo master data",
    }).toBe(true);
}
