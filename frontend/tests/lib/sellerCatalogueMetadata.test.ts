import { describe, expect, it } from 'vitest';

import metadataFixture from '@/lib/shared/runtime-fixtures/bobs-pizza.seller-metadata.json';
import {
    SELLER_CATALOGUE_METADATA_EXAMPLE,
} from '@/lib/shared/sellerCatalogueMetadata';
import { parseSellerCatalogueDocument } from '@/lib/shared/sellerCatalogueMetadataParser';

describe('seller catalogue metadata parser', () => {
    it('parses a valid seller catalogue metadata document', () => {
        const metadata = parseSellerCatalogueDocument(metadataFixture, 'bobs-pizza.seller-metadata.json');

        expect(metadata.subjectAddress).toBe('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
        expect(metadata.menu).toHaveLength(2);
        expect(metadata.menu[0]?.name).toBe('Margherita Pizza');
    });

    it('rejects a document missing menu', () => {
        const { menu, ...rest } = metadataFixture as Record<string, unknown>;
        void menu;
        expect(() => parseSellerCatalogueDocument(rest, 'invalid-seller-metadata.json'))
            .toThrow(/invalid-seller-metadata\.json\.menu must be an array/);
    });

    it('ships an example metadata object that round-trips through the parser', () => {
        expect(SELLER_CATALOGUE_METADATA_EXAMPLE.subjectAddress).toMatch(/^0x/);
        expect(SELLER_CATALOGUE_METADATA_EXAMPLE.menu[0]?.category).toBe('Pizza');
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

    it('round-trips schemaAttestations through the parser', () => {
        const original = {
            ...metadataFixture,
            menu: [
                {
                    ...(metadataFixture as { menu: unknown[] }).menu[0] as Record<string, unknown>,
                    schemaAttestations: { 'figaro-allergen-v1': { contains: ['gluten'] } },
                },
            ],
        };

        const first = parseSellerCatalogueDocument(original, 'first-pass');
        const second = parseSellerCatalogueDocument(first, 'second-pass');

        expect(second.menu[0]?.schemaAttestations).toEqual(first.menu[0]?.schemaAttestations);
    });
});