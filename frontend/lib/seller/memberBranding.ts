/**
 * lib/shared/memberBranding.ts
 *
 * Member branding metadata fetcher.
 * Resolves IPFS/HTTP URIs from MembersRegistry.metadataURI, fetches the
 * member profile document, and extracts branding + asset fields.
 *
 * The metadata document the on-chain `metadataURI` points to is an
 * `MemberProfileMetadata` record; only its branding-relevant subset
 * (name, branding, assets) is extracted here. The profile pins the
 * branding payload (logo, hero, image base URI) so buyer
 * frontends can render the member's identity.
 */

import type { MemberBrandingMetadata } from "@/lib/seller/memberBrandingMetadata";
import type { MemberProfileMetadata } from "@/lib/seller/memberProfileMetadata";
import { createUriFetcher } from "@/lib/seller/uriFetcher";

// ── Types ─────────────────────────────────────────────────────────────────────

interface MemberAssets {
    imageBaseURI?: string;
}

export interface ResolvedMemberBranding {
    branding: MemberBrandingMetadata;
    assets: MemberAssets;
    /** Raw logo LOCATOR (e.g. `ipfs://…`) — the render layer resolves it once
     *  through `resolveImageUri` (ipfs→gateway, rejects raw http as an
     *  anti-tracking gate). NOT pre-resolved here: pre-resolving to a gateway
     *  http URL made the render gate reject legitimate ipfs logos. */
    logoURI?: string;
    /** Raw member name (top-level). */
    name?: string;
}

// ── Fetch + parse ─────────────────────────────────────────────────────────────

function resolveMemberBrandingDocument(input: {
    name?: string;
    branding?: Partial<MemberBrandingMetadata> | null;
    assets?: Partial<MemberAssets> | null;
}): ResolvedMemberBranding {
    const branding = input.branding ?? {};
    const assets = input.assets ?? {};

    const b: MemberBrandingMetadata = {
        logoURI: typeof branding.logoURI === "string" ? branding.logoURI : undefined,
    };

    const a: MemberAssets = {
        imageBaseURI: typeof assets.imageBaseURI === "string" ? assets.imageBaseURI : undefined,
    };

    return {
        branding: b,
        assets: a,
        logoURI: typeof b.logoURI === "string" ? b.logoURI : undefined,
        name: typeof input.name === "string" ? input.name : undefined,
    };
}

export function resolveMemberBrandingFromMemberProfile(
    metadata: Pick<MemberProfileMetadata, "name" | "branding" | "assets"> | null | undefined,
): ResolvedMemberBranding | null {
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

    return resolveMemberBrandingDocument({
        name: metadata.name,
        branding: metadata.branding,
        assets: metadata.assets,
    });
}

/**
 * Fetch member metadata from a content URI and extract branding fields.
 * Results are cached in-memory by URI.
 *
 * @returns Resolved branding, or null if the URI is empty or fetch fails.
 */
const brandingFetcher = createUriFetcher<ResolvedMemberBranding>({
    parse: (doc) => {
        if (!doc || typeof doc !== "object" || Array.isArray(doc)) return null;
        const record = doc as Record<string, unknown>;
        return resolveMemberBrandingDocument({
            name: typeof record.name === "string" ? record.name : undefined,
            branding: (record.branding ?? null) as Partial<MemberBrandingMetadata> | null,
            assets: (record.assets ?? null) as Partial<MemberAssets> | null,
        });
    },
});

export function fetchMemberBranding(metadataURI: string): Promise<ResolvedMemberBranding | null> {
    return brandingFetcher.fetch(metadataURI);
}

/** Clear the branding cache (useful for tests). */
export function clearBrandingCache(): void {
    brandingFetcher.clear();
}
