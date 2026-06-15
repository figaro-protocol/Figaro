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
import { resolveContentUri } from "@/lib/shared/ipfsService";
import { createUriFetcher } from "@/lib/shared/uriFetcher";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SellerAssets {
    imageBaseURI?: string;
}

export interface ResolvedSellerBranding {
    branding: SellerBrandingMetadata;
    assets: SellerAssets;
    /** Gateway-resolved logo URL (ready for <img src>) */
    logoURL?: string;
    /** Gateway-resolved hero image URL */
    heroImageURL?: string;
    /** Raw seller name (top-level, not branding.displayName) */
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
        displayName: typeof branding.displayName === "string" ? branding.displayName : undefined,
        logoURI: typeof branding.logoURI === "string" ? branding.logoURI : undefined,
        heroImageURI: typeof branding.heroImageURI === "string" ? branding.heroImageURI : undefined,
        accentColor: typeof branding.accentColor === "string" ? branding.accentColor : undefined,
        themeClass: typeof branding.themeClass === "string" ? branding.themeClass : undefined,
    };

    const a: SellerAssets = {
        imageBaseURI: typeof assets.imageBaseURI === "string" ? assets.imageBaseURI : undefined,
    };

    return {
        branding: b,
        assets: a,
        logoURL: b.logoURI ? (resolveContentUri(b.logoURI) ?? undefined) : undefined,
        heroImageURL: b.heroImageURI ? (resolveContentUri(b.heroImageURI) ?? undefined) : undefined,
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
        metadata.branding?.displayName
        || metadata.branding?.logoURI
        || metadata.branding?.heroImageURI
        || metadata.branding?.accentColor
        || metadata.branding?.themeClass
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
