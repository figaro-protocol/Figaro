import type { CatalogueItemMetadata, UnitSystem } from "@/lib/seller/sellerCatalogueMetadata";
import type { AcceptedTokenMetadata } from "@/lib/seller/acceptedTokenMetadata";
import type { SellerAgentServices } from "@/lib/seller/sellerProfileMetadata";

/**
 * Buyer-side projection of an seller's profile + catalogue.
 *
 * Sources:
 *  - profile (`SellerProfileMetadata`): name, slug, description,
 *    specialty, location (geohash + addressText), branding, accepted
 *    tokens, default token, agent services.
 *  - catalogue (`SellerCatalogueMetadata`): items.
 *
 * Carries no closed-taxonomy fields. Earlier revisions had
 * `cuisine`/`rating`/`deliveryTime`/`minimumOrder` — none of those
 * exist in the underlying clauses; they were rendered from
 * hardcoded defaults and have been removed. `specialty` is the
 * free-form open-string self-description the seller authors
 * themselves.
 */
export interface SellerCatalogue {
    name: string;
    address: string;
    description: string;
    /** Free-form self-description (e.g. "Italian", "Mobile espresso", etc.). Authored by the seller; no closed taxonomy. */
    specialty: string;
    /** Seller logo URI (ipfs:// or https://), when the seller declared a
     *  resolvable one. Absent ⇒ the UI renders a neutral placeholder; never a
     *  coined emoji stand-in. */
    image?: string;
    geohash?: string;
    /** Free-form public street address (optional). */
    addressText?: string;
    items: CatalogueItemMetadata[];
    /** Tokens the seller accepts at settlement. */
    acceptedTokens?: AcceptedTokenMetadata[];
    /** The token catalogue prices are denominated in (one of `acceptedTokens`). */
    defaultTokenAddress?: `0x${string}`;
    /** The seller's dimensional-weight divisor (shipping convention), when
     *  declared — the checkout reads it to derive a parcel's billed weight. */
    dimWeightDivisor?: number;
    /** ERC-8004-compatible service endpoints (optional, for agent-driven sellers). */
    agentServices?: SellerAgentServices;
    /** Seller's preferred display unit system for mass / volume. Storage
     *  is always metric; this field only governs UI formatting. */
    unitSystem?: UnitSystem;
}

