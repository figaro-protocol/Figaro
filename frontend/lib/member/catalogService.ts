import {
    fetchMemberCatalog,
    invalidateCatalogCache,
} from '@/lib/member/catalogFetcher';
import { DEFAULT_IPFS_SERVICE, type IpfsService } from '@/lib/shared/ipfsService';
import {
    publishMemberCatalog,
    type PublishResult,
} from '@/lib/member/catalogPublisher';
import type { MemberCatalogMetadata } from '@/lib/member/memberCatalogMetadata';

export interface CatalogService {
    fetchMemberCatalog(metadataURI: string): Promise<MemberCatalogMetadata | null>;
    invalidateSellerCatalog(metadataURI: string): void;
    publishMemberCatalog(catalog: MemberCatalogMetadata): Promise<PublishResult>;
}

export interface CatalogServiceOptions {
    evidenceTransport?: Pick<IpfsService, "pinJSON" | "buildURI">;
}

export function createCatalogService(
    options: CatalogServiceOptions = {},
): CatalogService {
    const evidenceTransport = options.evidenceTransport ?? DEFAULT_IPFS_SERVICE;

    return {
        fetchMemberCatalog,
        invalidateSellerCatalog(metadataURI: string) {
            invalidateCatalogCache(metadataURI);
        },
        publishMemberCatalog(catalog: MemberCatalogMetadata) {
            return publishMemberCatalog(catalog, evidenceTransport);
        },
    };
}

export const DEFAULT_CATALOG_SERVICE: CatalogService = createCatalogService();