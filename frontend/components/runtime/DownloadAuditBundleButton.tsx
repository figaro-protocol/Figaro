"use client";

/**
 * DownloadAuditBundleButton — client-side trigger for Phase D PDF generation.
 *
 * On click: build a process-scoped audit-bundle PDF (via `buildAuditBundlePdfBlob`)
 * and trigger a browser download. No server round-trip; the user's data
 * never leaves the browser. Agreements are cleartext — the chain is a
 * deterministic state machine and this surface is a reader; there are no
 * redacted distribution forms (maintainer ruling 2026-07-02).
 */
import { useMemo, useState } from "react";
import { useChainId, usePublicClient } from "wagmi";
import type { Order } from "@/lib/kernel/store";
import { buildAuditBundlePdfBlob } from "@/lib/audit/auditBundlePdf";
import { useProcessAgreements } from "@/hooks/useProcessAgreements";
import { extractErrorMessage } from "@/lib/shared/errors";

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
    const agreementHashes = useMemo(
        () => orders.map((o) => o.agreementHash).filter((h): h is string => Boolean(h)),
        [orders],
    );
    const agreements = useProcessAgreements(agreementHashes);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const disabled = busy || orders.length === 0;

    return (
        <div className="flex flex-col gap-2" data-testid="download-audit-bundle">
            <button
                type="button"
                onClick={async () => {
                    setBusy(true);
                    setError(null);
                    try {
                        const blob = await buildAuditBundlePdfBlob(processId, orders, publicClient, chainId, agreements);
                        triggerDownload(blob, `audit-bundle-${processId.slice(0, 10)}.pdf`);
                    } catch (e) {
                        setError(extractErrorMessage(e, "PDF generation failed."));
                    } finally {
                        setBusy(false);
                    }
                }}
                disabled={disabled}
                className={`text-xs px-3 py-1.5 rounded border ${disabled ? "bg-subtle text-ink-faint border-default cursor-not-allowed" : "bg-ink-primary text-paper border-ink-primary hover:bg-ink-body"}`}
                data-testid="download-audit-bundle-button"
            >
                {busy ? "Building bundle…" : "Download audit bundle (PDF)"}
            </button>
            {error && (
                <p className="text-[11px] text-red-700" data-testid="download-audit-bundle-error">
                    {error}
                </p>
            )}
        </div>
    );
}
