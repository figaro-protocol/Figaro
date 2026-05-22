import {
    fetchOperatorCatalogue,
    invalidateCatalogueCache,
} from '@/lib/shared/catalogueFetcher';
import { DEFAULT_IPFS_SERVICE, type IpfsService } from '@/lib/shared/ipfsService';
import {
    publishOperatorCatalogue,
    type PublishResult,
} from '@/lib/shared/cataloguePublisher';
import type { OperatorCatalogueMetadata } from '@/lib/shared/operatorCatalogueMetadata';

export interface CatalogueService {
    fetchOperatorCatalogue(metadataURI: string): Promise<OperatorCatalogueMetadata | null>;
    invalidateOperatorCatalogue(metadataURI: string): void;
    publishOperatorCatalogue(catalogue: OperatorCatalogueMetadata): Promise<PublishResult>;
}

export interface CatalogueServiceOptions {
    evidenceTransport?: Pick<IpfsService, "pinJSON" | "buildURI">;
}

export function createCatalogueService(
    options: CatalogueServiceOptions = {},
): CatalogueService {
    const evidenceTransport = options.evidenceTransport ?? DEFAULT_IPFS_SERVICE;

    return {
        fetchOperatorCatalogue,
        invalidateOperatorCatalogue(metadataURI: string) {
            invalidateCatalogueCache(metadataURI);
        },
        publishOperatorCatalogue(catalogue: OperatorCatalogueMetadata) {
            return publishOperatorCatalogue(catalogue, evidenceTransport);
        },
    };
}

export const DEFAULT_CATALOGUE_SERVICE: CatalogueService = createCatalogueService();