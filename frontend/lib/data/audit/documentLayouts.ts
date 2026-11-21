/**
 * Declared document layouts — the recognizable trade documents the audit /
 * dispute bundle surfaces, as DATA. Each is a composition over committed leaves;
 * the generic engine (`documentProjection.ts`) produces them and one generic
 * renderer draws them. A new genre (packing list, certificate of origin, …) is a
 * new entry in the `DOCUMENT_LAYOUTS` array below — zero engine or renderer code.
 *
 * Every reference resolves through a mark a clause's spec declares in its `block`,
 * never by clause id and never by a field's name, so a layout projects identically
 * over an assembly this codebase has never seen. A section names the words a spec
 * uses in `block.runtime.documentPart` (cargo, freight-class, delivery-terms,
 * carriage); a route is the one `block.checkout.endpoints` marks. That is what
 * makes this open-world: the layouts are hardcoded here, but they carry no
 * clause-specific knowledge — a stranger's clause that declares a section fills it.
 *
 * DECISION (maintainer): these layouts are a hardcoded array in this
 * file. They are NOT moved to an on-chain registry — no on-chain document registry
 * at this time. Do NOT "graduate" this to a registry, and do NOT call it a
 * "catalog" (that word is the MEMBER'S catalog — a different object entirely).
 * It is a list of document-layout objects. Leave it here.
 */

import type { DocumentLayout } from "@/lib/data/audit/documentProjection";

/** Commercial invoice, EN 16931 core — one per SELLER (BG-4 single supplier). The
 *  interpretive VAT class is jurisdiction/graph-supplied and absent from the core.
 *  Applies wherever a clause whose spec marks priced lines was committed; its currency
 *  is the commitment's token, never a clause's. */
const COMMERCIAL_INVOICE: DocumentLayout = {
    genre: "commercial-invoice",
    title: "Commercial invoice (EN 16931 core)",
    scope: "seller",
    appliesWhen: { hasPricedLines: true },
    header: [
        { label: "Invoice no. (BT-1)", ref: { orderHash: true } },
        { label: "Issue date (BT-2)", ref: { resolvedDate: true } },
        { label: "Type (BT-3)", ref: { const: "380 — commercial invoice" } },
        { label: "Seller (BG-4)", ref: { party: "seller" } },
        { label: "Buyer (BG-7)", ref: { party: "buyer" } },
        { label: "Currency (BT-5)", ref: { currency: true } },
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
        { label: "Delivery terms", part: "delivery-terms" },
    ],
    note: "Derived from the committed data — not separately written. The interpretive VAT class is jurisdiction/graph-supplied and absent from this core projection (applicable, with a stablecoin denomination, to the EU e-invoice profile).",
};

/** Non-negotiable Bill of Lading — one per carriage-leg ORDER. Never a document of
 *  title: FigaroCore forbids substituting a bonded order's parties mid-flight, so
 *  the consignee is fixed at signing (/papers/after-tradelens §7).
 *
 *  A carriage leg is what its composed clauses make it: an order that follows
 *  another (the goods come from somewhere in the process), over a route (a leaf
 *  whose spec marks its endpoints), with a physical hand-over of the goods (a
 *  leaf whose spec declares the carriage section). A process log alone (an inspection, a
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
            { hasRoute: true },
            { hasPart: "carriage" },
        ],
    },
    header: [
        { label: "BoL no.", ref: { orderHash: true } },
        { label: "Carrier", ref: { party: "seller" } },
        { label: "Shipper / consignor", ref: { followedSellers: true } },
        { label: "Consignee", ref: { party: "buyer" } },
        { label: "Origin", ref: { routeEnd: "from" } },
        { label: "Destination", ref: { routeEnd: "to" } },
    ],
    leafSections: [
        { label: "Cargo", part: "cargo" },
        { label: "Freight class", part: "freight-class" },
        { label: "Delivery terms", part: "delivery-terms" },
        { label: "Mode of carriage", part: "carriage" },
    ],
    note: "NON-NEGOTIABLE — not a document of title. The consignee is fixed at signing; FigaroCore forbids substituting a bonded order's parties mid-flight. The precise addressee is party-private (ECDH channel); only the public geohash is committed.",
};

/** The document layouts the audit bundle projects. Add a genre by adding a
 *  layout object to this array — the engine and renderer are generic. */
export const DOCUMENT_LAYOUTS: readonly DocumentLayout[] = [
    COMMERCIAL_INVOICE,
    BILL_OF_LADING,
];
