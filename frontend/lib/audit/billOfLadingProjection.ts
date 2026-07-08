/**
 * Non-negotiable Bill of Lading — a trade document DERIVED read-only from a
 * carriage leg's committed leaves, never separately authored and never a
 * document of title.
 *
 * Figaro can express only the NON-NEGOTIABLE BoL: the consignee is fixed at
 * order signing, because FigaroCore forbids substituting a bonded order's
 * parties mid-flight (parties fixed at commit + single-buyer + no-escape-hatches,
 * each independently). A negotiable/transferable BoL — a claim that circulates to
 * a new holder in transit — is structurally impossible here, by design. Full
 * rationale: docs/v5/BOL_RESEARCH.md (§5) + the reference_bol_research_canonical
 * memory.
 *
 * Open-world: the projection names NO clause. A carriage leg is discriminated
 * from the graph — a sub-order whose committed topology declares parents (it
 * carries goods that originated upstream) and that composes a runtime process-log
 * ladder (a custody-advancing seller). Every field is read from the committed
 * agreement by its declared field, so an assembly this codebase has never seen
 * projects the same way. The precise addressee stays party-private (the ECDH
 * channel on the geolocation clause); only the public geohash is committed.
 */

import type { Agreement } from "@figaro/core";
import type { Order } from "@/lib/kernel/store";
import { clauseDeclaresField, clauseIsProcessLog } from "@/lib/shared/clauseSpecSource";

/** A carriage leg's non-negotiable bill of lading. @public */
export interface BillOfLadingProjection {
    /** BoL number — the carriage order's hash (its identity is the BoL's). */
    bolNumber: string;
    /** Always false — Figaro expresses only non-negotiable BoLs (not a document
     *  of title). Present as a field so a reader/serializer can assert it. */
    negotiable: false;
    /** Carrier — the order's committed seller. */
    carrier: string;
    /** Shipper / consignor — the order's buyer (who hired the carriage). */
    shipper: string;
    /** Consignee — the buyer, fixed at signing. The precise addressee is
     *  party-private (ECDH); only the public destination below is committed. */
    consignee: string;
    /** Public origin geohash (figaro-geolocation), when composed. */
    origin?: string;
    /** Public destination geohash, when composed. */
    destination?: string;
    /** Mode-of-carriage leaf (the committed handoff choice), when composed. */
    mode?: Record<string, unknown>;
    /** Cargo measure leaf (mass / volume / packaged dims / packaging / marks). */
    cargo?: Record<string, unknown>;
    /** Declared freight-class leaf (NMFC), when composed. */
    freightClass?: Record<string, unknown>;
    /** The carriage payment (freight) — payment + currency from the commerce leaf. */
    freight?: { payment: string; currency: string };
}

/** A committed section's data, found by a declared field — never by clause id. */
function sectionData(agreement: Agreement, fieldName: string): Record<string, unknown> | undefined {
    const section = agreement.sections.find((s) => clauseDeclaresField(s.clause, fieldName));
    return section?.data as Record<string, unknown> | undefined;
}

/**
 * Is this order a carriage leg? Open-world: its committed topology declares
 * parents (goods originated upstream) AND it composes a runtime process-log
 * ladder (a custody-advancing seller). Names no clause. @public
 */
export function isCarriageLeg(agreement: Agreement): boolean {
    const topology = sectionData(agreement, "parentOrderHashes");
    const parents = topology?.parentOrderHashes;
    const hasParents = Array.isArray(parents) && parents.length > 0;
    const carriesProcessLog = agreement.sections.some((s) => clauseIsProcessLog(s.clause));
    return hasParents && carriesProcessLog;
}

/**
 * Project the non-negotiable BoL for a carriage-leg order from its committed
 * leaves. Returns null when the order is not a carriage leg. @public
 */
export function projectBillOfLading(order: Order, agreement: Agreement): BillOfLadingProjection | null {
    if (!isCarriageLeg(agreement)) return null;

    const geo = sectionData(agreement, "originGeohash");
    const mode = sectionData(agreement, "handoff");
    const cargo = sectionData(agreement, "massGrams");
    const freightClass = sectionData(agreement, "nmfcClass");
    const commerce = sectionData(agreement, "lineItems");
    const origin = typeof geo?.originGeohash === "string" ? geo.originGeohash : undefined;
    const destination = typeof geo?.destinationGeohash === "string" ? geo.destinationGeohash : undefined;
    const payment = commerce?.payment;
    const currency = commerce?.currency;

    return {
        bolNumber: order.id,
        negotiable: false,
        carrier: order.seller,
        shipper: order.buyer,
        consignee: order.buyer,
        ...(origin !== undefined && { origin }),
        ...(destination !== undefined && { destination }),
        ...(mode !== undefined && { mode }),
        ...(cargo !== undefined && { cargo }),
        ...(freightClass !== undefined && { freightClass }),
        ...(typeof payment === "string" && typeof currency === "string" && { freight: { payment, currency } }),
    };
}
