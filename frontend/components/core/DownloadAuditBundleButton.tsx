"use client";

/**
 * DownloadAuditBundleButton — client-side trigger for Phase D PDF generation.
 *
 * On click: build a process-scoped audit-bundle PDF (via `buildAuditBundlePdfBlob`)
 * and trigger a browser download. No server round-trip; the user's data
 * never leaves the browser. The redact toggle seals commerce line items
 * via `redactSections` while preserving the agreement merkle root.
 */
import { useState } from "react";
import { useChainId, usePublicClient } from "wagmi";
import type { Order } from "@/lib/core/store";
import { buildAuditBundlePdfBlob } from "@/lib/audit/auditBundlePdf";

interface DownloadAuditBundleButtonProps {
    processId: string;
    orders: readonly Order[];
}

function triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export function DownloadAuditBundleButton({ processId, orders }: DownloadAuditBundleButtonProps) {
    const publicClient = usePublicClient();
    const chainId = useChainId();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [redactLineItems, setRedactLineItems] = useState(false);

    const disabled = busy || orders.length === 0;
    const filenameSuffix = redactLineItems ? "-redacted" : "";

    return (
        <div className="flex flex-col gap-2" data-testid="download-audit-bundle">
            <label
                className="flex items-center gap-2 text-[11px] text-neutral-700 cursor-pointer select-none"
                data-testid="download-audit-bundle-redact-toggle"
            >
                <input
                    type="checkbox"
                    checked={redactLineItems}
                    onChange={(e) => setRedactLineItems(e.target.checked)}
                    disabled={busy}
                    className="h-3 w-3"
                    data-testid="download-audit-bundle-redact-checkbox"
                />
                <span>
                    Seal commerce line items (for distribution)
                    {redactLineItems && (
                        <span className="ml-1 text-amber-700 font-semibold">— 🔒 sealed</span>
                    )}
                </span>
            </label>
            {redactLineItems && (
                <p
                    className="text-[10px] text-neutral-600 leading-tight max-w-md"
                    data-testid="download-audit-bundle-redact-note"
                >
                    The PDF will hide line-item detail (SKU, quantity, unit price)
                    while preserving the agreement merkle root, totals, currency,
                    and every other clause. The recipient verifies the root
                    against chain; you can selectively reveal individual sections
                    later via /audit Mode B if needed.
                </p>
            )}
            <button
                type="button"
                onClick={async () => {
                    setBusy(true);
                    setError(null);
                    try {
                        const blob = await buildAuditBundlePdfBlob(processId, orders, publicClient, chainId, {
                            redactLineItems,
                        });
                        triggerDownload(blob, `audit-bundle-${processId.slice(0, 10)}${filenameSuffix}.pdf`);
                    } catch (e) {
                        setError(e instanceof Error ? e.message : "PDF generation failed.");
                    } finally {
                        setBusy(false);
                    }
                }}
                disabled={disabled}
                className={`text-xs px-3 py-1.5 rounded border ${disabled ? "bg-neutral-100 text-neutral-400 border-neutral-200 cursor-not-allowed" : "bg-black text-white border-black hover:bg-neutral-800"}`}
                data-testid="download-audit-bundle-button"
            >
                {busy ? "Building bundle…" : redactLineItems ? "Download redacted bundle (PDF)" : "Download audit bundle (PDF)"}
            </button>
            {error && (
                <p className="text-[11px] text-red-700" data-testid="download-audit-bundle-error">
                    {error}
                </p>
            )}
        </div>
    );
}
