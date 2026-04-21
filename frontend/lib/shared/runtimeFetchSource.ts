import { RuntimeIdentityDataSource } from '@/lib/shared/runtimeDataSource';
import {
    createRuntimeIdentityDataSourceFromManifestDocument,
    ParsedRuntimeIdentityManifest,
} from '@/lib/shared/runtimeManifest';

export interface RuntimeIdentityManifestResponseLike {
    ok: boolean;
    status: number;
    statusText: string;
    json(): Promise<unknown>;
}

export type RuntimeIdentityManifestFetcher = (
    input: string,
    init?: RequestInit
) => Promise<RuntimeIdentityManifestResponseLike>;

export interface RuntimeIdentityManifestFetchOptions {
    fetcher?: RuntimeIdentityManifestFetcher;
    requestInit?: RequestInit;
    sourceLabel?: string;
}

function getDefaultFetcher(): RuntimeIdentityManifestFetcher {
    if (typeof fetch !== 'function') {
        throw new Error('No fetch implementation is available for runtime manifest loading.');
    }

    return fetch as RuntimeIdentityManifestFetcher;
}

export async function fetchRuntimeIdentityManifestDocument(
    manifestUrl: string,
    options: RuntimeIdentityManifestFetchOptions = {}
): Promise<unknown> {
    // RA-6: Validate URL scheme before fetching
    try {
        const parsed = new URL(manifestUrl);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
            throw new Error(`Unsupported URL scheme: ${parsed.protocol}`);
        }
    } catch (e) {
        throw new Error(`Invalid manifest URL: ${e instanceof Error ? e.message : 'malformed URL'}`);
    }

    const fetcher = options.fetcher ?? getDefaultFetcher();
    const response = await fetcher(manifestUrl, options.requestInit);

    if (!response.ok) {
        throw new Error(
            `Failed to fetch runtime identity manifest from ${manifestUrl}: ${response.status} ${response.statusText}`.trim()
        );
    }

    return response.json();
}

export async function createRuntimeIdentityDataSourceFromUrl(
    manifestUrl: string,
    options: RuntimeIdentityManifestFetchOptions = {}
): Promise<RuntimeIdentityDataSource & ParsedRuntimeIdentityManifest> {
    const manifestDocument = await fetchRuntimeIdentityManifestDocument(manifestUrl, options);

    return createRuntimeIdentityDataSourceFromManifestDocument(
        manifestDocument,
        options.sourceLabel ?? manifestUrl,
        {
            sourceKind: 'remote',
            sourceLabel: options.sourceLabel ?? manifestUrl,
            transport: 'fetched',
            requestUrl: manifestUrl,
        }
    );
}