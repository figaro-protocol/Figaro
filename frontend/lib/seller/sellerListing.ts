import type { AcceptedTokenMetadata } from "@/lib/seller/acceptedTokenMetadata";
import type { SellerProfileMetadata } from "@/lib/seller/sellerProfileMetadata";
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
interface ListingBinding {
    /** Slug of the assembly this binding targets (e.g. "local-commerce-seller-assigned"). */
    assemblySlug: string;
}

export interface Listing {
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
    /** Seller's home geohash. */
    geohash?: string;
    /** Human-readable location text (e.g. "Lower Manhattan, NY"). */
    addressText?: string;
    /** Tokens the seller accepts for settlement. */
    acceptedTokens: AcceptedTokenMetadata[];
    /** All assembly bindings this seller has. May be empty (browse-only —
     *  checkout enables only for a bound profile), one, or many. */
    bindings: ListingBinding[];
}

const SAFE_URI_RE = /^(https?:\/\/|ipfs:\/\/|\/ipfs\/)/i;
function safeURI(uri: string | undefined): string | undefined {
    if (!uri) return undefined;
    return SAFE_URI_RE.test(uri) ? uri : undefined;
}

/**
 * Project an on-chain-registered seller's profile into a `Listing`.
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
        address,
        name: profile.name,
        description: profile.description ?? "",
        specialty: profile.specialty,
        logoURI: safeURI(profile.branding?.logoURI),
        geohash: profile.location?.geohash,
        addressText: profile.location?.addressText,
        acceptedTokens: profile.acceptedTokens ?? [],
        bindings,
    };
}


import { truncateHex } from "@/lib/shared/formatHex";

/** Find a seller listing by wallet address. Case-insensitive. Accepts any
 *  {address}-keyed collection (Listing[], SellerCatalogue[], …). */
export function findListingByAddress<T extends { address: string }>(
    listings: ReadonlyArray<T>,
    address: string,
): T | undefined {
    if (!address) return undefined;
    return listings.find((l) => hexEqual(l.address, address));
}

/** Resolve an address to a human-readable display name from any loaded
 *  {address, name} collection (registry listings, seller catalogues),
 *  falling back to the truncated address when the wallet isn't in it (or
 *  it hasn't loaded yet). The ONE counterparty-name resolver — orders
 *  list, order timeline, checkout breakdown. */
export function displayNameForAddress(
    listings: ReadonlyArray<{ address: string; name: string }>,
    address: string,
): string {
    if (!address || !address.startsWith("0x")) return address ?? "";
    const found = findListingByAddress(listings, address);
    return found?.name ?? truncateHex(address);
}

/**
 * Geohash prefix-overlap check for filtering listings against a viewer's
 * device geohash: the seller's declared geohash and the viewer's overlap
 * when either is a prefix of the other. A seller with no geo declaration
 * always matches (e.g. remote/virtual).
 */
export function listingMatchesGeohash(listing: Listing, viewerGeohash: string): boolean {
    if (!viewerGeohash || !listing.geohash) return true;
    return listing.geohash.startsWith(viewerGeohash) || viewerGeohash.startsWith(listing.geohash);
}

/**
 * The destination URL for a listing card click: the per-seller detail
 * page. The /s page reads the seller's catalogue and bindings; assembly
 * disambiguation happens inside that page. An seller with no bindings
 * still has a /m page — it surfaces the catalogue without a modality path.
 */
export function listingClickThroughHref(listing: Listing): string {
    return `/s/${listing.address}`;
}
