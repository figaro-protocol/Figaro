import { describe, expect, it } from 'vitest';

import metadataFixture from '@/lib/shared/runtime-fixtures/bobs-pizza.seller-metadata.json';
import {
    SELLER_CATALOGUE_METADATA_EXAMPLE,
} from '@/lib/shared/sellerCatalogueMetadata';
import { parseSellerCatalogueDocument } from '@/lib/shared/sellerCatalogueMetadataParser';

describe('seller catalogue metadata parser', () => {
    it('parses a valid seller catalogue metadata document', () => {
        const metadata = parseSellerCatalogueDocument(metadataFixture, 'bobs-pizza.seller-metadata.json');

        expect(metadata.location.geohash).toBe('dr5reg');
        expect(metadata.menu).toHaveLength(2);
        expect(metadata.branding?.themeClass).toBe('merchant-pizza');
    });

    it('rejects an invalid fulfillment mode', () => {
        expect(() => parseSellerCatalogueDocument({
            ...metadataFixture,
            fulfillmentModes: ['dine-in'],
        }, 'invalid-seller-metadata.json')).toThrow(/invalid-seller-metadata\.json\.fulfillmentModes\[0\] must be one of/);
    });

    it('ships an example metadata object that round-trips through the parser', () => {
        expect(SELLER_CATALOGUE_METADATA_EXAMPLE.merchantId).toBe('bobs-pizza-palace');
        expect(SELLER_CATALOGUE_METADATA_EXAMPLE.fulfillmentModes).toContain('delivery');
        expect(SELLER_CATALOGUE_METADATA_EXAMPLE.menu[0]?.category).toBe('Pizza');
    });

    it('parses acceptedTokens with valid 0x addresses', () => {
        const metadata = parseSellerCatalogueDocument({
            ...metadataFixture,
            acceptedTokens: [
                {
                    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
                    symbol: 'USDC',
                    name: 'USD Coin',
                },
                {
                    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
                    symbol: 'FIG',
                },
            ],
        }, 'with-tokens.json');

        expect(metadata.acceptedTokens).toHaveLength(2);
        expect(metadata.acceptedTokens?.[0]?.symbol).toBe('USDC');
        expect(metadata.acceptedTokens?.[1]?.address).toBe('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
    });

    it('rejects acceptedTokens with a malformed address', () => {
        expect(() => parseSellerCatalogueDocument({
            ...metadataFixture,
            acceptedTokens: [{ address: 'not-an-address', symbol: 'BAD' }],
        }, 'bad-tokens.json')).toThrow(/acceptedTokens\[0\]\.address must be a 20-byte hex address/);
    });

    it('parses supportedSchemas (optional config object)', () => {
        const metadata = parseSellerCatalogueDocument({
            ...metadataFixture,
            supportedSchemas: [
                { schemaKey: 'figaro-delivery-lifecycle-v1' },
                {
                    schemaKey: 'figaro-ghg-iso-14064-v1',
                    config: { methodology: 'iso-14064-1', scopes: [1, 2, 3] },
                },
            ],
        }, 'with-schemas.json');

        expect(metadata.supportedSchemas).toHaveLength(2);
        expect(metadata.supportedSchemas?.[1]?.config?.methodology).toBe('iso-14064-1');
    });

    it('rejects supportedSchemas with non-object config', () => {
        expect(() => parseSellerCatalogueDocument({
            ...metadataFixture,
            supportedSchemas: [{ schemaKey: 'figaro-x', config: 'not-an-object' }],
        }, 'bad-schemas.json')).toThrow(/supportedSchemas\[0\]\.config must be an object/);
    });

    it('parses per-item schemaAttestations', () => {
        const itemWithAttestations = {
            ...(metadataFixture as { menu: unknown[] }).menu[0] as Record<string, unknown>,
            schemaAttestations: {
                'figaro-allergen-v1': { allergenFree: ['peanuts'] },
                'figaro-certification-v1': { certifier: 'USDA', type: 'organic' },
            },
        };
        const metadata = parseSellerCatalogueDocument({
            ...metadataFixture,
            menu: [itemWithAttestations, (metadataFixture as { menu: unknown[] }).menu[1]],
        }, 'with-attestations.json');

        expect(metadata.menu[0]?.schemaAttestations?.['figaro-allergen-v1']?.allergenFree).toEqual(['peanuts']);
        expect(metadata.menu[0]?.schemaAttestations?.['figaro-certification-v1']?.certifier).toBe('USDA');
    });

    it('rejects schemaAttestations whose values are not objects', () => {
        const item = {
            ...(metadataFixture as { menu: unknown[] }).menu[0] as Record<string, unknown>,
            schemaAttestations: { 'figaro-allergen-v1': 'not-an-object' },
        };
        expect(() => parseSellerCatalogueDocument({
            ...metadataFixture,
            menu: [item],
        }, 'bad-attestations.json')).toThrow(/menu\[0\]\.schemaAttestations\.figaro-allergen-v1 must be an object/);
    });

    it('round-trips acceptedTokens / supportedSchemas / schemaAttestations through the parser', () => {
        const original = {
            ...metadataFixture,
            acceptedTokens: [
                { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC' },
            ],
            supportedSchemas: [{ schemaKey: 'figaro-delivery-lifecycle-v1' }],
            menu: [
                {
                    ...(metadataFixture as { menu: unknown[] }).menu[0] as Record<string, unknown>,
                    schemaAttestations: { 'figaro-allergen-v1': { contains: ['gluten'] } },
                },
            ],
        };

        const first = parseSellerCatalogueDocument(original, 'first-pass');
        const second = parseSellerCatalogueDocument(first, 'second-pass');

        expect(second.acceptedTokens).toEqual(first.acceptedTokens);
        expect(second.supportedSchemas).toEqual(first.supportedSchemas);
        expect(second.menu[0]?.schemaAttestations).toEqual(first.menu[0]?.schemaAttestations);
    });
});