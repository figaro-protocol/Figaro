/**
 * lib/shared/sellerBranding.ts
 *
 * Seller branding metadata fetcher.
 * Resolves IPFS/HTTP URIs from SellerRegistry.metadataURI, fetches the
 * seller profile document, and extracts branding + asset fields.
 *
 * The metadata document the on-chain `metadataURI` points to is an
 * `SellerProfileMetadata` record; only its branding-relevant subset
 * (name, branding, assets) is extracted here. The profile pins the
 * branding payload (logo, hero, image base URI) so buyer
 * frontends can render the seller's identity.
 */

import type { SellerBrandingMetadata } from "@/lib/seller/sellerBrandingMetadata";
import type { SellerProfileMetadata } from "@/lib/seller/sellerProfileMetadata";
import { createUriFetcher } from "@/lib/seller/uriFetcher";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SellerAssets {
    imageBaseURI?: string;
}

export interface ResolvedSellerBranding {
    branding: SellerBrandingMetadata;
    assets: SellerAssets;
    /** Raw logo LOCATOR (e.g. `ipfs://…`) — the render layer resolves it once
     *  through `resolveImageUri` (ipfs→gateway, rejects raw http as an
     *  anti-tracking gate). NOT pre-resolved here: pre-resolving to a gateway
     *  http URL made the render gate reject legitimate ipfs logos. */
    logoURI?: string;
    /** Raw seller name (top-level). */
    name?: string;
}

// ── Fetch + parse ─────────────────────────────────────────────────────────────

function resolveSellerBrandingDocument(input: {
    name?: string;
    branding?: Partial<SellerBrandingMetadata> | null;
    assets?: Partial<SellerAssets> | null;
}): ResolvedSellerBranding {
    const branding = input.branding ?? {};
    const assets = input.assets ?? {};

    const b: SellerBrandingMetadata = {
        logoURI: typeof branding.logoURI === "string" ? branding.logoURI : undefined,
    };

    const a: SellerAssets = {
        imageBaseURI: typeof assets.imageBaseURI === "string" ? assets.imageBaseURI : undefined,
    };

    return {
        branding: b,
        assets: a,
        logoURI: typeof b.logoURI === "string" ? b.logoURI : undefined,
        name: typeof input.name === "string" ? input.name : undefined,
    };
}

export function resolveSellerBrandingFromSellerProfile(
    metadata: Pick<SellerProfileMetadata, "name" | "branding" | "assets"> | null | undefined,
): ResolvedSellerBranding | null {
    if (!metadata) {
        return null;
    }

    const hasBranding = Boolean(
        metadata.branding?.logoURI
        || metadata.assets?.imageBaseURI
    );

    if (!hasBranding) {
        return null;
    }

    return resolveSellerBrandingDocument({
        name: metadata.name,
        branding: metadata.branding,
        assets: metadata.assets,
    });
}

/**
 * Fetch seller metadata from a content URI and extract branding fields.
 * Results are cached in-memory by URI.
 *
 * @returns Resolved branding, or null if the URI is empty or fetch fails.
 */
const brandingFetcher = createUriFetcher<ResolvedSellerBranding>({
    parse: (doc) => {
        if (!doc || typeof doc !== "object" || Array.isArray(doc)) return null;
        const record = doc as Record<string, unknown>;
        return resolveSellerBrandingDocument({
            name: typeof record.name === "string" ? record.name : undefined,
            branding: (record.branding ?? null) as Partial<SellerBrandingMetadata> | null,
            assets: (record.assets ?? null) as Partial<SellerAssets> | null,
        });
    },
});

export function fetchSellerBranding(metadataURI: string): Promise<ResolvedSellerBranding | null> {
    return brandingFetcher.fetch(metadataURI);
}

/** Clear the branding cache (useful for tests). */
export function clearBrandingCache(): void {
    brandingFetcher.clear();
}
