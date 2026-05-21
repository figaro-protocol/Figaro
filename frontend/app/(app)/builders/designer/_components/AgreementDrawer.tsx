"use client";

/**
 * AgreementDrawer — schema-composition editor for a single order's
 * agreement.
 *
 * Each tab represents an article of the bonded commitment. The designer
 * chooses which schemas appear in the order's agreement by toggling
 * inclusion or by filling structured controls (checkboxes for multi-valued
 * fields; per-article custom widgets for Fulfilment, Emissions, and
 * Jurisdiction).
 *
 * The actual values are filled in by the merchant or buyer at commit time
 * — the designer's job here is composition, not data entry. Rendering of
 * populated agreement sections lives in `AgreementPreviewModal.tsx` and
 * `lib/audit/`.
 *
 * Persistence: every manifest-field change rebuilds the agreement
 * (`editSyntheticAgreement` → `buildOrderAgreement`) and updates the
 * order's `agreementHash`. Inclusion is therefore cryptographically real.
 *
 * Rendering modes:
 *   - `embedded` (default false): legacy fixed-overlay positioning used
 *     by /edit.
 *   - `embedded: true`: inline flex-column block. The page handles
 *     positioning. Used by /new where the drawer is part of the layout.
 */

import { useEffect, useId, useState } from "react";
import type { Order } from "@/lib/core/store";
import type { ManifestFields } from "@/lib/core/encoding";
import {
    readAgreementFields,
    type AgreementEdits,
} from "@/lib/designer/syntheticProcess";
import { loadAgreement } from "@/lib/core/agreementStore";
import { summarizeAgreement } from "@/lib/core/orderAgreement";
import {
    COMMERCE_SCHEMA_KEY,
    COURIER_PROCESS_SCHEMA_KEY,
    GEO_SCHEMA_KEY,
    GHG_DISCLOSURE_SCHEMA_KEYS,
    MERCHANT_PROCESS_SCHEMA_KEY,
} from "@/lib/core/agreementManifest";
import { getSchemaInfo } from "@/lib/shared/schemaCategories";
import { ZERO_BYTES32 } from "@/lib/shared/evm";
import { truncateHex } from "@/lib/shared/formatHex";
import type { FulfilmentModality } from "@figaro/core/schemas";
import { KLEROS_COURTS } from "@/lib/dispute";

/**
 * Articles of the agreement, in canonical contract-paper order.
 */
type ArticleKey =
    | "identity"
    | "order"
    | "fulfilment"
    | "logistics"
    | "attestations"
    | "emissions"
    | "jurisdiction"
    | "consent";

const ARTICLES: readonly { key: ArticleKey; label: string }[] = [
    { key: "identity", label: "Identity" },
    { key: "order", label: "Order" },
    { key: "fulfilment", label: "Fulfilment" },
    { key: "logistics", label: "Logistics" },
    { key: "attestations", label: "Attestations" },
    { key: "emissions", label: "Emissions" },
    { key: "jurisdiction", label: "Jurisdiction" },
    { key: "consent", label: "Consent" },
];

/**
 * Per-schema sentinel manifest fields. Toggling a schema "Included"
 * applies these values; toggling "Not included" deletes them.
 *
 * Sentinels are chosen so the encoder (`@figaro/core/schemas`) emits a
 * valid section: minimum-length geohash, enum-valid handoff mode, etc.
 * Real values come from the runtime — designer's job is composition.
 */
const SCHEMA_SENTINELS: Record<string, Record<string, string>> = {
    // figaro-geo-v2 requires all five fields. Origin / destination get
    // minimum-length geohashes. Mass / volume default to 1 (the smallest
    // value the v2 validator accepts; 0 reverts). Class defaults to "S"
    // (Standard). `manifestFieldsToGeoSection` reads these manifest keys
    // and produces an encoder-valid section. Real values flow in at
    // commit-time from the buyer's runtime UI.
    [GEO_SCHEMA_KEY]: { origin: "0", destination: "0", mass: "1g", volume: "1ml", class_: "S" },
};

/**
 * Per-schema fields the toggle "Not included" clears. Must match the
 * sentinel keys above so toggling off wipes every field toggling on set.
 */
const SCHEMA_FIELDS: Record<string, readonly string[]> = {
    [GEO_SCHEMA_KEY]: ["origin", "destination", "mass", "volume", "class_"],
};

function isFieldFilled(fields: ManifestFields, key: string): boolean {
    const v = (fields as Record<string, unknown>)[key];
    if (v === undefined || v === null) return false;
    if (typeof v === "string") {
        const trimmed = v.trim();
        return trimmed !== "" && trimmed !== "—";
    }
    return true;
}

/** Geo schema is "included" when its required fields are set in the manifest. */
function isSchemaIncluded(schemaId: string, fields: ManifestFields): boolean {
    if (schemaId === GEO_SCHEMA_KEY) {
        return isFieldFilled(fields, "origin") && isFieldFilled(fields, "destination");
    }
    return false;
}

interface Props {
    /** Currently-selected order. May be null in `embedded` mode (renders
        an empty state). */
    order: Order | null;
    onClose: () => void;
    onChange: (edits: AgreementEdits) => void;
    /** True when the current order already has at least one child sub-order.
     *  Surfaced to the Fulfilment article so its hint copy reflects the
     *  canvas state ("a sub-order was added" vs. "set coordination on the
     *  existing sub-order"). */
    hasChildren?: boolean;
    /** True when the parent of the currently-selected sub-order has Delivery
     *  in its Fulfilment article. Drives the Attestations tab's
     *  courier-process lock-on rule when editing a courier sub-order — the
     *  drawer cannot see the parent's manifest directly, so the page is
     *  expected to compute and pass this. False / undefined when editing a
     *  root order (or any sub-order whose parent has no delivery). */
    parentDeliveryActive?: boolean;
    /** True when the currently-selected merchant order has at least one
     *  child anchoring the courier-process schema. Drives the Attestations
     *  tab's cross-role hint copy so we only direct the designer to "edit
     *  on the courier sub-order" when one actually exists. */
    hasCourierChild?: boolean;
    /** Fired when the user picks Delivery in the Fulfilment article. The
     *  page is responsible for adding a courier sub-order if none exists
     *  and tracking it so a subsequent `onDeliveryUnselected` can remove
     *  the same one. */
    onDeliverySelected?: (parentOrderId: string) => void;
    /** Fired when the user picks a non-delivery modality (or Not included)
     *  after previously having Delivery selected. The page should remove
     *  any sub-order it auto-added in response to the matching
     *  `onDeliverySelected`, leaving manually-added sub-orders alone. */
    onDeliveryUnselected?: (parentOrderId: string) => void;
    /** When true, render as an inline flex-column block without fixed
        positioning. The page layout becomes responsible for placement. */
    embedded?: boolean;
    /** When true, the article tabs remain clickable for navigation, but
     *  every form control inside an article is disabled. Used by /view
     *  to surface clause/schema detail without permitting edits. */
    readOnly?: boolean;
    /** Every order in the design. Drives the per-node tab row so each
     *  graph node has its own authoring surface in the drawer — without
     *  this, a spawned sub-order is reachable only by clicking its canvas
     *  node. Omitted, or single-order, → no tab row. */
    orders?: Order[];
    /** Switch the drawer to another node's agreement. Paired with
     *  `orders`; the canvas owns the selected-order state. */
    onSelectOrder?: (orderId: string) => void;
}

