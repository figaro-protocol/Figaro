import type { AcceptedTokenMetadata } from "@/lib/shared/sellerCatalogueMetadata";
import type { OperatorProfileMetadata } from "@/lib/shared/operatorProfileMetadata";

/**
 * Generic operator-listing surface for `/discover`.
 *
 * Independent of the local-commerce-shaped `SellerCatalogue` type:
 * a `Listing` is the projection of (subject + bindings + optional metadata)
 * into a shape the `OperatorCard` can render across any assembly. An
 * operator with zero bindings still produces a `Listing`; clicking such a
 * listing routes to `/terminal?seller=<address>` rather than to an
 * assembly runtime. An operator with multiple bindings carries them all
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
    /** Role this operator holds inside the assembly (e.g. "merchant-operator", "supplier", "reviewer"). */
    roleKind: string;
    /** Assembly-level role kinds (e.g. ["merchant"]) — what the runtime renders this operator as. */
    assemblyRoleKinds: string[];
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
    /** Operator wallet address. */
    address: string;
    /** Display name. */
    name: string;
    /** Free-form one-line description. May be empty. */
    description: string;
    /** Per-listing specialty (cuisine for local-commerce-food, equipment-class for rental, etc.). */
    specialty?: string;
    /** Operator logo URI (ipfs:// or https://). */
    logoURI?: string;
    /** Accent color for branding. */
    accentColor?: string;
    /** Operator's home geohash. */
    geohash?: string;
    /** Human-readable location text (e.g. "Lower Manhattan, NY"). */
    addressText?: string;
    /** Service-area geohash prefixes (operator may serve a wider area than its home). */
    serviceAreas: ListingServiceArea[];
    /** Fulfillment modes offered. May be empty for purely-remote work (review, freelance). */
    fulfillmentModes: FulfillmentMode[];
    /** Tokens the operator accepts for settlement. */
    acceptedTokens: AcceptedTokenMetadata[];
    /** All assembly bindings this operator has. May be empty (kernel-direct), one (single assembly), or many. */
    bindings: ListingBinding[];
}

const SAFE_URI_RE = /^(https?:\/\/|ipfs:\/\/|\/ipfs\/)/i;
function safeURI(uri: string | undefined): string | undefined {
    if (!uri) return undefined;
    return SAFE_URI_RE.test(uri) ? uri : undefined;
}

/**
 * Project an on-chain-registered operator's profile into a `Listing` with
 * `provenance: "registry"`. The discover surface no longer blends fixture
 * listings — only registered operators surface.
 *
 * `assemblyBindings` from the profile JSON drives the `bindings` field —
 * the wizard writes these from `OnboardingState.assemblies`, so a
 * freshly-registered seller appears in the assembly-filter chips.
 */
export function profileToListing(
    profile: OperatorProfileMetadata,
    address: string,
): Listing {
    const bindings: ListingBinding[] = [];
    for (const b of profile.assemblyBindings ?? []) {
        if (b.roleBindings.length === 0) {
            // No explicit roles authored — surface the assembly itself
            // so it still flows through the assembly filter chips.
            bindings.push({
                assemblySlug: b.assemblySlug,
                roleKind: "",
                assemblyRoleKinds: [],
            });
        } else {
            for (const rb of b.roleBindings) {
                bindings.push({
                    assemblySlug: b.assemblySlug,
                    roleKind: rb.roleKind,
                    assemblyRoleKinds: rb.assemblyRoleKinds ?? [],
                });
            }
        }
    }

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


/**
 * Geohash prefix-overlap check for filtering listings against a viewer's
 * device geohash. An operator matches if any of its serviceArea prefixes is
 * a prefix of the viewer's geohash, or vice versa. Falls back to
 * operator's own geohash if it has no serviceAreas.
 */
export function listingMatchesGeohash(listing: Listing, viewerGeohash: string): boolean {
    if (!viewerGeohash) return true;
    const hashes = listing.serviceAreas.length > 0
        ? listing.serviceAreas.map((a) => a.geohashPrefix)
        : listing.geohash
            ? [listing.geohash]
            : [];
    if (hashes.length === 0) return true; // operator has no geo declaration → always include (e.g. remote)
    return hashes.some((h) => h.startsWith(viewerGeohash) || viewerGeohash.startsWith(h));
}

/**
 * Given a listing's bindings, pick the destination URL for a card click.
 * - 1+ bindings → `/m/<address>` (per-merchant detail page)
 * - 0 bindings → `/terminal?seller=<address>` (kernel-direct commit fallback)
 *
 * The merchant detail page (Increment 3) replaces the prior shape that
 * routed buyers into a generic assembly runtime keyed by `?operator=`. The
 * /m page itself reads the merchant's catalogue and bindings — assembly
 * disambiguation now happens inside that page when relevant.
 */
export function listingClickThroughHref(listing: Listing): string {
    if (listing.bindings.length === 0) {
        return `/terminal?seller=${listing.address}`;
    }
    return `/m/${listing.address}`;
}
