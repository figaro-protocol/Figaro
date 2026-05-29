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
 * normalisation here keeps callers — `agreement module`, test helpers,
 * future clause bridges — from each re-implementing the catalogue
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
 * Seller's preferred unit system for the catalogue editor + display.
 * Storage of `massGrams` / `volumeMl` is ALWAYS metric — `unitSystem`
 * only governs how the editor accepts input and how the display
 * formats the stored metric values back to the seller's locale.
 */
export type UnitSystem = "metric" | "imperial";

/**
 * Pricing policy for a catalogue item's public (un-negotiated) price.
 *  - "fixed"         — `price` is the price.
 *  - "buyer-set"     — the buyer names the price at checkout.
 *  - "dutch-auction" — price discovered via a descending auction.
 * Absent on an item → treated as "fixed".
 */
export type CataloguePricingPolicy = "fixed" | "buyer-set" | "dutch-auction";

/**
 * A negotiated price for a specific counterparty — one row of a
 * per-client rate card. `counterparty` is the address the price was
 * agreed with (e.g. a delivery seller's rate per counterparty served).
 */
export interface NegotiatedPriceEntry {
    counterparty: `0x${string}`;
    price: string;
}

export interface CatalogueItemMetadata {
    id: string;
    name: string;
    description?: string;
    price: string;
    /** Pricing policy for the public `price`. Absent → "fixed". */
    pricingPolicy?: CataloguePricingPolicy;
    /**
     * Per-counterparty negotiated prices — a rate card keyed by the
     * address each price was agreed with. A matching entry overrides
     * `price` + `pricingPolicy` with the settled figure. These live in
     * the public catalogue, so the entries are publicly visible —
     * consistent with the public-graph model.
     */
    negotiatedPrices?: NegotiatedPriceEntry[];
    category: string;
    image?: string;
    available: boolean;
    /**
     * Optional assembly this product is realised through. When set, selecting
     * this item drives the checkout to compose the named multi-party assembly
     * (e.g. a kit assembled by several sellers) rather than resolving an
     * assembly by fulfilment modality. Product-driven selection: the buyer
     * picks the product; the product names the process it composes.
     */
    assemblySlug?: string;
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
     * Clause-specific attestations attached to this item.
     * Keyed by clauseKey (must match a key in the seller's supportedClauses).
     * When the buyer selects this item, these attestations become part of
     * the corresponding AgreementSection and are hashed into agreementHash.
     *
     * Example — allergen attestation:
     *   { "figaro-allergen-v1": { "allergenFree": ["peanuts", "gluten"] } }
     *
     * Example — organic certification:
     *   { "figaro-certification-v1": { "certifier": "USDA", "type": "organic" } }
     */
    clauseAttestations?: Record<string, Record<string, unknown>>;
}

/** The effective price + policy resolved for a catalogue item. */
export interface ResolvedCataloguePrice {
    price: string;
    /** A negotiated entry resolves as "fixed" — a negotiated price is an
     *  already-settled figure. */
    policy: CataloguePricingPolicy;
}

/**
 * Resolve a catalogue item's effective price + policy, optionally for a
 * specific counterparty. A `negotiatedPrices` entry matching
 * `counterparty` wins; otherwise the item's public `price` +
 * `pricingPolicy` apply.
 *
 * General over every seller's catalogue — a goods row and a delivery row
 * resolve through this one function. There is no delivery-specific pricing
 * path. The parameter is structural so both the
 * on-disk `CatalogueItemMetadata` and the buyer-side `CatalogueItem`
 * projection satisfy it.
 */
export function resolveCatalogueItemPrice(
    item: Pick<CatalogueItemMetadata, "price" | "pricingPolicy" | "negotiatedPrices">,
    counterparty?: string,
): ResolvedCataloguePrice {
    if (counterparty) {
        const negotiated = item.negotiatedPrices?.find(
            (entry) => entry.counterparty.toLowerCase() === counterparty.toLowerCase(),
        );
        if (negotiated) return { price: negotiated.price, policy: "fixed" };
    }
    return { price: item.price, policy: item.pricingPolicy ?? "fixed" };
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
 * A clause the seller declares support for. This is the seller's composability
 * surface — each entry binds the seller to a registered clause from ClauseRegistry.
 *
 * Examples:
 *   - "figaro-merchant-process-v1" → merchant attests their internal order-fulfilment events
 *   - "figaro-courier-process-v1" → courier attests their internal transport events
 *   - "figaro-ghg-iso-14064-v1" → seller reports GHG emissions per ISO 14064
 *   - "figaro-proximity-policy-v1" → seller commits a required proximity band at agreement time
 *     (paired runtime sister: "figaro-proximity-proof-v1" carrying band+nonce+sig per handoff)
 *   - "figaro-commerce-v1" → seller uses the commerce attestation clause
 *
 * This replaces V3's TemplateRegistry: instead of matching protocol-defined
 * templates, each seller composes their own capability set by declaring which
 * clauses they operate under. The buyer reads this to know what to expect.
 */
export interface SupportedClauseDeclaration {
    /** Clause key — must match a registered clause in ClauseRegistry.
     *  e.g. "figaro-ghg-iso-14064-v1" */
    clauseKey: string;
    /** Optional seller-specific configuration for this clause.
     *  e.g. for GHG: { methodology: "iso-14064-1", scopes: [1, 2, 3] } */
    config?: Record<string, unknown>;
}

/**
 * The catalogue document — a wallet's list of items for sale.
 *
 * Identity, location, branding, accepted tokens, agent endpoints,
 * assembly bindings, and operational config all live on the seller
 * profile (`SellerProfileMetadata`); the catalogue carries only the
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
     * Seller's preferred unit system for editor + display. Storage of
     * mass/volume on `CatalogueItemMetadata` is always metric; this
     * field is a UI preference only. Defaults to "metric" when unset.
     */
    unitSystem?: UnitSystem;
}


