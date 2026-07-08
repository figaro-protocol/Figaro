/**
 * Declared document templates — the recognizable trade documents the audit /
 * dispute bundle surfaces, as DATA. Each is a composition over committed leaves;
 * the generic engine (`documentProjection.ts`) produces them and one generic
 * renderer draws them. A new genre (packing list, certificate of origin, …) is a
 * new entry here — zero engine or renderer code.
 *
 * Every reference resolves by DECLARED FIELD, never by clause id, so a template
 * projects identically over an assembly this codebase has never seen. This is a
 * declared catalogue today; it can graduate to a permissionless registry (the
 * fifth-noun composition path) without touching the engine.
 */

import type { DocumentTemplate } from "@/lib/audit/documentProjection";

/** Commercial invoice, EN 16931 core — one per SELLER (BG-4 single supplier). The
 *  interpretive VAT class is jurisdiction/graph-supplied and absent from the core.
 *  Applies wherever a commerce leaf (declaring `lineItems`) was committed. */
const COMMERCIAL_INVOICE: DocumentTemplate = {
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
    note: "Derived from the committed record — not separately authored. The interpretive VAT class is jurisdiction/graph-supplied and absent from this core projection (applicable, with a stablecoin denomination, to the EU e-invoice profile).",
};

/** Non-negotiable Bill of Lading — one per carriage-leg ORDER. Never a document of
 *  title: FigaroCore forbids substituting a bonded order's parties mid-flight, so
 *  the consignee is fixed at signing (see docs/v5/BOL_RESEARCH.md). */
const BILL_OF_LADING: DocumentTemplate = {
    genre: "bill-of-lading",
    title: "Bill of Lading (non-negotiable)",
    scope: "order",
    appliesWhen: { isCarriageLeg: true },
    header: [
        { label: "BoL no.", ref: { orderHash: true } },
        { label: "Carrier", ref: { party: "seller" } },
        { label: "Shipper / consignor", ref: { party: "buyer" } },
        { label: "Consignee", ref: { party: "buyer" } },
        { label: "Origin (geohash)", ref: { leafField: { byField: "originGeohash", field: "originGeohash" } } },
        { label: "Destination (geohash)", ref: { leafField: { byField: "originGeohash", field: "destinationGeohash" } } },
    ],
    leafSections: [
        { label: "Cargo", byField: "massGrams" },
        { label: "Freight class", byField: "nmfcClass" },
        { label: "Mode of carriage", byField: "handoff" },
    ],
    note: "NON-NEGOTIABLE — not a document of title. The consignee is fixed at signing; FigaroCore forbids substituting a bonded order's parties mid-flight. The precise addressee is party-private (ECDH channel); only the public geohash is committed.",
};

/** The declared catalogue the audit bundle projects. Add a genre by adding a
 *  template — the engine and renderer are generic. */
export const DOCUMENT_TEMPLATES: readonly DocumentTemplate[] = [
    COMMERCIAL_INVOICE,
    BILL_OF_LADING,
];
