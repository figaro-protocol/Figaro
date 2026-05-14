import { createRuntimeIdentityDataSourceFromUrl } from '@/lib/shared/runtimeFetchSource';
import type { RuntimeIdentityDataSource } from '@/lib/shared/runtimeDataSource';
import { FIXTURE_RUNTIME_IDENTITY_SOURCE } from '@/lib/shared/runtimeIdentityRegistry';

export interface RuntimeIdentityService {
    getFallbackSource(): RuntimeIdentityDataSource;
    loadSourceFromUrl(manifestUrl: string): Promise<RuntimeIdentityDataSource>;
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
};
