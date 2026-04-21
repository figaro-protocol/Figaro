import { describe, expect, it } from 'vitest';

import {
    getSellerMetadataByAddress,
    listAssemblyBoundSubjectSummaries,
    listRuntimeInstitutionBindings,
    listRuntimeSubjectRecords,
    resolveRuntimeSubjectByAddress,
} from '@/lib/shared/runtimeIdentityRegistry';

describe('runtime identity registry', () => {
    it('exposes fixture-backed subject records and bindings', () => {
        expect(listRuntimeSubjectRecords()).toHaveLength(3);
        expect(listRuntimeInstitutionBindings()).toHaveLength(3);
    });

    it('resolves seller catalogue metadata by subject address', () => {
        const metadata = getSellerMetadataByAddress('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');

        expect(metadata?.merchantId).toBe('bobs-pizza-palace');
        expect(metadata?.menu).toHaveLength(2);
    });

    it('resolves a runtime subject preview for the configured address', () => {
        const context = resolveRuntimeSubjectByAddress('0x70997970C51812dc3A010C7d01b50e0d17dc79C8', 'local-anvil');

        expect(context?.subject.displayName).toBe("Bob's Pizza Palace");
        expect(context?.selectedBinding?.assemblySlug).toBe('figaro-eats');
    });

    it('resolves a procurement-bound subject preview for a second fixture address', () => {
        const context = resolveRuntimeSubjectByAddress('0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', 'local-anvil');

        expect(context?.subject.displayName).toBe('Acme Components Supply');
        expect(context?.selectedBinding?.assemblySlug).toBe('figaro-procurement');
        expect(context?.selectedBinding?.archetypeId).toBe('bonded-procurement-supplier');
    });

    it('resolves a disclosure-review-bound subject preview for a third fixture address', () => {
        const context = resolveRuntimeSubjectByAddress('0x90F79bf6EB2c4f870365E785982E1f101E93b906', 'local-anvil');

        expect(context?.subject.displayName).toBe('GreenLedger Review Desk');
        expect(context?.selectedBinding?.assemblySlug).toBe('figaro-disclosure-review');
        expect(context?.selectedBinding?.archetypeId).toBe('disclosure-review-operator');
    });

    it('lists assembly-bound subject summaries for figaro-eats', () => {
        const summaries = listAssemblyBoundSubjectSummaries('figaro-eats', 'local-anvil');

        expect(summaries).toHaveLength(1);
        expect(summaries[0]?.displayName).toBe("Bob's Pizza Palace");
        expect(summaries[0]?.bindingId).toBe('binding:bobs-pizza-palace:local-anvil');
        expect(summaries[0]?.metadataURI).toBe('ipfs://figaro/merchants/bobs-pizza-palace.metadata.json');
        expect(summaries[0]?.assetURI).toBe('ipfs://figaro/merchants/bobs-pizza-palace.assets.json');
        expect(summaries[0]?.assetDocument?.branding?.themeClass).toBe('runtime-shell-pizza');
        expect(summaries[0]?.sellerCatalogueMetadata?.location.geohash).toBe('dr5reg');
    });

    it('lists assembly-bound subject summaries for figaro-procurement', () => {
        const summaries = listAssemblyBoundSubjectSummaries('figaro-procurement', 'local-anvil');

        expect(summaries).toHaveLength(1);
        expect(summaries[0]?.displayName).toBe('Acme Components Supply');
        expect(summaries[0]?.archetypeId).toBe('bonded-procurement-supplier');
        expect(summaries[0]?.roleKinds).toEqual(['supplier']);
        expect(summaries[0]?.assemblyRoleKinds).toEqual(['supplier']);
        expect(summaries[0]?.assetDocument?.branding?.themeClass).toBe('runtime-shell-acme');
        expect(summaries[0]?.sellerCatalogueMetadata).toBeUndefined();
    });

    it('lists assembly-bound subject summaries for figaro-disclosure-review', () => {
        const summaries = listAssemblyBoundSubjectSummaries('figaro-disclosure-review', 'local-anvil');

        expect(summaries).toHaveLength(1);
        expect(summaries[0]?.displayName).toBe('GreenLedger Review Desk');
        expect(summaries[0]?.archetypeId).toBe('disclosure-review-operator');
        expect(summaries[0]?.roleKinds).toEqual(['reviewer']);
        expect(summaries[0]?.assemblyRoleKinds).toEqual(['reviewer']);
        expect(summaries[0]?.assetDocument?.branding?.themeClass).toBe('runtime-shell-greenledger');
        expect(summaries[0]?.sellerCatalogueMetadata).toBeUndefined();
    });
});