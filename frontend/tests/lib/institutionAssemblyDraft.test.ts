import { describe, expect, it } from 'vitest';

import {
    buildBlankInstitutionAssembly,
    buildDraftInstitutionArtifact,
    buildInstitutionAssemblySectionText,
    serializeInstitutionAssemblyDocument,
} from '@/lib/shared/institutionAssemblyDraft';

describe('institution assembly draft utilities', () => {
    it('builds a blank draft and serializes each top-level section', () => {
        const draft = buildBlankInstitutionAssembly({
            name: 'Figaro Returns',
            slug: 'figaro-returns',
            description: 'Returns institution.',
            assemblyClass: 'reference-returns',
            compositionLevel: 2,
        });

        const sections = buildInstitutionAssemblySectionText(draft);

        expect(draft.identity.id).toBe('figaro-returns-reference');
        expect(draft.views[1]?.viewId).toBe('figaro-returns-dashboard');
        expect(draft.roles.map((role) => role.defaultLandingView)).toEqual([
            'figaro-returns-dashboard',
            'figaro-returns-dashboard',
        ]);
        expect(sections.identity).toContain('"slug": "figaro-returns"');
        expect(sections.views).not.toContain('"route": "/"');
        expect(sections.views).not.toContain('"contextsAccepted"');
        expect(sections.views).not.toContain('"moduleSlots"');
        expect(sections.modules).not.toContain('"slot":');
        expect(sections.modules).not.toContain('"priority":');
        expect(sections.modules).toContain('"moduleId": "role-switcher"');
        expect(sections.modules).not.toContain('"componentKind": "RoleSwitcher"');
        expect(sections.builderMetadata).toContain('"compositionLevel": 2');

        const serialized = serializeInstitutionAssemblyDocument(draft);

        expect(serialized).not.toContain('"route": "/"');
        expect(serialized).not.toContain('"contextsAccepted"');
        expect(serialized).not.toContain('"moduleSlots"');
        expect(serialized).not.toContain('"slot":');
        expect(serialized).toContain('"moduleId": "role-switcher"');
        expect(serialized).not.toContain('"componentKind": "RoleSwitcher"');

        const serializedDocument = JSON.parse(serialized);

        expect(serializedDocument.modules.every((module: { slot?: string; priority?: number }) => (
            module.slot === undefined && module.priority === undefined
        ))).toBe(true);
    });

    it('flags publication conflicts against the registered assembly set', () => {
        const conflictingDraft = buildBlankInstitutionAssembly({
            name: 'Duplicate Eats',
            slug: 'figaro-eats',
            description: 'Duplicate slug.',
            assemblyClass: 'reference-template',
            compositionLevel: 1,
        });

        const artifact = buildDraftInstitutionArtifact(conflictingDraft);

        expect(artifact.publication.ok).toBe(false);
        expect(artifact.publication.issues.some((issue) => issue.path === 'identity.slug')).toBe(true);
        expect(artifact.publication.issues.some((issue) => issue.path === 'identity.id')).toBe(true);
    });
});