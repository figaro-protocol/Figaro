import {
    fetchSellerCatalogue,
    invalidateCatalogueCache,
} from '@/lib/seller/catalogueFetcher';
import { DEFAULT_IPFS_SERVICE, type IpfsService } from '@/lib/shared/ipfsService';
import {
    publishSellerCatalogue,
    type PublishResult,
} from '@/lib/seller/cataloguePublisher';
import type { SellerCatalogueMetadata } from '@/lib/seller/sellerCatalogueMetadata';

export interface CatalogueService {
    fetchSellerCatalogue(metadataURI: string): Promise<SellerCatalogueMetadata | null>;
    invalidateSellerCatalogue(metadataURI: string): void;
    publishSellerCatalogue(catalogue: SellerCatalogueMetadata): Promise<PublishResult>;
}

export interface CatalogueServiceOptions {
    evidenceTransport?: Pick<IpfsService, "pinJSON" | "buildURI">;
}

export function createCatalogueService(
    options: CatalogueServiceOptions = {},
): CatalogueService {
    const evidenceTransport = options.evidenceTransport ?? DEFAULT_IPFS_SERVICE;

    return {
        fetchSellerCatalogue,
        invalidateSellerCatalogue(metadataURI: string) {
            invalidateCatalogueCache(metadataURI);
        },
        publishSellerCatalogue(catalogue: SellerCatalogueMetadata) {
            return publishSellerCatalogue(catalogue, evidenceTransport);
        },
    };
}

export const DEFAULT_CATALOGUE_SERVICE: CatalogueService = createCatalogueService();