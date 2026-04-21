import { describe, expect, it } from 'vitest';

import { REFERENCE_ASSEMBLY_MANIFEST, validateAssemblyManifest } from '@/lib/shared/institutionAssemblyManifest';

describe('institution assembly manifest', () => {
    it('validates the current reference manifest cleanly', () => {
        const result = validateAssemblyManifest(REFERENCE_ASSEMBLY_MANIFEST);

        expect(result.ok).toBe(true);
        expect(result.perAssembly).toHaveLength(5);
        expect(result.perAssembly.every((entry) => entry.result.ok)).toBe(true);
    });

    it('rejects duplicate slugs across manifest entries', () => {
        const [first, second] = REFERENCE_ASSEMBLY_MANIFEST;
        const result = validateAssemblyManifest([
            first,
            { slug: first.slug, assembly: second.assembly },
        ]);

        expect(result.ok).toBe(false);
        expect(result.issues.some((issue) => issue.message.includes('Duplicate manifest slug'))).toBe(true);
    });

    it('rejects duplicate institution ids across manifest entries', () => {
        const [first, second] = REFERENCE_ASSEMBLY_MANIFEST;
        const result = validateAssemblyManifest([
            first,
            {
                slug: second.slug,
                assembly: {
                    ...second.assembly,
                    identity: {
                        ...second.assembly.identity,
                        id: first.assembly.identity.id,
                    },
                },
            },
        ]);

        expect(result.ok).toBe(false);
        expect(result.issues.some((issue) => issue.message.includes('Duplicate institution id across manifest'))).toBe(true);
    });

    it('rejects manifest entries whose slug does not match the assembly document', () => {
        const [first] = REFERENCE_ASSEMBLY_MANIFEST;
        const result = validateAssemblyManifest([
            {
                slug: 'mismatched-slug',
                assembly: first.assembly,
            },
        ]);

        expect(result.ok).toBe(false);
        expect(result.issues.some((issue) => issue.message.includes('does not match assembly slug'))).toBe(true);
    });

    it('surfaces underlying document validation failures through manifest validation', () => {
        const [first] = REFERENCE_ASSEMBLY_MANIFEST;
        const result = validateAssemblyManifest([
            {
                slug: first.slug,
                assembly: {
                    ...first.assembly,
                    views: [
                        {
                            ...first.assembly.views[0],
                            moduleSlots: ['unknown-module'],
                        },
                    ],
                },
            },
        ]);

        expect(result.ok).toBe(false);
        expect(result.issues.some((issue) => issue.path.includes('views[0].moduleSlots'))).toBe(true);
    });
});