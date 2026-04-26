export interface SellerHoursWindow {
    open: string;
    close: string;
}

export interface SellerHours {
    timezone: string;
    windows: Partial<Record<
        "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday",
        SellerHoursWindow[]
    >>;
}

export interface CatalogueItemMetadata {
    id: string;
    name: string;
    description?: string;
    price: string;
    currencySymbol?: string;
    category: string;
    image?: string;
    available: boolean;
    /**
     * Schema-specific attestations attached to this item.
     * Keyed by schemaKey (must match a key in the seller's supportedSchemas).
     * When the buyer selects this item, these attestations become part of
     * the corresponding AgreementSection and are hashed into agreementHash.
     *
     * Example — allergen attestation:
     *   { "figaro-allergen-v1": { "allergenFree": ["peanuts", "gluten"] } }
     *
     * Example — organic certification:
     *   { "figaro-certification-v1": { "certifier": "USDA", "type": "organic" } }
     */
    schemaAttestations?: Record<string, Record<string, unknown>>;
}

export interface ServiceAreaMetadata {
    geohashPrefix: string;
    label?: string;
}

export interface SellerBrandingMetadata {
    displayName?: string;
    logoURI?: string;
    heroImageURI?: string;
    accentColor?: string;
    themeClass?: string;
}

/**
 * A token the seller accepts for settlement.
 * Token acceptance IS identity — the set of tokens a seller bonds in
 * defines their coordination surface and value system.
 */
export interface AcceptedTokenMetadata {
    /** ERC-20 contract address. */
    address: `0x${string}`;
    /** Token symbol, e.g. "USDC", "FIG". */
    symbol: string;
    /** Human-readable name. */
    name?: string;
    /** URI (IPFS or HTTP) to the token logo. */
    logoURI?: string;
}

/**
 * A schema the seller declares support for. This is the seller's composability
 * surface — each entry binds the seller to a registered schema from SchemaRegistry.
 *
 * Examples:
 *   - "figaro-delivery-lifecycle-v1" → seller participates in delivery lifecycle attestation
 *   - "figaro-ghg-iso-14064-v1" → seller reports GHG emissions per ISO 14064
 *   - "figaro-proximity-policy-v1" → seller commits a required proximity band at agreement time
 *     (paired runtime sister: "figaro-proximity-proof-v1" carrying band+nonce+sig per handoff)
 *   - "figaro-commerce-v1" → seller uses the commerce attestation schema
 *
 * This replaces V3's TemplateRegistry: instead of matching protocol-defined
 * templates, each seller composes their own capability set by declaring which
 * schemas they operate under. The buyer reads this to know what to expect.
 */
export interface SupportedSchemaDeclaration {
    /** Schema key — must match a registered schema in SchemaRegistry.
     *  e.g. "figaro-ghg-iso-14064-v1" */
    schemaKey: string;
    /** Optional seller-specific configuration for this schema.
     *  e.g. for GHG: { methodology: "iso-14064-1", scopes: [1, 2, 3] } */
    config?: Record<string, unknown>;
}

export interface SellerCatalogueMetadata {
    subjectAddress: `0x${string}`;
    archetypeId: string;
    merchantId: string;
    slug: string;
    name: string;
    description?: string;
    cuisine?: string;
    fulfillmentModes: Array<"pickup" | "delivery">;
    location: {
        geohash: string;
        addressText?: string;
    };
    serviceAreas?: ServiceAreaMetadata[];
    minimumOrder?: string;
    estimatedFulfillment?: string;
    hours?: SellerHours;
    menu: CatalogueItemMetadata[];
    branding?: SellerBrandingMetadata;
    acceptedTokens?: AcceptedTokenMetadata[];
    /**
     * Schemas this seller operates under. Defines their composability surface.
     * Each entry maps to a schema registered in SchemaRegistry.
     * Replaces V3 TemplateRegistry — seller-defined, not protocol-imposed.
     */
    supportedSchemas?: SupportedSchemaDeclaration[];
    assets?: {
        cssURI?: string;
        imageBaseURI?: string;
    };
    version: string;
}

export const SELLER_CATALOGUE_METADATA_EXAMPLE: SellerCatalogueMetadata = {
    subjectAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    archetypeId: "merchant-one-hop-delivery",
    merchantId: "bobs-pizza-palace",
    slug: "bobs-pizza-palace",
    name: "Bob's Pizza Palace",
    description: "Authentic New York style pizza.",
    cuisine: "Italian",
    fulfillmentModes: ["delivery"],
    location: {
        geohash: "dr5reg",
        addressText: "Lower Manhattan, NY",
    },
    serviceAreas: [
        { geohashPrefix: "dr5", label: "Downtown Manhattan" },
    ],
    minimumOrder: "0.01",
    estimatedFulfillment: "30-45 min",
    menu: [
        {
            id: "pizza1",
            name: "Margherita Pizza",
            description: "Classic tomato, mozzarella, and basil",
            price: "0.01",
            currencySymbol: "ETH",
            category: "Pizza",
            image: "ipfs://example/margherita.png",
            available: true,
            schemaAttestations: {
                "figaro-allergen-v1": {
                    allergenFree: ["gluten-free-crust-option"],
                    contains: ["dairy", "gluten"],
                },
            },
        },
        {
            id: "drink1",
            name: "Soft Drink",
            description: "Cola, Sprite, or Fanta",
            price: "0.002",
            currencySymbol: "ETH",
            category: "Drinks",
            image: "ipfs://example/drink.png",
            available: true,
        },
    ],
    branding: {
        displayName: "Bob's Pizza Palace",
        logoURI: "ipfs://example/logo.png",
        heroImageURI: "ipfs://example/hero.png",
        accentColor: "#c2410c",
        themeClass: "merchant-pizza",
    },
    acceptedTokens: [
        { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", name: "USD Coin" },
        { address: "0x0000000000000000000000000000000000000FIG", symbol: "FIG", name: "Figaro" },
    ],
    supportedSchemas: [
        {
            schemaKey: "figaro-delivery-lifecycle-v1",
        },
        {
            schemaKey: "figaro-ghg-iso-14064-v1",
            config: {
                methodology: "iso-14064-1",
                scopes: [1, 2, 3],
            },
        },
        {
            schemaKey: "figaro-proximity-policy-v1",
        },
        {
            schemaKey: "figaro-proximity-proof-v1",
        },
    ],
    assets: {
        cssURI: "ipfs://example/theme.css",
        imageBaseURI: "ipfs://example/assets/",
    },
    version: "1.0.0",
};

// ── Schema resolution utilities ─────────────────────────────────────────────

/**
 * Check whether a seller's metadata declares support for a given schema key.
 * Use this to gate rendering of schema-specific modules (e.g. GHG panels only
 * appear if the seller supports "figaro-ghg-iso-14064-v1").
 */
export function sellerSupportsSchema(
    metadata: SellerCatalogueMetadata | null | undefined,
    schemaKey: string,
): boolean {
    return metadata?.supportedSchemas?.some((s) => s.schemaKey === schemaKey) ?? false;
}

/**
 * Retrieve the seller-specific config for a given schema, or undefined.
 * e.g. sellerSchemaConfig(meta, "figaro-ghg-iso-14064-v1")?.methodology
 */
export function sellerSchemaConfig(
    metadata: SellerCatalogueMetadata | null | undefined,
    schemaKey: string,
): Record<string, unknown> | undefined {
    return metadata?.supportedSchemas?.find((s) => s.schemaKey === schemaKey)?.config;
}