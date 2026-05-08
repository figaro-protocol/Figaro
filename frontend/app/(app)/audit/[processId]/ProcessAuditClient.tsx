"use client";

import { useParams } from "next/navigation";
import { ProcessFinancialsView } from "../_components/ProcessFinancialsView";
import { HashVerifier } from "../_components/HashVerifier";

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
                <p className="text-eyebrow uppercase text-ink-muted">
                    Audit
                </p>
                <h1 className="text-heading-h2 text-ink-heading">
                    Process audit
                </h1>
                <p className="text-sm text-ink-body max-w-2xl">
                    Consolidated financials, audit-bundle PDF, and hash verification
                    for one process. After the buyer triggers <code>resolveProcess</code>,
                    the audit-bundle PDF below is the resolve receipt.
                </p>
            </header>

            <ProcessFinancialsView processId={processId} />

            <div className="border-t border-default pt-12">
                <HashVerifier />
            </div>
        </div>
    );
}
