"use client";

/**
 * GeohashFieldInput — the input component for fields declaring
 * `format: "geohash"`.
 *
 * A text input plus a "Use device location" affordance: the browser's
 * geolocation reading is encoded to a geohash (the same
 * `getDeviceLocation` + `encodeGeohash` pair the seller-profile form uses)
 * and written into the field. Typing stays first-class — the device path is
 * assistance, not a requirement, and the page never sees coordinates, only
 * the geohash the party chose to commit.
 *
 * Mounted by FieldControl via the fieldFormatInputs registry — this
 * component knows no clause and no field name.
 */
import { useState } from "react";
import { getDeviceLocation } from "@/lib/seller/geocode";
import { encodeGeohash } from "@/lib/shared/geohash";
import type { FieldFormatInputProps } from "@/components/core/fieldFormatInputs";

/** Commit-grade default precision — ~±0.06 km cell, the profile form's
 *  finest preset. The party can type any coarser/finer hash by hand. */
const DEVICE_PRECISION = 9;

export function GeohashFieldInput({ value, onChange, testId, pattern }: FieldFormatInputProps) {
    const [locating, setLocating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function fillFromDevice() {
        setLocating(true);
        setError(null);
        try {
            const position = await getDeviceLocation();
            if (!position) {
                setError("Couldn't read device location. Permission denied or unavailable.");
                return;
            }
            onChange(encodeGeohash(position.lat, position.lon, DEVICE_PRECISION));
        } finally {
            setLocating(false);
        }
    }

    const trimmed = value.trim();
    const shapeOk = trimmed === "" || !pattern || new RegExp(pattern).test(trimmed);

    return (
        <div className="space-y-1">
            <div className="flex items-center gap-2">
                <input
                    type="text"
                    value={value}
                    onChange={(e) => {
                        const raw = e.target.value;
                        onChange(raw === "" ? undefined : raw);
                    }}
                    placeholder="geohash (base32)"
                    data-testid={testId}
                    className={`w-full rounded border bg-white px-2 py-1 text-xs font-mono text-black focus:outline-none focus:ring-1 focus:ring-accent ${
                        shapeOk ? "border-neutral-300" : "border-red-400"
                    }`}
                />
                <button
                    type="button"
                    onClick={() => void fillFromDevice()}
                    disabled={locating}
                    data-testid={`${testId}-device`}
                    title="Fill from this device's location"
                    className="shrink-0 text-[11px] px-2 py-1 rounded border border-neutral-300 bg-white text-neutral-700 hover:border-neutral-500 disabled:opacity-50"
                >
                    {locating ? "Locating…" : "Use device location"}
                </button>
            </div>
            {error && (
                <p className="text-[11px] text-red-600" data-testid={`${testId}-device-error`}>
                    {error}
                </p>
            )}
        </div>
    );
}
