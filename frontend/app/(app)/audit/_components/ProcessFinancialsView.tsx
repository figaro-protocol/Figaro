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

import { useProcessOrders } from "@/hooks/useProcessOrders";
import { projectAllFinancialStatements } from "@/lib/audit/documentProjection";
import { DownloadAuditBundleButton } from "@/components/runtime/DownloadAuditBundleButton";
import { DocumentView } from "./DocumentView";

interface Props {
    processId: string;
}

export function ProcessFinancialsView({ processId }: Props) {
    const orders = useProcessOrders(processId);
    const statements = projectAllFinancialStatements(orders, processId);
    const buyer = orders[0]?.buyer;

    return (
        <div className="space-y-10" data-testid="financials-view">
            {/* Header */}
            <header className="space-y-2">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className="text-xs font-semibold text-neutral-500">
                            Process financials
                        </p>
                        <h2 className="text-xl font-bold text-black">
                            Financial statements
                        </h2>
                    </div>
                    <DownloadAuditBundleButton processId={processId} orders={orders} />
                </div>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono text-neutral-700 mt-3">
                    <div>
                        <dt className="text-neutral-500">processId</dt>
                        <dd className="break-all" data-testid="financials-process-id">{processId}</dd>
                    </div>
                    {buyer && (
                        <div>
                            <dt className="text-neutral-500">buyer</dt>
                            <dd className="break-all">{buyer}</dd>
                        </div>
                    )}
                </dl>
                <p className="text-[11px] text-neutral-500 max-w-2xl mt-3">
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
                <p className="text-sm text-neutral-500" data-testid="financials-empty">
                    No orders found for this process. The chain has no record of any commitment under this processId.
                </p>
            ) : (
                statements.map((document, i) => (
                    <DocumentView key={`${document.genre}-${i}`} document={document} />
                ))
            )}
        </div>
    );
}
