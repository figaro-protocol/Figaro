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
});