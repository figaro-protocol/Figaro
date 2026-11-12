"use client";

import { useMemo } from "react";
import { QueryParamPage, processIdParam } from "@/components/shared/QueryParamPage";
import { ProcessFinancialsView } from "../_components/ProcessFinancialsView";
import { ProcessClauseEvidence } from "../_components/ProcessClauseEvidence";
import { HashVerifier } from "../_components/HashVerifier";
import { RecoursePanel } from "@/components/runtime/RecoursePanel";
import { AgreementPinErasure } from "@/components/runtime/AgreementPinErasure";
import { useProcessOrders } from "@/hooks/useProcessOrders";
import { useProcessAgreements } from "@/hooks/useProcessAgreements";
import { deriveProcessRecourse } from "@/lib/semantic/processRecourse";
import type { Order } from "@/lib/core/store";

/**
 * Dispute escalation for the process. In the layered dispute model
 * (on-chain-evidence paper, 1-indexed: Layer 2 bonding + Layer 3 coordination, then the
 * evidentiary data exported to an off-chain forum at Layers 4–5), escalation happens
 * while the process stands open, before the buyer resolves, so the panel lives here, beside the
 * audit-bundle PDF the forum would receive. Process-scoped: one panel per
 * process — not one per order.
 */
function ProcessDisputeSection({ processId }: { processId: string }) {
    const read = useProcessOrders(processId);
    // Recourse is offered only over orders the chain returned.
    if (read.status !== "present") return null;
    return <ProcessDispute processId={processId} orders={read.value} />;
}

function ProcessDispute({ processId, orders }: { processId: string; orders: Order[] }) {
    const checkoutHashes = useMemo(
        () => orders.map((o) => o.checkoutHash).filter((h): h is string => Boolean(h)),
        [orders],
    );
    const agreements = useProcessAgreements(checkoutHashes);

    // Layer-3 recourse is whatever the assembly's dispute-resolution clauses
    // named — read off the committed orders by spec, not a global default.
    const recourses = useMemo(() => deriveProcessRecourse(orders, agreements), [orders, agreements]);

    return (
        <div data-testid="audit-dispute-section">
            <RecoursePanel
                processId={processId as `0x${string}`}
                recourses={recourses}
                orders={orders}
            />
            <AgreementPinErasure checkoutHashes={checkoutHashes} />
        </div>
    );
}

/** The page body: the `process` query parameter through `QueryParamPage`, which
 *  renders nothing for a missing or malformed process id. */
export function ProcessAuditClient() {
    return (
        <QueryParamPage param="process" validate={processIdParam}>
            {(processId) => <ProcessAudit processId={processId} />}
        </QueryParamPage>
    );
}

function ProcessAudit({ processId }: { processId: `0x${string}` }) {
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
