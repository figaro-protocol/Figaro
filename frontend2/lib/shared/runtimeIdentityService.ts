import { createRuntimeIdentityDataSourceFromUrl } from '@/lib/shared/runtimeFetchSource';
import type { RuntimeIdentityDataSource } from '@/lib/shared/runtimeDataSource';
import { FIXTURE_RUNTIME_IDENTITY_SOURCE } from '@/lib/shared/runtimeIdentityRegistry';
import {
    resolveAssemblyRuntimeContext,
    type ResolvedAssemblyRuntimeContext,
} from '@/lib/shared/runtimeResolution';

export interface RuntimeIdentityService {
    getFallbackSource(): RuntimeIdentityDataSource;
    loadSourceFromUrl(manifestUrl: string): Promise<RuntimeIdentityDataSource>;
    resolveAssemblyContext(
        slug: string,
        networkTarget?: string,
        dataSource?: RuntimeIdentityDataSource,
    ): ResolvedAssemblyRuntimeContext | undefined;
}

export const DEFAULT_RUNTIME_IDENTITY_SERVICE: RuntimeIdentityService = {
    getFallbackSource() {
        return FIXTURE_RUNTIME_IDENTITY_SOURCE;
    },
    loadSourceFromUrl(manifestUrl: string) {
        return createRuntimeIdentityDataSourceFromUrl(manifestUrl, {
            sourceLabel: manifestUrl,
        });
    },
    resolveAssemblyContext(
        slug: string,
        networkTarget?: string,
        dataSource: RuntimeIdentityDataSource = FIXTURE_RUNTIME_IDENTITY_SOURCE,
    ) {
        return resolveAssemblyRuntimeContext(slug, networkTarget, dataSource);
    },
};