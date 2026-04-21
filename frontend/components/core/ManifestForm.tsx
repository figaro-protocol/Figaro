"use client";

/**
 * ManifestForm — shared manifest-entry UI for firstOrder and subOrder.
 *
 * Renders the standard manifest fields (origin, destination, mass, volume,
 * class) and exposes agreement-adjacent advanced fields for fulfilment,
 * handoff, and GHG terms. Callers receive the raw ManifestFields object.
 */

import { useState } from "react";
import { ManifestFields, encodeManifestFields } from "@/lib/core/encoding";
import { Input } from "@/components/ui/Input";
import ChevronDown from "@/components/icons/ChevronDown";
import ChevronUp from "@/components/icons/ChevronUp";

export type { ManifestFields };

interface ManifestFormProps {
    /** Controlled fields value. */
    value: ManifestFields;
    /** Called whenever any field changes. */
    onChange: (fields: ManifestFields) => void;
    /** When true, show "Origin is required" validation message. */
    showValidation?: boolean;
}

const FIELD_CLS =
    "mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black";

const FULFILMENT_OPTIONS = [
    { value: "", label: "Select fulfilment" },
    { value: "pickup", label: "Pickup" },
    { value: "deliver", label: "Delivery" },
    { value: "consume-onsite", label: "Consume On-Site" },
] as const;

const AUCTION_OPTIONS = [
    { value: "", label: "No auction" },
    { value: "dutch-auction", label: "Dutch Auction" },
    { value: "fixed-price", label: "Fixed Price" },
] as const;

const HANDOFF_OPTIONS = [
    { value: "", label: "Select handoff" },
    { value: "face-to-face", label: "Face to Face" },
    { value: "dead-drop", label: "Dead Drop" },
    { value: "meet-at-door", label: "Meet at Door" },
    { value: "meet-at-car", label: "Meet at Car" },
    { value: "parking-area", label: "Parking Area" },
] as const;

const GHG_SCOPE_OPTIONS = [
    { value: "", label: "No GHG scope" },
    { value: "1", label: "Scope 1" },
] as const;

function hasExtendedAdvancedValues(value: ManifestFields): boolean {
    return Boolean(
        value.mass
        || value.volume
        || value.class_
        || value.fulfilmentMethod
        || value.fulfillmentMethod
        || value.auctionType
        || value.handoffMode
        || value.ghgStandard
        || value.ghgMethodology
        || value.ghgScope,
    );
}

