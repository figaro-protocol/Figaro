import type { AcceptedTokenMetadata } from "@/lib/shared/sellerCatalogueMetadata";
import type { OperatorAgentServices } from "@/lib/shared/operatorProfileMetadata";

export interface CatalogueItem {
    id: string;
    name: string;
    description: string;
    price: string;
    image: string;
    category: string;
    available: boolean;
}

/**
 * Buyer-side projection of an operator's profile + catalogue.
 *
 * Sources:
 *  - profile (`OperatorProfileMetadata`): name, slug, description,
 *    specialty, location (geohash + addressText), branding, accepted
 *    tokens, default token, agent services.
 *  - catalogue (`SellerCatalogueMetadata`): items.
 *
 * Carries no closed-taxonomy fields. Earlier revisions had
 * `cuisine`/`rating`/`deliveryTime`/`minimumOrder` — none of those
 * exist in the underlying schemas; they were rendered from
 * hardcoded defaults and have been removed. `specialty` is the
 * free-form open-string self-description the operator authors
 * themselves.
 */
export interface SellerCatalogue {
    id: string;
    name: string;
    address: string;
    description: string;
    /** Free-form self-description (e.g. "Italian", "Mobile espresso", etc.). Authored by the operator; no closed taxonomy. */
    specialty: string;
    image: string;
    geohash?: string;
    /** Free-form public street address (optional). */
    addressText?: string;
    menu: CatalogueItem[];
    /** Tokens the merchant accepts at settlement. */
    acceptedTokens?: AcceptedTokenMetadata[];
    /** The token catalogue prices are denominated in (one of `acceptedTokens`). */
    defaultTokenAddress?: `0x${string}`;
    /** ERC-8004-compatible service endpoints (optional, for agent-driven operators). */
    agentServices?: OperatorAgentServices;
    fulfillmentModes?: Array<
        | "consume-onsite"
        | "pickup"
        | "delivery"
        | "deliver:buyer-assigned"
        | "deliver:seller-assigned"
        | "deliver:dutch-auction"
    >;
}

export interface CartItem {
    menuItemId: string;
    sellerId: string;
    sellerAddress: string;
    sellerName: string;
    name: string;
    price: string;
    quantity: number;
    imageURI?: string;
}
