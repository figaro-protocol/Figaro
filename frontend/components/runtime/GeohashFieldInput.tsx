"use client";

/**
 * GeohashFieldInput — the input component for fields declaring
 * `format: "geohash"`.
 *
 * A text input plus a "Use device location" affordance: the browser's
 * geolocation reading is encoded to a geohash (the same
 * `getDeviceLocation` + `encodeGeohash` pair the member-profile form uses)
 * and written into the field. Typing stays first-class — the device path is
 * assistance, not a requirement, and the page never sees coordinates, only
 * the geohash the party chose to commit. A surface that already knows a
 * locality (the checkout knows the seller's) passes it as a preset, rendered
 * as one more fill button — the party with no device and no code to type
 * still states a value.
 *
 * Mounted by FieldControl via the fieldFormatInputs registry — this
 * component knows no clause and no field name.
 */
import { useState } from "react";
import { DEVICE_LOCATION_UNREAD, readDeviceGeohash } from "@/lib/shared/deviceLocation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { safeRegexTest, capGeohashGrain, geohashCapturePrecision } from "@figaro-protocol/sdk/clauses";
import type { FieldFormatInputProps } from "@/components/runtime/fieldFormatInputs";

export function GeohashFieldInput({ value, onChange, testId, pattern, disposition, presets }: FieldFormatInputProps) {
    const [locating, setLocating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Grain cap by disposition: a PUBLIC geohash is coarsened to neighborhood
    // grain (it lands in a plaintext, pinned agreement); a PRIVATE one keeps
    // fine grain (factory/machine — it lives encrypted / content-withheld).
    // The SDK's content validation refuses a value past the same cap.
    const maxChars = geohashCapturePrecision(disposition);

    async function fillFromDevice() {
        setLocating(true);
        setError(null);
        try {
            const hash = await readDeviceGeohash(geohashCapturePrecision(disposition));
            if (!hash) {
                setError(DEVICE_LOCATION_UNREAD);
                return;
            }
            onChange(hash);
        } finally {
            setLocating(false);
        }
    }

    const trimmed = value.trim();
    // ReDoS-safe against an attacker-written spec `pattern` (finding 5).
    const shapeOk = trimmed === "" || !pattern || safeRegexTest(pattern, trimmed);

    return (
        <div className="space-y-1">
            <div className="flex items-center gap-2">
                <Input
                    type="text"
                    value={value}
                    onChange={(e) => {
                        // Typed hashes are capped too — the cap is about where
                        // the value lands (public plaintext vs private/encrypted),
                        // not how it was produced.
                        const raw = e.target.value;
                        onChange(raw === "" ? undefined : capGeohashGrain(disposition, raw));
                    }}
                    placeholder={`geohash (base32, ≤${maxChars} chars)`}
                    data-testid={testId}
                    className={`rounded px-2 py-1 text-xs font-mono ${
                        shapeOk ? "border-default" : "border-error"
                    }`}
                />
                <Button
                    type="button"
                    variant="outline"
                    size="compact"
                    onClick={() => void fillFromDevice()}
                    disabled={locating}
                    data-testid={`${testId}-device`}
                    title="Fill from this device's location"
                    className="shrink-0 text-[11px] px-2 py-1 rounded border-default text-ink-body hover:bg-paper hover:border-default-strong"
                >
                    {locating ? "Locating…" : "Use device location"}
                </Button>
                {(presets ?? []).map((preset, i) => (
                    <Button
                        key={`${preset.value}-${i}`}
                        variant="outline"
                        size="compact"
                        type="button"
                        // A preset lands under the same grain cap as a typed
                        // value: where it lands decides, not where it came from.
                        onClick={() => onChange(capGeohashGrain(disposition, preset.value))}
                        data-testid={`${testId}-preset-${i}`}
                        title={preset.value}
                        className="shrink-0 text-[11px] px-2 py-1 rounded border-default text-ink-body hover:bg-paper hover:border-default-strong"
                    >
                        {preset.label}
                    </Button>
                ))}
            </div>
            {error && (
                <p className="text-[11px] text-error-fg" data-testid={`${testId}-device-error`}>
                    {error}
                </p>
            )}
        </div>
    );
}
