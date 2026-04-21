import { describe, expect, it } from 'vitest';

import localRuntimeManifestDocument from '@/lib/shared/runtime-fixtures/local-runtime.manifest.json';
import { parseRuntimeIdentityManifestDocument } from '@/lib/shared/runtimeManifest';

describe('runtime manifest validation', () => {
    it('parses the bundled manifest and reports provenance warnings without failing', () => {
        const manifest = parseRuntimeIdentityManifestDocument(
            localRuntimeManifestDocument,
            'local-runtime.manifest.json'
        );

        expect(manifest.subjectProvenance).toHaveLength(3);
        expect(manifest.validationIssues).toEqual([
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

    it('throws when an institution binding points at a missing subject', () => {
        const invalidManifest = {
            ...localRuntimeManifestDocument,
            institutionBindings: [
                ...localRuntimeManifestDocument.institutionBindings,
                {
                    ...localRuntimeManifestDocument.institutionBindings[0],
                    bindingId: 'binding:missing-subject:local-anvil',
                    subjectAddress: '0x0000000000000000000000000000000000000001',
                },
            ],
        };

        expect(() => parseRuntimeIdentityManifestDocument(invalidManifest, 'invalid.manifest.json')).toThrow(
            /binding binding:missing-subject:local-anvil references missing subject/
        );
    });

    it('throws when seller catalogue metadata has no figaro-eats binding', () => {
        const invalidManifest = {
            ...localRuntimeManifestDocument,
            institutionBindings: localRuntimeManifestDocument.institutionBindings.filter(
                (binding) => binding.assemblySlug !== 'figaro-eats'
            ),
        };

        expect(() => parseRuntimeIdentityManifestDocument(invalidManifest, 'invalid.manifest.json')).toThrow(
            /seller catalogue metadata .* has no figaro-eats institution binding/
        );
    });

    it('throws when duplicate subject addresses exist in the manifest', () => {
        const invalidManifest = {
            ...localRuntimeManifestDocument,
            subjects: [
                ...localRuntimeManifestDocument.subjects,
                {
                    ...localRuntimeManifestDocument.subjects[0],
                    displayName: 'Duplicate Bob',
                },
            ],
        };

        expect(() => parseRuntimeIdentityManifestDocument(invalidManifest, 'invalid.manifest.json')).toThrow(
            /duplicate subject address/
        );
    });

    it('reports a warning when a subject bindingRef does not match its manifest binding', () => {
        const warningManifest = {
            ...localRuntimeManifestDocument,
            subjects: localRuntimeManifestDocument.subjects.map((subject) =>
                subject.subjectAddress === '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
                    ? {
                        ...subject,
                        bindingRefs: [
                            {
                                refKind: 'binding',
                                uri: 'ipfs://figaro/bindings/not-bobs-pizza.binding.json',
                                contentHash: 'bafybeibadmismatch',
                            },
                        ],
                    }
                    : subject
            ),
        };

        const parsedManifest = parseRuntimeIdentityManifestDocument(warningManifest, 'warning.manifest.json');

        expect(parsedManifest.validationIssues).toContainEqual(
            expect.objectContaining({
                severity: 'warning',
                code: 'binding-ref-binding-mismatch',
                subjectAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
                bindingId: 'binding:bobs-pizza-palace:local-anvil',
            })
        );
    });

    it('reports a warning when an institution role binding omits assemblyRoleKinds', () => {
        const warningManifest = {
            ...localRuntimeManifestDocument,
            institutionBindings: localRuntimeManifestDocument.institutionBindings.map((binding) =>
                binding.bindingId === 'binding:bobs-pizza-palace:local-anvil'
                    ? {
                        ...binding,
                        roleBindings: binding.roleBindings.map((roleBinding) => ({
                            ...roleBinding,
                            assemblyRoleKinds: undefined,
                        })),
                    }
                    : binding
            ),
        };

        const parsedManifest = parseRuntimeIdentityManifestDocument(warningManifest, 'warning.manifest.json');

        expect(parsedManifest.validationIssues).toContainEqual(
            expect.objectContaining({
                severity: 'warning',
                code: 'missing-assembly-role-kinds',
                subjectAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
                bindingId: 'binding:bobs-pizza-palace:local-anvil',
            })
        );
    });

    it('parses optional binding-level service bindings from the manifest', () => {
        const serviceManifest = {
            ...localRuntimeManifestDocument,
            institutionBindings: localRuntimeManifestDocument.institutionBindings.map((binding) =>
                binding.bindingId === 'binding:bobs-pizza-palace:local-anvil'
                    ? {
                        ...binding,
                        serviceBindings: [
                            {
                                serviceKey: 'catalogue',
                                providerKey: 'merchant-catalogue-provider',
                            },
                            {
                                serviceKey: 'evidenceTransport',
                                providerKey: 'merchant-ipfs-provider',
                            },
                        ],
                    }
                    : binding
            ),
        };

        const parsedManifest = parseRuntimeIdentityManifestDocument(serviceManifest, 'service.manifest.json');

        expect(
            parsedManifest.institutionBindings.find((binding) => binding.bindingId === 'binding:bobs-pizza-palace:local-anvil')?.serviceBindings
        ).toEqual([
            {
                serviceKey: 'catalogue',
                providerKey: 'merchant-catalogue-provider',
            },
            {
                serviceKey: 'evidenceTransport',
                providerKey: 'merchant-ipfs-provider',
            },
        ]);
    });

    it('parses optional asset documents from the manifest', () => {
        const manifest = parseRuntimeIdentityManifestDocument(
            localRuntimeManifestDocument,
            'local-runtime.manifest.json'
        );

        expect(manifest.assetDocuments).toContainEqual(
            expect.objectContaining({
                assetURI: 'ipfs://figaro/procurement/acme-components-supply.assets.json',
                branding: expect.objectContaining({
                    themeClass: 'runtime-shell-acme',
                }),
                assets: expect.objectContaining({
                    cssURI: 'ipfs://example/acme-theme.css',
                }),
            })
        );
    });
});