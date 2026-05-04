"use client";

/**
 * /audit/[processId] — consolidated process-level audit surface.
 *
 * Unifies what previously lived at `/financials/[processId]` and `/verify`:
 *
 *   - Process financials (invoice-style: balance sheet + income statement
 *     + per-order line items + cash-flow log; balance-sheet identity check)
 *   - Audit-bundle PDF download (the resolve receipt)
 *   - Hash verification (three modes — agreement / section / search;
 *     search runs against the wallet's visible orders, including this
 *     process)
 *   - Kleros entry: surfaced from per-order cards via `<DisputeStatusPanel>`
 *     (mounted by `OrderNodeSemanticCard`) — not duplicated here
 *
 * The legacy routes redirect:
 *   - `/financials/[processId]` → `/audit/[processId]`
 *   - `/verify` → `/audit` (no processId; generic verify-only mode)
 *
 * Wallet-tier (in `(app)/`) because the orders + agreements being audited
 * are the connected wallet's own.
 */

import { useParams } from "next/navigation";
import { ProcessFinancialsView } from "@/components/core/audit/ProcessFinancialsView";
import { HashVerifier } from "@/components/core/audit/HashVerifier";

export default function ProcessAuditPage() {
    const params = useParams<{ processId: string }>();
    const processId = params?.processId ?? null;

    if (!processId) {
        return (
            <div className="container mx-auto px-6 py-12">
                <p className="text-sm text-neutral-500">No process id in URL.</p>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-6 py-10 max-w-5xl space-y-12" data-testid="audit-page">
            <header className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                    Audit
                </p>
                <h1 className="text-2xl font-bold text-black">
                    Process audit
                </h1>
                <p className="text-sm text-neutral-700 max-w-2xl">
                    Consolidated financials, audit-bundle PDF, and hash verification
                    for one process. After the buyer triggers <code>resolveProcess</code>,
                    the audit-bundle PDF below is the resolve receipt.
                </p>
            </header>

            <ProcessFinancialsView processId={processId} />

            <div className="border-t border-neutral-200 pt-12">
                <HashVerifier />
            </div>
        </div>
    );
}
