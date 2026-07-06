import type { Metadata } from "next";
import { truncateHex } from "@/lib/shared/formatHex";
import { ProcessAuditClient } from "./ProcessAuditClient";

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
 *   - Dispute escalation: a process-scoped `<RecoursePanel>` mounted
 *     here — the end-of-process step where the audit bundle becomes the
 *     evidence exported to an off-chain forum
 *
 * The legacy routes redirect:
 *   - `/financials/[processId]` → `/audit/[processId]`
 *   - `/verify` → `/audit` (no processId; generic verify-only mode)
 *
 * Wallet-tier (in `(app)/`) because the orders + agreements being audited
 * are the connected wallet's own.
 *
 * Server component — exports `generateMetadata` so the browser tab shows
 * the truncated processId; renders `<ProcessAuditClient />` for the
 * wallet-aware UI.
 */

interface Props {
    params: { processId: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const truncated = truncateHex(params.processId, { head: 10, tail: 4 });
    return {
        title: `Process ${truncated} — Figaro Protocol`,
        description:
            "Process-bound audit: financials, audit-bundle PDF, and hash verification.",
    };
}

export default function Page() {
    return <ProcessAuditClient />;
}