export function AgreementDrawer({
    order,
    onClose,
    onChange,
    hasChildren = false,
    parentDeliveryActive = false,
    hasCourierChild = false,
    onDeliverySelected,
    onDeliveryUnselected,
    embedded = false,
    readOnly = false,
    orders,
    onSelectOrder,
}: Props) {
    const [fields, setFields] = useState<ManifestFields>(() =>
        order ? readAgreementFields(order) : ({} as ManifestFields),
    );
    const [openSection, setOpenSection] = useState<ArticleKey | null>(null);
    const [minimized, setMinimized] = useState(false);
    const [headerHeight, setHeaderHeight] = useState(108);

    useEffect(() => {
        if (embedded) return;
        const header = document.querySelector("header");
        if (!header) return;
        const measure = () => setHeaderHeight(header.getBoundingClientRect().height);
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(header);
        return () => ro.disconnect();
    }, [embedded]);

    useEffect(() => {
        if (order) setFields(readAgreementFields(order));
    }, [order?.id, order?.agreementHash]);

    // Auto-open Identity on each new order — contracts open with who is bound + where in the DAG.
    useEffect(() => {
        if (order) setOpenSection("identity");
    }, [order?.id]);

    // Empty state — only valid in embedded mode.
    if (!order) {
        if (!embedded) return null;
        return (
            <aside
                data-testid="agreement-drawer"
                data-empty="true"
                className="w-[360px] shrink-0 bg-white border-l border-neutral-200 flex flex-col items-center justify-center text-center px-6"
            >
                <div className="text-neutral-300 text-4xl mb-3" aria-hidden>←</div>
                <p className="text-sm font-semibold text-neutral-700 mb-1">
                    Select a node to edit
                </p>
                <p className="text-xs text-neutral-500 leading-relaxed max-w-[260px]">
                    Click any node on the canvas to choose which clause
                    schemas its agreement includes.
                </p>
            </aside>
        );
    }

    const topology = summarizeAgreement(loadAgreement(order.agreementHash))?.topology;
    const isRootOrder = (topology?.parentOrderHashes?.length ?? 0) === 0;
    // Structural role booleans — derived from the order's actual content.
    // Root + (delivery in fulfilment OR merchant-process anchored) is the
    // merchant order; the per-role process schemas distinguish courier and
    // offset sub-orders.
    const isMerchantOrder = isRootOrder;
    const isCourierOrder = !isRootOrder && fields.courierProcessIncluded === true;

    function selectSection(section: ArticleKey) {
        setOpenSection((prev) => (prev === section ? null : section));
    }

    function commitFields(next: ManifestFields) {
        setFields(next);
        onChange({ manifestFields: next });
    }

    /** Toggle inclusion for a single-schema article. Sets sentinel fields
     *  on "Included", clears all schema-related fields on "Not included". */
    function toggleSchema(schemaId: string, included: boolean) {
        const next: ManifestFields = { ...fields };
        if (included) {
            const sentinel = SCHEMA_SENTINELS[schemaId];
            for (const [k, v] of Object.entries(sentinel)) {
                (next as Record<string, unknown>)[k] = v;
            }
        } else {
            for (const k of SCHEMA_FIELDS[schemaId] ?? []) {
                delete (next as Record<string, unknown>)[k];
            }
        }
        commitFields(next);
    }

    function readStringArray(key: string): string[] {
        const v = fields[key];
        return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
    }

    const fulfilmentModalities = readStringArray("fulfilmentModalities");
    const fulfilmentCoordinations = readStringArray("fulfilmentCoordinations");
    const fulfilmentHandoffPoints = readStringArray("fulfilmentHandoffPoints");
    const proximityBands = readStringArray("proximityBands");

    /** Cross-article dependency: when fulfilment offers delivery, the
     *  Logistics clause is required (delivery is physical handoff and must
     *  carry origin/destination/mass/volume/class). Drives the Logistics
     *  tab's locked-on state. */
    const deliveryActive = fulfilmentModalities.includes("delivery");

    /** Fulfilment article: multi-select across modalities, coordinations,
     *  and handoffPoints. The article emits whole-shape updates; the drawer
     *  routes side-effects (auto-add / auto-remove courier sub-order) via
     *  the onDeliveryAdded / onDeliveryRemoved callbacks the article fires
     *  when delivery is toggled on or off.
     *
     *  Delivery → Logistics dependency: when delivery transitions off→on,
     *  this function also writes the Logistics sentinel into the same
     *  commitFields call, so the auto-include is atomic with the modality
     *  update. Transition on→off leaves Logistics where it is — the
     *  designer may want to keep it for non-delivery flows. */
    function updateFulfilment(next: {
        modalities: string[];
        coordinations: string[];
        handoffPoints: string[];
    }) {
        const becomingDelivery =
            next.modalities.includes("delivery") && !fulfilmentModalities.includes("delivery");
        const out: ManifestFields = { ...fields };
        if (next.modalities.length > 0) out.fulfilmentModalities = next.modalities;
        else delete (out as Record<string, unknown>).fulfilmentModalities;
        if (next.coordinations.length > 0) out.fulfilmentCoordinations = next.coordinations;
        else delete (out as Record<string, unknown>).fulfilmentCoordinations;
        if (next.handoffPoints.length > 0) out.fulfilmentHandoffPoints = next.handoffPoints;
        else delete (out as Record<string, unknown>).fulfilmentHandoffPoints;
        if (becomingDelivery && !isSchemaIncluded(GEO_SCHEMA_KEY, out)) {
            const sentinel = SCHEMA_SENTINELS[GEO_SCHEMA_KEY];
            for (const [k, v] of Object.entries(sentinel)) {
                (out as Record<string, unknown>)[k] = v;
            }
        }
        // Delivery → merchant-process auto-included on this (merchant) order.
        // The courier sub-order is spawned by the page handler with
        // courierProcessIncluded already set on its manifest.
        if (becomingDelivery) {
            out.merchantProcessIncluded = true;
        }
        commitFields(out);
    }

    function updateProximityBands(next: string[]) {
        const out: ManifestFields = { ...fields };
        if (next.length > 0) out.proximityBands = next;
        else delete (out as Record<string, unknown>).proximityBands;
        commitFields(out);
    }

    /** Per-role process-log toggles. Each writes a boolean manifest field
     *  that buildOrderAgreement reads to decide whether to anchor the
     *  matching figaro-merchant-process-v1 / figaro-courier-process-v1
     *  clause in this order's agreement. Sentinel-style — written when on,
     *  cleared when off. */
    const merchantProcessIncluded = fields.merchantProcessIncluded === true;
    const courierProcessIncluded = fields.courierProcessIncluded === true;

    function setProcessFlag(key: "merchantProcessIncluded" | "courierProcessIncluded", on: boolean) {
        const out: ManifestFields = { ...fields };
        if (on) (out as Record<string, unknown>)[key] = true;
        else delete (out as Record<string, unknown>)[key];
        commitFields(out);
    }

    /** Emissions article: multi-select across the GHG accounting standards.
     *  Each checked standard produces an independent disclosure clause in
     *  the agreement (one section per standard, scope defaults to 1).
     *  Carbon-offset retirement is handled at the process level (off-protocol,
     *  via aggregator contracts) — not here in the per-order drawer. */
    const activeGhgStandards = readStringArray("ghgStandards");

    function updateGhgStandards(next: string[]) {
        const out: ManifestFields = { ...fields };
        if (next.length > 0) out.ghgStandards = next;
        else delete (out as Record<string, unknown>).ghgStandards;
        commitFields(out);
    }

    /** Jurisdiction article state — three layers; layer 1 always active
     *  (kernel mechanisms, not encoded), layer 2 = Kleros, layer 3 =
     *  traditional state/ADR. */
    const klerosCourtValue = typeof fields.klerosCourt === "string" ? fields.klerosCourt : "";
    const klerosOptedIn = klerosCourtValue !== "";
    const klerosMinJurorsValue = typeof fields.klerosMinJurors === "string" ? fields.klerosMinJurors : "3";
    const applicableLawValue = typeof fields.applicableLaw === "string" ? fields.applicableLaw : "";
    const forumValue = typeof fields.forum === "string" ? fields.forum : "";
    const languageValue = typeof fields.language === "string" ? fields.language : "";
    const traditionalActive = applicableLawValue !== "" || forumValue !== "" || languageValue !== "";

    function setKlerosCourt(value: string) {
        const out: ManifestFields = { ...fields };
        if (value === "") {
            delete (out as Record<string, unknown>).klerosCourt;
            delete (out as Record<string, unknown>).klerosMinJurors;
        } else {
            out.klerosCourt = value;
            if (!out.klerosMinJurors) out.klerosMinJurors = "3";
        }
        commitFields(out);
    }

    function setKlerosMinJurors(value: string) {
        const out: ManifestFields = { ...fields };
        out.klerosMinJurors = value;
        commitFields(out);
    }

    function setTraditionalField(key: "applicableLaw" | "forum" | "language", value: string) {
        const out: ManifestFields = { ...fields };
        if (value === "") delete (out as Record<string, unknown>)[key];
        else (out as Record<string, unknown>)[key] = value;
        commitFields(out);
    }

    function clearTraditional() {
        const out: ManifestFields = { ...fields };
        delete (out as Record<string, unknown>).applicableLaw;
        delete (out as Record<string, unknown>).forum;
        delete (out as Record<string, unknown>).language;
        commitFields(out);
    }

    /** Consent article state — array of {documentHash, documentVersion,
     *  documentTitle} rows. Each row is independently editable; partial
     *  rows are silently dropped by buildOrderAgreement. */
    const consentDocuments: Array<Record<string, string>> = Array.isArray(fields.consentDocuments)
        ? (fields.consentDocuments as Array<Record<string, string>>)
        : [];

    function commitConsentDocuments(next: Array<Record<string, string>>) {
        const out: ManifestFields = { ...fields };
        if (next.length > 0) out.consentDocuments = next;
        else delete (out as Record<string, unknown>).consentDocuments;
        commitFields(out);
    }

    function addConsentDocument() {
        commitConsentDocuments([
            ...consentDocuments,
            { documentTitle: "", documentVersion: "", documentHash: "" },
        ]);
    }

    function updateConsentDocument(index: number, key: string, value: string) {
        const next = consentDocuments.map((row, i) =>
            i === index ? { ...row, [key]: value } : row,
        );
        commitConsentDocuments(next);
    }

    function removeConsentDocument(index: number) {
        commitConsentDocuments(consentDocuments.filter((_, i) => i !== index));
    }

    return (
        <aside
            data-testid="agreement-drawer"
            data-minimized={minimized}
            data-embedded={embedded}
            style={
                embedded
                    ? { width: minimized ? 48 : 360 }
                    : { top: headerHeight, height: `calc(100vh - ${headerHeight}px)`, width: minimized ? 48 : 380 }
            }
            className={
                embedded
                    ? "shrink-0 bg-white border-l border-neutral-200 overflow-hidden flex flex-col transition-[width] duration-150"
                    : "fixed right-0 bg-white border-l border-t border-neutral-200 shadow-xl z-30 overflow-hidden flex flex-col rounded-tl-lg transition-[width] duration-150"
            }
        >
            {minimized && (
                <div className="flex flex-col items-center py-3 gap-2">
                    <button
                        type="button"
                        onClick={() => setMinimized(false)}
                        aria-label="Expand drawer"
                        data-testid="drawer-expand"
                        title="Expand"
                        className="w-8 h-8 rounded border border-neutral-300 hover:border-neutral-700 bg-white text-neutral-600 text-xs"
                    >
                        ‹
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close drawer"
                        title="Close"
                        className="w-8 h-8 rounded border border-neutral-300 hover:border-red-400 bg-white text-neutral-600 text-xs"
                    >
                        ✕
                    </button>
                    <div className="border-t border-neutral-200 w-6 my-1" />
                    {ARTICLES.map((article) => (
                        <button
                            key={article.key}
                            type="button"
                            onClick={() => { setMinimized(false); setOpenSection(article.key); }}
                            title={article.label}
                            data-testid={`drawer-rail-${article.key}`}
                            className="w-full text-[10px] text-neutral-500 hover:text-black px-1 py-1"
                        >
                            {article.label.slice(0, 3)}
                        </button>
                    ))}
                </div>
            )}
            {!minimized && (<>
            <div className="px-5 py-3 border-b border-neutral-200 flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-[11px] text-neutral-500">Agreement</p>
                    <p
                        className="text-sm font-mono font-semibold text-black mt-0.5 truncate"
                        data-testid="drawer-selected-order-id"
                        title={order.id}
                    >
                        Order #{truncateHex(order.id, { head: 10, tail: 0 })}
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        type="button"
                        onClick={() => setMinimized(true)}
                        aria-label="Minimize drawer"
                        data-testid="drawer-minimize"
                        title="Minimize"
                        className="text-xs text-neutral-500 hover:text-black px-1"
                    >
                        ›
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close drawer"
                        data-testid="drawer-close"
                        className="text-xs text-neutral-500 hover:text-black px-1"
                    >
                        ✕
                    </button>
                </div>
            </div>

            {orders && orders.length > 1 && onSelectOrder && (
                <div
                    data-testid="drawer-node-tabs"
                    className="flex flex-row gap-1 px-3 py-2 border-b border-neutral-200 overflow-x-auto"
                >
                    {orders.map((node, index) => {
                        const isActive = node.id === order.id;
                        return (
                            <button
                                key={node.id}
                                type="button"
                                onClick={() => onSelectOrder(node.id)}
                                data-testid={`drawer-node-tab-${node.id}`}
                                aria-pressed={isActive}
                                title={node.id}
                                className={`shrink-0 rounded border px-3 py-1 text-xs ${
                                    isActive
                                        ? "border-black bg-black text-white"
                                        : "border-neutral-300 bg-white text-neutral-600 hover:border-neutral-500"
                                }`}
                            >
                                Order {index + 1}
                            </button>
                        );
                    })}
                </div>
            )}

            <div className="flex-1 flex flex-row overflow-hidden">
                <nav
                    data-testid="drawer-articles-nav"
                    className="w-[112px] shrink-0 border-r border-neutral-200 overflow-y-auto"
                >
                    {ARTICLES.map((article) => {
                        const isOpen = openSection === article.key;
                        return (
                            <button
                                key={article.key}
                                type="button"
                                onClick={() => selectSection(article.key)}
                                data-testid={`drawer-tab-${article.key}`}
                                aria-pressed={isOpen}
                                className={`w-full text-left text-xs px-4 py-2.5 ${
                                    isOpen
                                        ? "bg-neutral-100 text-black font-semibold"
                                        : "text-neutral-600 hover:bg-neutral-50"
                                }`}
                            >
                                {article.label}
                            </button>
                        );
                    })}
                </nav>
                <div className="flex-1 overflow-y-auto px-5 py-4 text-sm">
                    <fieldset
                        disabled={readOnly}
                        data-testid="drawer-article-body"
                        data-readonly={readOnly || undefined}
                        className="contents"
                    >
                    {openSection === "identity" && (
                        <section data-testid="drawer-section-identity">
                            <div className="space-y-5">
                                <div>
                                    <span className="text-[11px] text-neutral-500">Buyer</span>
                                    <p className="font-mono text-xs text-neutral-700 break-all mt-0.5" data-testid="drawer-identity-buyer">
                                        {order.buyer}
                                    </p>
                                </div>
                                <div>
                                    <span className="text-[11px] text-neutral-500">Seller</span>
                                    <p className="font-mono text-xs text-neutral-700 break-all mt-0.5" data-testid="drawer-identity-seller">
                                        {order.seller}
                                    </p>
                                </div>
                                <div>
                                    <span className="text-[11px] text-neutral-500">Position</span>
                                    {topology?.parentOrderHashes && topology.parentOrderHashes.length > 0 ? (
                                        <ul
                                            className="font-mono text-[10px] text-neutral-600 space-y-1 break-all mt-0.5"
                                            data-testid="drawer-identity-parents"
                                        >
                                            {topology.parentOrderHashes.map((p) => (
                                                <li key={p}>{p}</li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p
                                            className="text-xs text-neutral-700 mt-0.5"
                                            data-testid="drawer-identity-root"
                                        >
                                            Root order.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </section>
                    )}

                    {openSection === "order" && (
                        <section data-testid="drawer-section-order">
                            <p className="text-sm text-black mb-1">
                                {getSchemaInfo(COMMERCE_SCHEMA_KEY)?.title ?? "Commerce"}
                            </p>
                            <p className="text-xs text-neutral-500 leading-relaxed">
                                Order details (currency, payment, line items) are filled in at
                                commit time and validated against{" "}
                                <code className="font-mono text-[11px]">{COMMERCE_SCHEMA_KEY}</code>{" "}
                                — the commerce schema. No composition decision lives here; this
                                clause is included in every agreement by default.
                            </p>
                        </section>
                    )}

                    {openSection === "logistics" && (
                        <section data-testid="drawer-section-logistics">
                            <SchemaToggleArticle
                                schemaId={GEO_SCHEMA_KEY}
                                included={isSchemaIncluded(GEO_SCHEMA_KEY, fields)}
                                onToggle={(next) => toggleSchema(GEO_SCHEMA_KEY, next)}
                                disabled={deliveryActive}
                                disabledHint="Required when fulfilment includes delivery."
                                lockedOn={deliveryActive}
                            />
                        </section>
                    )}

                    {openSection === "attestations" && (
                        <section data-testid="drawer-section-attestations" className="space-y-5">
                            <AttestationsArticle
                                isMerchantOrder={isMerchantOrder}
                                isCourierOrder={isCourierOrder}
                                merchantProcessIncluded={merchantProcessIncluded}
                                courierProcessIncluded={courierProcessIncluded}
                                onMerchantToggle={(next) => setProcessFlag("merchantProcessIncluded", next)}
                                onCourierToggle={(next) => setProcessFlag("courierProcessIncluded", next)}
                                deliveryActive={deliveryActive}
                                parentDeliveryActive={parentDeliveryActive}
                                hasCourierChild={hasCourierChild}
                            />
                        </section>
                    )}

                    {openSection === "fulfilment" && (
                        <section data-testid="drawer-section-fulfilment">
                            <FulfilmentArticle
                                modalities={fulfilmentModalities}
                                coordinations={fulfilmentCoordinations}
                                handoffPoints={fulfilmentHandoffPoints}
                                proximityBands={proximityBands}
                                onChange={updateFulfilment}
                                onProximityChange={updateProximityBands}
                                hasChildren={hasChildren}
                                onDeliveryAdded={() => order && onDeliverySelected?.(order.id)}
                                onDeliveryRemoved={() => order && onDeliveryUnselected?.(order.id)}
                            />
                        </section>
                    )}

                    {openSection === "emissions" && (
                        <section data-testid="drawer-section-emissions">
                            <EmissionsArticle
                                checked={activeGhgStandards}
                                onChange={updateGhgStandards}
                            />
                        </section>
                    )}

                    {openSection === "jurisdiction" && (
                        <section data-testid="drawer-section-jurisdiction">
                            <JurisdictionArticle
                                klerosCourt={klerosCourtValue}
                                klerosMinJurors={klerosMinJurorsValue}
                                applicableLaw={applicableLawValue}
                                forum={forumValue}
                                language={languageValue}
                                klerosOptedIn={klerosOptedIn}
                                onKlerosCourtChange={setKlerosCourt}
                                onKlerosMinJurorsChange={setKlerosMinJurors}
                                onTraditionalFieldChange={setTraditionalField}
                                onClearTraditional={clearTraditional}
                            />
                        </section>
                    )}

                    {openSection === "consent" && (
                        <section data-testid="drawer-section-consent">
                            <ConsentArticle
                                documents={consentDocuments}
                                onAdd={addConsentDocument}
                                onUpdate={updateConsentDocument}
                                onRemove={removeConsentDocument}
                            />
                        </section>
                    )}

                    </fieldset>
                </div>
            </div>
            </>)}
        </aside>
    );
}

/**
 * Single-schema article body — title + description (from the spec JSON)
 * + a binary inclusion toggle.
 */
function SchemaToggleArticle({
    schemaId,
    included,
    onToggle,
    disabled = false,
    disabledHint,
    lockedOn = false,
}: {
    schemaId: string;
    included: boolean;
    onToggle: (next: boolean) => void;
    /** When true, the toggle is locked at its current value. Used to express
     *  cross-article dependencies — e.g., Logistics is locked-on while
     *  Fulfilment offers delivery. */
    disabled?: boolean;
    /** One-line hint rendered beneath the locked toggle explaining why. */
    disabledHint?: string;
    /** Distinguishes "this clause is mandated by another decision and
     *  forced-included" from plain disabled ("you can't edit this here"
     *  / "doesn't apply to this role"). When true, surfaces a "Required"
     *  badge inline with the toggle label so the user reads
     *  required-and-on vs not-applicable as visually distinct states.
     *  Implies disabled. */
    lockedOn?: boolean;
}) {
    const info = getSchemaInfo(schemaId);
    const hintId = useId();
    const showHint = disabled && !!disabledHint;
    return (
        <div>
            <p className="text-sm text-black mb-1">{info?.title ?? schemaId}</p>
            <p className="text-xs text-neutral-500 leading-relaxed mb-4">
                {info?.description ?? ""}
            </p>
            <label className={`flex items-center gap-2 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}>
                <input
                    type="checkbox"
                    checked={included}
                    onChange={(e) => onToggle(e.target.checked)}
                    disabled={disabled}
                    aria-describedby={showHint ? hintId : undefined}
                    data-testid={`drawer-include-${schemaId}`}
                    className="accent-accent disabled:opacity-100"
                />
                <span className={`text-xs ${disabled && !lockedOn ? "text-neutral-400" : "text-neutral-700"}`}>
                    Included in this order&apos;s agreement
                </span>
                {lockedOn && (
                    <span
                        aria-hidden
                        data-testid={`drawer-include-${schemaId}-required-badge`}
                        className="ml-auto inline-flex items-center rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700"
                    >
                        Required
                    </span>
                )}
            </label>
            {showHint && (
                <p id={hintId} className="text-[10px] text-neutral-400 italic mt-1 ml-6">
                    {disabledHint}
                </p>
            )}
        </div>
    );
}

/**
 * Attestations article — two per-role sovereign event-log toggles. Each is
 * shown on every order's drawer (consistent UI), but only the
 * role-appropriate toggle is editable on a given drawer.
 *
 *   - Editing the merchant order (root): merchant-process toggle is the
 *     active control; courier-process is disabled with a context hint.
 *   - Editing a courier sub-order: courier-process toggle is the active
 *     control; merchant-process is disabled with a "edit on the merchant
 *     order" hint.
 *
 * Locking rules:
 *   - Delivery selected on this merchant order → merchant-process forced
 *     on + locked. (The courier sub-order's drawer will lock its own
 *     courier-process via `parentDeliveryActive`.)
 *   - This is a courier sub-order whose parent has delivery selected →
 *     courier-process forced on + locked.
 *
 * Single-node hint: when editing a root with no children and no delivery,
 * the courier-process toggle's hint nudges the designer toward adding a
 * courier sub-order (typically via Delivery in Fulfilment).
 */
function AttestationsArticle({
    isMerchantOrder,
    isCourierOrder,
    merchantProcessIncluded,
    courierProcessIncluded,
    onMerchantToggle,
    onCourierToggle,
    deliveryActive,
    parentDeliveryActive,
    hasCourierChild,
}: {
    isMerchantOrder: boolean;
    isCourierOrder: boolean;
    merchantProcessIncluded: boolean;
    courierProcessIncluded: boolean;
    onMerchantToggle: (next: boolean) => void;
    onCourierToggle: (next: boolean) => void;
    /** Delivery is in this order's fulfilment modalities (merchant order case). */
    deliveryActive: boolean;
    /** Parent order has delivery in its fulfilment (courier sub-order case). */
    parentDeliveryActive: boolean;
    /** True when this merchant order has a child anchoring the courier-process
     *  schema. Drives the cross-role hint copy so we only suggest "Edit on the
     *  courier sub-order" when one exists. */
    hasCourierChild: boolean;
}) {

    // Merchant toggle: active iff editing the merchant order. Locked-on
    // when delivery is in this order's fulfilment.
    const merchantEditable = isMerchantOrder && !deliveryActive;
    const merchantLockedOn = isMerchantOrder && deliveryActive;
    const merchantDisabled = !isMerchantOrder || deliveryActive;
    const merchantHint = isMerchantOrder
        ? (deliveryActive ? "Required when fulfilment includes delivery." : undefined)
        : isCourierOrder
            ? "Edit on the parent merchant order."
            : "Not applicable for this role — edit on the merchant order.";

    // Courier toggle: active iff editing the courier sub-order. Locked-on
    // when the parent has delivery in its fulfilment.
    const courierEditable = isCourierOrder && !parentDeliveryActive;
    const courierLockedOn = isCourierOrder && parentDeliveryActive;
    const courierDisabled = !isCourierOrder || parentDeliveryActive;
    const courierHint = isCourierOrder
        ? (parentDeliveryActive ? "Required when fulfilment includes delivery." : undefined)
        : isMerchantOrder
            ? (deliveryActive
                ? "Auto-included on the courier sub-order (required when delivery is offered)."
                : hasCourierChild
                    ? "Edit on the courier sub-order."
                    : "Requires delivery in Fulfilment or a courier sub-order on the canvas.")
            : "Not applicable for this role.";

    return (
        <div className="space-y-5">
            <p className="text-xs text-neutral-500 leading-relaxed">
                Per-role sovereign event logs. Each operator (merchant, courier)
                attests their own internal events under their own schema. Each
                clause anchors the on-chain inclusion proof for that role&apos;s
                runtime attestations.
            </p>
            <SchemaToggleArticle
                schemaId={MERCHANT_PROCESS_SCHEMA_KEY}
                included={merchantLockedOn ? true : merchantProcessIncluded}
                onToggle={merchantEditable ? onMerchantToggle : () => undefined}
                disabled={merchantDisabled}
                disabledHint={merchantHint}
                lockedOn={merchantLockedOn}
            />
            <SchemaToggleArticle
                schemaId={COURIER_PROCESS_SCHEMA_KEY}
                included={courierLockedOn ? true : courierProcessIncluded}
                onToggle={courierEditable ? onCourierToggle : () => undefined}
                disabled={courierDisabled}
                disabledHint={courierHint}
                lockedOn={courierLockedOn}
            />
        </div>
    );
}

const MODALITY_OPTIONS: ReadonlyArray<{ value: FulfilmentModality; label: string }> = [
    { value: "consume-onsite", label: "Consume on-site" },
    { value: "pickup", label: "Pickup" },
    { value: "delivery", label: "Delivery" },
    { value: "virtual", label: "Virtual" },
];

const COORDINATION_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
    { value: "buyer-assigned", label: "Buyer chooses courier" },
    { value: "seller-assigned", label: "Merchant arranges courier" },
    { value: "dutch-auction", label: "Dutch-auction courier" },
];

const HANDOFF_POINT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
    { value: "face-to-face", label: "Face-to-face" },
    { value: "dead-drop", label: "Dead-drop" },
    { value: "parking-area", label: "Parking / curbside" },
    { value: "locker", label: "Locker" },
];

const PROXIMITY_BAND_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
    { value: "zone-wifi", label: "Zone — same WiFi" },
    { value: "nearby-ble", label: "Nearby — BLE" },
    { value: "contact-nfc", label: "Contact — NFC" },
];

function toggleInList<T>(list: readonly T[], value: T): T[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/**
 * Fulfilment article — modalities + (conditional) courier coordination +
 * handoff points + (conditional) proximity bands. All four subsections are
 * always rendered; coordination is gated on "delivery" in modalities and
 * proximity is gated on at least one physical modality. Gated subsections
 * show their options disabled with an inline hint so users see what the
 * decision space is even before unlocking it.
 *
 * Picking Delivery triggers `onDeliveryAdded` (the page auto-adds a courier
 * sub-order); unchecking triggers `onDeliveryRemoved`.
 */
function FulfilmentArticle({
    modalities,
    coordinations,
    handoffPoints,
    proximityBands,
    onChange,
    onProximityChange,
    hasChildren,
    onDeliveryAdded,
    onDeliveryRemoved,
}: {
    modalities: string[];
    coordinations: string[];
    handoffPoints: string[];
    proximityBands: string[];
    onChange: (next: { modalities: string[]; coordinations: string[]; handoffPoints: string[] }) => void;
    onProximityChange: (next: string[]) => void;
    hasChildren: boolean;
    onDeliveryAdded: () => void;
    onDeliveryRemoved: () => void;
}) {
    const deliveryOffered = modalities.includes("delivery");
    const hasPhysicalModality = modalities.some((m) => m !== "virtual");

    /** Single-select per section per the assembly-uniqueness model: one
     *  assembly = one fulfilment shape. Modalities and coordination are
     *  mandatory-when-applicable (no deselect); handoff and proximity
     *  are optional (the radio's Clear affordance maps to "no clause"
     *  on the agreement). All four sections still write `string[]`
     *  (length 0 or 1) so the v2 schema serialization is unchanged. */
    function selectModality(value: string) {
        if (modalities.length === 1 && modalities[0] === value) return;
        const nextModalities = [value];
        const wasDelivery = deliveryOffered;
        const isDelivery = value === "delivery";
        const becomingDelivery = isDelivery && !wasDelivery;
        const removingDelivery = !isDelivery && wasDelivery;
        const nextCoordinations = isDelivery
            ? (coordinations.length > 0 ? coordinations : ["seller-assigned"])
            : [];
        onChange({ modalities: nextModalities, coordinations: nextCoordinations, handoffPoints });
        if (becomingDelivery) onDeliveryAdded();
        if (removingDelivery) onDeliveryRemoved();
    }

    function selectCoordination(value: string) {
        if (coordinations.length === 1 && coordinations[0] === value) return;
        onChange({ modalities, coordinations: [value], handoffPoints });
    }

    function selectHandoffPoint(value: string) {
        if (handoffPoints.length === 1 && handoffPoints[0] === value) return;
        onChange({ modalities, coordinations, handoffPoints: [value] });
    }

    function clearHandoffPoint() {
        if (handoffPoints.length === 0) return;
        onChange({ modalities, coordinations, handoffPoints: [] });
    }

    function selectProximityBand(value: string) {
        if (proximityBands.length === 1 && proximityBands[0] === value) return;
        onProximityChange([value]);
    }

    function clearProximityBand() {
        if (proximityBands.length === 0) return;
        onProximityChange([]);
    }

    return (
        <div className="space-y-5">
            <RadioGroup
                label="Modality"
                options={MODALITY_OPTIONS}
                selected={modalities[0]}
                onSelect={selectModality}
                testIdPrefix="drawer-fulfilment-modality"
            />

            <RadioGroup
                label="Courier coordination"
                hint={deliveryOffered ? undefined : "Pick Delivery to enable."}
                options={COORDINATION_OPTIONS}
                selected={coordinations[0]}
                onSelect={selectCoordination}
                disabled={!deliveryOffered}
                testIdPrefix="drawer-fulfilment-coordination"
            />

            <RadioGroup
                label="Handoff point"
                options={HANDOFF_POINT_OPTIONS}
                selected={handoffPoints[0]}
                onSelect={selectHandoffPoint}
                onClear={clearHandoffPoint}
                testIdPrefix="drawer-fulfilment-handoff"
            />

            <RadioGroup
                label="Proximity verification"
                hint={hasPhysicalModality ? undefined : "Pick a physical modality to enable."}
                options={PROXIMITY_BAND_OPTIONS}
                selected={proximityBands[0]}
                onSelect={selectProximityBand}
                onClear={clearProximityBand}
                disabled={!hasPhysicalModality}
                testIdPrefix="drawer-proximity-band"
            />

            {deliveryOffered && (
                <p
                    className="text-[11px] text-neutral-500"
                    data-testid="drawer-fulfilment-courier-hint"
                >
                    {hasChildren
                        ? "Courier sub-order on the canvas."
                        : "Courier sub-order added to the canvas."}
                </p>
            )}
        </div>
    );
}

/**
 * Single-select radio group. When `onClear` is supplied, a small "Clear"
 * affordance appears in the header whenever a value is selected — that's
 * the only path back to "no selection" since HTML radios don't deselect
 * on second click. Sections that are mandatory-when-applicable (modality,
 * coordination) omit `onClear`; optional sections (handoff, proximity)
 * supply it.
 */
function RadioGroup({
    label,
    hint,
    options,
    selected,
    onSelect,
    onClear,
    disabled = false,
    testIdPrefix,
}: {
    label: string;
    hint?: string;
    options: ReadonlyArray<{ value: string; label: string }>;
    selected: string | undefined;
    onSelect: (value: string) => void;
    onClear?: () => void;
    disabled?: boolean;
    testIdPrefix: string;
}) {
    const hintId = useId();
    const showClear = !!onClear && !disabled && selected !== undefined;
    return (
        <div data-testid={`${testIdPrefix}-group`}>
            <div className="flex items-baseline gap-2 mb-1">
                <span className="text-[11px] text-neutral-500">{label}</span>
                {hint && (
                    <span id={hintId} className="text-[10px] text-neutral-400 italic">
                        {hint}
                    </span>
                )}
                {showClear && (
                    <button
                        type="button"
                        onClick={() => onClear!()}
                        className="ml-auto text-[10px] text-neutral-400 hover:text-neutral-700 underline"
                        data-testid={`${testIdPrefix}-clear`}
                    >
                        Clear
                    </button>
                )}
            </div>
            <div className="space-y-1">
                {options.map((opt) => (
                    <label
                        key={opt.value}
                        className={`flex items-center gap-2 text-xs ${disabled ? "text-neutral-400 cursor-not-allowed" : "text-neutral-700 cursor-pointer"}`}
                    >
                        <input
                            type="radio"
                            name={testIdPrefix}
                            checked={selected === opt.value}
                            onChange={() => !disabled && onSelect(opt.value)}
                            disabled={disabled}
                            aria-describedby={hint ? hintId : undefined}
                            data-testid={`${testIdPrefix}-${opt.value}`}
                            className="accent-accent disabled:opacity-100"
                        />
                        <span>{opt.label}</span>
                    </label>
                ))}
            </div>
        </div>
    );
}

function CheckboxGroup({
    label,
    hint,
    options,
    checked,
    onToggle,
    disabled = false,
    testIdPrefix,
}: {
    label: string;
    hint?: string;
    options: ReadonlyArray<{ value: string; label: string }>;
    checked: string[];
    onToggle: (value: string) => void;
    disabled?: boolean;
    testIdPrefix: string;
}) {
    const hintId = useId();
    return (
        <div data-testid={`${testIdPrefix}-group`}>
            <div className="flex items-baseline gap-2 mb-1">
                <span className="text-[11px] text-neutral-500">{label}</span>
                {hint && (
                    <span id={hintId} className="text-[10px] text-neutral-400 italic">
                        {hint}
                    </span>
                )}
            </div>
            <div className="space-y-1">
                {options.map((opt) => (
                    <label
                        key={opt.value}
                        className={`flex items-center gap-2 text-xs ${disabled ? "text-neutral-400 cursor-not-allowed" : "text-neutral-700 cursor-pointer"}`}
                    >
                        <input
                            type="checkbox"
                            checked={checked.includes(opt.value)}
                            onChange={() => !disabled && onToggle(opt.value)}
                            disabled={disabled}
                            aria-describedby={hint ? hintId : undefined}
                            data-testid={`${testIdPrefix}-${opt.value}`}
                            className="accent-accent disabled:opacity-100"
                        />
                        <span>{opt.label}</span>
                    </label>
                ))}
            </div>
        </div>
    );
}

/**
 * Emissions article — multi-select across the GHG accounting standards.
 * Each checked standard produces an independent disclosure clause in the
 * agreement (one section per standard, scope defaults to 1).
 *
 * Carbon-offset retirement is process-level (off-protocol via aggregator
 * contracts), not order-level. The buyer retires offsets from the
 * pre-resolve panel on the process page, sized to the aggregated
 * `totalActualGrams` across all measurement attestations in the process.
 * No offset selection lives in this drawer.
 */
function EmissionsArticle({
    checked,
    onChange,
}: {
    checked: string[];
    onChange: (next: string[]) => void;
}) {
    const standardOptions = GHG_DISCLOSURE_SCHEMA_KEYS.map((schemaId) => ({
        value: schemaId,
        label: getSchemaInfo(schemaId)?.title ?? schemaId,
    }));
    return (
        <div className="space-y-5">
            <CheckboxGroup
                label="Emission disclosures"
                options={standardOptions}
                checked={checked}
                onToggle={(value) => onChange(toggleInList(checked, value))}
                testIdPrefix="drawer-emissions-standard"
            />
        </div>
    );
}

// Derived from the canonical KLEROS_COURTS catalogue (lib/dispute) so the
// designer's subcourt picker cannot drift from the /dispute court list.
const KLEROS_COURT_OPTIONS: ReadonlyArray<{ value: string; label: string }> =
    KLEROS_COURTS.map((court) => ({ value: court.key, label: court.name }));

/**
 * Jurisdiction article — three layers of dispute resolution.
 *
 *   Layer 1: Kernel mechanisms (asymmetric bonding + buyer dominance).
 *            Always active; not encoded in the agreement. Informational only.
 *
 *   Layer 2: Kleros — decentralized off-chain arbitration. On by default.
 *            Encoded via the `klerosCourt` + `klerosMinJurors` schema fields.
 *
 *   Layer 3: State / ADR / traditional jurisdiction. Optional, on top of
 *            layers 1 + 2. Encoded via `applicableLaw` + `forum` + `language`.
 */
function JurisdictionArticle({
    klerosCourt,
    klerosMinJurors,
    applicableLaw,
    forum,
    language,
    klerosOptedIn,
    onKlerosCourtChange,
    onKlerosMinJurorsChange,
    onTraditionalFieldChange,
    onClearTraditional,
}: {
    klerosCourt: string;
    klerosMinJurors: string;
    applicableLaw: string;
    forum: string;
    language: string;
    klerosOptedIn: boolean;
    onKlerosCourtChange: (value: string) => void;
    onKlerosMinJurorsChange: (value: string) => void;
    onTraditionalFieldChange: (key: "applicableLaw" | "forum" | "language", value: string) => void;
    onClearTraditional: () => void;
}) {
    // Toggle reflects intent. Initialized from any persisted field value
    // so that reopening a node with state/ADR already filled keeps the
    // toggle in the right state.
    const hasPersistedTraditional = applicableLaw !== "" || forum !== "" || language !== "";
    const [stateAdrOpen, setStateAdrOpen] = useState(hasPersistedTraditional);
    useEffect(() => {
        if (hasPersistedTraditional) setStateAdrOpen(true);
    }, [hasPersistedTraditional]);
    return (
        <div className="space-y-5">
            <div data-testid="drawer-jurisdiction-layer1">
                <p className="text-[11px] text-neutral-500 mb-1">Bonded settlement</p>
                <p className="text-xs text-neutral-700 leading-relaxed">
                    Always active. Cooperation is the dominant strategy under
                    asymmetric bonding and buyer dominance — the protocol&apos;s
                    primary jurisdictional layer.
                </p>
            </div>

            <div data-testid="drawer-jurisdiction-layer2">
                <label className="flex items-center gap-2 text-xs text-neutral-700 cursor-pointer mb-2">
                    <input
                        type="checkbox"
                        checked={klerosOptedIn}
                        onChange={(e) => onKlerosCourtChange(e.target.checked ? "general" : "")}
                        data-testid="drawer-jurisdiction-kleros-toggle"
                        className="accent-accent disabled:opacity-100"
                    />
                    <span className="font-medium">Kleros — off-chain arbitration</span>
                </label>
                {klerosOptedIn && (
                    <div className="ml-6 space-y-2">
                        <div>
                            <label className="block text-[11px] text-neutral-500 mb-1">Subcourt</label>
                            <select
                                value={klerosCourt}
                                onChange={(e) => onKlerosCourtChange(e.target.value)}
                                data-testid="drawer-jurisdiction-kleros-court"
                                className="text-xs border border-neutral-300 rounded px-2 py-1.5 min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 w-full bg-white"
                            >
                                {KLEROS_COURT_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[11px] text-neutral-500 mb-1">Minimum jurors</label>
                            <input
                                type="number"
                                min={1}
                                max={99}
                                value={klerosMinJurors}
                                onChange={(e) => onKlerosMinJurorsChange(e.target.value)}
                                data-testid="drawer-jurisdiction-kleros-min-jurors"
                                className="text-xs border border-neutral-300 rounded px-2 py-1.5 min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 w-20 bg-white"
                            />
                        </div>
                    </div>
                )}
            </div>

            <div data-testid="drawer-jurisdiction-layer3">
                <label className="flex items-center gap-2 text-xs text-neutral-700 cursor-pointer mb-2">
                    <input
                        type="checkbox"
                        checked={stateAdrOpen}
                        onChange={(e) => {
                            if (e.target.checked) {
                                setStateAdrOpen(true);
                            } else {
                                setStateAdrOpen(false);
                                onClearTraditional();
                            }
                        }}
                        data-testid="drawer-jurisdiction-traditional-toggle"
                        className="accent-accent disabled:opacity-100"
                    />
                    <span className="font-medium">State / ADR jurisdiction</span>
                </label>
                {stateAdrOpen && (
                    <div className="ml-6 space-y-2">
                        <div>
                            <label className="block text-[11px] text-neutral-500 mb-1">Applicable law</label>
                            <input
                                type="text"
                                placeholder="US-CA · EU · INTL · Sharia"
                                maxLength={16}
                                value={applicableLaw}
                                onChange={(e) => onTraditionalFieldChange("applicableLaw", e.target.value)}
                                data-testid="drawer-jurisdiction-applicable-law"
                                className="text-xs border border-neutral-300 rounded px-2 py-1.5 min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 w-full bg-white"
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] text-neutral-500 mb-1">Forum</label>
                            <input
                                type="text"
                                placeholder="JAMS-arbitration · AAA-arbitration · ICC-arbitration"
                                maxLength={64}
                                value={forum}
                                onChange={(e) => onTraditionalFieldChange("forum", e.target.value)}
                                data-testid="drawer-jurisdiction-forum"
                                className="text-xs border border-neutral-300 rounded px-2 py-1.5 min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 w-full bg-white"
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] text-neutral-500 mb-1">Language</label>
                            <input
                                type="text"
                                placeholder="en · fr · zh · ar"
                                maxLength={16}
                                value={language}
                                onChange={(e) => onTraditionalFieldChange("language", e.target.value)}
                                data-testid="drawer-jurisdiction-language"
                                className="text-xs border border-neutral-300 rounded px-2 py-1.5 min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 w-32 bg-white"
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * Consent article — multi-document list. Each row carries a (title,
 * version, hash) tuple. Empty rows are silently dropped by
 * `buildOrderAgreement`; the on-chain validator enforces non-empty hash
 * + 1-32 char version + 1-200 char title per row. The drawer offers free
 * editing without inline validation (the validator is authoritative).
 */
function ConsentArticle({
    documents,
    onAdd,
    onUpdate,
    onRemove,
}: {
    documents: Array<Record<string, string>>;
    onAdd: () => void;
    onUpdate: (index: number, key: string, value: string) => void;
    onRemove: (index: number) => void;
}) {
    return (
        <div className="space-y-4">
            <p className="text-[11px] text-neutral-500">
                Off-chain documents this agreement binds to (ToS, NDA, privacy
                policy, custom terms). Each document is referenced by its
                keccak256 hash.
            </p>
            {documents.length === 0 && (
                <p className="text-xs text-neutral-500" data-testid="drawer-consent-empty">
                    No documents bound.
                </p>
            )}
            {documents.map((doc, i) => (
                <div
                    key={i}
                    className="border border-neutral-200 rounded p-3 space-y-2"
                    data-testid={`drawer-consent-row-${i}`}
                >
                    <div className="flex items-baseline justify-between">
                        <span className="text-[11px] text-neutral-500">Document {i + 1}</span>
                        <button
                            type="button"
                            onClick={() => onRemove(i)}
                            className="text-[11px] text-red-600 hover:text-red-800"
                            data-testid={`drawer-consent-remove-${i}`}
                        >
                            Remove
                        </button>
                    </div>
                    <div>
                        <label className="block text-[11px] text-neutral-500 mb-1">Title</label>
                        <input
                            type="text"
                            placeholder="Terms of Service · Privacy Policy · NDA"
                            maxLength={200}
                            value={doc.documentTitle ?? ""}
                            onChange={(e) => onUpdate(i, "documentTitle", e.target.value)}
                            data-testid={`drawer-consent-title-${i}`}
                            className="text-xs border border-neutral-300 rounded px-2 py-1.5 min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 w-full bg-white"
                        />
                    </div>
                    <div>
                        <label className="block text-[11px] text-neutral-500 mb-1">Version</label>
                        <input
                            type="text"
                            placeholder="1.0.0 · 2025-04-29"
                            maxLength={32}
                            value={doc.documentVersion ?? ""}
                            onChange={(e) => onUpdate(i, "documentVersion", e.target.value)}
                            data-testid={`drawer-consent-version-${i}`}
                            className="text-xs border border-neutral-300 rounded px-2 py-1.5 min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 w-40 bg-white"
                        />
                    </div>
                    <div>
                        <label className="block text-[11px] text-neutral-500 mb-1">
                            Hash (keccak256, 0x… 64-char hex)
                        </label>
                        <input
                            type="text"
                            placeholder="0x…"
                            maxLength={66}
                            value={doc.documentHash ?? ""}
                            onChange={(e) => onUpdate(i, "documentHash", e.target.value)}
                            data-testid={`drawer-consent-hash-${i}`}
                            className="text-xs font-mono border border-neutral-300 rounded px-2 py-1.5 min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 w-full bg-white"
                        />
                    </div>
                </div>
            ))}
            <button
                type="button"
                onClick={onAdd}
                data-testid="drawer-consent-add"
                className="text-xs px-3 py-1.5 rounded border border-neutral-300 hover:border-neutral-500 bg-white text-neutral-700"
            >
                + Add document
            </button>
        </div>
    );
}
