import { describe, expect, it } from 'vitest';

import { REFERENCE_ASSEMBLIES_INDEX, validateAssemblyIndex } from '@/lib/shared/assemblyIndex';

describe('assembly index', () => {
    it('validates the current reference manifest cleanly', () => {
        const result = validateAssemblyIndex(REFERENCE_ASSEMBLIES_INDEX);

        expect(result.ok).toBe(true);
        expect(result.perAssembly).toHaveLength(5);
        expect(result.perAssembly.every((entry) => entry.result.ok)).toBe(true);
    });

    it('rejects duplicate slugs across index entries', () => {
        const [first, second] = REFERENCE_ASSEMBLIES_INDEX;
        const result = validateAssemblyIndex([
            first,
            { slug: first.slug, assembly: second.assembly },
        ]);

        expect(result.ok).toBe(false);
        expect(result.issues.some((issue) => issue.message.includes('Duplicate index slug'))).toBe(true);
    });

    it('rejects duplicate assembly ids across index entries', () => {
        const [first, second] = REFERENCE_ASSEMBLIES_INDEX;
        const result = validateAssemblyIndex([
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
        expect(result.issues.some((issue) => issue.message.includes('Duplicate assembly id across index'))).toBe(true);
    });

    it('rejects manifest entries whose slug does not match the assembly document', () => {
        const [first] = REFERENCE_ASSEMBLIES_INDEX;
        const result = validateAssemblyIndex([
            {
                slug: 'mismatched-slug',
                assembly: first.assembly,
            },
        ]);

        expect(result.ok).toBe(false);
        expect(result.issues.some((issue) => issue.message.includes('does not match assembly slug'))).toBe(true);
    });

    it('surfaces underlying document validation failures through manifest validation', () => {
        const [first] = REFERENCE_ASSEMBLIES_INDEX;
        const result = validateAssemblyIndex([
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