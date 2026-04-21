import { describe, expect, it } from 'vitest';

import { SELLER_CATALOGUE_METADATA_EXAMPLE } from '@/lib/shared/sellerCatalogueMetadata';
import { RuntimeIdentityDataSource } from '@/lib/shared/runtimeDataSource';
import {
    createRuntimeIdentityDataSourceFromManifestDocument,
    getAssetDocumentByUriFromSource,
    getSubjectProvenanceByAddressFromSource,
    getSellerMetadataByAddressFromSource,
    listAssemblyBoundSubjectSummariesFromSource,
    listSubjectProvenanceRecordsFromSource,
    listValidationIssuesFromSource,
    resolveRuntimeSubjectByAddressFromSource,
} from '@/lib/shared/runtimeDataSource';
import localRuntimeManifestDocument from '@/lib/shared/runtime-fixtures/local-runtime.manifest.json';

const testSource: RuntimeIdentityDataSource = {
    listSubjectRecords: () => [
        {
            subjectAddress: '0x1111111111111111111111111111111111111111',
            subjectKind: 'merchant',
            displayName: 'Fixture Transport Merchant',
            bindingRefs: [
                {
                    refKind: 'binding',
                    uri: 'ipfs://figaro/bindings/fixture-transport-merchant.binding.json',
                    contentHash: 'bafybeifixturebinding',
                },
            ],
            signatureRefs: [
                {
                    refKind: 'signature',
                    uri: 'ipfs://figaro/signatures/fixture-transport-merchant.sig',
                    contentHash: 'bafybeifixturesignature',
                },
            ],
            version: '1.0.0',
        },
    ],
    listInstitutionBindings: () => [
        {
            bindingId: 'binding-fixture-transport-merchant',
            subjectAddress: '0x1111111111111111111111111111111111111111',
            archetypeId: 'merchant-one-hop-delivery',
            assemblySlug: 'figaro-eats',
            networkTargets: ['local-anvil'],
            roleBindings: [
                {
                    roleKind: 'seller',
                    scope: 'institution',
                },
            ],
            serviceBindings: [
                {
                    serviceKey: 'catalogue',
                    providerKey: 'fixture-catalogue-provider',
                },
            ],
            assetURI: 'ipfs://example/fixture-transport-merchant.assets.json',
            version: '1.0.0',
        },
    ],
    listSellerCatalogueMetadata: () => [
        {
            ...SELLER_CATALOGUE_METADATA_EXAMPLE,
            subjectAddress: '0x1111111111111111111111111111111111111111',
            merchantId: 'fixture-transport-merchant',
            name: 'Fixture Transport Merchant',
        },
    ],
    listAssetDocuments: () => [
        {
            assetURI: 'ipfs://example/fixture-transport-merchant.assets.json',
            name: 'Fixture Transport Merchant Skin',
            branding: {
                displayName: 'Fixture Transport Merchant',
                logoURI: 'ipfs://example/fixture-logo.png',
                accentColor: '#0f766e',
                themeClass: 'fixture-transport-theme',
            },
            assets: {
                cssURI: 'ipfs://example/fixture-theme.css',
            },
            version: '1.0.0',
        },
    ],
};

