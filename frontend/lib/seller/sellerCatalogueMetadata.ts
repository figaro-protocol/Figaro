/**
 * Seller's preferred unit system for the catalogue editor + display.
 * Storage of `massGrams` / `volumeMl` is ALWAYS metric — `unitSystem`
 * only governs how the editor accepts input and how the display
 * formats the stored metric values back to the seller's locale.
 */
export type UnitSystem = "metric" | "imperial";

export interface CatalogueItemMetadata {
    id: string;
    name: string;
    description?: string;
    price: string;
    /** Free-form seller-authored grouping. Optional — absent when the seller
     *  didn't author one; never coerced to a coined "General". */
    category?: string;
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
    /**
     * How `price` is read. Absent or "fixed": `price` is the item's price
     * (today's behavior). "rate": `price` is a RATE per `rateUnit`, and the
     * payment is rate × the quantity resolved at checkout from
     * `rateQuantitySource` — billed per STARTED unit (quantity = ceil of the
     * resolved units, min 1), so the committed line item alone replays the
     * payment (quantity × unitPrice) with no reference back to this mutable
     * catalogue.
     */
    pricingPolicy?: "fixed" | "rate";
    /**
     * Editorial unit label for a rate item — "km", "hour", "GB", … Free
     * text like `category`, never a closed set; display-only.
     */
    rateUnit?: string;
    /**
     * Where a rate item's quantity comes from at checkout — a key into the
     * rate-quantity resolver registry (an OPEN axis, same discipline as the
     * field `format` registry): "checkout-quantity" (the buyer enters the
     * units) or "order-geodistance" (derived from the order's committed
     * geolocation endpoints). New sources register without touching checkout.
     */
    rateQuantitySource?: string;
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
    items: CatalogueItemMetadata[];
    version: string;
    /**
     * Seller's preferred unit system for editor + display. Storage of
     * mass/volume on `CatalogueItemMetadata` is always metric; this
     * field is a UI preference only. Defaults to "metric" when unset.
     */
    unitSystem?: UnitSystem;
}


