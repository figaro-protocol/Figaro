"use client";

/**
 * ContentAnchorFieldInput — the input component for fields declaring
 * `format: "bytes32-hex"` (a CONTENT ANCHOR: keccak256 of a canonical
 * artifact — e.g. a consent clause's affixed legal document).
 *
 * The ONLY fill path is the AFFIX: pick a file → pin it to IPFS (the
 * document must be fetchable for a counterparty to verify by rehashing) →
 * keccak256 of the bytes fills the field. There is no paste-hex input —
 * raw hex is used nowhere as a content fill (ruled 2026-07-10); the anchor
 * is derived from the artifact, never typed.
 *
 * When the artifact pins, its locator is emitted on the COMPANION channel
 * under the `"uri"` format — FieldControl's object branch routes it to the
 * first sibling field declaring `format: "uri"` (the consent spec's
 * `documentUri`). A clause with no such sibling simply drops the companion.
 *
 * Mounted by FieldControl via the fieldFormatInputs registry — this
 * component knows no clause and no field name.
 */
import { useRef, useState } from "react";
import { keccak256 } from "viem";
import { DEFAULT_IPFS_SERVICE } from "@/lib/shared/ipfsService";
import { extractErrorMessage } from "@/lib/shared/errors";
import type { FieldFormatInputProps } from "@/components/runtime/fieldFormatInputs";

export function ContentAnchorFieldInput({ value, onChange, testId, onCompanion }: FieldFormatInputProps) {
    const fileRef = useRef<HTMLInputElement>(null);
    const [affixing, setAffixing] = useState(false);
    const [fileName, setFileName] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function affix(file: File) {
        setAffixing(true);
        setError(null);
        try {
            // Anchor + pin are ONE act: a hash whose artifact nobody can fetch
            // is not a shared reference, so the fill lands only after the pin
            // succeeds.
            const bytes = new Uint8Array(await file.arrayBuffer());
            const anchor = keccak256(bytes);
            const pinned = await DEFAULT_IPFS_SERVICE.uploadFile(file);
            onChange(anchor);
            onCompanion?.("uri", pinned.uri);
            setFileName(file.name);
        } catch (err) {
            setError(extractErrorMessage(err, "Affixing the document failed."));
        } finally {
            setAffixing(false);
        }
    }

    function clear() {
        onChange(undefined);
        onCompanion?.("uri", undefined);
        setFileName(null);
        setError(null);
        if (fileRef.current) fileRef.current.value = "";
    }

    return (
        <div className="space-y-1">
            <div className="flex items-center gap-2">
                <input
                    ref={fileRef}
                    type="file"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void affix(file);
                    }}
                    disabled={affixing}
                    data-testid={`${testId}-affix`}
                    className="text-[11px] text-ink-body file:mr-2 file:rounded file:border file:border-default file:bg-surface file:px-2 file:py-1 file:text-[11px] file:text-ink-body hover:file:border-default-strong"
                />
                {value && (
                    <button
                        type="button"
                        onClick={clear}
                        data-testid={`${testId}-clear`}
                        className="shrink-0 text-[11px] px-2 py-1 rounded border border-default bg-paper text-ink-body hover:border-default-strong"
                    >
                        Clear
                    </button>
                )}
            </div>
            {affixing && (
                <p className="text-[11px] text-ink-muted" data-testid={`${testId}-affixing`}>
                    Pinning &amp; anchoring…
                </p>
            )}
            {value && (
                <p className="text-[11px] font-mono text-ink-muted break-all" data-testid={testId} title={value}>
                    {fileName ? `${fileName} · ` : ""}{value}
                </p>
            )}
            {error && (
                <p className="text-[11px] text-red-600" data-testid={`${testId}-affix-error`}>
                    {error}
                </p>
            )}
        </div>
    );
}
