/**
 * fulfilmentRouting — helpers that map a CanonicalFulfilmentMethod to:
 *   - The default handoff point that goes into the agreement manifest
 *     (figaro-fulfilment-v2 handoffPoint enum).
 *   - The assembly slug whose runtime/UI shape matches the chosen
 *     fulfilment topology (1-node `direct-sale` for consume-onsite/pickup;
 *     2+ node `local-commerce` for delivery variants).
 *
 * Centralizing these mappings here keeps the cart from re-encoding the
 * relationship in ad-hoc ternaries (the prior `delivery → "deliver:dutch-auction"`
 * + `pickup → "pickup"` ladder).
 */

import type { CanonicalFulfilmentMethod } from "@/lib/core/orderAgreement";

const FULFILMENT_TO_HANDOFF: Record<CanonicalFulfilmentMethod, string> = {
    "consume-onsite": "face-to-face",
    "pickup": "face-to-face",
    "virtual": "face-to-face",
    "deliver:buyer-assigned": "face-to-face",
    "deliver:seller-assigned": "face-to-face",
    "deliver:dutch-auction": "face-to-face",
};

export function mapFulfilmentToHandoff(method: CanonicalFulfilmentMethod): string {
    return FULFILMENT_TO_HANDOFF[method];
}

/**
 * Maps a fulfilment method to the assembly whose topology and module
 * surface match that method. `consume-onsite` and `pickup` are 1-node
 * graphs (no sub-order, no courier) → `direct-sale`. The three
 * `deliver:*` variants imply a courier sub-order → `local-commerce`.
 *
 * Returning a string-literal union keeps callers honest if a new
 * topology assembly is added later.
 */
export function mapFulfilmentToAssemblySlug(
    method: CanonicalFulfilmentMethod,
): "direct-sale" | "local-commerce" {
    if (method === "consume-onsite" || method === "pickup" || method === "virtual") return "direct-sale";
    return "local-commerce";
}

/** True for the 3 `deliver:*` variants. False for `consume-onsite` and `pickup`. */
export function isDeliveryFulfilment(method: CanonicalFulfilmentMethod): boolean {
    return method.startsWith("deliver:");
}

/** Human-readable labels for picker UIs. */
export const FULFILMENT_MODE_LABELS: Record<CanonicalFulfilmentMethod, string> = {
    "consume-onsite": "Consume on-site",
    "pickup": "Pickup",
    "virtual": "Virtual",
    "deliver:buyer-assigned": "Delivery (buyer chooses courier)",
    "deliver:seller-assigned": "Delivery (merchant arranges)",
    "deliver:dutch-auction": "Delivery (Dutch-auction courier)",
};
