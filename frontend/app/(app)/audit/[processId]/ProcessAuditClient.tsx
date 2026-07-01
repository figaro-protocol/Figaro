"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { ProcessFinancialsView } from "../_components/ProcessFinancialsView";
import { ProcessClauseEvidence } from "../_components/ProcessClauseEvidence";
import { HashVerifier } from "../_components/HashVerifier";
import { DisputeStatusPanel } from "@/components/core/DisputeStatusPanel";
import { useProcessOrders } from "@/hooks/core/useProcessOrders";
import { useProcessAgreements } from "@/hooks/core/useProcessAgreements";
import { resolveProcessRecourse } from "@/lib/semantic/processRecourse";

/**
 * Dispute escalation for the process. In the three-layer dispute model
 * (on-chain-evidence paper: Layer 1 bonding + Layer 2 coordination, then Layer 3 — the
 * evidentiary record exported to an off-chain forum), escalation happens
 * at the end of a process, so the panel lives here, beside the
 * audit-bundle PDF the forum would receive. Process-scoped: one panel per
 * process — not one per order.
 */
function ProcessDisputeSection({ processId }: { processId: string }) {
    const orders = useProcessOrders(processId);
    const agreementHashes = useMemo(
        () => orders.map((o) => o.agreementHash).filter((h): h is string => Boolean(h)),
        [orders],
    );
    const agreements = useProcessAgreements(agreementHashes);

    // Layer-3 recourse is whatever the assembly's dispute-resolution clauses
    // named — read off the committed orders by spec, not a global default.
    const recourses = useMemo(() => resolveProcessRecourse(orders, agreements), [orders, agreements]);

    return (
        <div data-testid="audit-dispute-section">
            <DisputeStatusPanel
                processId={processId as `0x${string}`}
                recourses={recourses}
                orders={orders}
            />
        </div>
    );
}

export function ProcessAuditClient() {
    const params = useParams<{ processId: string }>();
    const processId = params?.processId ?? null;

    if (!processId) {
        return (
            <div className="container mx-auto px-6 py-12">
                <p className="text-sm text-ink-muted">No process id in URL.</p>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-6 py-10 max-w-5xl space-y-12" data-testid="audit-page">
            <header className="space-y-2">
                <h1 className="text-heading-h2 text-ink-heading">
                    Process audit
                </h1>
                <p className="text-sm text-ink-body max-w-2xl">
                    Consolidated financials, audit-bundle PDF, hash verification, and
                    dispute escalation for one process. After the buyer triggers{" "}
                    <code>resolveProcess</code>, the audit-bundle PDF below is the
                    resolve receipt.
                </p>
            </header>

            <ProcessFinancialsView processId={processId} />

            <div className="border-t border-default pt-12">
                <ProcessClauseEvidence processId={processId} />
            </div>

            <div className="border-t border-default pt-12">
                <ProcessDisputeSection processId={processId} />
            </div>

            <div className="border-t border-default pt-12">
                <HashVerifier />
            </div>
        </div>
    );
}
