/**
 * lib/shared/cataloguePublisher.ts
 *
 * Write path for operator catalogues.
 * Serializes a OperatorCatalogueMetadata document → pins to IPFS → returns
 * the IPFS URI. The URI is then referenced from the operator's profile
 * document (as `catalogueURI`) which itself is pinned and registered
 * on-chain via `OperatorRegistry.register(profileURI)` for first-time
 * operators or `OperatorRegistry.updateProfile(profileURI)` for already-
 * registered operators (the latter does not consume the deposit or
 * restart the lock period). This module handles the off-chain pin only;
 * the caller orchestrates the on-chain call.
 */

import type { OperatorCatalogueMetadata } from "@/lib/shared/operatorCatalogueMetadata";
import { parseOperatorCatalogueDocument } from "@/lib/shared/operatorCatalogueMetadataParser";
import { DEFAULT_IPFS_SERVICE, type IpfsService } from "@/lib/shared/ipfsService";
import { invalidateCatalogueCache } from "@/lib/shared/catalogueFetcher";
import { clearBrandingCache } from "@/lib/shared/merchantBranding";

export interface PublishResult {
    /** The IPFS CID of the pinned document */
    cid: string;
    /** The full IPFS URI (ipfs://CID) for the on-chain metadataURI field */
    uri: string;
}

/**
 * Validate, pin to IPFS, and return the URI for a merchant catalogue.
 *
 * Performs a round-trip validation: the document is parsed through the
 * strict parser before pinning to ensure only valid documents get published.
 *
 * @throws If the document fails validation or IPFS pinning fails.
 */
export async function publishOperatorCatalogue(
    catalogue: OperatorCatalogueMetadata,
    evidenceTransport: Pick<IpfsService, "pinJSON" | "buildURI"> = DEFAULT_IPFS_SERVICE,
): Promise<PublishResult> {
    // Round-trip validation — rejects invalid documents before pinning
    parseOperatorCatalogueDocument(catalogue, "catalogue-publish");

    const cid = await evidenceTransport.pinJSON(catalogue);
    const uri = evidenceTransport.buildURI(cid);

    // Invalidate caches so the next read picks up the new version
    invalidateCatalogueCache(uri);
    clearBrandingCache();

    return { cid, uri };
}
