import { RuntimeIdentityDataSource } from '@/lib/shared/runtimeDataSource';
import {
    createRuntimeIdentityDataSourceFromDocument,
    ParsedRuntimeIdentityDocument,
} from '@/lib/shared/runtimeIdentityDocument';
import { safeJsonFromResponse } from '@/lib/shared/safeJson';

export interface RuntimeIdentityResponseLike {
    ok: boolean;
    status: number;
    statusText: string;
    /** Read body as text. Required so the runtime can route through
     *  `safeJsonParse` for prototype-pollution defense. Test stubs that
     *  previously only implemented `json()` need to add `text()` too. */
    text(): Promise<string>;
}

export type RuntimeIdentityFetcher = (
    input: string,
    init?: RequestInit
) => Promise<RuntimeIdentityResponseLike>;

export interface RuntimeIdentityFetchOptions {
    fetcher?: RuntimeIdentityFetcher;
    requestInit?: RequestInit;
    sourceLabel?: string;
}

function getDefaultFetcher(): RuntimeIdentityFetcher {
    if (typeof fetch !== 'function') {
        throw new Error('No fetch implementation is available for runtime identity document loading.');
    }

    return fetch as RuntimeIdentityFetcher;
}

export async function fetchRuntimeIdentityDocument(
    identityUrl: string,
    options: RuntimeIdentityFetchOptions = {}
): Promise<unknown> {
    // RA-6: Validate URL scheme before fetching
    try {
        const parsed = new URL(identityUrl);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
            throw new Error(`Unsupported URL scheme: ${parsed.protocol}`);
        }
    } catch (e) {
        throw new Error(`Invalid identity URL: ${e instanceof Error ? e.message : 'malformed URL'}`);
    }

    const fetcher = options.fetcher ?? getDefaultFetcher();
    const response = await fetcher(identityUrl, options.requestInit);

    const parsed = await safeJsonFromResponse(response);
    if (parsed === null) {
        throw new Error(
            `Failed to fetch runtime identity document from ${identityUrl}: ${response.status} ${response.statusText}`.trim()
        );
    }

    return parsed;
}

export async function createRuntimeIdentityDataSourceFromUrl(
    identityUrl: string,
    options: RuntimeIdentityFetchOptions = {}
): Promise<RuntimeIdentityDataSource & ParsedRuntimeIdentityDocument> {
    const identityDocument = await fetchRuntimeIdentityDocument(identityUrl, options);

    return createRuntimeIdentityDataSourceFromDocument(
        identityDocument,
        options.sourceLabel ?? identityUrl,
        {
            sourceKind: 'remote',
            sourceLabel: options.sourceLabel ?? identityUrl,
            transport: 'fetched',
            requestUrl: identityUrl,
        }
    );
}