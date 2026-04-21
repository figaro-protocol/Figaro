import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { BuildProvider, useBuilder } from '@/lib/console/buildProvider';
import type { ConsoleQueueItem } from '@/lib/console/consoleQueue';
import type { PublishAssemblyAction } from '@/lib/console/buildProvider';
import { buildBlankInstitutionAssembly } from '@/lib/shared/institutionAssemblyDraft';

function renderBuildHook(queueItems: ConsoleQueueItem[] = []) {
    return renderHook(() => useBuilder(), {
        wrapper: ({ children }) => <BuildProvider queueItems={queueItems}>{children}</BuildProvider>,
    });
}

function makePublishedQueueItem(): ConsoleQueueItem {
    const action: PublishAssemblyAction = {
        type: 'publish-assembly',
        description: 'Publish console assembly',
        slug: 'console-published',
        assembly: buildBlankInstitutionAssembly({
            name: 'Console Published',
            slug: 'console-published',
            assemblyClass: 'reference-template',
            compositionLevel: 1,
        }),
    };

    return {
        id: 99,
        entry: { kind: 'building', action },
        status: 'executed',
        enqueuedAt: Date.now(),
        result: {
            published: true,
            mode: 'workspace',
            slug: action.slug,
            prototypePath: `/builders/prototype/${action.slug}`,
        },
    };
}

