"use client";

import { useState } from "react";
import { DEFAULT_IPFS_SERVICE } from "@/lib/shared/ipfsService";
import { truncateHex } from "@/lib/shared/formatHex";
import { extractErrorMessage } from "@/lib/shared/errors";

interface IpfsImageUploadProps {
    /** Current IPFS URI (`ipfs://Qm…`). Empty string for "not yet uploaded". */
    value: string;
    /** Called with the resulting URI after a successful upload, or `""` after Remove. */
    onChange: (uri: string) => void;
    /** Called on upload failure. */
    onError?: (message: string) => void;
    /** Label to show on the upload button. Defaults to "Upload image". */
    label?: string;
    /** Accept attribute for the file input. Defaults to image MIME types. */
    accept?: string;
}

/**
 * Generic file → IPFS upload control. Uploads on file-select, persists the
 * resulting `ipfs://Qm…` URI via `onChange`, allows removal. Replaces three
 * parallel implementations (`LogoUpload`, `IpfsUploadButton`, inline
 * `<input type="file">`) flagged in the duplication audit.
 */
export function IpfsImageUpload({
    value,
    onChange,
    onError,
    label = "Upload image",
    accept = "image/jpeg,image/png,image/webp,image/gif,image/svg+xml",
}: IpfsImageUploadProps) {
    const [uploading, setUploading] = useState(false);

    async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const result = await DEFAULT_IPFS_SERVICE.uploadFile(file);
            onChange(result.uri);
        } catch (err) {
            onError?.(extractErrorMessage(err, String(err)));
        } finally {
            setUploading(false);
            e.target.value = ""; // allow re-uploading the same file
        }
    }

    if (value) {
        return (
            <div className="flex items-center gap-3 flex-1 min-w-0">
                <code className="text-xs text-ink-faint font-mono truncate flex-1">
                    {truncateHex(value, { head: 16, tail: 8 })}
                </code>
                <button
                    type="button"
                    onClick={() => onChange("")}
                    className="text-xs text-ink-faint hover:text-red-600 transition-colors"
                >
                    Remove
                </button>
            </div>
        );
    }

    return (
        <label className="cursor-pointer text-sm font-semibold text-ink-heading border border-default rounded px-4 py-2 hover:bg-paper-200 transition-colors inline-block">
            {uploading ? "Uploading…" : label}
            <input
                type="file"
                accept={accept}
                onChange={handleFile}
                disabled={uploading}
                className="hidden"
            />
        </label>
    );
}
