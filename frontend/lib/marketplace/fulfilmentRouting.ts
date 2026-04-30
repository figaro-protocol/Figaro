/**
 * fulfilmentRouting — helpers that map a CanonicalFulfilmentMethod to:
 *   - The default handoff mode that goes into the agreement manifest
 *     (figaro-handoff-v1 enum).
 *   - The assembly slug whose runtime/UI shape matches the chosen
 *     fulfilment topology (1-node `direct-sale` for consume-onsite/pickup;
 *     2+ node `local-commerce` for delivery variants).
 *
 * Centralizing these mappings here keeps the cart from re-encoding the
 * relationship in ad-hoc ternaries (the prior `delivery → "deliver:dutch-auction"`
 * + `pickup → "pickup"` ladder).
 */

import type { CanonicalFulfilmentMethod } from "@/lib/core/orderAgreement";

export const FULFILMENT_TO_HANDOFF: Record<CanonicalFulfilmentMethod, string> = {
    "consume-onsite": "face-to-face",
    "pickup": "face-to-face",
    "deliver:buyer-assigned": "meet-at-door",
    "deliver:seller-assigned": "meet-at-door",
    "deliver:dutch-auction": "meet-at-door",
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
    if (method === "consume-onsite" || method === "pickup") return "direct-sale";
    return "local-commerce";
}

/** True for the 3 `deliver:*` variants. False for `consume-onsite` and `pickup`. */
export function isDeliveryFulfilment(method: CanonicalFulfilmentMethod): boolean {
    return method.startsWith("deliver:");
}

/** Human-readable label for picker UIs. Keep in sync with `FULFILMENT_METHOD_PILL_LABELS`. */
export const FULFILMENT_MODE_LABELS: Record<CanonicalFulfilmentMethod, string> = {
    "consume-onsite": "Consume on-site",
    "pickup": "Pickup",
    "deliver:buyer-assigned": "Delivery (buyer chooses courier)",
    "deliver:seller-assigned": "Delivery (merchant arranges)",
    "deliver:dutch-auction": "Delivery (Dutch-auction courier)",
};
