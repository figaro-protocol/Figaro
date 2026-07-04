/**
 * rateQuantitySources — the rate-quantity-source→resolver registry.
 *
 * A rate-priced catalogue item declares WHERE its billed quantity comes from
 * (`rateQuantitySource`) — an OPEN axis, the same discipline as the field
 * `format` registry: the KEY is a semantic the item declares, never a sector,
 * a clause id, or a component name. The pricing site consults it wherever a
 * rate item prices; a source with no entry resolves to null and the surface
 * refuses to price the item (resolved-empty = absence, never a fallback).
 *
 * Tenants:
 *  - "checkout-quantity": the buyer enters the units at checkout (hours,
 *    seats, GB — the unit is the seller's editorial `rateUnit` label).
 *  - "order-geodistance": derived from the order's OWN committed geolocation
 *    endpoints — great-circle distance in km between the two geohash cell
 *    centroids, found by their declared fields (`originGeohash` +
 *    `destinationGeohash`), never by clause id. ANY order that composes both
 *    endpoints has a derivable distance; no sector is named. Crow-flies is
 *    the only distance derivable from committed data alone — routed distance
 *    is an external source, i.e. a future composition tenant, as is a
 *    booking-window clause deriving hours (fill-where-composed).
 */

import { geohashCentroidDistanceKm } from "@figaro/core/extensions";
import { clauseDeclaresField } from "@/lib/shared/clauseSpecSource";
import type { ClauseFields } from "@/lib/shared/clauseFields";

/** @public pending consumer: external resolver tenants (a booking-window
 *  derivation, a routed-distance composition) type their context with this;
 *  remove the tag when the first out-of-file tenant lands. */
export interface RateQuantityContext {
    /** The order's clause fields (template values + checkout fills), keyed by
     *  clause id — the same map the agreement commits. */
    clauses: ClauseFields;
    /** The buyer's entered units for this order, when the surface collected
     *  one (the "checkout-quantity" source's input). */
    checkoutQuantity?: number;
}

/** Resolve the item's raw quantity in the rate's unit — possibly fractional
 *  (billing rounds per started unit at the ONE pricing site). Null when the
 *  quantity cannot be resolved from this order. */
export type RateQuantityResolver = (ctx: RateQuantityContext) => number | null;

function resolveCheckoutQuantity(ctx: RateQuantityContext): number | null {
    const q = ctx.checkoutQuantity;
    return typeof q === "number" && Number.isFinite(q) && q > 0 ? q : null;
}

function resolveOrderGeodistance(ctx: RateQuantityContext): number | null {
    const geoClauseId = Object.keys(ctx.clauses).find(
        (clauseId) =>
            clauseDeclaresField(clauseId, "originGeohash") &&
            clauseDeclaresField(clauseId, "destinationGeohash"),
    );
    if (!geoClauseId) return null;
    const section = ctx.clauses[geoClauseId];
    const origin = section?.originGeohash;
    const destination = section?.destinationGeohash;
    if (typeof origin !== "string" || typeof destination !== "string" || !origin || !destination) {
        return null;
    }
    try {
        return geohashCentroidDistanceKm(origin, destination);
    } catch {
        // Malformed committed geohash — unresolvable, never junk-priced.
        return null;
    }
}

const REGISTRY = new Map<string, RateQuantityResolver>([
    ["checkout-quantity", resolveCheckoutQuantity],
    ["order-geodistance", resolveOrderGeodistance],
]);

/** Register a resolver for a declared quantity source. Last write wins —
 *  the registry's extension point: a booking-window derivation or a routed-
 *  distance composition registers here without touching checkout code.
 *  @public */
export function registerRateQuantitySource(
    source: string,
    resolver: RateQuantityResolver,
): void {
    REGISTRY.set(source, resolver);
}

/** The resolver for a declared quantity source, or null — the pricing site
 *  treats a missing tenant as unresolvable. */
export function getRateQuantityResolver(
    source: string | undefined,
): RateQuantityResolver | null {
    if (!source) return null;
    return REGISTRY.get(source) ?? null;
}
