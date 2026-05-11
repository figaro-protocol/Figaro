"use client";

/**
 * AgreementDrawer — right-side panel for editing a single order's
 * baseline-graph clauses.
 *
 * Surfaces designer-time baseline graphs as focused panels:
 *   - Geo (figaro-geo-v1)
 *   - GHG disclosure (figaro-ghg-iso-14064-v1)
 *   - Handoff (figaro-handoff-v1)
 *   - Proximity (figaro-proximity-policy-v1) — band committed at agreement time;
 *     the runtime witness payload travels in figaro-proximity-proof-v1
 *   - Jurisdiction (figaro-jurisdiction-v1) — off-chain forum + applicable law
 *   - Consent (figaro-consent-v1) — cryptographic consent to an off-chain
 *     legal document (hash + version + title); reusable on any assembly
 *     that needs participant consent (beta enrolment, ToS, NDA, governance)
 *   - Topology (read-only, derived from the DAG)
 *
 * NOT exposed here: Commerce (payment + currency) — buyer-at-commit-time
 * choice — and Fulfilment — set via edge pills on the canvas.
 *
 * Every change rebuilds the agreement, recomputes its hash, and persists
 * via syntheticProcess.editSyntheticAgreement.
 *
 * Rendering modes:
 *   - `embedded` (default false): legacy fixed-overlay positioning used by
 *     /edit. Drawer floats at viewport right with its own shadow/rounding.
 *   - `embedded: true`: inline flex-column block. The page handles
 *     positioning. Used by /new where the drawer is part of the layout.
 *
 * Drives section organization from the canonical taxonomy in
 * `@/lib/shared/schemaCategories` + the shared clause-status helpers in
 * `@/lib/shared/clauseSectionStatus`. Adding a new designer-time schema in
 * an existing category auto-appears in the section picker.
 */

import { useEffect, useState } from "react";
import type { Order } from "@/lib/core/store";
import type { ManifestFields } from "@/lib/core/encoding";
import {
    deriveFulfilmentMethod,
    FULFILMENT_METHOD_LABELS,
    readAgreementFields,
    type AgreementEdits,
} from "@/lib/designer/syntheticProcess";
import { loadAgreement } from "@/lib/core/agreementStore";
import { summarizeAgreement } from "@/lib/core/orderAgreement";
import {
    GHG_DISCLOSURE_SCHEMA_KEYS,
    GHG_SCHEMA_KEY,
    GHG_SCHEMA_TO_STANDARD,
    GHG_STANDARD_TO_SCHEMA,
} from "@/lib/core/agreementManifest";
import {
    CATEGORY_LABELS,
    DESIGNER_SCHEMAS_BY_CATEGORY,
    type SchemaCategory,
} from "@/lib/shared/schemaCategories";
import {
    CLAUSE_CATEGORIES,
    SECTION_FIELDS,
    sectionStatus,
} from "@/lib/shared/clauseSectionStatus";

const GHG_SCOPES = ["", "1", "2", "3"] as const;
const HANDOFF_MODES = ["", "face-to-face", "dead-drop", "parking-area", "locker", "courier-relay"] as const;
const PROXIMITY_BANDS = ["", "none", "zone-wifi", "nearby-ble", "contact-nfc"] as const;

type SectionKey = SchemaCategory;

/**
 * Per-section schema candidates — a section topic (the pill in the drawer)
 * can be served by N different schemaIds, derived from the canonical
 * taxonomy. The drawer picks the active one from manifest fields; the
 * section header displays it live.
 *
 * `emissions` is the canonical multi-candidate case: 5 sister schemas, one
 * per accounting standard, sharing the `(uint8 scope)` content shape.
 * Adding a v2 of an existing schema (`figaro-geo-v2` etc.) only requires
 * landing the lockstep + adding to `SCHEMA_TIER_MAP`; this picker
 * auto-includes it. A version selector field + per-section Select must
 * still be added by hand when v2 introduces new fields.
 */
