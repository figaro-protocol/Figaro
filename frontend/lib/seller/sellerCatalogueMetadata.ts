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
    /** Item volume in millilitres. Same convention as `massGrams`. Kept for
     *  non-parcel items (a drink, a bulk liquid) that have a volume but no
     *  shippable box; for a parcel with L/W/D below, volume is derivable
     *  (`lengthMm × widthMm × heightMm`) and need not be authored. */
    volumeMl?: number;
    /**
     * Parcel dimensions in whole millimetres. Storage canonical: always metric
     * (same convention as `massGrams`/`volumeMl`; the editor converts imperial
     * input). **Parcel-only** — a shippable box carries all three; a service or
     * a non-parcel item omits them. The individual dimensions are load-bearing:
     * dimensional weight rounds each dimension before multiplying and oversize
     * rules read the longest side, neither of which a single `volumeMl` can
     * reproduce. Consumed by `figaro-dimweight` / `figaro-cargo` at checkout.
     */
    lengthMm?: number;
    widthMm?: number;
    heightMm?: number;
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
    /**
     * Catalogue-sourced clause values — product master data authored per item
     * for clauses that declare `block.catalogueSourced` (freight class, hazmat,
     * cold-chain, …). Keyed by clauseId → the clause's content field values
     * (the same `{clause, data}` shape as an agreement section's `data`).
     * Generic and open-world: no clause is named here; the authoring form and
     * the checkout fold both derive from the registered clause specs, so a new
     * product-property clause participates with zero change to this type.
     * Absent for non-physical / unannotated items. Validated against each
     * clause's registered spec (Layer A) before publish.
     */
    clauseValues?: Record<string, Record<string, unknown>>;
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


