/**
 * Shipping/handling class — feeds the figaro-geo-v2 `classOfService` field
 * at commit time. String literals are the canonical storage shape; the
 * geo validator's uint8 encoding (1=standard, 2=express, 3=fragile,
 * 4=cold-chain) is a manifest-encoder concern, not a storage concern.
 */
export type CatalogueClassOfService =
    | "standard"
    | "express"
    | "fragile"
    | "cold-chain";

/** Higher number = higher handling priority when a multi-item shipment
 *  must collapse to a single class-of-service annotation. */
export const CLASS_PRIORITY: Record<CatalogueClassOfService, number> = {
    "standard": 1,
    "express": 2,
    "fragile": 3,
    "cold-chain": 4,
};

/** Single-character codes consumed by the geo-content encoder
 *  (figaro-geo-v2 `classOfService` field). */
export const CLASS_TO_SHORT_CODE: Record<CatalogueClassOfService, "S" | "E" | "F" | "C"> = {
    "standard": "S",
    "express": "E",
    "fragile": "F",
    "cold-chain": "C",
};

/**
 * Normalize a `classOfService` input to the SDK encoder's short-code form.
 * The figaro-geo-v2 encoder requires single-letter codes ("S"/"E"/"F"/"C")
 * because the on-chain ABI encodes the field as `uint8`. The catalogue
 * layer (and a number of upstream surfaces) stores the long form
 * ("standard"/"express"/"fragile"/"cold-chain"); this helper accepts
 * either and throws a typed error on anything else. Centralising the
 * normalisation here keeps callers — `agreementManifest`, test helpers,
 * future schema bridges — from each re-implementing the catalogue
 * convention, and replaces the previous failure mode (a cryptic
 * `numberToHex(undefined)` from viem) with a clear message.
 */
export function classOfServiceToShortCode(input: unknown): "S" | "E" | "F" | "C" {
    if (typeof input !== "string") {
        throw new TypeError(
            `classOfService: expected string, got ${typeof input}`,
        );
    }
    const trimmed = input.trim();
    if (trimmed === "S" || trimmed === "E" || trimmed === "F" || trimmed === "C") {
        return trimmed;
    }
    const lower = trimmed.toLowerCase();
    if (lower in CLASS_TO_SHORT_CODE) {
        return CLASS_TO_SHORT_CODE[lower as CatalogueClassOfService];
    }
    throw new TypeError(
        `classOfService: expected one of "S"/"E"/"F"/"C" or "standard"/"express"/"fragile"/"cold-chain", got ${JSON.stringify(input)}`,
    );
}

/**
 * Operator's preferred unit system for the catalogue editor + display.
 * Storage of `massGrams` / `volumeMl` is ALWAYS metric — `unitSystem`
 * only governs how the editor accepts input and how the display
 * formats the stored metric values back to the operator's locale.
 */
export type UnitSystem = "metric" | "imperial";

export interface CatalogueItemMetadata {
    id: string;
    name: string;
    description?: string;
    price: string;
    category: string;
    image?: string;
    available: boolean;
    /**
     * Item mass in grams. Storage canonical: always metric. The editor
     * accepts oz/lbs input when the catalogue's `unitSystem` is
     * "imperial" and converts to grams before persisting. Optional —
     * items that aren't physical (virtual services) or aren't yet
     * annotated can omit it.
     */
    massGrams?: number;
    /** Item volume in millilitres. Same convention as `massGrams`. */
    volumeMl?: number;
    /** Shipping/handling class. Default at commit time: "standard". */
    classOfService?: CatalogueClassOfService;
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
    /**
     * Operator's preferred unit system for editor + display. Storage of
     * mass/volume on `CatalogueItemMetadata` is always metric; this
     * field is a UI preference only. Defaults to "metric" when unset.
     */
    unitSystem?: UnitSystem;
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

