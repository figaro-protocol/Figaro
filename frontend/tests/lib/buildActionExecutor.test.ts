import { describe, expect, it, vi, beforeEach } from 'vitest';

import { buildBlankAssembly } from '@/lib/shared/assemblyDraft';
import {
    executeBuildAction,
    publishAssemblyToLocalRegistry,
} from '@/lib/console/buildActionExecutor';
import type {
    PublishAssemblyAction,
    RegisterSchemaAction,
} from '@/lib/console/buildProvider';

function makePublishAction(slug = 'figaro-console-test'): PublishAssemblyAction {
    return {
        type: 'publish-assembly',
        description: `Publish ${slug}`,
        slug,
        assembly: buildBlankAssembly({
            name: 'Console Test',
            slug,
            assemblyClass: 'reference-template',
            compositionLevel: 1,
        }),
    };
}

function makeRegisterAction(): RegisterSchemaAction {
    return {
        type: 'register-schema',
        description: 'Register console schema',
        slug: 'figaro-console-test',
        schemaKey: 'figaro:assembly:figaro-console-test',
        version: 1,
    };
}

describe('buildActionExecutor', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('publishes assemblies to the local console registry', () => {
        const action = makePublishAction();
        const result = publishAssemblyToLocalRegistry(action);

        expect(result.mode).toBe('local');
        expect(result.localStorageKey).toBe(`figaro:assembly:${action.slug}`);
        expect(localStorage.getItem(result.localStorageKey)).toContain(action.slug);
    });

    it('returns workspace publication metadata when the workspace publisher succeeds', async () => {
        const action = makePublishAction();
        const outcome = await executeBuildAction(action, {
            registerSchema: vi.fn(),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            publishAssembly: (vi.fn(async () => ({
                ok: true,
                slug: action.slug,
                assembly: action.assembly,
                outputPath: `/tmp/${action.slug}.reference.json`,
                registryPath: '/tmp/assembly.ts',
                prototypePath: `/builders/prototype/${action.slug}`,
            })) as any),
        });

        expect(outcome.txHash).toBeUndefined();
        expect(outcome.result).toMatchObject({
            published: true,
            mode: 'workspace',
            slug: action.slug,
            outputPath: `/tmp/${action.slug}.reference.json`,
        });
    });

    it('falls back to local publication when the workspace publisher throws', async () => {
        const action = makePublishAction('figaro-console-fallback');
        const outcome = await executeBuildAction(action, {
            registerSchema: vi.fn(),
            publishAssembly: vi.fn(async () => {
                throw new Error('workspace unavailable');
            }),
        });

        expect(outcome.result).toMatchObject({
            published: true,
            mode: 'local',
            slug: action.slug,
            fallbackReason: 'workspace unavailable',
        });
        expect(localStorage.getItem(`figaro:assembly:${action.slug}`)).toContain(action.slug);
    });

    it('does not fall back to local publication when the workspace publisher returns validation issues', async () => {
        const action = makePublishAction('figaro-console-invalid');

        await expect(executeBuildAction(action, {
            registerSchema: vi.fn(),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            publishAssembly: (vi.fn(async () => ({
                ok: false,
                issues: [{
                    severity: 'error',
                    path: 'identity.slug',
                    message: 'Assembly document already exists.',
                }],
            })) as any),
        })).rejects.toThrow('identity.slug: Assembly document already exists.');

        expect(localStorage.getItem(`figaro:assembly:${action.slug}`)).toBeNull();
    });

    it('delegates schema registration and returns the tx hash', async () => {
        const action = makeRegisterAction();
        const registerSchema = vi.fn(async () => '0x1234' as `0x${string}`);
        const outcome = await executeBuildAction(action, {
            registerSchema,
            publishAssembly: vi.fn(),
        });

        expect(registerSchema).toHaveBeenCalledWith(action);
        expect(outcome.txHash).toBe('0x1234');
        expect(outcome.result).toMatchObject({
            registered: true,
            schemaKey: action.schemaKey,
            version: action.version,
        });
    });
});