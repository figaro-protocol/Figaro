import type { AcceptedTokenMetadata } from "@/lib/shared/sellerCatalogueMetadata";
import type { SellerProfileMetadata } from "@/lib/shared/sellerProfileMetadata";
import { hexEqual } from "@/lib/shared/evm";

/**
 * Generic seller-listing surface for `/discover`.
 *
 * Independent of the local-commerce-shaped `SellerCatalogue` type:
 * a `Listing` is the projection of (subject + bindings + optional metadata)
 * into a shape the `SellerCard` can render across any assembly. An
 * seller with zero bindings still produces a `Listing`; clicking any
 * listing routes to its `/s/<address>` detail page. An seller with
 * multiple bindings carries them all
 * so the card can display assembly badges and the click-through can pick
 * the primary.
 */
export type FulfillmentMode =
    | "consume-onsite"
    | "pickup"
    | "virtual"
    | "deliver:buyer-assigned"
    | "deliver:seller-assigned"
    | "deliver:dutch-auction";

export interface ListingBinding {
    /** Slug of the assembly this binding targets (e.g. "local-commerce"). */
    assemblySlug: string;
}

export interface ListingServiceArea {
    geohashPrefix: string;
    label?: string;
}

export interface Listing {
    /**
     * Source of this listing. Only `registry` is produced at runtime now —
     * the fixture path was removed when reference data stopped shadowing
     * real on-chain registrations. The discriminator stays on the type
     * for transcript/log compatibility and possible future provenance
     * tagging (e.g. "did-web" identities).
     */
    provenance: "registry";
    /** Seller wallet address. */
    address: string;
    /** Display name. */
    name: string;
    /** Free-form one-line description. May be empty. */
    description: string;
    /** Per-listing specialty (cuisine for local-commerce-food, equipment-class for rental, etc.). */
    specialty?: string;
    /** Seller logo URI (ipfs:// or https://). */
    logoURI?: string;
    /** Accent color for branding. */
    accentColor?: string;
    /** Seller's home geohash. */
    geohash?: string;
    /** Human-readable location text (e.g. "Lower Manhattan, NY"). */
    addressText?: string;
    /** Service-area geohash prefixes (seller may serve a wider area than its home). */
    serviceAreas: ListingServiceArea[];
    /** Fulfillment modes offered. May be empty for purely-remote work (review, freelance). */
    fulfillmentModes: FulfillmentMode[];
    /** Tokens the seller accepts for settlement. */
    acceptedTokens: AcceptedTokenMetadata[];
    /** All assembly bindings this seller has. May be empty (kernel-direct), one (single assembly), or many. */
    bindings: ListingBinding[];
}

const SAFE_URI_RE = /^(https?:\/\/|ipfs:\/\/|\/ipfs\/)/i;
function safeURI(uri: string | undefined): string | undefined {
    if (!uri) return undefined;
    return SAFE_URI_RE.test(uri) ? uri : undefined;
}

/**
 * Project an on-chain-registered seller's profile into a `Listing` with
 * `provenance: "registry"`.
 *
 * `assemblyBindings` from the profile JSON drives the `bindings` field —
 * the wizard writes these from `OnboardingState.assemblies`, so a
 * freshly-registered seller appears in the assembly-filter chips. Role
 * attribution within an assembly is event-derived, not declared on the
 * profile (see `feedback_state_from_events`).
 */
export function profileToListing(
    profile: SellerProfileMetadata,
    address: string,
): Listing {
    const bindings: ListingBinding[] = (profile.assemblyBindings ?? []).map((b) => ({
        assemblySlug: b.assemblySlug,
    }));

    return {
        provenance: "registry",
        address,
        name: profile.name,
        description: profile.description ?? "",
        specialty: profile.specialty,
        logoURI: safeURI(profile.branding?.logoURI),
        accentColor: profile.branding?.accentColor,
        geohash: profile.location?.geohash,
        addressText: profile.location?.addressText,
        serviceAreas: [],
        fulfillmentModes: [],
        acceptedTokens: profile.acceptedTokens ?? [],
        bindings,
    };
}


import { truncateHex } from "@/lib/shared/formatHex";

/** Find an seller listing by wallet address. Case-insensitive. */
export function findListingByAddress(
    listings: ReadonlyArray<Listing>,
    address: string,
): Listing | undefined {
    if (!address) return undefined;
    return listings.find((l) => hexEqual(l.address, address));
}

/** Resolve an address to a human-readable display name using the loaded
 *  registry listings, falling back to the truncated address when the
 *  wallet isn't registered (or the listings haven't loaded yet). Used by
 *  every counterparty-name surface (inbox, orders list, order timeline). */
export function displayNameForAddress(
    listings: ReadonlyArray<Listing>,
    address: string,
): string {
    if (!address || !address.startsWith("0x")) return address ?? "";
    const found = findListingByAddress(listings, address);
    return found?.name ?? truncateHex(address);
}

/**
 * Geohash prefix-overlap check for filtering listings against a viewer's
 * device geohash. An seller matches if any of its serviceArea prefixes is
 * a prefix of the viewer's geohash, or vice versa. Falls back to
 * seller's own geohash if it has no serviceAreas.
 */
export function listingMatchesGeohash(listing: Listing, viewerGeohash: string): boolean {
    if (!viewerGeohash) return true;
    const hashes = listing.serviceAreas.length > 0
        ? listing.serviceAreas.map((a) => a.geohashPrefix)
        : listing.geohash
            ? [listing.geohash]
            : [];
    if (hashes.length === 0) return true; // seller has no geo declaration → always include (e.g. remote)
    return hashes.some((h) => h.startsWith(viewerGeohash) || viewerGeohash.startsWith(h));
}

/**
 * The destination URL for a listing card click: the per-seller detail
 * page. The /s page reads the seller's catalogue and bindings; assembly
 * disambiguation happens inside that page. An seller with no bindings
 * still has a /m page — it surfaces the catalogue without a fulfilment path.
 */
export function listingClickThroughHref(listing: Listing): string {
    return `/s/${listing.address}`;
}