interface SectionSchemaOption {
    schemaId: string;
    label: string;
    description?: string;
}

function labelForSchema(category: SchemaCategory, schemaId: string): string {
    if (category === "emissions") {
        const standard = GHG_SCHEMA_TO_STANDARD[schemaId as keyof typeof GHG_SCHEMA_TO_STANDARD];
        return standard ?? schemaId;
    }
    const versionMatch = schemaId.match(/-v(\d+)$/);
    return versionMatch ? `v${versionMatch[1]}` : schemaId;
}

const SECTION_SCHEMA_OPTIONS: Record<SchemaCategory, readonly SectionSchemaOption[]> =
    (function buildSectionOptions() {
        const result = {} as Record<SchemaCategory, readonly SectionSchemaOption[]>;
        for (const cat of CLAUSE_CATEGORIES) {
            // Preserve GHG's hand-curated ordering (by standard name) over
            // the alphabetic order DESIGNER_SCHEMAS_BY_CATEGORY produces.
            const schemaIds = cat === "emissions"
                ? GHG_DISCLOSURE_SCHEMA_KEYS
                : DESIGNER_SCHEMAS_BY_CATEGORY[cat];
            result[cat] = schemaIds.map((schemaId) => ({
                schemaId,
                label: labelForSchema(cat, schemaId),
            }));
        }
        return result;
    })();

function resolveActiveSchemaId(section: SchemaCategory, fields: ManifestFields): string {
    if (section === "emissions") {
        const standard = (fields.ghgStandard as string | undefined)?.trim();
        if (standard && GHG_STANDARD_TO_SCHEMA[standard]) {
            return GHG_STANDARD_TO_SCHEMA[standard];
        }
        return GHG_SCHEMA_KEY;
    }
    const options = SECTION_SCHEMA_OPTIONS[section];
    return options[0]?.schemaId ?? "";
}

const GHG_STANDARDS: readonly string[] = ["", ...SECTION_SCHEMA_OPTIONS.emissions.map((opt) => opt.label)];

/**
 * Unified header rendered at the top of every section. Shows category label
 * + active schemaId, plus an optional `Clear` button (omitted for read-only
 * sections like topology).
 */
function SectionHeader({
    category,
    fields,
    onClear,
}: {
    category: SchemaCategory;
    fields: ManifestFields;
    onClear?: () => void;
}) {
    return (
        <div className="flex items-baseline justify-between mb-3 gap-3">
            <p className="text-sm font-semibold text-ink-heading">
                {CATEGORY_LABELS[category]}
                {" · "}
                <span
                    className="font-mono normal-case text-neutral-400"
                    data-testid={`drawer-section-${category}-active-schema`}
                >
                    {resolveActiveSchemaId(category, fields)}
                </span>
            </p>
            {onClear && (
                <button
                    type="button"
                    onClick={onClear}
                    data-testid={`drawer-clear-${category}`}
                    className="text-[10px] text-neutral-500 hover:text-red-600 underline shrink-0"
                >
                    Clear
                </button>
            )}
        </div>
    );
}

interface Props {
    /** Currently-selected order. May be null in `embedded` mode (renders an
        empty state). Required in legacy fixed-overlay mode (caller gates on
        selection). */
    order: Order | null;
    onClose: () => void;
    onChange: (edits: AgreementEdits) => void;
    /** Optional — when provided, the drawer renders a Delete button. */
    onDelete?: (orderId: string) => void;
    /** When true, render as an inline flex-column block (no fixed
        positioning, no shadow, no top/height calc). The page layout becomes
        responsible for placing the drawer. Default false preserves the
        legacy fixed-overlay behavior. */
    embedded?: boolean;
}