describe('runtime data source helpers', () => {
    it('resolves merchant metadata from an injected data source', () => {
        const metadata = getSellerMetadataByAddressFromSource(
            '0x1111111111111111111111111111111111111111',
            testSource
        );

        expect(metadata?.merchantId).toBe('fixture-transport-merchant');
    });

    it('resolves asset documents from an injected data source', () => {
        const assetDocument = getAssetDocumentByUriFromSource(
            'ipfs://example/fixture-transport-merchant.assets.json',
            testSource
        );

        expect(assetDocument?.branding?.themeClass).toBe('fixture-transport-theme');
        expect(assetDocument?.assets?.cssURI).toBe('ipfs://example/fixture-theme.css');
    });

    it('resolves an address against the injected data source', () => {
        const context = resolveRuntimeSubjectByAddressFromSource(
            '0x1111111111111111111111111111111111111111',
            'local-anvil',
            testSource
        );

        expect(context?.subject.displayName).toBe('Fixture Transport Merchant');
        expect(context?.selectedBinding?.assemblySlug).toBe('figaro-eats');
    });

    it('lists assembly-bound subject summaries from the injected data source', () => {
        const summaries = listAssemblyBoundSubjectSummariesFromSource('figaro-eats', 'local-anvil', testSource);

        expect(summaries).toHaveLength(1);
        expect(summaries[0]?.displayName).toBe('Fixture Transport Merchant');
        expect(summaries[0]?.bindingId).toBe('binding-fixture-transport-merchant');
        expect(summaries[0]?.roleBindings).toEqual([
            expect.objectContaining({
                roleKind: 'seller',
                assemblyRoleKinds: [],
                scope: 'institution',
                mechanismIds: [],
            }),
        ]);
        expect(summaries[0]?.serviceBindings).toEqual([
            {
                serviceKey: 'catalogue',
                providerKey: 'fixture-catalogue-provider',
            },
        ]);
        expect(summaries[0]?.assetDocument).toEqual(
            expect.objectContaining({
                assetURI: 'ipfs://example/fixture-transport-merchant.assets.json',
                branding: expect.objectContaining({
                    themeClass: 'fixture-transport-theme',
                }),
            })
        );
        expect(summaries[0]?.sellerCatalogueMetadata?.merchantId).toBe('fixture-transport-merchant');
        expect(summaries[0]?.provenance?.hasSignatures).toBe(true);
        expect(summaries[0]?.provenance?.bindingRefs).toHaveLength(1);
        expect(summaries[0]?.provenance?.quality).toBe('signed');
    });

    it('creates a runtime source from a manifest document bundle', () => {
        const manifestSource = createRuntimeIdentityDataSourceFromManifestDocument(
            localRuntimeManifestDocument,
            'local-runtime.manifest.json'
        );

        expect(manifestSource.version).toBe('1.0.0');
        expect(manifestSource.listSubjectRecords()).toHaveLength(3);
        expect(manifestSource.listInstitutionBindings()).toHaveLength(3);
        expect(manifestSource.listSellerCatalogueMetadata()).toHaveLength(1);
        expect(manifestSource.listAssetDocuments?.()).toHaveLength(3);
        expect(manifestSource.subjectProvenance).toHaveLength(3);
        expect(manifestSource.listSubjectProvenanceRecords?.()).toHaveLength(3);
        expect(manifestSource.listValidationIssues?.()).toHaveLength(2);
        expect(manifestSource.listInstitutionBindings()[0]?.roleBindings[0]?.assemblyRoleKinds).toEqual(['restaurant']);
    });

    it('exposes manifest validation issues through the runtime source helper', () => {
        const manifestSource = createRuntimeIdentityDataSourceFromManifestDocument(
            localRuntimeManifestDocument,
            'local-runtime.manifest.json'
        );

        expect(listValidationIssuesFromSource(manifestSource)).toEqual([
            expect.objectContaining({
                severity: 'warning',
                code: 'missing-signature-refs',
                subjectAddress: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
            }),
            expect.objectContaining({
                severity: 'warning',
                code: 'missing-signature-refs',
                subjectAddress: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
            }),
        ]);
    });

    it('exposes manifest-backed subject provenance for signed runtime subjects', () => {
        const manifestSource = createRuntimeIdentityDataSourceFromManifestDocument(
            localRuntimeManifestDocument,
            'local-runtime.manifest.json'
        );

        const provenance = getSubjectProvenanceByAddressFromSource(
            '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
            manifestSource
        );

        expect(provenance?.bindingRefs[0]?.refKind).toBe('binding');
        expect(provenance?.signatureRefs[0]?.refKind).toBe('signature');
        expect(provenance?.metadataRefs[0]?.refKind).toBe('metadata');
        expect(provenance?.assetRefs[0]?.refKind).toBe('asset');
        expect(provenance?.hasSignatures).toBe(true);
        expect(provenance?.quality).toBe('signed');
        expect(provenance?.issues).toEqual([]);
    });

    it('derives subject provenance for injected sources that do not implement provenance helpers', () => {
        const provenanceRecords = listSubjectProvenanceRecordsFromSource(testSource);

        expect(provenanceRecords).toHaveLength(1);
        expect(provenanceRecords[0]?.bindingIds).toEqual(['binding-fixture-transport-merchant']);
        expect(provenanceRecords[0]?.signatureRefs[0]?.uri).toContain('fixture-transport-merchant.sig');
        expect(provenanceRecords[0]?.metadataRefs[0]?.uri).toBeUndefined();
        expect(provenanceRecords[0]?.hasSignatures).toBe(true);
        expect(provenanceRecords[0]?.quality).toBe('signed');
    });

    it('classifies manifest subjects without signatures as referenced-only provenance', () => {
        const manifestSource = createRuntimeIdentityDataSourceFromManifestDocument(
            localRuntimeManifestDocument,
            'local-runtime.manifest.json'
        );

        const provenance = getSubjectProvenanceByAddressFromSource(
            '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
            manifestSource
        );

        expect(provenance?.quality).toBe('referenced-only');
        expect(provenance?.hasSignatures).toBe(false);
        expect(provenance?.issues).toContain('missing-signature-refs');
    });
});