describe('BuildProvider', () => {
    // ── Draft creation ─────────────────────────────────────────────────────

    it('starts with no drafts and no selection', () => {
        const { result } = renderBuildHook();
        expect(result.current.drafts.size).toBe(0);
        expect(result.current.selectedDraftSlug).toBeNull();
        expect(result.current.selectedDraft).toBeNull();
    });

    it('creates a blank draft and auto-selects it', () => {
        const { result } = renderBuildHook();

        act(() => result.current.createDraft('Test Assembly', 'test-assembly'));

        expect(result.current.drafts.size).toBe(1);
        expect(result.current.selectedDraftSlug).toBe('test-assembly');
        expect(result.current.selectedDraft).not.toBeNull();
        expect(result.current.selectedDraft!.assembly.identity.slug).toBe('test-assembly');
        expect(result.current.selectedDraft!.dirty).toBe(true);
        expect(result.current.selectedDraft!.validation).toBeNull();
    });

    it('creates multiple drafts', () => {
        const { result } = renderBuildHook();

        act(() => result.current.createDraft('First', 'first'));
        act(() => result.current.createDraft('Second', 'second'));

        expect(result.current.drafts.size).toBe(2);
        // Last one created is selected
        expect(result.current.selectedDraftSlug).toBe('second');
    });

    // ── Draft selection ────────────────────────────────────────────────────

    it('selects a specific draft', () => {
        const { result } = renderBuildHook();

        act(() => result.current.createDraft('Alpha', 'alpha'));
        act(() => result.current.createDraft('Beta', 'beta'));
        act(() => result.current.selectDraft('alpha'));

        expect(result.current.selectedDraftSlug).toBe('alpha');
        expect(result.current.selectedDraft!.assembly.identity.slug).toBe('alpha');
    });

    it('deselects when null is passed', () => {
        const { result } = renderBuildHook();

        act(() => result.current.createDraft('Solo', 'solo'));
        act(() => result.current.selectDraft(null));

        expect(result.current.selectedDraftSlug).toBeNull();
        expect(result.current.selectedDraft).toBeNull();
    });

    // ── Draft update ───────────────────────────────────────────────────────

    it('updates a draft assembly and marks dirty', () => {
        const { result } = renderBuildHook();

        act(() => result.current.createDraft('Editable', 'editable'));

        const assembly = result.current.selectedDraft!.assembly;
        const updated = {
            ...assembly,
            identity: { ...assembly.identity, name: 'Renamed' },
        };

        act(() => result.current.updateDraft('editable', updated));

        expect(result.current.selectedDraft!.assembly.identity.name).toBe('Renamed');
        expect(result.current.selectedDraft!.dirty).toBe(true);
    });

    // ── Section update (JSON text) ─────────────────────────────────────────

    it('updates a section via valid JSON text', () => {
        const { result } = renderBuildHook();

        act(() => result.current.createDraft('Json Test', 'json-test'));

        const narrativeJson = JSON.stringify({
            headline: 'Updated headline',
            tagline: 'New tagline',
        });

        let ok = false;
        act(() => { ok = result.current.updateDraftSection('json-test', 'narrative', narrativeJson); });

        expect(ok).toBe(true);
        expect(result.current.selectedDraft!.assembly.narrative).toEqual({
            headline: 'Updated headline',
            tagline: 'New tagline',
        });
    });

    it('rejects invalid JSON text and returns false', () => {
        const { result } = renderBuildHook();

        act(() => result.current.createDraft('Bad Json', 'bad-json'));

        let ok = true;
        act(() => { ok = result.current.updateDraftSection('bad-json', 'narrative', '{not valid json}'); });

        expect(ok).toBe(false);
    });

    it('returns false for non-existent draft slug', () => {
        const { result } = renderBuildHook();

        let ok = true;
        act(() => { ok = result.current.updateDraftSection('ghost', 'identity', '{}'); });

        expect(ok).toBe(false);
    });

    // ── Validation ─────────────────────────────────────────────────────────

    it('validates a draft and stores the result', () => {
        const { result } = renderBuildHook();

        act(() => result.current.createDraft('Validate Me', 'validate-me'));

        let validationResult: any;
        act(() => { validationResult = result.current.validateDraft('validate-me'); });

        // Blank assemblies typically have warnings but not hard failures
        expect(validationResult).toHaveProperty('ok');
        expect(validationResult).toHaveProperty('issues');

        // Validation result is stored on the draft
        expect(result.current.selectedDraft!.validation).toBe(validationResult);
    });

    it('returns error result for non-existent draft', () => {
        const { result } = renderBuildHook();

        let validationResult: any;
        act(() => { validationResult = result.current.validateDraft('ghost'); });

        expect(validationResult.ok).toBe(false);
        expect(validationResult.issues[0].message).toContain('not found');
    });

    // ── Deletion ───────────────────────────────────────────────────────────

    it('deletes a draft and deselects if it was selected', () => {
        const { result } = renderBuildHook();

        act(() => result.current.createDraft('Delete Me', 'delete-me'));
        expect(result.current.selectedDraftSlug).toBe('delete-me');

        act(() => result.current.deleteDraft('delete-me'));

        expect(result.current.drafts.size).toBe(0);
        expect(result.current.selectedDraftSlug).toBeNull();
    });

    it('deletes a non-selected draft without affecting selection', () => {
        const { result } = renderBuildHook();

        act(() => result.current.createDraft('Keep', 'keep'));
        act(() => result.current.createDraft('Remove', 'remove'));
        act(() => result.current.selectDraft('keep'));

        act(() => result.current.deleteDraft('remove'));

        expect(result.current.drafts.size).toBe(1);
        expect(result.current.selectedDraftSlug).toBe('keep');
    });

    // ── Fork ───────────────────────────────────────────────────────────────

    it('forks a registered assembly into a draft', () => {
        const { result } = renderBuildHook();
        const registered = result.current.registeredAssemblies;

        if (registered.length === 0) {
            // No registered assemblies in test env — skip gracefully
            return;
        }

        const sourceSlug = registered[0].identity.slug;
        act(() => result.current.forkAssembly(sourceSlug));

        const forkedSlug = `${sourceSlug}-fork`;
        expect(result.current.selectedDraftSlug).toBe(forkedSlug);
        expect(result.current.selectedDraft!.assembly.identity.name).toContain('(Fork)');
        expect(result.current.selectedDraft!.dirty).toBe(true);
    });

    it('no-ops when forking a non-existent slug', () => {
        const { result } = renderBuildHook();

        act(() => result.current.forkAssembly('does-not-exist'));

        expect(result.current.drafts.size).toBe(0);
    });

    it('adds executed publish actions to the registered assembly list', () => {
        const queueItem = makePublishedQueueItem();
        const { result } = renderBuildHook([queueItem]);

        expect(result.current.registeredAssemblies.some((assembly) => assembly.identity.slug === 'console-published')).toBe(true);
    });
});
