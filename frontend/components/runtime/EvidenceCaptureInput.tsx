"use client";

/**
 * EvidenceCaptureInput — the input component for fields declaring
 * `format: "evidence-capture"` (a runtime witness's evidence pointer, e.g.
 * the proximity clause's stage-1 `evidenceUri`).
 *
 * One responsive surface for browser AND mobile: the capture buttons are the
 * device's OWN capabilities, detected at runtime (`availableCaptures`) —
 * geolocation cross-check everywhere, NFC tap on Android Chrome, BLE
 * sighting on Chromium — never a fixed set. A capture PINS the mechanism-
 * grain PUBLIC artifact (the cell + hashed identifiers + rawCaptureHash —
 * evidence nobody can fetch is not shared evidence, but raw coordinates
 * never leave the device) and its URI fills the field; the full-fidelity
 * raw capture is retained locally for dispute-time revelation, purgeable
 * here (unpin + forget — the same erasure symmetry as the profile). The
 * plain URI input stays alongside: the field is an OPEN pointer (a ranging
 * report from a device daemon, a counterparty co-signature, any artifact)
 * and capture is an affordance, never the only path.
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
    findRetainedRawCapture,
    forgetRetainedRawCapture,
    retainRawCapture,
    toPublicEvidence,
    type DeviceEvidenceKind,
} from "@/lib/shared/deviceEvidence";
import type { FieldFormatInputProps } from "@/components/runtime/fieldFormatInputs";

export function EvidenceCaptureInput({ value, onChange, testId }: FieldFormatInputProps) {
    const [capturing, setCapturing] = useState<DeviceEvidenceKind | null>(null);
    const [error, setError] = useState<string | null>(null);
    const kinds = availableCaptures();
    const retained = value ? findRetainedRawCapture(value) : null;

    async function capture(kind: DeviceEvidenceKind) {
        setCapturing(kind);
        setError(null);
        try {
            const raw = await captureEvidence(kind);
            const artifact = toPublicEvidence(raw);
            const cid = await DEFAULT_IPFS_SERVICE.pinJSON(artifact);
            const uri = DEFAULT_IPFS_SERVICE.buildURI(cid);
            retainRawCapture({ uri, cid, rawCaptureHash: artifact.rawCaptureHash, raw });
            onChange(uri);
        } catch (err) {
            setError(extractErrorMessage(err, "Evidence capture failed."));
        } finally {
            setCapturing(null);
        }
    }

    async function purge() {
        if (!retained) return;
        setError(null);
        try {
            await DEFAULT_IPFS_SERVICE.unpin(retained.cid);
            forgetRetainedRawCapture(retained.uri);
            onChange(undefined);
        } catch (err) {
            setError(extractErrorMessage(err, "Purging the evidence failed."));
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
                            className="text-[11px] px-2 py-1 rounded border border-default bg-paper text-ink-body hover:border-default-strong disabled:opacity-50"
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
                className="w-full rounded border border-default bg-surface px-2 py-1.5 text-[12px] font-mono text-ink-primary focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent"
            />
            {retained && (
                <button
                    type="button"
                    onClick={() => void purge()}
                    data-testid={`${testId}-capture-purge`}
                    className="text-[11px] px-2 py-1 rounded border border-default bg-paper text-ink-muted hover:border-red-400 hover:text-red-600"
                >
                    Unpin + purge this capture
                </button>
            )}
            {error && (
                <p className="text-[11px] text-red-600" data-testid={`${testId}-capture-error`}>
                    {error}
                </p>
            )}
        </div>
    );
}
