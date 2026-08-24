import type { Metadata } from "next";
import { Suspense } from "react";
import { withOg } from "@/lib/shared/pageMetadata";
import { ProcessAuditClient } from "./ProcessAuditClient";

export const metadata: Metadata = withOg({
    title: "Process audit — Figaro Protocol",
    description: "Consolidated process-level audit: financial statements, the audit-bundle PDF, hash verification, and dispute escalation for one bonded process.",
});

/**
 * /audit/view?process=<processId> — consolidated process-level audit surface.
 *
 * Unifies what previously lived at `/financials/[processId]` and `/verify`:
 *
 *   - Process financials (invoice-style: balance sheet + income statement
 *     + per-order line items + cash-flow log; balance-sheet identity check)
 *   - Audit-bundle PDF download (the resolve receipt)
 *   - Hash verification (three modes — agreement / section / search;
 *     search runs against the wallet's visible orders, including this
 *     process)
 *   - Dispute escalation: a process-scoped `<RecoursePanel>` mounted
 *     here — the end-of-process step where the audit bundle becomes the
 *     evidence exported to an off-chain forum
 *
 * No redirect ships: the static export carries no server redirects and the
 * deployment ships no `_redirects` file. `/audit` (generic verify-only mode)
 * and `/audit/view?process=<processId>` are the only routes into this surface.
 *
 * Wallet-tier (in `(app)/`) because the orders + agreements being audited
 * are the connected wallet's own.
 *
 * The processId is an open-world id, so it rides in a query param read
 * client-side (`ProcessAuditClient` via `useSearchParams`); the page
 * prerenders to a static shell. See `docs/FRONTEND.md` § "Static export".
 */
export default function Page() {
    return (
        <Suspense
            fallback={
                <div className="container mx-auto px-6 py-12">
                    <p className="text-sm text-ink-muted">Loading process audit…</p>
                </div>
            }
        >
            <ProcessAuditClient />
        </Suspense>
    );
}
