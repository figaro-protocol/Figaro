/**
 * Declared document layouts — the recognizable trade documents the audit /
 * dispute bundle surfaces, as DATA. Each is a composition over committed leaves;
 * the generic engine (`documentProjection.ts`) produces them and one generic
 * renderer draws them. A new genre (packing list, certificate of origin, …) is a
 * new entry in the `DOCUMENT_LAYOUTS` array below — zero engine or renderer code.
 *
 * Every reference resolves by DECLARED FIELD, never by clause id, so a layout
 * projects identically over an assembly this codebase has never seen. That is what
 * makes this open-world: the layouts are hardcoded here, but they carry no
 * clause-specific knowledge — they read whatever fields the committed leaves declare.
 *
 * DECISION (maintainer): these layouts are a hardcoded array in this
 * file. They are NOT moved to an on-chain registry — no on-chain document registry
 * at this time. Do NOT "graduate" this to a registry, and do NOT call it a
 * "catalog" (that word is the MEMBER'S catalog — a different object entirely).
 * It is a list of document-layout objects. Leave it here.
 */

import type { DocumentLayout } from "@/lib/audit/documentProjection";

/** Commercial invoice, EN 16931 core — one per SELLER (BG-4 single supplier). The
 *  interpretive VAT class is jurisdiction/graph-supplied and absent from the core.
 *  Applies wherever a commerce leaf (declaring `lineItems`) was committed. */
const COMMERCIAL_INVOICE: DocumentLayout = {
    genre: "commercial-invoice",
    title: "Commercial invoice (EN 16931 core)",
    scope: "seller",
    appliesWhen: { hasLeafField: "lineItems" },
    header: [
        { label: "Invoice no. (BT-1)", ref: { orderHash: true } },
        { label: "Issue date (BT-2)", ref: { resolvedDate: true } },
        { label: "Type (BT-3)", ref: { const: "380 — commercial invoice" } },
        { label: "Seller (BG-4)", ref: { party: "seller" } },
        { label: "Buyer (BG-7)", ref: { party: "buyer" } },
        { label: "Currency (BT-5)", ref: { leafField: { byField: "lineItems", field: "currency" } } },
    ],
    lines: {
        fields: [
            { label: "Order", ref: { orderHash: true } },
            { label: "Description", ref: { lineItemNames: true } },
            { label: "Net amount", ref: { payment: true } },
        ],
        total: { label: "Net total (BT-106)", ref: { sumPayments: true } },
    },
    leafSections: [
        { label: "Delivery terms (Incoterms 2020)", byField: "incotermsRule" },
    ],
    note: "Derived from the committed data — not separately written. The interpretive VAT class is jurisdiction/graph-supplied and absent from this core projection (applicable, with a stablecoin denomination, to the EU e-invoice profile).",
};

/** Non-negotiable Bill of Lading — one per carriage-leg ORDER. Never a document of
 *  title: FigaroCore forbids substituting a bonded order's parties mid-flight, so
 *  the consignee is fixed at signing (/papers/after-tradelens §7).
 *
 *  A carriage leg is what its composed clauses make it: an order that follows
 *  another (the goods come from somewhere in the process), over a route (a leaf
 *  declaring `origin` and `destination`), with a physical hand-over of the
 *  goods (a leaf declaring `handoff`). A process log alone (an inspection, a
 *  customs filing), a route without a hand-over (a forwarder) or a hand-over
 *  of content is not one. The parties come from the topology: the carrier is
 *  this order's seller, the shipper the seller of the order it follows (who
 *  tenders the goods), the consignee the buyer the process delivers to. */
const BILL_OF_LADING: DocumentLayout = {
    genre: "bill-of-lading",
    title: "Bill of Lading (non-negotiable)",
    scope: "order",
    appliesWhen: {
        all: [
            { followsAnOrder: true },
            { hasLeafField: "origin" },
            { hasLeafField: "destination" },
            { hasLeafField: "handoff" },
        ],
    },
    header: [
        { label: "BoL no.", ref: { orderHash: true } },
        { label: "Carrier", ref: { party: "seller" } },
        { label: "Shipper / consignor", ref: { followedSellers: true } },
        { label: "Consignee", ref: { party: "buyer" } },
        { label: "Origin (geohash)", ref: { leafField: { byField: "origin", field: "origin" } } },
        { label: "Destination (geohash)", ref: { leafField: { byField: "origin", field: "destination" } } },
    ],
    leafSections: [
        { label: "Cargo", byField: "massGrams" },
        { label: "Freight class", byField: "nmfcClass" },
        { label: "Incoterms 2020", byField: "incotermsRule" },
        { label: "Mode of carriage", byField: "handoff" },
    ],
    note: "NON-NEGOTIABLE — not a document of title. The consignee is fixed at signing; FigaroCore forbids substituting a bonded order's parties mid-flight. The precise addressee is party-private (ECDH channel); only the public geohash is committed.",
};

/** The document layouts the audit bundle projects. Add a genre by adding a
 *  layout object to this array — the engine and renderer are generic. */
export const DOCUMENT_LAYOUTS: readonly DocumentLayout[] = [
    COMMERCIAL_INVOICE,
    BILL_OF_LADING,
];
