import { describe, expect, it, vi } from 'vitest';

import localRuntimeManifestDocument from '@/lib/shared/runtime-fixtures/local-runtime.manifest.json';
import {
    createRuntimeIdentityDataSourceFromUrl,
    fetchRuntimeIdentityManifestDocument,
    RuntimeIdentityManifestFetcher,
} from '@/lib/shared/runtimeFetchSource';

function createJsonResponse(payload: unknown) {
    return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => payload,
    };
}

describe('runtime fetch source', () => {
    it('loads a runtime data source from a fetched manifest document', async () => {
        const fetcher: RuntimeIdentityManifestFetcher = vi.fn(async () => createJsonResponse(localRuntimeManifestDocument));

        const dataSource = await createRuntimeIdentityDataSourceFromUrl(
            'https://example.com/runtime.manifest.json',
            { fetcher }
        );

        expect(fetcher).toHaveBeenCalledWith('https://example.com/runtime.manifest.json', undefined);
        expect(dataSource.version).toBe('1.0.0');
        expect(dataSource.listSubjectRecords()).toHaveLength(3);
        expect(dataSource.listValidationIssues?.()).toHaveLength(2);
        expect(dataSource.getSourceMetadata?.()).toEqual({
            sourceKind: 'remote',
            sourceLabel: 'https://example.com/runtime.manifest.json',
            transport: 'fetched',
            requestUrl: 'https://example.com/runtime.manifest.json',
        });
    });

    it('forwards request init to the fetcher', async () => {
        const fetcher: RuntimeIdentityManifestFetcher = vi.fn(async () => createJsonResponse(localRuntimeManifestDocument));
        const requestInit: RequestInit = {
            headers: {
                Accept: 'application/json',
                Authorization: 'Bearer runtime-token',
            },
            cache: 'no-store',
        };

        await fetchRuntimeIdentityManifestDocument('https://example.com/runtime.manifest.json', {
            fetcher,
            requestInit,
        });

        expect(fetcher).toHaveBeenCalledWith('https://example.com/runtime.manifest.json', requestInit);
    });

    it('throws a descriptive error on HTTP failure', async () => {
        const fetcher: RuntimeIdentityManifestFetcher = vi.fn(async () => ({
            ok: false,
            status: 404,
            statusText: 'Not Found',
            json: async () => ({ error: 'missing' }),
        }));

        await expect(createRuntimeIdentityDataSourceFromUrl('https://example.com/missing.json', { fetcher })).rejects.toThrow(
            /Failed to fetch runtime identity manifest from https:\/\/example.com\/missing.json: 404 Not Found/
        );
    });

    it('propagates manifest parse failures from fetched documents', async () => {
        const invalidManifest = {
            ...localRuntimeManifestDocument,
            institutionBindings: [
                ...localRuntimeManifestDocument.institutionBindings,
                {
                    ...localRuntimeManifestDocument.institutionBindings[0],
                    bindingId: 'binding:broken:local-anvil',
                    subjectAddress: '0x0000000000000000000000000000000000000001',
                },
            ],
        };
        const fetcher: RuntimeIdentityManifestFetcher = vi.fn(async () => createJsonResponse(invalidManifest));

        await expect(createRuntimeIdentityDataSourceFromUrl('https://example.com/broken.json', { fetcher })).rejects.toThrow(
            /binding binding:broken:local-anvil references missing subject/
        );
    });
});