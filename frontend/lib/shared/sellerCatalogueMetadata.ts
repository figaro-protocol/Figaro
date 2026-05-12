export interface CatalogueItemMetadata {
    id: string;
    name: string;
    description?: string;
    price: string;
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
 *   - "figaro-merchant-process-v1" → merchant attests their internal order-fulfilment events
 *   - "figaro-courier-process-v1" → courier attests their internal transport events
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

/**
 * The catalogue document — a wallet's list of items for sale.
 *
 * Identity, location, branding, accepted tokens, agent endpoints,
 * assembly bindings, and operational config all live on the operator
 * profile (`OperatorProfileMetadata`); the catalogue carries only the
 * volatile sales-context payload, so an item edit re-pins one small
 * JSON instead of the whole identity envelope.
 *
 * Pricing: the catalogue is denominated in the profile's
 * `defaultTokenAddress`. Frontends convert to whatever accepted token
 * the buyer commits in via Uniswap quote at commit time.
 */
export interface SellerCatalogueMetadata {
    subjectAddress: `0x${string}`;
    menu: CatalogueItemMetadata[];
    version: string;
}

export const SELLER_CATALOGUE_METADATA_EXAMPLE: SellerCatalogueMetadata = {
    subjectAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    menu: [
        {
            id: "pizza1",
            name: "Margherita Pizza",
            description: "Classic tomato, mozzarella, and basil",
            price: "0.01",
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
            category: "Drinks",
            image: "ipfs://example/drink.png",
            available: true,
        },
    ],
    version: "1.0.0",
};

