"use client";

/**
 * ProcessFinancialsView — the financial statements for one process.
 *
 * Reads the process's orders from `useProcessOrders`, projects them via
 * `projectAllFinancialStatements` — one statement document PER SELLER
 * (individual register) plus one CONSOLIDATED across the assembly — and draws
 * each through the ONE generic `DocumentView`. Balance sheet, income statement,
 * and cash flow are documents like any other (same `RenderedDocument` shape the
 * invoice and bill of lading use), derived purely from commit + resolve. There
 * is no bespoke financials layout and no per-order "line item" breakdown — the
 * per-seller line detail is the invoice document, carried in the audit bundle.
 *
 * Used by `/audit/view?process=<processId>`.
 */

import { useAuditProcessOrders } from "@/hooks/useAuditProcessOrders";
import { projectAllFinancialStatements } from "@/lib/audit/documentProjection";
import { DownloadAuditBundleButton } from "@/components/runtime/DownloadAuditBundleButton";
import { DocumentView } from "./DocumentView";

interface Props {
    processId: string;
}

export function ProcessFinancialsView({ processId }: Props) {
    const { orders, batch } = useAuditProcessOrders(processId);
    const statements = projectAllFinancialStatements(orders, processId);
    const buyer = orders[0]?.buyer;

    return (
        <div className="space-y-10" data-testid="financials-view">
            {/* Header */}
            <header className="space-y-2">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className="text-xs font-semibold text-ink-muted">
                            Process financials
                        </p>
                        <h2 className="text-xl font-bold text-ink-primary">
                            Financial statements
                        </h2>
                    </div>
                    <DownloadAuditBundleButton processId={processId} orders={orders} />
                </div>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono text-ink-body mt-3">
                    <div>
                        <dt className="text-ink-muted">processId</dt>
                        <dd className="break-all" data-testid="financials-process-id">{processId}</dd>
                    </div>
                    {buyer && (
                        <div>
                            <dt className="text-ink-muted">buyer</dt>
                            <dd className="break-all">{buyer}</dd>
                        </div>
                    )}
                </dl>
                <p className="text-[11px] text-ink-muted max-w-2xl mt-3">
                    One statement per seller (individual register) plus the assembly
                    consolidation. Cash-basis projection of on-chain commit + resolve
                    events. Each line traces to one or more on-chain events. Not an
                    audited statement under any accounting standard — interpretation
                    under GAAP/IFRS requires accountant judgment. Amounts displayed in
                    the currency&apos;s smallest unit; reconcile against chain from the
                    raw value if per-token decimals matter.
                </p>
            </header>

            {orders.length === 0 ? (
                <p className="text-sm text-ink-muted" data-testid="financials-empty">
                    No orders found for this process. The kernel published no
                    commitment under this processId
                    {batch?.status === "found"
                        ? ", and the batch relay published none that verified."
                        : batch?.status === "no-relay"
                            ? " — and batch-settled trade cannot be read here, because no relay is configured. See the batch section below."
                            : batch?.status === "not-in-archive"
                                ? ", and the configured relay does not hold it either. See the batch section below."
                                : "."}
                </p>
            ) : (
                statements.map((document, i) => (
                    <DocumentView key={`${document.genre}-${i}`} document={document} />
                ))
            )}
        </div>
    );
}
