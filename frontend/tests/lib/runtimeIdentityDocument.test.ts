import { describe, expect, it } from 'vitest';

import localRuntimeIdentityDocument from '@/lib/shared/runtime-fixtures/local-runtime-identity.json';
import { parseRuntimeIdentityDocument } from '@/lib/shared/runtimeIdentityDocument';

describe('runtime manifest validation', () => {
    it('parses the bundled manifest and reports provenance warnings without failing', () => {
        const manifest = parseRuntimeIdentityDocument(
            localRuntimeIdentityDocument,
            'local-runtime-identity.json'
        );

        expect(manifest.subjectProvenance).toHaveLength(7);
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

    it('throws when an assembly binding points at a missing subject', () => {
        const invalidManifest = {
            ...localRuntimeIdentityDocument,
            assemblyBindings: [
                ...localRuntimeIdentityDocument.assemblyBindings,
                {
                    ...localRuntimeIdentityDocument.assemblyBindings[0],
                    bindingId: 'binding:missing-subject:local-anvil',
                    subjectAddress: '0x0000000000000000000000000000000000000001',
                },
            ],
        };

        expect(() => parseRuntimeIdentityDocument(invalidManifest, 'invalid.manifest.json')).toThrow(
            /binding binding:missing-subject:local-anvil references missing subject/
        );
    });

    it('throws when seller catalogue metadata has no assembly binding', () => {
        const invalidManifest = {
            ...localRuntimeIdentityDocument,
            assemblyBindings: localRuntimeIdentityDocument.assemblyBindings.filter(
                (binding) => binding.subjectAddress !== '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
            ),
        };

        expect(() => parseRuntimeIdentityDocument(invalidManifest, 'invalid.manifest.json')).toThrow(
            /seller catalogue metadata .* has no assembly binding/
        );
    });

    it('throws when duplicate subject addresses exist in the manifest', () => {
        const invalidManifest = {
            ...localRuntimeIdentityDocument,
            subjects: [
                ...localRuntimeIdentityDocument.subjects,
                {
                    ...localRuntimeIdentityDocument.subjects[0],
                    displayName: 'Duplicate Bob',
                },
            ],
        };

        expect(() => parseRuntimeIdentityDocument(invalidManifest, 'invalid.manifest.json')).toThrow(
            /duplicate subject address/
        );
    });

    it('reports a warning when a subject bindingRef does not match its manifest binding', () => {
        const warningManifest = {
            ...localRuntimeIdentityDocument,
            subjects: localRuntimeIdentityDocument.subjects.map((subject) =>
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

        const parsedManifest = parseRuntimeIdentityDocument(warningManifest, 'warning.manifest.json');

        expect(parsedManifest.validationIssues).toContainEqual(
            expect.objectContaining({
                severity: 'warning',
                code: 'binding-ref-binding-mismatch',
                subjectAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
                bindingId: 'binding:bobs-pizza-palace:local-anvil',
            })
        );
    });

    it('reports a warning when an assembly role binding omits assemblyRoleKinds', () => {
        const warningManifest = {
            ...localRuntimeIdentityDocument,
            assemblyBindings: localRuntimeIdentityDocument.assemblyBindings.map((binding) =>
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

        const parsedManifest = parseRuntimeIdentityDocument(warningManifest, 'warning.manifest.json');

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
            ...localRuntimeIdentityDocument,
            assemblyBindings: localRuntimeIdentityDocument.assemblyBindings.map((binding) =>
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

        const parsedManifest = parseRuntimeIdentityDocument(serviceManifest, 'service.manifest.json');

        expect(
            parsedManifest.assemblyBindings.find((binding) => binding.bindingId === 'binding:bobs-pizza-palace:local-anvil')?.serviceBindings
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
        const manifest = parseRuntimeIdentityDocument(
            localRuntimeIdentityDocument,
            'local-runtime-identity.json'
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