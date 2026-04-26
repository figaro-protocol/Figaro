import { describe, expect, it, vi } from 'vitest';

import { SELLER_CATALOGUE_METADATA_EXAMPLE } from '@/lib/shared/sellerCatalogueMetadata';
import { RuntimeIdentityDataSource } from '@/lib/shared/runtimeDataSource';
import {
    fetchRuntimeAssetDocument,
    requireAssemblyRuntimeContext,
    resolveSemanticRuntimeSnapshot,
    resolveSemanticRuntimeSnapshotForSubjectAddress,
    resolveAssemblySkinBundleFromTransport,
    resolveAssemblySkinBundle,
    resolveRoleScopedModuleSelection,
    resolveRoleScopedMechanismSelection,
    resolveAssemblyShellPresentation,
    resolveRuntimeRoleSelection,
    resolveAssemblyRuntimeContext,
} from '@/lib/shared/runtimeResolution';

const injectedRuntimeSource: RuntimeIdentityDataSource = {
    listSubjectRecords: () => [
        {
            subjectAddress: '0x2222222222222222222222222222222222222222',
            subjectKind: 'merchant',
            displayName: 'Injected Runtime Merchant',
            version: '1.0.0',
        },
    ],
    listAssemblyBindings: () => [
        {
            bindingId: 'binding-injected-runtime-merchant',
            subjectAddress: '0x2222222222222222222222222222222222222222',
            archetypeId: 'merchant-one-hop-delivery',
            assemblySlug: 'figaro-eats',
            networkTargets: ['local-anvil'],
            roleBindings: [
                {
                    roleKind: 'seller',
                    assemblyRoleKinds: ['buyer'],
                    scope: 'assembly',
                },
            ],
            version: '1.0.0',
        },
    ],
    listSellerCatalogueMetadata: () => [
        {
            ...SELLER_CATALOGUE_METADATA_EXAMPLE,
            subjectAddress: '0x2222222222222222222222222222222222222222',
            merchantId: 'injected-runtime-merchant',
            name: 'Injected Runtime Merchant',
        },
    ],
};

const unmappedRuntimeSource: RuntimeIdentityDataSource = {
    listSubjectRecords: () => [
        {
            subjectAddress: '0x3333333333333333333333333333333333333333',
            subjectKind: 'merchant',
            displayName: 'Unmapped Runtime Merchant',
            version: '1.0.0',
        },
    ],
    listAssemblyBindings: () => [
        {
            bindingId: 'binding-unmapped-runtime-merchant',
            subjectAddress: '0x3333333333333333333333333333333333333333',
            archetypeId: 'merchant-one-hop-delivery',
            assemblySlug: 'figaro-eats',
            networkTargets: ['local-anvil'],
            roleBindings: [
                {
                    roleKind: 'restaurant-operator',
                    scope: 'assembly',
                },
            ],
            version: '1.0.0',
        },
    ],
    listSellerCatalogueMetadata: () => [],
};

const transportSkinRuntimeSource: RuntimeIdentityDataSource = {
    listSubjectRecords: () => [
        {
            subjectAddress: '0x4444444444444444444444444444444444444444',
            subjectKind: 'merchant',
            displayName: 'Transport Skin Merchant',
            version: '1.0.0',
        },
    ],
    listAssemblyBindings: () => [
        {
            bindingId: 'binding-transport-skin-merchant',
            subjectAddress: '0x4444444444444444444444444444444444444444',
            archetypeId: 'merchant-one-hop-delivery',
            assemblySlug: 'figaro-eats',
            networkTargets: ['local-anvil'],
            roleBindings: [
                {
                    roleKind: 'seller',
                    assemblyRoleKinds: ['restaurant'],
                    scope: 'assembly',
                },
            ],
            assetURI: 'ipfs://example/transport-skin.assets.json',
            version: '1.0.0',
        },
    ],
    listSellerCatalogueMetadata: () => [
        {
            ...SELLER_CATALOGUE_METADATA_EXAMPLE,
            subjectAddress: '0x4444444444444444444444444444444444444444',
            merchantId: 'transport-skin-merchant',
            name: 'Transport Skin Merchant',
            branding: {
                displayName: 'Transport Skin Merchant',
                logoURI: 'ipfs://example/catalogue-logo.png',
                accentColor: '#7c2d12',
                themeClass: 'catalogue-theme',
            },
            assets: {
                cssURI: 'ipfs://example/catalogue-theme.css',
            },
        },
    ],
};

