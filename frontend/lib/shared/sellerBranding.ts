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
 * branding payload (logo, hero, CSS, image base URI) so buyer
 * frontends can skin against the seller's identity.
 *
 * NOTE (Phase-2): `resolveContentURI` is a neutral IPFS/HTTP URI resolver
 * that duplicates `ipfsService.resolveFetchUrl`. It lives here only for
 * historical reasons; relocating/merging it is tracked separately and is
 * out of scope for the seller-naming pass.
 */

import type {
    SellerBrandingMetadata,
} from "@/lib/shared/sellerCatalogueMetadata";
import type { SellerProfileMetadata } from "@/lib/shared/sellerProfileMetadata";
import { safeJsonFromResponse } from "@/lib/shared/safeJson";
import { IPFS_GATEWAY_URL } from "@/lib/shared/ipfsService";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SellerAssets {
    cssURI?: string;
    imageBaseURI?: string;
}

export interface ResolvedSellerBranding {
    branding: SellerBrandingMetadata;
    assets: SellerAssets;
    /** Gateway-resolved logo URL (ready for <img src>) */
    logoURL?: string;
    /** Gateway-resolved hero image URL */
    heroImageURL?: string;
    /** Gateway-resolved CSS URL */
    cssURL?: string;
    /** Raw seller name (top-level, not branding.displayName) */
    name?: string;
}

// ── URI resolution ────────────────────────────────────────────────────────────

/**
 * Resolve a content URI to an HTTP URL.
 * Supports `ipfs://CID`, `ipfs://CID/path`, and passthrough for `http(s)://`.
 */
export function resolveContentURI(uri: string): string {
    if (uri.startsWith("ipfs://")) {
        const path = uri.slice("ipfs://".length);
        return `${IPFS_GATEWAY_URL}/ipfs/${path}`;
    }
    if (uri.startsWith("http://") || uri.startsWith("https://")) {
        return uri;
    }
    // Bare CID fallback
    if (/^Qm[1-9A-HJ-NP-Za-km-z]{44}/.test(uri) || /^bafy/.test(uri)) {
        return `${IPFS_GATEWAY_URL}/ipfs/${uri}`;
    }
    // RA-2: Reject unrecognised schemes (javascript:, data:, blob:, etc.)
    return "";
}

// ── Fetch + parse ─────────────────────────────────────────────────────────────

const cache = new Map<string, ResolvedSellerBranding>();

export function resolveSellerBrandingDocument(input: {
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
        cssURI: typeof assets.cssURI === "string" ? assets.cssURI : undefined,
        imageBaseURI: typeof assets.imageBaseURI === "string" ? assets.imageBaseURI : undefined,
    };

    return {
        branding: b,
        assets: a,
        logoURL: b.logoURI ? resolveContentURI(b.logoURI) : undefined,
        heroImageURL: b.heroImageURI ? resolveContentURI(b.heroImageURI) : undefined,
        cssURL: a.cssURI ? resolveContentURI(a.cssURI) : undefined,
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
        || metadata.assets?.cssURI
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
export async function fetchSellerBranding(
    metadataURI: string
): Promise<ResolvedSellerBranding | null> {
    if (!metadataURI) return null;

    const cached = cache.get(metadataURI);
    if (cached) return cached;

    try {
        const url = resolveContentURI(metadataURI);
        const res = await fetch(url);
        const doc = await safeJsonFromResponse(res);
        if (!doc || typeof doc !== "object" || Array.isArray(doc)) return null;

        const record = doc as Record<string, unknown>;
        const resolved = resolveSellerBrandingDocument({
            name: typeof record.name === "string" ? record.name : undefined,
            branding: (record.branding ?? null) as Partial<SellerBrandingMetadata> | null,
            assets: (record.assets ?? null) as Partial<SellerAssets> | null,
        });
        cache.set(metadataURI, resolved);
        return resolved;
    } catch {
        return null;
    }
}

/**
 * Clear the branding cache (useful for tests).
 */
export function clearBrandingCache(): void {
    cache.clear();
}
