import { describe, expect, it } from 'vitest';

import subjectFixture from '@/lib/shared/runtime-fixtures/bobs-pizza.subject.json';
import bindingFixture from '@/lib/shared/runtime-fixtures/bobs-pizza.binding.json';
import {
    collectSubjectProvenance,
    listBindingsForAddress,
    resolveIdentityContext,
} from '@/lib/shared/runtimeIdentity';
import {
    parseInstitutionBindingDocument,
    parseSubjectRecordDocument,
} from '@/lib/shared/runtimeIdentityParser';

describe('runtime identity parser', () => {
    it('parses a valid subject record document', () => {
        const subject = parseSubjectRecordDocument(subjectFixture, 'bobs-pizza.subject.json');

        expect(subject.subjectKind).toBe('merchant');
        expect(subject.displayName).toBe("Bob's Pizza Palace");
        expect(subject.bindingRefs?.[0]?.refKind).toBe('binding');
    });

    it('parses a valid institution binding document', () => {
        const binding = parseInstitutionBindingDocument(bindingFixture, 'bobs-pizza.binding.json');

        expect(binding.assemblySlug).toBe('figaro-eats');
        expect(binding.roleBindings[0]?.roleKind).toBe('restaurant-operator');
        expect(binding.roleBindings[0]?.assemblyRoleKinds).toEqual(['restaurant']);
        expect(binding.networkTargets).toContain('local-anvil');
    });

    it('rejects an invalid subject address', () => {
        expect(() => parseSubjectRecordDocument({
            ...subjectFixture,
            subjectAddress: 'not-an-address',
        }, 'invalid-subject.json')).toThrow(/invalid-subject\.json\.subjectAddress must be a 20-byte hex address/);
    });
});

describe('runtime identity resolution', () => {
    const subject = parseSubjectRecordDocument(subjectFixture, 'bobs-pizza.subject.json');
    const binding = parseInstitutionBindingDocument(bindingFixture, 'bobs-pizza.binding.json');

    it('filters bindings by address and network target', () => {
        const bindings = listBindingsForAddress(subject.subjectAddress, [binding], 'local-anvil');

        expect(bindings).toHaveLength(1);
        expect(bindings[0]?.bindingId).toBe(binding.bindingId);
    });

    it('resolves a subject and selected binding for an address', () => {
        const context = resolveIdentityContext(subject.subjectAddress, [subject], [binding], 'local-anvil');

        expect(context?.subject.subjectAddress).toBe(subject.subjectAddress);
        expect(context?.selectedBinding?.assemblySlug).toBe('figaro-eats');
    });

    it('derives subject provenance from the subject record and its bindings', () => {
        const provenance = collectSubjectProvenance(subject, [binding]);

        expect(provenance.bindingIds).toEqual([binding.bindingId]);
        expect(provenance.bindingRefs[0]?.refKind).toBe('binding');
        expect(provenance.signatureRefs[0]?.refKind).toBe('signature');
        expect(provenance.metadataRefs[0]?.uri).toBe(binding.metadataURI);
        expect(provenance.assetRefs[0]?.uri).toBe(binding.assetURI);
        expect(provenance.hasSignatures).toBe(true);
        expect(provenance.quality).toBe('signed');
        expect(provenance.issues).toEqual([]);
    });

    it('returns undefined when no subject record exists', () => {
        const context = resolveIdentityContext(subject.subjectAddress, [], [binding], 'local-anvil');
        expect(context).toBeUndefined();
    });
});