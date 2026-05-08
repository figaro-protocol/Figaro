/**
 * lib/shared/assemblyLabels.ts
 *
 * Single source of truth for the slug → human-label translation tables
 * used across the Discover page (`OperatorDiscovery`, `OperatorCard`)
 * and any future surface that surfaces protocol-tier slugs to readers.
 *
 * Two axes:
 *  - `ASSEMBLY_LABELS` — assembly-slug → label (e.g. "local-commerce" →
 *    "Local Commerce"). Drives the top-level assembly filter row and
 *    the assembly pills on each card.
 *  - `FULFILLMENT_LABELS` — fulfilment-mode → label (e.g.
 *    "deliver:dutch-auction" → "Delivery (auction)"). Drives the
 *    fulfilment filter row and the fulfilment pills on each card.
 *
 * Adding a new assembly: extend `ASSEMBLY_LABELS` here. The Discover
 * surface picks it up automatically — no second edit.
 */

const ASSEMBLY_LABELS: Record<string, string> = {
    "local-commerce": "Local Commerce",
    "direct-sale": "Direct Sale",
    "figaro-procurement": "Procurement",
    "figaro-disclosure-review": "Disclosure Review",
    "figaro-equipment-rental": "Equipment Rental",
    "figaro-freelance": "Freelance",
};

const FULFILLMENT_LABELS: Record<string, string> = {
    "consume-onsite": "On-site",
    "pickup": "Pickup",
    "delivery": "Delivery",
    "deliver:buyer-assigned": "Delivery (buyer-arranged)",
    "deliver:seller-assigned": "Delivery (seller-arranged)",
    "deliver:dutch-auction": "Delivery (auction)",
};

export function assemblyLabel(slug: string): string {
    return ASSEMBLY_LABELS[slug] ?? slug;
}

export function fulfilmentLabel(mode: string): string {
    return FULFILLMENT_LABELS[mode] ?? mode;
}
