/**
 * lib/shared/catalogPublisher.ts
 *
 * Write path for member catalogs.
 * Serializes a MemberCatalogMetadata document → pins to IPFS → returns
 * the IPFS URI. The URI is then referenced from the member's profile
 * document (as `catalogURI`) which itself is pinned and registered
 * on-chain via `MembersRegistry.register(profileURI)` for first-time
 * members or `MembersRegistry.updateProfile(profileURI)` for already-
 * registered members (the latter does not consume the deposit or
 * restart the lock period). This module handles the off-chain pin only;
 * the caller orchestrates the on-chain call.
 */

import type { MemberCatalogMetadata } from "@/lib/member/memberCatalogMetadata";
import { parseMemberCatalogDocument } from "@/lib/member/memberCatalogMetadataParser";
import { DEFAULT_IPFS_SERVICE, type IpfsService } from "@/lib/shared/ipfsService";
import { invalidateCatalogCache } from "@/lib/member/catalogFetcher";
import { clearBrandingCache } from "@/lib/member/memberBranding";

export interface PublishResult {
    /** The IPFS CID of the pinned document */
    cid: string;
    /** The full IPFS URI (ipfs://CID) for the on-chain metadataURI field */
    uri: string;
}

/**
 * Validate, pin to IPFS, and return the URI for a member catalog.
 *
 * Performs a round-trip validation: the document is parsed through the
 * strict parser before pinning to ensure only valid documents get published.
 *
 * @throws If the document fails validation or IPFS pinning fails.
 */
export async function publishMemberCatalog(
    catalog: MemberCatalogMetadata,
    evidenceTransport: Pick<IpfsService, "pinJSON" | "buildURI"> = DEFAULT_IPFS_SERVICE,
): Promise<PublishResult> {
    // Round-trip validation — rejects invalid documents before pinning
    parseMemberCatalogDocument(catalog, "catalog-publish");

    const cid = await evidenceTransport.pinJSON(catalog);
    const uri = evidenceTransport.buildURI(cid);

    // Invalidate caches so the next read picks up the new version
    invalidateCatalogCache(uri);
    clearBrandingCache();

    return { cid, uri };
}
