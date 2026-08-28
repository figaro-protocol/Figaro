"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { OrderTimelineView } from "../_components/OrderTimelineView";

/**
 * /orders/view?process=<processId> — per-order live status.
 *
 * The processId is an open-world id (any bonded process), so it rides in a
 * query param read client-side rather than a build-time route segment — the
 * page prerenders to a static shell and hydrates against chain + IPFS. See
 * `docs/FRONTEND.md` § "Static export".
 */
function OrderViewContent() {
    const searchParams = useSearchParams();
    const processId = searchParams.get("process");

    if (!processId) {
        return (
            <div className="container mx-auto px-6 py-12">
                <p className="text-sm text-ink-muted">No process id in URL.</p>
            </div>
        );
    }

    return <OrderTimelineView processId={processId} />;
}

export default function OrderPage() {
    return (
        <Suspense
            fallback={
                <div className="container mx-auto px-6 py-12">
                    <p className="text-sm text-ink-muted">Loading…</p>
                </div>
            }
        >
            <OrderViewContent />
        </Suspense>
    );
}
