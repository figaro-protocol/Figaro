"use client";

/**
 * AgreementDrawer — right-side panel for editing a single order's
 * baseline-graph clauses.
 *
 * Surfaces the six designer-time baseline graphs as focused panels:
 *   - Geo (figaro-geo-v1)
 *   - GHG disclosure (figaro-ghg-iso-14064-v1)
 *   - Handoff (figaro-handoff-v1)
 *   - Proximity (figaro-proximity-policy-v1) — band committed at agreement time;
 *     the runtime witness payload travels in figaro-proximity-proof-v1
 *   - Jurisdiction (figaro-jurisdiction-v1) — off-chain forum + applicable law
 *   - Topology (read-only, derived from the DAG)
 *
 * The seventh baseline (capital flow / payment) is NOT exposed here —
 * commerce (payment + currency) is a buyer-at-commit-time choice, not a
 * designer-time clause.
 *
 * NOT exposed here: Commerce (payment + currency). Those are buyer-at-
 * commit-time choices, not designer-time clauses.
 *
 * Every change rebuilds the agreement, recomputes its hash, and persists
 * via syntheticProcess.editSyntheticAgreement. The page reflects the
 * updated agreementHash + lens content in the canvas.
 */

import { useEffect, useRef, useState } from "react";
import type { Order } from "@/lib/core/store";
import type { ManifestFields } from "@/lib/core/encoding";
import {
    deriveFormationMechanism,
    FORMATION_MECHANISM_LABELS,
    readAgreementFields,
    type AgreementEdits,
} from "@/lib/designer/syntheticProcess";
import { loadAgreement } from "@/lib/core/agreementStore";
import { summarizeAgreement } from "@/lib/core/orderAgreement";

const GHG_STANDARDS = ["", "ISO-14064", "GHG-Protocol", "PAS-2050", "Custom"] as const;
const GHG_SCOPES = ["", "1", "2", "3"] as const;
const HANDOFF_MODES = ["", "face-to-face", "dead-drop", "parking-area", "locker", "courier-relay"] as const;
const PROXIMITY_BANDS = ["", "none", "zone-wifi", "nearby-ble", "contact-nfc"] as const;

/** Top offset to stay below the global sticky Header band. */
const HEADER_OFFSET_PX = 80;

type SectionKey = "geo" | "ghg" | "handoff" | "proximity" | "jurisdiction" | "topology";

const SECTION_LABELS: Record<SectionKey, string> = {
    geo: "Geo",
    ghg: "GHG",
    handoff: "Handoff",
    proximity: "Proximity",
    jurisdiction: "Jurisdiction",
    topology: "Topology",
};

const SECTION_SCHEMA_IDS: Record<SectionKey, string> = {
    geo: "figaro-geo-v1",
    ghg: "figaro-ghg-iso-14064-v1",
    handoff: "figaro-handoff-v1",
    proximity: "figaro-proximity-policy-v1",
    jurisdiction: "figaro-jurisdiction-v1",
    topology: "figaro-topology-v1",
};

interface Props {
    order: Order;
    onClose: () => void;
    onChange: (edits: AgreementEdits) => void;
    /** Optional — when provided, the drawer renders a Delete button. */
    onDelete?: (orderId: string) => void;
}

export function AgreementDrawer({ order, onClose, onChange, onDelete }: Props) {
    const [fields, setFields] = useState<ManifestFields>(() => readAgreementFields(order));
    /**
     * Single-select pills: at most one section open at a time. Clicking a
     * different pill flips to that section; clicking the active pill closes
     * it (no section visible).
     */
    const [openSection, setOpenSection] = useState<SectionKey | null>(null);

    useEffect(() => {
        setFields(readAgreementFields(order));
    }, [order.id, order.agreementHash]);

    const mechanism = deriveFormationMechanism(order);
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

    return (
        <aside
            data-testid="agreement-drawer"
            style={{ top: HEADER_OFFSET_PX, height: `calc(100vh - ${HEADER_OFFSET_PX}px)` }}
            className="fixed right-0 w-[380px] bg-white border-l border-t border-neutral-200 shadow-xl z-30 overflow-hidden flex flex-col rounded-tl-lg"
        >
            {/* Header bar with prominent close */}
            <div className="px-5 py-3 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                        Modify agreement
                    </p>
                    <p className="text-sm font-semibold text-black mt-0.5 truncate">
                        Order #{order.id.slice(0, 10)}…
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close drawer"
                    data-testid="drawer-close"
                    className="shrink-0 rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
                >
                    Close ✕
                </button>
            </div>

            {/* Per-category toggle row — pills are the canonical control */}
            <div className="px-5 py-2 border-b border-neutral-200 bg-white flex items-center gap-1.5 overflow-x-auto">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500 mr-1 shrink-0">
                    Modify:
                </span>
                {(Object.keys(SECTION_LABELS) as SectionKey[]).map((key) => {
                    const isOpen = openSection === key;
                    return (
                        <button
                            key={key}
                            type="button"
                            onClick={() => selectSection(key)}
                            data-testid={`drawer-toggle-${key}`}
                            aria-pressed={isOpen}
                            className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border transition-colors ${
                                isOpen
                                    ? "bg-gray-700 text-white border-gray-700"
                                    : "bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-100"
                            }`}
                        >
                            {SECTION_LABELS[key]}
                        </button>
                    );
                })}
            </div>

            {/* Body — scrollable, sections rendered only when their pill is on */}
            <div className="flex-1 overflow-y-auto px-5 py-4 text-sm">
                <p className="text-[11px] text-neutral-500 mb-3">
                    agreementHash recomputes live as you edit. Mechanism is{" "}
                    <span className="font-semibold text-neutral-700">{FORMATION_MECHANISM_LABELS[mechanism]}</span>{" "}
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
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500 mb-3">
                            Geo · <span className="font-mono normal-case text-neutral-400">{SECTION_SCHEMA_IDS.geo}</span>
                        </p>
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

                {openSection === "ghg" && (
                    <section data-testid="drawer-section-ghg" className="mb-5 pt-2 border-t border-neutral-100">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500 mb-3">
                            GHG · <span className="font-mono normal-case text-neutral-400">{SECTION_SCHEMA_IDS.ghg}</span>
                        </p>
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
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500 mb-3">
                            Handoff · <span className="font-mono normal-case text-neutral-400">{SECTION_SCHEMA_IDS.handoff}</span>
                        </p>
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
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500 mb-3">
                            Proximity · <span className="font-mono normal-case text-neutral-400">{SECTION_SCHEMA_IDS.proximity}</span>
                        </p>
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
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500 mb-3">
                            Jurisdiction · <span className="font-mono normal-case text-neutral-400">{SECTION_SCHEMA_IDS.jurisdiction}</span>
                        </p>
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

                {openSection === "topology" && (
                    <section data-testid="drawer-section-topology" className="mb-5 pt-2 border-t border-neutral-100">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500 mb-3">
                            Topology · <span className="font-mono normal-case text-neutral-400">{SECTION_SCHEMA_IDS.topology}</span>
                        </p>
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