export function AgreementDrawer({ order, onClose, onChange, onDelete, embedded = false }: Props) {
    const [fields, setFields] = useState<ManifestFields>(() =>
        order ? readAgreementFields(order) : ({} as ManifestFields),
    );
    /**
     * Single-select pills: at most one section open at a time. Clicking a
     * different pill flips to that section; clicking the active pill closes
     * it (no section visible).
     */
    const [openSection, setOpenSection] = useState<SectionKey | null>(null);
    /**
     * Minimize-to-rail: collapses the drawer to a narrow vertical strip
     * showing one status dot per category. Clicking a dot expands the
     * drawer back to full width and opens that section.
     */
    const [minimized, setMinimized] = useState(false);

    /**
     * Measure the (app) Header's actual height so the drawer's top edge
     * anchors below it. Only used in legacy fixed-overlay mode; embedded
     * mode lets the parent page handle positioning.
     */
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

    // Empty state — only valid in embedded mode (legacy callers gate on
    // selection and pass a non-null order).
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
                    Click any node on the canvas to set its baseline-graph
                    clauses — geo, GHG, handoff, proximity, jurisdiction,
                    consent.
                </p>
            </aside>
        );
    }

    const fulfilmentMethod = deriveFulfilmentMethod(order);
    const summary = summarizeAgreement(loadAgreement(order.agreementHash));
    const topology = summary?.topology;

    function applyManifest(next: ManifestFields) {
        setFields(next);
        onChange({ manifestFields: next });
    }

    function patch<K extends keyof ManifestFields>(key: K, value: ManifestFields[K] | undefined) {
        const next: ManifestFields = { ...fields };
        if (value === undefined || value === "") {
            delete next[key as string];
            if (key === "origin") next.origin = "—";
        } else {
            (next as Record<string, string | undefined>)[key as string] = value as string | undefined;
        }
        applyManifest(next);
    }

    function selectSection(section: SectionKey) {
        setOpenSection((prev) => (prev === section ? null : section));
    }

    function clearSection(category: SchemaCategory) {
        const next: ManifestFields = { ...fields };
        for (const key of SECTION_FIELDS[category]) {
            delete (next as Record<string, unknown>)[key];
        }
        if (SECTION_FIELDS[category].includes("origin")) {
            next.origin = "—";
        }
        applyManifest(next);
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
                    {CLAUSE_CATEGORIES.map((key) => {
                        const status = sectionStatus(key, fields);
                        return (
                            <button
                                key={key}
                                type="button"
                                onClick={() => { setMinimized(false); setOpenSection(key); }}
                                title={`${CATEGORY_LABELS[key]} — ${status}`}
                                data-testid={`drawer-rail-${key}`}
                                data-status={status}
                                className="w-8 h-8 rounded-full border border-neutral-300 hover:border-neutral-700 bg-white flex items-center justify-center"
                            >
                                <span className={`w-3 h-3 rounded-full ${
                                    status === "empty" ? "bg-neutral-200" :
                                    status === "partial" ? "bg-amber-500" :
                                    "bg-emerald-500"
                                }`} />
                            </button>
                        );
                    })}
                </div>
            )}
            {!minimized && (<>
            {/* Header bar with prominent close */}
            <div className="px-5 py-3 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs font-semibold text-neutral-500">
                        Modify agreement
                    </p>
                    <p className="text-sm font-semibold text-black mt-0.5 truncate">
                        Order #{order.id.slice(0, 10)}…
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        type="button"
                        onClick={() => setMinimized(true)}
                        aria-label="Minimize drawer"
                        data-testid="drawer-minimize"
                        title="Minimize to rail"
                        className="rounded border border-neutral-300 bg-white px-2 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
                    >
                        ›
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close drawer"
                        data-testid="drawer-close"
                        className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
                    >
                        Close ✕
                    </button>
                </div>
            </div>

            {/* Per-category toggle row — pills are the canonical control. Wraps
                to multiple lines on narrow widths rather than horizontal scroll
                so no pill is hidden behind the right edge. */}
            <div className="px-5 py-2 border-b border-neutral-200 bg-white flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-semibold text-neutral-500 mr-1 shrink-0">
                    Modify:
                </span>
                {CLAUSE_CATEGORIES.map((key) => {
                    const isOpen = openSection === key;
                    const status = sectionStatus(key, fields);
                    return (
                        <button
                            key={key}
                            type="button"
                            onClick={() => selectSection(key)}
                            data-testid={`drawer-toggle-${key}`}
                            data-status={status}
                            aria-pressed={isOpen}
                            className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border transition-colors ${
                                isOpen
                                    ? "bg-gray-700 text-white border-gray-700"
                                    : "bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-100"
                            }`}
                        >
                            {status !== "empty" && (
                                <span
                                    aria-label={status}
                                    className={`inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle ${
                                        status === "complete"
                                            ? "bg-emerald-500"
                                            : "bg-amber-500"
                                    }`}
                                />
                            )}
                            {CATEGORY_LABELS[key]}
                        </button>
                    );
                })}
            </div>

            {/* Body — scrollable, sections rendered only when their pill is on */}
            <div className="flex-1 overflow-y-auto px-5 py-4 text-sm">
                <p className="text-[11px] text-neutral-500 mb-3">
                    agreementHash recomputes live as you edit. Fulfilment method is{" "}
                    <span className="font-semibold text-neutral-700">{FULFILMENT_METHOD_LABELS[fulfilmentMethod]}</span>{" "}
                    (change via the edge pill on the canvas).
                </p>
                <p className="font-mono text-[10px] text-neutral-500 break-all mb-5" data-testid="drawer-agreement-hash">
                    {order.agreementHash}
                </p>

                {openSection === null && (
                    <p className="text-xs text-neutral-500 italic" data-testid="drawer-empty-hint">
                        Click a Modify pill above to reveal a baseline-graph clause.
                    </p>
                )}

                {openSection === "geo" && (
                    <section data-testid="drawer-section-geo" className="mb-5 pt-2 border-t border-neutral-100">
                        <SectionHeader category="geo" fields={fields} onClear={() => clearSection("geo")} />
                        <div className="space-y-3">
                            <Field
                                label="Origin"
                                description="Geohash or place name."
                                value={fields.origin ?? ""}
                                onChange={(v) => patch("origin", v || "—")}
                                data-testid="drawer-input-origin"
                            />
                            <Field
                                label="Destination"
                                value={fields.destination ?? ""}
                                onChange={(v) => patch("destination", v)}
                                data-testid="drawer-input-destination"
                            />
                            <Field
                                label="Mass"
                                description="e.g. 5 kg"
                                value={(fields.mass as string | undefined) ?? ""}
                                onChange={(v) => patch("mass", v)}
                                data-testid="drawer-input-mass"
                            />
                            <Field
                                label="Volume"
                                description="e.g. 10 L"
                                value={(fields.volume as string | undefined) ?? ""}
                                onChange={(v) => patch("volume", v)}
                                data-testid="drawer-input-volume"
                            />
                            <Field
                                label="Class of service"
                                description="Freight or hazmat class."
                                value={fields.class_ ?? ""}
                                onChange={(v) => patch("class_", v)}
                                data-testid="drawer-input-class"
                            />
                        </div>
                    </section>
                )}

                {openSection === "emissions" && (
                    <section data-testid="drawer-section-emissions" className="mb-5 pt-2 border-t border-neutral-100">
                        <SectionHeader category="emissions" fields={fields} onClear={() => clearSection("emissions")} />
                        <div className="space-y-3">
                            <Select
                                label="Standard"
                                value={fields.ghgStandard ?? ""}
                                options={[...GHG_STANDARDS]}
                                onChange={(v) => patch("ghgStandard", v)}
                                data-testid="drawer-input-ghg-standard"
                            />
                            <Select
                                label="Scope"
                                value={fields.ghgScope ?? ""}
                                options={[...GHG_SCOPES]}
                                onChange={(v) => patch("ghgScope", v)}
                                data-testid="drawer-input-ghg-scope"
                            />
                        </div>
                    </section>
                )}

                {openSection === "handoff" && (
                    <section data-testid="drawer-section-handoff" className="mb-5 pt-2 border-t border-neutral-100">
                        <SectionHeader category="handoff" fields={fields} onClear={() => clearSection("handoff")} />
                        <div className="space-y-3">
                            <Select
                                label="Mode"
                                value={fields.handoffMode ?? ""}
                                options={[...HANDOFF_MODES]}
                                onChange={(v) => patch("handoffMode", v)}
                                data-testid="drawer-input-handoff-mode"
                            />
                            <p className="text-[11px] text-neutral-500">
                                Physical-exchange modality. Every assembly declares one (even
                                <code className="text-neutral-700">consume-onsite</code> implies a face-to-face handoff).
                            </p>
                        </div>
                    </section>
                )}

                {openSection === "proximity" && (
                    <section data-testid="drawer-section-proximity" className="mb-5 pt-2 border-t border-neutral-100">
                        <SectionHeader category="proximity" fields={fields} onClear={() => clearSection("proximity")} />
                        <div className="space-y-3">
                            <Select
                                label="Band (policy)"
                                value={(fields.proximityBand as string | undefined) ?? ""}
                                options={[...PROXIMITY_BANDS]}
                                onChange={(v) => patch("proximityBand" as keyof ManifestFields, v)}
                                data-testid="drawer-input-proximity-band"
                            />
                            <p className="text-[11px] text-neutral-500">
                                Required proximity-verification policy committed at agreement time
                                (sister schema <code className="text-neutral-700">figaro-proximity-policy-v1</code>).
                                <code className="text-neutral-700">none</code> = no proximity proof required.
                                <code className="text-neutral-700">zone-wifi</code> / <code className="text-neutral-700">nearby-ble</code> /
                                <code className="text-neutral-700">contact-nfc</code> = required band at handoff time.
                                The per-handoff nonce + signed witness payload travel at runtime in
                                <code className="text-neutral-700">figaro-proximity-proof-v1</code>; off-chain
                                consumers verify <code>proof.band == policy.band</code>.
                            </p>
                        </div>
                    </section>
                )}

                {openSection === "jurisdiction" && (
                    <section data-testid="drawer-section-jurisdiction" className="mb-5 pt-2 border-t border-neutral-100">
                        <SectionHeader category="jurisdiction" fields={fields} onClear={() => clearSection("jurisdiction")} />
                        <div className="space-y-3">
                            <Field
                                label="Applicable law"
                                description="ISO 3166 code (e.g., US-CA, NL), 'EU', 'INTL', or non-state legal order (Sharia, Kleros, etc.). Required."
                                value={(fields.applicableLaw as string | undefined) ?? ""}
                                onChange={(v) => patch("applicableLaw" as keyof ManifestFields, v)}
                                data-testid="drawer-input-applicableLaw"
                            />
                            <Field
                                label="Forum"
                                description="Adjudication venue, e.g. JAMS-arbitration, kleros, us-federal-court. Optional — empty means courts of competent jurisdiction within applicable law."
                                value={(fields.forum as string | undefined) ?? ""}
                                onChange={(v) => patch("forum" as keyof ManifestFields, v)}
                                data-testid="drawer-input-forum"
                            />
                            <Field
                                label="Language"
                                description="ISO 639 code (e.g. en, fr, zh, ar). Optional — empty means official language of the forum."
                                value={(fields.language as string | undefined) ?? ""}
                                onChange={(v) => patch("language" as keyof ManifestFields, v)}
                                data-testid="drawer-input-language"
                            />
                        </div>
                    </section>
                )}

                {openSection === "consent" && (
                    <section data-testid="drawer-section-consent" className="mb-5 pt-2 border-t border-neutral-100">
                        <SectionHeader category="consent" fields={fields} onClear={() => clearSection("consent")} />
                        <div className="space-y-3">
                            <Field
                                label="Document hash"
                                description="keccak256 of the canonical document text. 32-byte hex (0x…)."
                                value={(fields.documentHash as string | undefined) ?? ""}
                                onChange={(v) => patch("documentHash" as keyof ManifestFields, v)}
                                data-testid="drawer-input-documentHash"
                            />
                            <Field
                                label="Document version"
                                description="Semver-style identifier (≤32 chars), e.g. 1.0.0 or beta-2026-05."
                                value={(fields.documentVersion as string | undefined) ?? ""}
                                onChange={(v) => patch("documentVersion" as keyof ManifestFields, v)}
                                data-testid="drawer-input-documentVersion"
                            />
                            <Field
                                label="Document title"
                                description="Human-readable name (≤200 chars)."
                                value={(fields.documentTitle as string | undefined) ?? ""}
                                onChange={(v) => patch("documentTitle" as keyof ManifestFields, v)}
                                data-testid="drawer-input-documentTitle"
                            />
                            <p className="text-[11px] text-neutral-500">
                                Cryptographic consent to an off-chain legal document. The signed agreement carries a clause under <code className="text-neutral-700">figaro-consent-v1</code>; participants attest by signing the bonded commitment, and the document hash + version + title pin which document was consented to. All three fields are required for the clause to land.
                            </p>
                        </div>
                    </section>
                )}

                {openSection === "topology" && (
                    <section data-testid="drawer-section-topology" className="mb-5 pt-2 border-t border-neutral-100">
                        <SectionHeader category="topology" fields={fields} />
                        <div className="space-y-2 text-xs">
                            <p>
                                <span className="text-neutral-500">Mode: </span>
                                <span className="font-mono text-neutral-700">{topology?.topologyMode ?? "root"}</span>
                            </p>
                            <p className="text-neutral-500">Parents:</p>
                            {topology?.parentOrderHashes && topology.parentOrderHashes.length > 0 ? (
                                <ul className="font-mono text-[10px] text-neutral-600 space-y-1 break-all">
                                    {topology.parentOrderHashes.map((p) => (
                                        <li key={p}>{p}</li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-neutral-400 italic text-[11px]">No parents — this is the root order.</p>
                            )}
                            <p className="text-[10px] text-neutral-400 mt-2">
                                Topology is set by the DAG. Drag from a node onto another to add a parent.
                            </p>
                        </div>
                    </section>
                )}
            </div>
            {onDelete && (
                <div className="px-5 py-3 border-t border-neutral-200 bg-white">
                    <button
                        type="button"
                        onClick={() => onDelete(order.id)}
                        data-testid="drawer-delete-order"
                        className="w-full text-xs px-3 py-2 rounded border border-red-300 bg-white text-red-700 hover:bg-red-50 hover:border-red-500 font-semibold"
                    >
                        Delete this order (and its descendants)
                    </button>
                </div>
            )}
            </>)}
        </aside>
    );
}

interface FieldProps {
    label: string;
    description?: string;
    value: string;
    onChange: (v: string) => void;
    "data-testid"?: string;
}

function Field({ label, description, value, onChange, "data-testid": testId }: FieldProps) {
    return (
        <label className="block">
            <span className="text-xs font-semibold text-neutral-700">{label}</span>
            {description && (
                <span className="block text-[11px] text-neutral-500 leading-relaxed mt-0.5">{description}</span>
            )}
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                data-testid={testId}
                className="mt-1.5 w-full text-xs border border-neutral-300 rounded px-2 py-1.5"
            />
        </label>
    );
}

interface SelectProps {
    label: string;
    value: string;
    options: string[];
    onChange: (v: string) => void;
    "data-testid"?: string;
}

function Select({ label, value, options, onChange, "data-testid": testId }: SelectProps) {
    return (
        <label className="block">
            <span className="text-xs font-semibold text-neutral-700">{label}</span>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                data-testid={testId}
                className="mt-1.5 w-full text-xs border border-neutral-300 rounded px-2 py-1.5 bg-white"
            >
                {options.map((o) => (
                    <option key={o} value={o}>{o === "" ? "— none —" : o}</option>
                ))}
            </select>
        </label>
    );
}
