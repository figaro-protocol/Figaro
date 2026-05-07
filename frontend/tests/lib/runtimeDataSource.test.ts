import { describe, expect, it } from 'vitest';

import { SELLER_CATALOGUE_METADATA_EXAMPLE } from '@/lib/shared/sellerCatalogueMetadata';
import { RuntimeIdentityDataSource } from '@/lib/shared/runtimeDataSource';
import {
    createRuntimeIdentityDataSourceFromDocument,
    getAssetDocumentByUriFromSource,
    getSubjectProvenanceByAddressFromSource,
    getSellerMetadataByAddressFromSource,
    listAssemblyBoundSubjectSummariesFromSource,
    listSubjectProvenanceRecordsFromSource,
    listValidationIssuesFromSource,
    resolveRuntimeSubjectByAddressFromSource,
} from '@/lib/shared/runtimeDataSource';
import localRuntimeIdentityDocument from '@/lib/shared/runtime-fixtures/local-runtime-identity.json';

const testSource: RuntimeIdentityDataSource = {
    listSubjectRecords: () => [
        {
            subjectAddress: '0x1111111111111111111111111111111111111111',
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
    listAssemblyBindings: () => [
        {
            bindingId: 'binding-fixture-transport-merchant',
            subjectAddress: '0x1111111111111111111111111111111111111111',
            assemblySlug: 'local-commerce',
            networkTargets: ['local-anvil'],
            roleBindings: [
                {
                    roleKind: 'seller',
                    scope: 'assembly',
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
    listOperatorProfileMetadata: () => [
        {
            subjectAddress: '0x1111111111111111111111111111111111111111',
            name: 'Fixture Transport Merchant',
            slug: 'fixture-transport-merchant',
            version: '1.0.0',
        },
    ],
    listSellerCatalogueMetadata: () => [
        {
            ...SELLER_CATALOGUE_METADATA_EXAMPLE,
            subjectAddress: '0x1111111111111111111111111111111111111111',
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

        expect(metadata?.subjectAddress).toBe('0x1111111111111111111111111111111111111111');
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
        expect(context?.selectedBinding?.assemblySlug).toBe('local-commerce');
    });

    it('lists assembly-bound subject summaries from the injected data source', () => {
        const summaries = listAssemblyBoundSubjectSummariesFromSource('local-commerce', 'local-anvil', testSource);

        expect(summaries).toHaveLength(1);
        expect(summaries[0]?.displayName).toBe('Fixture Transport Merchant');
        expect(summaries[0]?.bindingId).toBe('binding-fixture-transport-merchant');
        expect(summaries[0]?.roleBindings).toEqual([
            expect.objectContaining({
                roleKind: 'seller',
                assemblyRoleKinds: [],
                scope: 'assembly',
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
        expect(summaries[0]?.operatorProfile?.slug).toBe('fixture-transport-merchant');
        expect(summaries[0]?.provenance?.hasSignatures).toBe(true);
        expect(summaries[0]?.provenance?.bindingRefs).toHaveLength(1);
        expect(summaries[0]?.provenance?.quality).toBe('signed');
    });

    it('creates a runtime source from a manifest document bundle', () => {
        const manifestSource = createRuntimeIdentityDataSourceFromDocument(
            localRuntimeIdentityDocument,
            'local-runtime-identity.json'
        );

        expect(manifestSource.version).toBe('1.0.0');
        expect(manifestSource.listSubjectRecords()).toHaveLength(7);
        expect(manifestSource.listAssemblyBindings()).toHaveLength(8);
        expect(manifestSource.listSellerCatalogueMetadata()).toHaveLength(7);
        expect(manifestSource.listAssetDocuments?.()).toHaveLength(7);
        expect(manifestSource.subjectProvenance).toHaveLength(7);
        expect(manifestSource.listSubjectProvenanceRecords?.()).toHaveLength(7);
        expect(manifestSource.listValidationIssues?.()).toHaveLength(6);
        expect(manifestSource.listAssemblyBindings()[0]?.roleBindings[0]?.assemblyRoleKinds).toEqual(['merchant']);
    });

    it('exposes manifest validation issues through the runtime source helper', () => {
        const manifestSource = createRuntimeIdentityDataSourceFromDocument(
            localRuntimeIdentityDocument,
            'local-runtime-identity.json'
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
            expect.objectContaining({
                severity: 'warning',
                code: 'missing-signature-refs',
                subjectAddress: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
            }),
            expect.objectContaining({
                severity: 'warning',
                code: 'missing-signature-refs',
                subjectAddress: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
            }),
            expect.objectContaining({
                severity: 'warning',
                code: 'missing-signature-refs',
                subjectAddress: '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720',
            }),
            expect.objectContaining({
                severity: 'warning',
                code: 'missing-signature-refs',
                subjectAddress: '0xBcd4042DE499D14e55001CcbB24a551F3b954096',
            }),
        ]);
    });

    it('exposes manifest-backed subject provenance for signed runtime subjects', () => {
        const manifestSource = createRuntimeIdentityDataSourceFromDocument(
            localRuntimeIdentityDocument,
            'local-runtime-identity.json'
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
        const manifestSource = createRuntimeIdentityDataSourceFromDocument(
            localRuntimeIdentityDocument,
            'local-runtime-identity.json'
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