export function ManifestForm({ value, onChange, showValidation }: ManifestFormProps) {
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [touchedRequiredFields, setTouchedRequiredFields] = useState({ origin: false, destination: false });

    const set = (key: keyof ManifestFields) => (e: React.ChangeEvent<HTMLInputElement>) =>
        onChange({ ...value, [key]: e.target.value });

    const markRequiredTouched = (key: "origin" | "destination") => () => {
        setTouchedRequiredFields((current) => ({ ...current, [key]: true }));
    };

    const setSelect = (key: keyof ManifestFields) => (e: React.ChangeEvent<HTMLSelectElement>) =>
        onChange({ ...value, [key]: e.target.value || undefined });

    const encodedPreview = encodeManifestFields(value);
    // "0x01" is the sentinel for an empty manifest (no text content).
    const isEffectivelyEmpty = encodedPreview === "0x01";
    const showOriginValidation = (showValidation || touchedRequiredFields.origin) && !value.origin?.trim();
    const showDestinationValidation = (showValidation || touchedRequiredFields.destination) && !value.destination?.trim();

    return (
        <div className="flex flex-col gap-3" data-testid="manifest-form">
            {/* ── Required ───────────────────────────────────────────── */}
            <div>
                <label className="text-xs font-medium text-black">
                    Origin <span className="text-red-500">*</span>
                </label>
                <Input
                    data-testid="manifest-input-origin"
                    type="text"
                    placeholder="e.g. warehouse-A, geohash, city name"
                    value={value.origin ?? ""}
                    onChange={set("origin")}
                    onBlur={markRequiredTouched("origin")}
                    className={`mt-1 ${showOriginValidation ? "border-red-500" : ""}`}
                />
                {showOriginValidation && (
                    <p className="text-xs text-red-600 mt-1">Origin is required</p>
                )}
            </div>

            {/* ── Required ──────────────────────────────────────────── */}
            <div>
                <label className="text-xs font-medium text-black">
                    Destination <span className="text-red-500">*</span>
                </label>
                <Input
                    data-testid="manifest-input-destination"
                    type="text"
                    placeholder="e.g. customer-B, geohash, city name"
                    value={value.destination ?? ""}
                    onChange={set("destination")}
                    onBlur={markRequiredTouched("destination")}
                    className={`mt-1 ${showDestinationValidation ? "border-red-500" : ""}`}
                />
                {showDestinationValidation && (
                    <p className="text-xs text-red-600 mt-1">Destination is required</p>
                )}
            </div>

            {/* ── Advanced ───────────────────────────────────────────── */}
            <div>
                <button
                    type="button"
                    data-testid="manifest-toggle-advanced"
                    onClick={() => setAdvancedOpen((o) => !o)}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-black transition-colors"
                >
                    {advancedOpen
                        ? <ChevronUp className="w-3 h-3" />
                        : <ChevronDown className="w-3 h-3" />}
                    Advanced fields
                    {!advancedOpen && hasExtendedAdvancedValues(value) && (
                        <span className="ml-1 text-green-600">(set)</span>
                    )}
                </button>

                {advancedOpen && (
                    <div className="mt-2 space-y-4" data-testid="manifest-advanced-fields">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div>
                                <label className="text-xs font-medium text-black">Mass</label>
                                <input
                                    data-testid="manifest-input-mass"
                                    type="text"
                                    placeholder="e.g. 5 kg"
                                    value={value.mass ?? ""}
                                    onChange={set("mass")}
                                    className={FIELD_CLS}
                                />
                            </div>

                            <div>
                                <label className="text-xs font-medium text-black">Volume</label>
                                <input
                                    data-testid="manifest-input-volume"
                                    type="text"
                                    placeholder="e.g. 10 L"
                                    value={value.volume ?? ""}
                                    onChange={set("volume")}
                                    className={FIELD_CLS}
                                />
                            </div>

                            <div>
                                <label className="text-xs font-medium text-black">Class</label>
                                <input
                                    data-testid="manifest-input-class"
                                    type="text"
                                    placeholder="e.g. Perishables, Hazmat A"
                                    value={value.class_ ?? ""}
                                    onChange={set("class_")}
                                    className={FIELD_CLS}
                                />
                            </div>
                        </div>

                        <div>
                            <p className="text-xs font-medium text-black">Agreement Terms</p>
                            <p className="text-[11px] text-gray-500 mt-1">
                                These fields feed the schema-composed agreement sections used for fulfilment, handoff, and GHG requirements.
                            </p>
                            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div>
                                    <label className="text-xs font-medium text-black">Fulfilment Method</label>
                                    <select
                                        data-testid="manifest-input-fulfilment"
                                        value={value.fulfilmentMethod ?? value.fulfillmentMethod ?? ""}
                                        onChange={setSelect("fulfilmentMethod")}
                                        className={FIELD_CLS}
                                    >
                                        {FULFILMENT_OPTIONS.map((option) => (
                                            <option key={option.value || "blank"} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-xs font-medium text-black">Auction Type</label>
                                    <select
                                        data-testid="manifest-input-auction"
                                        value={value.auctionType ?? value.auctionMechanism ?? ""}
                                        onChange={setSelect("auctionType")}
                                        className={FIELD_CLS}
                                    >
                                        {AUCTION_OPTIONS.map((option) => (
                                            <option key={option.value || "blank"} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-xs font-medium text-black">Handoff Mode</label>
                                    <select
                                        data-testid="manifest-input-handoff"
                                        value={value.handoffMode ?? ""}
                                        onChange={setSelect("handoffMode")}
                                        className={FIELD_CLS}
                                    >
                                        {HANDOFF_OPTIONS.map((option) => (
                                            <option key={option.value || "blank"} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-xs font-medium text-black">GHG Scope</label>
                                    <select
                                        data-testid="manifest-input-ghg-scope"
                                        value={value.ghgScope ?? ""}
                                        onChange={setSelect("ghgScope")}
                                        className={FIELD_CLS}
                                    >
                                        {GHG_SCOPE_OPTIONS.map((option) => (
                                            <option key={option.value || "blank"} value={option.value}>{option.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="sm:col-span-2">
                                    <label className="text-xs font-medium text-black">GHG Standard</label>
                                    <input
                                        data-testid="manifest-input-ghg-standard"
                                        type="text"
                                        placeholder="e.g. iso-14064-1"
                                        value={value.ghgStandard ?? value.ghgMethodology ?? ""}
                                        onChange={set("ghgStandard")}
                                        className={FIELD_CLS}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Encoded preview ────────────────────────────────────── */}
            {!isEffectivelyEmpty && (
                <div className="bg-gray-50 border border-gray-200 rounded px-3 py-2">
                    <p className="text-xs text-gray-500 mb-0.5">Encoded manifest (bytes)</p>
                    <p
                        className="text-xs font-mono text-gray-600 break-all"
                        data-testid="manifest-encoded-preview"
                    >
                        {encodedPreview}
                    </p>
                </div>
            )}
        </div>
    );
}

/** Empty default so callers can initialise state cleanly. */
export const EMPTY_MANIFEST_FIELDS: ManifestFields = { origin: "", destination: "" };
