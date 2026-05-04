import { describe, expect, it, vi } from 'vitest';

import localRuntimeIdentityDocument from '@/lib/shared/runtime-fixtures/local-runtime-identity.json';
import {
    createRuntimeIdentityDataSourceFromUrl,
    fetchRuntimeIdentityDocument,
    RuntimeIdentityFetcher,
} from '@/lib/shared/runtimeFetchSource';

function createJsonResponse(payload: unknown) {
    const text = JSON.stringify(payload);
    return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => payload,
        text: async () => text,
    };
}

describe('runtime fetch source', () => {
    it('loads a runtime data source from a fetched manifest document', async () => {
        const fetcher: RuntimeIdentityFetcher = vi.fn(async () => createJsonResponse(localRuntimeIdentityDocument));

        const dataSource = await createRuntimeIdentityDataSourceFromUrl(
            'https://example.com/runtime-identity.json',
            { fetcher }
        );

        expect(fetcher).toHaveBeenCalledWith('https://example.com/runtime-identity.json', undefined);
        expect(dataSource.version).toBe('1.0.0');
        expect(dataSource.listSubjectRecords()).toHaveLength(7);
        expect(dataSource.listValidationIssues?.()).toHaveLength(6);
        expect(dataSource.getSourceMetadata?.()).toEqual({
            sourceKind: 'remote',
            sourceLabel: 'https://example.com/runtime-identity.json',
            transport: 'fetched',
            requestUrl: 'https://example.com/runtime-identity.json',
        });
    });

    it('forwards request init to the fetcher', async () => {
        const fetcher: RuntimeIdentityFetcher = vi.fn(async () => createJsonResponse(localRuntimeIdentityDocument));
        const requestInit: RequestInit = {
            headers: {
                Accept: 'application/json',
                Authorization: 'Bearer runtime-token',
            },
            cache: 'no-store',
        };

        await fetchRuntimeIdentityDocument('https://example.com/runtime-identity.json', {
            fetcher,
            requestInit,
        });

        expect(fetcher).toHaveBeenCalledWith('https://example.com/runtime-identity.json', requestInit);
    });

    it('throws a descriptive error on HTTP failure', async () => {
        const fetcher: RuntimeIdentityFetcher = vi.fn(async () => ({
            ok: false,
            status: 404,
            statusText: 'Not Found',
            json: async () => ({ error: 'missing' }),
            text: async () => JSON.stringify({ error: 'missing' }),
        }));

        await expect(createRuntimeIdentityDataSourceFromUrl('https://example.com/missing.json', { fetcher })).rejects.toThrow(
            /Failed to fetch runtime identity document from https:\/\/example.com\/missing.json: 404 Not Found/
        );
    });

    it('propagates manifest parse failures from fetched documents', async () => {
        const invalidManifest = {
            ...localRuntimeIdentityDocument,
            assemblyBindings: [
                ...localRuntimeIdentityDocument.assemblyBindings,
                {
                    ...localRuntimeIdentityDocument.assemblyBindings[0],
                    bindingId: 'binding:broken:local-anvil',
                    subjectAddress: '0x0000000000000000000000000000000000000001',
                },
            ],
        };
        const fetcher: RuntimeIdentityFetcher = vi.fn(async () => createJsonResponse(invalidManifest));

        await expect(createRuntimeIdentityDataSourceFromUrl('https://example.com/broken.json', { fetcher })).rejects.toThrow(
            /binding binding:broken:local-anvil references missing subject/
        );
    });
});