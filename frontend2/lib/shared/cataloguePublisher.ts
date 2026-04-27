/**
 * lib/shared/cataloguePublisher.ts
 *
 * Write path for seller/courier catalogues.
 * Serializes a SellerCatalogueMetadata document → pins to IPFS → returns
 * the IPFS URI to be stored on-chain via OperatorRegistry.updateProfile().
 *
 * The caller is responsible for the on-chain transaction (updateProfile).
 * This module handles only the off-chain publishing step.
 */

import type { SellerCatalogueMetadata } from "@/lib/shared/sellerCatalogueMetadata";
import type { CourierOfferingMetadata } from "@/lib/shared/courierOfferingMetadata";
import { parseSellerCatalogueDocument } from "@/lib/shared/sellerCatalogueMetadataParser";
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
export async function publishMerchantCatalogue(
    catalogue: SellerCatalogueMetadata,
    evidenceTransport: Pick<IpfsService, "pinJSON" | "buildURI"> = DEFAULT_IPFS_SERVICE,
): Promise<PublishResult> {
    // Round-trip validation — rejects invalid documents before pinning
    parseSellerCatalogueDocument(catalogue, "catalogue-publish");

    const cid = await evidenceTransport.pinJSON(catalogue);
    const uri = evidenceTransport.buildURI(cid);

    // Invalidate caches so the next read picks up the new version
    invalidateCatalogueCache(uri);
    clearBrandingCache();

    return { cid, uri };
}

/**
 * Validate, pin to IPFS, and return the URI for a courier offering.
 *
 * @throws If IPFS pinning fails.
 */
export async function publishCourierOffering(
    offering: CourierOfferingMetadata,
    evidenceTransport: Pick<IpfsService, "pinJSON" | "buildURI"> = DEFAULT_IPFS_SERVICE,
): Promise<PublishResult> {
    // Basic shape validation
    if (!offering.subjectAddress || !offering.serviceAreas?.length) {
        throw new Error("Courier offering must include subjectAddress and at least one service area");
    }

    const cid = await evidenceTransport.pinJSON(offering);
    const uri = evidenceTransport.buildURI(cid);

    return { cid, uri };
}