describe('runtime resolution', () => {
    it('resolves a combined assembly runtime context for figaro-eats', () => {
        const context = resolveAssemblyRuntimeContext('figaro-eats', 'local-anvil');

        expect(context?.artifact.assembly.identity.slug).toBe('figaro-eats');
        expect(context?.boundSubjects).toHaveLength(1);
        expect(context?.boundSubjects[0]?.sellerCatalogueMetadata?.merchantId).toBe('bobs-pizza-palace');
        expect(context?.sourceMetadata).toEqual({
            sourceKind: 'bundled',
            sourceLabel: 'local-runtime-identity.json',
            transport: 'static',
        });
    });

    it('resolves a combined assembly runtime context for figaro-procurement', () => {
        const context = resolveAssemblyRuntimeContext('figaro-procurement', 'local-anvil');

        expect(context?.artifact.assembly.identity.slug).toBe('figaro-procurement');
        expect(context?.boundSubjects).toHaveLength(1);
        expect(context?.boundSubjects[0]?.displayName).toBe('Acme Components Supply');
        expect(context?.boundSubjects[0]?.sellerCatalogueMetadata).toBeUndefined();
    });

    it('resolves a combined assembly runtime context for figaro-disclosure-review', () => {
        const context = resolveAssemblyRuntimeContext('figaro-disclosure-review', 'local-anvil');

        expect(context?.artifact.assembly.identity.slug).toBe('figaro-disclosure-review');
        expect(context?.boundSubjects).toHaveLength(1);
        expect(context?.boundSubjects[0]?.displayName).toBe('GreenLedger Review Desk');
        expect(context?.boundSubjects[0]?.sellerCatalogueMetadata).toBeUndefined();
    });

    it('returns undefined for an unknown assembly slug', () => {
        expect(resolveAssemblyRuntimeContext('missing-assembly', 'local-anvil')).toBeUndefined();
    });

    it('accepts an injected runtime data source instead of the default fixture registry', () => {
        const context = resolveAssemblyRuntimeContext('figaro-eats', 'local-anvil', injectedRuntimeSource);

        expect(context?.artifact.assembly.identity.slug).toBe('figaro-eats');
        expect(context?.boundSubjects).toHaveLength(1);
        expect(context?.boundSubjects[0]?.displayName).toBe('Injected Runtime Merchant');
        expect(context?.boundSubjects[0]?.sellerCatalogueMetadata?.merchantId).toBe('injected-runtime-merchant');
        expect(context?.sourceMetadata).toEqual({
            sourceKind: 'unknown',
            sourceLabel: 'runtime-data-source',
            transport: 'in-memory',
        });
    });

    it('prefers runtime-bound assembly roles for the connected subject address', () => {
        const context = resolveAssemblyRuntimeContext('figaro-eats', 'local-anvil');
        const roleSelection = resolveRuntimeRoleSelection(
            '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
            context?.boundSubjects ?? [],
            context?.artifact.model.roles ?? []
        );

        expect(roleSelection.matchedSubject?.displayName).toBe("Bob's Pizza Palace");
        expect(roleSelection.matchedSubject?.bindingId).toBe('binding:bobs-pizza-palace:local-anvil');
        expect(roleSelection.roleHints).toEqual(['restaurant']);
        expect(roleSelection.availableRoles.map((role) => role.roleKind)).toEqual(['restaurant']);
        expect(roleSelection.preferredRoleKind).toBe('restaurant');
    });

    it('resolves runtime-bound shell metadata from the matched subject', () => {
        const context = resolveAssemblyRuntimeContext('figaro-eats', 'local-anvil');
        const roleSelection = resolveRuntimeRoleSelection(
            '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
            context?.boundSubjects ?? [],
            context?.artifact.model.roles ?? []
        );
        const shellPresentation = resolveAssemblyShellPresentation(
            context!.artifact.assembly,
            roleSelection.matchedSubject,
        );

        expect(shellPresentation.sourceKind).toBe('runtime-bound');
        expect(shellPresentation.title).toBe("Bob's Pizza Palace");
        expect(shellPresentation.subtitle).toBe('Authentic New York style pizza.');
        expect(shellPresentation.bindingId).toBe('binding:bobs-pizza-palace:local-anvil');
        expect(shellPresentation.metadataURI).toBe(roleSelection.matchedSubject?.metadataURI);
        expect(shellPresentation.assetURI).toBe(roleSelection.matchedSubject?.assetURI);
        expect(shellPresentation.assetDocument?.branding?.themeClass).toBe('runtime-shell-pizza');
        expect(shellPresentation.branding?.themeClass).toBe('merchant-pizza');
        expect(shellPresentation.assets?.cssURI).toBe('ipfs://example/theme.css');
    });

    it('resolves a runtime skin bundle from the matched subject shell presentation', () => {
        const context = resolveAssemblyRuntimeContext('figaro-eats', 'local-anvil');
        const roleSelection = resolveRuntimeRoleSelection(
            '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
            context?.boundSubjects ?? [],
            context?.artifact.model.roles ?? []
        );
        const shellPresentation = resolveAssemblyShellPresentation(
            context!.artifact.assembly,
            roleSelection.matchedSubject,
        );
        const skinBundle = resolveAssemblySkinBundle(shellPresentation);

        expect(skinBundle?.sourceKind).toBe('runtime-bound');
        expect(skinBundle?.skinId).toBe('binding-bobs-pizza-palace-local-anvil');
        expect(skinBundle?.branding.branding.themeClass).toBe('runtime-shell-pizza');
        expect(skinBundle?.branding.logoURL).toBe('http://127.0.0.1:8080/ipfs/example/runtime-shell-logo.png');
        expect(skinBundle?.branding.heroImageURL).toBe('http://127.0.0.1:8080/ipfs/example/runtime-shell-hero.png');
        expect(skinBundle?.branding.cssURL).toBe('http://127.0.0.1:8080/ipfs/example/runtime-shell-theme.css');
    });

    it('builds a runtime snapshot from the selected bound subject without a parallel model', () => {
        const context = resolveAssemblyRuntimeContext('figaro-eats', 'local-anvil');
        const snapshot = resolveSemanticRuntimeSnapshot(context!, {
            selectedBoundSubject: context?.boundSubjects[0],
        });

        expect(snapshot.runtime.selectedBindingId).toBe('binding:bobs-pizza-palace:local-anvil');
        expect(snapshot.runtime.selectedRole?.roleKind).toBe('restaurant');
        expect(snapshot.runtime.selectedShellPresentation.title).toBe("Bob's Pizza Palace");
        expect(snapshot.runtime.boundSubjects[0]?.subject.displayName).toBe("Bob's Pizza Palace");
        expect(snapshot.runtime.boundSubjects[0]?.shellPresentation.assetDocument?.branding?.themeClass).toBe('runtime-shell-pizza');
        expect(snapshot.runtime.selectedServiceProviderKeys.catalogue).toBe('default-catalogue');
        expect(snapshot.runtime.boundSubjects[0]?.serviceProviderKeys.evidenceTransport).toBe('default-ipfs');
        expect(snapshot.runtime.availableRoles.map((role) => role.roleKind)).toEqual(['restaurant']);
    });

    it('resolves a runtime snapshot directly from a bound subject address', () => {
        const snapshot = resolveSemanticRuntimeSnapshotForSubjectAddress(
            '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        );

        expect(snapshot?.assembly.identity.slug).toBe('figaro-eats');
        expect(snapshot?.runtime.selectedBindingId).toBe('binding:bobs-pizza-palace:local-anvil');
        expect(snapshot?.runtime.selectedRole?.roleKind).toBe('restaurant');
        expect(snapshot?.runtime.selectedShellPresentation.title).toBe("Bob's Pizza Palace");
    });

    it('fetches runtime asset documents through evidence transport', async () => {
        const evidenceTransport = {
            resolveFetchUrl: vi.fn().mockReturnValue('https://example.com/runtime-assets.json'),
        };
        const transportPayload = {
            assetURI: 'ipfs://example/transport-skin.assets.json',
            name: 'Transport Skin Merchant Runtime Skin',
            branding: {
                displayName: 'Transport Skin Merchant',
                logoURI: 'ipfs://example/transport-logo.png',
                accentColor: '#0f766e',
                themeClass: 'transport-theme',
            },
            assets: {
                cssURI: 'ipfs://example/transport-theme.css',
            },
            version: '1.0.0',
        };
        const fetcher = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => transportPayload,
            text: async () => JSON.stringify(transportPayload),
        });

        const assetDocument = await fetchRuntimeAssetDocument(
            'ipfs://example/transport-skin.assets.json',
            evidenceTransport,
            { fetcher },
        );

        expect(evidenceTransport.resolveFetchUrl).toHaveBeenCalledWith('ipfs://example/transport-skin.assets.json');
        expect(fetcher).toHaveBeenCalledWith('https://example.com/runtime-assets.json', undefined);
        expect(assetDocument?.branding?.themeClass).toBe('transport-theme');
        expect(assetDocument?.assets?.cssURI).toBe('ipfs://example/transport-theme.css');
    });

    it('hydrates a remote skin bundle and prefers it over seller metadata fallback', async () => {
        const context = resolveAssemblyRuntimeContext('figaro-eats', 'local-anvil', transportSkinRuntimeSource);
        const roleSelection = resolveRuntimeRoleSelection(
            '0x4444444444444444444444444444444444444444',
            context?.boundSubjects ?? [],
            context?.artifact.model.roles ?? []
        );
        const shellPresentation = resolveAssemblyShellPresentation(
            context!.artifact.assembly,
            roleSelection.matchedSubject,
        );
        const evidenceTransport = {
            resolveFetchUrl: vi.fn().mockReturnValue('https://example.com/runtime-assets.json'),
        };
        const transportPayload = {
            assetURI: 'ipfs://example/transport-skin.assets.json',
            name: 'Transport Skin Merchant Runtime Skin',
            branding: {
                displayName: 'Transport Skin Merchant',
                logoURI: 'ipfs://example/transport-logo.png',
                heroImageURI: 'ipfs://example/transport-hero.png',
                accentColor: '#0f766e',
                themeClass: 'transport-theme',
            },
            assets: {
                cssURI: 'ipfs://example/transport-theme.css',
            },
            version: '1.0.0',
        };
        const fetcher = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => transportPayload,
            text: async () => JSON.stringify(transportPayload),
        });

        const skinBundle = await resolveAssemblySkinBundleFromTransport(
            shellPresentation,
            evidenceTransport,
            { fetcher },
        );

        expect(skinBundle?.branding.branding.themeClass).toBe('transport-theme');
        expect(skinBundle?.branding.logoURL).toBe('http://127.0.0.1:8080/ipfs/example/transport-logo.png');
        expect(skinBundle?.branding.heroImageURL).toBe('http://127.0.0.1:8080/ipfs/example/transport-hero.png');
        expect(skinBundle?.branding.cssURL).toBe('http://127.0.0.1:8080/ipfs/example/transport-theme.css');
    });

    it('falls back to seller metadata skin when remote asset hydration fails', async () => {
        const context = resolveAssemblyRuntimeContext('figaro-eats', 'local-anvil', transportSkinRuntimeSource);
        const roleSelection = resolveRuntimeRoleSelection(
            '0x4444444444444444444444444444444444444444',
            context?.boundSubjects ?? [],
            context?.artifact.model.roles ?? []
        );
        const shellPresentation = resolveAssemblyShellPresentation(
            context!.artifact.assembly,
            roleSelection.matchedSubject,
        );

        const skinBundle = await resolveAssemblySkinBundleFromTransport(
            shellPresentation,
            { resolveFetchUrl: vi.fn().mockReturnValue('https://example.com/runtime-assets.json') },
            {
                fetcher: vi.fn().mockResolvedValue({
                    ok: false,
                    status: 404,
                    statusText: 'Not Found',
                    json: async () => ({}),
                }),
            },
        );

        expect(skinBundle?.branding.branding.themeClass).toBe('catalogue-theme');
        expect(skinBundle?.branding.cssURL).toBe('http://127.0.0.1:8080/ipfs/example/catalogue-theme.css');
    });

    it('prefers explicit assembly role mappings over raw binding role labels', () => {
        const context = resolveAssemblyRuntimeContext('figaro-eats', 'local-anvil', injectedRuntimeSource);
        const roleSelection = resolveRuntimeRoleSelection(
            '0x2222222222222222222222222222222222222222',
            context?.boundSubjects ?? [],
            context?.artifact.model.roles ?? []
        );

        expect(roleSelection.roleHints).toEqual(['buyer']);
        expect(roleSelection.availableRoles.map((role) => role.roleKind)).toEqual(['buyer']);
        expect(roleSelection.preferredRoleKind).toBe('buyer');
    });

    it('does not infer assembly roles from raw binding role labels when explicit mappings are missing', () => {
        const context = resolveAssemblyRuntimeContext('figaro-eats', 'local-anvil', unmappedRuntimeSource);
        const roleSelection = resolveRuntimeRoleSelection(
            '0x3333333333333333333333333333333333333333',
            context?.boundSubjects ?? [],
            context?.artifact.model.roles ?? []
        );

        expect(roleSelection.matchedSubject?.displayName).toBe('Unmapped Runtime Merchant');
        expect(roleSelection.roleHints).toEqual([]);
        expect(roleSelection.availableRoles.map((role) => role.roleKind)).toEqual(
            (context?.artifact.model.roles ?? []).map((role) => role.roleKind)
        );
        expect(roleSelection.preferredRoleKind).toBeUndefined();
    });

    it('falls back to assembly roles when no bound subject matches the connected address', () => {
        const context = resolveAssemblyRuntimeContext('figaro-procurement', 'local-anvil');
        const roleSelection = resolveRuntimeRoleSelection(
            '0x1234567890123456789012345678901234567890',
            context?.boundSubjects ?? [],
            context?.artifact.model.roles ?? []
        );

        expect(roleSelection.matchedSubject).toBeUndefined();
        expect(roleSelection.roleHints).toEqual([]);
        expect(roleSelection.availableRoles).toHaveLength(3);
        expect(roleSelection.preferredRoleKind).toBeUndefined();
    });

    it('falls back to assembly shell metadata when no bound subject is selected', () => {
        const context = resolveAssemblyRuntimeContext('figaro-procurement', 'local-anvil');
        const shellPresentation = resolveAssemblyShellPresentation(context!.artifact.assembly);

        expect(shellPresentation.sourceKind).toBe('assembly-default');
        expect(shellPresentation.title).toBe(context!.artifact.assembly.identity.name);
        expect(shellPresentation.subtitle).toBe(context!.artifact.assembly.narrative?.assemblySummary ?? '');
        expect(shellPresentation.bindingId).toBeUndefined();
        expect(shellPresentation.metadataURI).toBeUndefined();
        expect(shellPresentation.assetURI).toBeUndefined();
    });

    it('resolves a skin bundle from binding asset documents even without seller metadata', () => {
        const context = resolveAssemblyRuntimeContext('figaro-procurement', 'local-anvil');
        const roleSelection = resolveRuntimeRoleSelection(
            '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
            context?.boundSubjects ?? [],
            context?.artifact.model.roles ?? []
        );
        const shellPresentation = resolveAssemblyShellPresentation(
            context!.artifact.assembly,
            roleSelection.matchedSubject,
        );

        expect(resolveAssemblySkinBundle(shellPresentation)).toEqual(
            expect.objectContaining({
                skinId: 'binding-acme-components-supply-local-anvil',
                branding: expect.objectContaining({
                    branding: expect.objectContaining({
                        themeClass: 'runtime-shell-acme',
                    }),
                    cssURL: 'http://127.0.0.1:8080/ipfs/example/acme-theme.css',
                }),
            })
        );
    });

    it('limits visible mechanisms to those implied by the selected role context', () => {
        const context = resolveAssemblyRuntimeContext('figaro-procurement', 'local-anvil');
        const supplierRole = context?.artifact.model.roles.find((role) => role.roleKind === 'supplier');
        const scopedMechanisms = resolveRoleScopedMechanismSelection(
            supplierRole,
            context?.artifact.model.mechanisms ?? []
        );

        expect(scopedMechanisms.visibleMechanisms.map((mechanism) => mechanism.id)).toEqual([
            'core-orders',
            'fulfillment-coordinator',
        ]);
    });

    it('keeps only the disclosure mechanism visible for the reviewer role', () => {
        const context = resolveAssemblyRuntimeContext('figaro-disclosure-review', 'local-anvil');
        const reviewerRole = context?.artifact.model.roles.find((role) => role.roleKind === 'reviewer');
        const scopedMechanisms = resolveRoleScopedMechanismSelection(
            reviewerRole,
            context?.artifact.model.mechanisms ?? []
        );

        expect(scopedMechanisms.visibleMechanisms.map((mechanism) => mechanism.id)).toEqual([
            'ghg-disclosure',
        ]);
    });

    it('does not widen mechanism visibility based on selected view module slots', () => {
        const context = resolveAssemblyRuntimeContext('figaro-disclosure-review', 'local-anvil');
        const buyerRole = context?.artifact.model.roles.find((role) => role.roleKind === 'buyer');
        const scopedMechanisms = resolveRoleScopedMechanismSelection(
            buyerRole,
            context?.artifact.model.mechanisms ?? []
        );

        expect(scopedMechanisms.visibleMechanisms.map((mechanism) => mechanism.id)).toEqual([
            'core-orders',
        ]);
    });

    it('filters visible modules to the role-scoped mechanism surface plus always-visible modules', () => {
        const context = resolveAssemblyRuntimeContext('figaro-disclosure-review', 'local-anvil');
        const reviewerRole = context?.artifact.model.roles.find((role) => role.roleKind === 'reviewer');
        const scopedMechanisms = resolveRoleScopedMechanismSelection(
            reviewerRole,
            context?.artifact.model.mechanisms ?? []
        );
        const scopedModules = resolveRoleScopedModuleSelection(
            ['capability-rail', 'mechanism-inspector', 'order-actions'],
            scopedMechanisms.visibleMechanisms
        );

        expect(scopedModules.visibleModuleIds).toEqual([
            'capability-rail',
            'mechanism-inspector',
        ]);
    });

    it('uses explicit mechanism recognizedRoles when assembly modules are not implied by capabilities', () => {
        const context = resolveAssemblyRuntimeContext('figaro-eats', 'local-anvil');
        const buyerRole = context?.artifact.model.roles.find((role) => role.roleKind === 'buyer');
        const scopedMechanisms = resolveRoleScopedMechanismSelection(
            buyerRole,
            context?.artifact.model.mechanisms ?? []
        );

        expect(scopedMechanisms.visibleMechanisms.map((mechanism) => mechanism.id)).toEqual([
            'core-orders',
            'delivery-coordinator',
        ]);
    });

    it('throws when a required runtime context is missing', () => {
        expect(() => requireAssemblyRuntimeContext('missing-assembly', 'local-anvil')).toThrow(/Unknown assembly/);
    });
});