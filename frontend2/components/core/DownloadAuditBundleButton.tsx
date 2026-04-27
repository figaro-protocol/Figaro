"use client";

/**
 * DownloadAuditBundleButton — client-side trigger for Phase D PDF generation.
 *
 * On click:
 *   1. For each order in the process, load the signed Agreement
 *      (agreementStore: in-memory + localStorage cache; mock-mode + devnet
 *      both populate this on commit).
 *   2. Fetch lifecycle attestations per order via the indexer.
 *   3. Build an AuditBundle per order (contractExtract + invoiceExtract +
 *      billOfLadingExtract + hashAppendix).
 *   4. Project consolidated process-level financials.
 *   5. Render to a Blob via @react-pdf/renderer's `pdf()` and trigger
 *      a browser download. No server round-trip; the user's data never
 *      leaves the browser.
 */
import { useState } from "react";
import { useChainId, usePublicClient } from "wagmi";
import type { Order } from "@/lib/core/store";
import { loadAgreement } from "@/lib/core/agreementStore";
import { getAttestationsByOrder } from "@/lib/core/indexer";
import { buildAuditBundle, type AuditBundle } from "@/lib/audit/auditBundle";
import {
    projectFinancials,
    type FinancialsModel,
} from "@/lib/semantic/financialsProjection";
import type { AttestationRecord } from "@/lib/mechanisms/useGHGDisclosure";

// `@react-pdf/renderer` is ~400 kB. Lazy-load on click so the financials
// page itself stays light. Users who never download the PDF never pay
// the cost; users who click see a brief "Building bundle…" while the
// chunk fetches + the PDF renders.
async function loadPdfModule() {
    const [renderer, bundle] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/lib/audit/pdfBundle"),
    ]);
    return { pdf: renderer.pdf, AuditBundlePdf: bundle.AuditBundlePdf };
}

interface DownloadAuditBundleButtonProps {
    processId: string;
    orders: readonly Order[];
}

type IndexedAttestationLog = {
    args?: {
        orderHash?: string;
        processId?: string;
        attester?: string;
        schemaId?: string;
        stage?: number | bigint;
        contentRef?: string;
    };
    transactionHash?: string;
    blockNumber?: bigint | number;
};

/**
 * Normalize an indexer log into the AttestationRecord shape the extractors
 * expect. The indexer's getAttestationsByOrder returns viem decoded logs;
 * the field names match but we cast through to bridge bigint stage / block.
 */
function toAttestationRecord(log: IndexedAttestationLog): AttestationRecord | null {
    const args = log.args;
    if (!args || !args.orderHash || !args.processId || !args.attester || !args.schemaId) {
        return null;
    }
    const stage = args.stage === undefined ? 0 : Number(args.stage);
    return {
        orderHash: args.orderHash,
        processId: args.processId,
        attester: args.attester,
        schemaId: args.schemaId,
        stage,
        contentRef: args.contentRef ?? "0x",
        transactionHash: log.transactionHash ?? null,
        blockNumber: log.blockNumber === undefined ? 0 : Number(log.blockNumber),
    };
}

async function buildPdfBlob(
    processId: string,
    orders: readonly Order[],
    publicClient: ReturnType<typeof usePublicClient>,
    chainId: number,
): Promise<Blob> {
    const perOrderBundles: AuditBundle[] = [];

    for (const order of orders) {
        const agreement = loadAgreement(order.agreementHash);
        if (!agreement) {
            // Skip orders whose agreement wasn't hydrated locally — the bundle
            // depends on agreement clauses to extract. The hash appendix would
            // be empty without it. A future enhancement is fetching by uriHash
            // from IPFS, but that's not required for first-cut where mock and
            // devnet both populate agreementStore at commit time.
            continue;
        }

        let attestations: readonly AttestationRecord[] = [];
        if (publicClient) {
            try {
                const logs = await getAttestationsByOrder(publicClient, chainId, order.id);
                attestations = (logs as IndexedAttestationLog[])
                    .map(toAttestationRecord)
                    .filter((r): r is AttestationRecord => r !== null);
            } catch {
                // Non-fatal — render the bundle with empty attestations rather
                // than failing the whole PDF.
                attestations = [];
            }
        }

        perOrderBundles.push(buildAuditBundle(order, agreement, attestations));
    }

    const financials: FinancialsModel = projectFinancials(orders, "process", processId);
    const buyer = orders[0]?.buyer;

    const { pdf, AuditBundlePdf } = await loadPdfModule();
    const doc = AuditBundlePdf({
        data: {
            processId,
            buyer,
            perOrderBundles,
            financials,
            generatedAt: new Date(),
        },
    });
    return pdf(doc).toBlob();
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

    const disabled = busy || orders.length === 0;

    return (
        <div className="flex flex-col gap-1" data-testid="download-audit-bundle">
            <button
                type="button"
                onClick={async () => {
                    setBusy(true);
                    setError(null);
                    try {
                        const blob = await buildPdfBlob(processId, orders, publicClient, chainId);
                        triggerDownload(blob, `audit-bundle-${processId.slice(0, 10)}.pdf`);
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
