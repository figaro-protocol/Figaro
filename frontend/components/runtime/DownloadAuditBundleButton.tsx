"use client";

/**
 * DownloadAuditBundleButton — client-side trigger for Phase D PDF generation.
 *
 * On click: build a process-scoped audit-bundle PDF (via `buildAuditBundlePdfBlob`)
 * and trigger a browser download. No server round-trip; the user's data
 * never leaves the browser. Agreements are cleartext — the chain is a
 * deterministic state machine and this surface is a reader; there are no
 * redacted distribution forms.
 */
import { useChainId, usePublicClient } from "wagmi";
import type { Order } from "@/lib/core/store";
import { buildAuditBundlePdfBlob } from "@/lib/data/audit/auditBundlePdf";
import { useAgreementsOfOrders } from "@/hooks/useProcessAgreements";
import { useWitnessHolder } from "@/lib/core/useWitnessHolder";
import { useBusyAction } from "@/lib/shared/useBusyAction";
import { saveBlob } from "@/lib/shared/download";
import { Button } from "@/components/ui/Button";

interface DownloadAuditBundleButtonProps {
    processId: string;
    orders: readonly Order[];
}

export function DownloadAuditBundleButton({ processId, orders }: DownloadAuditBundleButtonProps) {
    const publicClient = usePublicClient();
    const chainId = useChainId();
    const holder = useWitnessHolder();
    const agreements = useAgreementsOfOrders(orders);
    const { busy, error, run } = useBusyAction();

    const disabled = busy || orders.length === 0;

    return (
        <div className="flex flex-col gap-2" data-testid="download-audit-bundle">
            <Button
                type="button"
                variant={disabled ? "secondary" : "default"}
                size="compact"
                onClick={() => run("PDF generation failed.", async () => {
                    const blob = await buildAuditBundlePdfBlob(processId, orders, publicClient, chainId, agreements, { holder });
                    saveBlob(blob, `audit-bundle-${processId.slice(0, 10)}.pdf`);
                })}
                disabled={disabled}
                className={`py-1.5 rounded ${disabled ? "text-ink-faint cursor-not-allowed disabled:opacity-100" : ""}`}
                data-testid="download-audit-bundle-button"
            >
                {busy ? "Building bundle…" : "Download audit bundle (PDF)"}
            </Button>
            {error && (
                <p className="text-[11px] text-error-fg" data-testid="download-audit-bundle-error">
                    {error}
                </p>
            )}
        </div>
    );
}
