"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { MatchRoundView } from "./_components/MatchRoundView";
import { isValidAddress } from "@/lib/shared/evm";

/**
 * /rounds?pool=<address> — one crowd-steered match round (an
 * OptimisticMatchPool instance), addressed directly.
 *
 * There is NO round registry: a round is emergent from its deployment the way
 * recipients are emergent from donations, so the pool address is an
 * open-world id that rides in a query param and arrives out-of-band (a link
 * in the round's announcement — config, never code). The page prerenders to
 * a static shell and hydrates against the chain.
 */
function RoundsContent() {
    const searchParams = useSearchParams();
    const pool = searchParams.get("pool");

    if (!pool || !isValidAddress(pool)) {
        return (
            <div className="container mx-auto px-6 py-12">
                <p className="text-sm text-ink-muted" data-testid="round-no-pool">
                    No round address in URL. A match round is one OptimisticMatchPool
                    instance — open this page as /rounds?pool=&lt;address&gt; from the
                    round&apos;s announcement.
                </p>
            </div>
        );
    }

    return <MatchRoundView pool={pool as `0x${string}`} />;
}

export default function RoundsPage() {
    return (
        <Suspense
            fallback={
                <div className="container mx-auto px-6 py-12">
                    <p className="text-sm text-ink-muted">Loading round…</p>
                </div>
            }
        >
            <RoundsContent />
        </Suspense>
    );
}
