"use client";

/**
 * EvidenceCaptureInput — the input component for fields declaring
 * `format: "evidence-capture"` (a runtime witness's evidence pointer, e.g.
 * the proximity clause's stage-1 `evidenceUri`).
 *
 * One responsive surface for browser AND mobile: the capture buttons are the
 * device's OWN capabilities, detected at runtime (`availableCaptures`) —
 * geolocation cross-check everywhere, NFC tap on Android Chrome, BLE
 * sighting on Chromium — never a fixed set. A capture builds the evidence
 * JSON and PINS it (evidence nobody can fetch is not shared evidence — same
 * rule as the content anchor), and the pinned URI fills the field. The plain
 * URI input stays alongside: the field is an OPEN pointer (a ranging report
 * from a device daemon, a counterparty co-signature, any artifact) and
 * capture is an affordance, never the only path.
 *
 * Mounted by FieldControl via the fieldFormatInputs registry — this
 * component knows no clause and no field name.
 */
import { useState } from "react";
import { DEFAULT_IPFS_SERVICE } from "@/lib/shared/ipfsService";
import { extractErrorMessage } from "@/lib/shared/errors";
import {
    availableCaptures,
    captureEvidence,
    CAPTURE_LABELS,
    type DeviceEvidenceKind,
} from "@/lib/shared/deviceEvidence";
import type { FieldFormatInputProps } from "@/components/runtime/fieldFormatInputs";

export function EvidenceCaptureInput({ value, onChange, testId }: FieldFormatInputProps) {
    const [capturing, setCapturing] = useState<DeviceEvidenceKind | null>(null);
    const [error, setError] = useState<string | null>(null);
    const kinds = availableCaptures();

    async function capture(kind: DeviceEvidenceKind) {
        setCapturing(kind);
        setError(null);
        try {
            const evidence = await captureEvidence(kind);
            const cid = await DEFAULT_IPFS_SERVICE.pinJSON(evidence);
            onChange(DEFAULT_IPFS_SERVICE.buildURI(cid));
        } catch (err) {
            setError(extractErrorMessage(err, "Evidence capture failed."));
        } finally {
            setCapturing(null);
        }
    }

    return (
        <div className="space-y-1">
            {kinds.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {kinds.map((kind) => (
                        <button
                            key={kind}
                            type="button"
                            onClick={() => void capture(kind)}
                            disabled={capturing !== null}
                            data-testid={`${testId}-capture-${kind}`}
                            className="text-[11px] px-2 py-1 rounded border border-neutral-300 bg-white text-neutral-700 hover:border-neutral-500 disabled:opacity-50"
                        >
                            {capturing === kind ? "Capturing…" : CAPTURE_LABELS[kind]}
                        </button>
                    ))}
                </div>
            )}
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)}
                placeholder="Evidence URI — capture above, or paste any artifact locator"
                data-testid={testId}
                className="w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-[12px] font-mono text-black focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
            />
            {error && (
                <p className="text-[11px] text-red-600" data-testid={`${testId}-capture-error`}>
                    {error}
                </p>
            )}
        </div>
    );
}
