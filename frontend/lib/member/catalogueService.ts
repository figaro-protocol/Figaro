import {
    fetchMemberCatalogue,
    invalidateCatalogueCache,
} from '@/lib/member/catalogueFetcher';
import { DEFAULT_IPFS_SERVICE, type IpfsService } from '@/lib/shared/ipfsService';
import {
    publishMemberCatalogue,
    type PublishResult,
} from '@/lib/member/cataloguePublisher';
import type { MemberCatalogueMetadata } from '@/lib/member/memberCatalogueMetadata';

export interface CatalogueService {
    fetchMemberCatalogue(metadataURI: string): Promise<MemberCatalogueMetadata | null>;
    invalidateSellerCatalogue(metadataURI: string): void;
    publishMemberCatalogue(catalogue: MemberCatalogueMetadata): Promise<PublishResult>;
}

export interface CatalogueServiceOptions {
    evidenceTransport?: Pick<IpfsService, "pinJSON" | "buildURI">;
}

export function createCatalogueService(
    options: CatalogueServiceOptions = {},
): CatalogueService {
    const evidenceTransport = options.evidenceTransport ?? DEFAULT_IPFS_SERVICE;

    return {
        fetchMemberCatalogue,
        invalidateSellerCatalogue(metadataURI: string) {
            invalidateCatalogueCache(metadataURI);
        },
        publishMemberCatalogue(catalogue: MemberCatalogueMetadata) {
            return publishMemberCatalogue(catalogue, evidenceTransport);
        },
    };
}

export const DEFAULT_CATALOGUE_SERVICE: CatalogueService = createCatalogueService();