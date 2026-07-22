"use client";

/**
 * DatetimeFieldInput — the richer input for a string field declaring
 * `format: "iso-datetime"`. Renders a native datetime picker and stores the
 * value as ISO 8601 UTC (the shape the SDK's iso-datetime validator requires:
 * seconds + trailing `Z`). Registered in `fieldFormatInputs` for the
 * `iso-datetime` format, so ANY clause declaring it — figaro-schedule's booked
 * window, a cold-chain reporting period — gets the picker with zero
 * clause-specific code, exactly like `geohash` → GeohashFieldInput. No mapping
 * would fall back to a raw text box.
 *
 * The picker's wall-clock is UTC: a committed window is an absolute instant the
 * parties agree, so it must not shift with the viewer's device timezone. The
 * ISO ⇄ control conversion is pure string slicing — deterministic, never a
 * `Date` round-trip that would re-zone the value.
 */

import { useId } from "react";

import type { FieldFormatInputProps } from "@/components/runtime/fieldFormatInputs";

/** "2026-07-22T09:00:00Z" → "2026-07-22T09:00" (the datetime-local value). */
function isoToLocal(iso: string): string {
    const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/.exec(iso);
    return m ? m[1] : "";
}

/** "2026-07-22T09:00" → "2026-07-22T09:00:00Z" (ISO 8601 UTC, seconds + Z). */
function localToIso(local: string): string | undefined {
    if (!local) return undefined;
    // datetime-local yields minute precision (YYYY-MM-DDTHH:mm); some browsers
    // add seconds when `step` is set. Normalise to seconds + Z either way.
    const withSeconds = /T\d{2}:\d{2}:\d{2}$/.test(local) ? local : `${local}:00`;
    return `${withSeconds}Z`;
}

export function DatetimeFieldInput({ value, onChange, testId }: FieldFormatInputProps) {
    const utcHintId = useId();
    return (
        <div className="flex items-center gap-2">
            <input
                type="datetime-local"
                value={isoToLocal(value ?? "")}
                onChange={(e) => onChange(localToIso(e.target.value))}
                data-testid={testId}
                aria-describedby={utcHintId}
                className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-xs text-black focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <span id={utcHintId} className="text-[11px] text-neutral-400">UTC</span>
        </div>
    );
}
