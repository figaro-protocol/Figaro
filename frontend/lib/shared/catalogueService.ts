import type { CourierOfferingMetadata } from '@/lib/shared/courierOfferingMetadata';
import {
    fetchMerchantCatalogue,
    invalidateCatalogueCache,
} from '@/lib/shared/catalogueFetcher';
import { DEFAULT_IPFS_SERVICE, type IpfsService } from '@/lib/shared/ipfsService';
import {
    publishCourierOffering,
    publishMerchantCatalogue,
    type PublishResult,
} from '@/lib/shared/cataloguePublisher';
import type { SellerCatalogueMetadata } from '@/lib/shared/sellerCatalogueMetadata';

export interface CatalogueService {
    fetchMerchantCatalogue(metadataURI: string): Promise<SellerCatalogueMetadata | null>;
    invalidateMerchantCatalogue(metadataURI: string): void;
    publishMerchantCatalogue(catalogue: SellerCatalogueMetadata): Promise<PublishResult>;
    publishCourierOffering(offering: CourierOfferingMetadata): Promise<PublishResult>;
}

export interface CatalogueServiceOptions {
    evidenceTransport?: Pick<IpfsService, "pinJSON" | "buildURI">;
}

export function createCatalogueService(
    options: CatalogueServiceOptions = {},
): CatalogueService {
    const evidenceTransport = options.evidenceTransport ?? DEFAULT_IPFS_SERVICE;

    return {
        fetchMerchantCatalogue,
        invalidateMerchantCatalogue(metadataURI: string) {
            invalidateCatalogueCache(metadataURI);
        },
        publishMerchantCatalogue(catalogue: SellerCatalogueMetadata) {
            return publishMerchantCatalogue(catalogue, evidenceTransport);
        },
        publishCourierOffering(offering: CourierOfferingMetadata) {
            return publishCourierOffering(offering, evidenceTransport);
        },
    };
}

export const DEFAULT_CATALOGUE_SERVICE: CatalogueService = createCatalogueService();