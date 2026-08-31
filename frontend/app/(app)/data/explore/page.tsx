import type { Metadata } from "next";
import { Suspense } from "react";
import { withOg } from "@/lib/shared/pageMetadata";
import { DataExplorer } from "@/components/data/DataExplorer";

/**
 * /data/explore — the graph-query surface `docs/DATA_LAYER.md`
 * promises ("agents discover work through graph queries, not platform-mediated
 * matching"), for the human who wants to ask the questions themselves.
 *
 * `(app)` tier, but SPECTATOR-CAPABLE like `/audit`: every view reads the
 * public record through the standalone client and nothing here is gated on a
 * connected wallet. Server component — the `<DataExplorer />` child carries
 * its own `"use client"` and reads its view + wallet subject from the query
 * string behind a Suspense boundary (open-world ids ride in query params,
 * never route segments).
 *
 * The nav label derives from this title.
 */
export const metadata: Metadata = withOg({
    title: "Data explorer — Figaro Protocol",
    description:
        "Query the public graphs the protocol emits — market shape per assembly, one overlay per attestable clause family in use, value flow per denomination, and any wallet's public trading record. Each layer carries its own truth boundary; projected in your browser from the network's own event record.",
});

export default function DataExplorePage() {
    return (
        <div className="container mx-auto px-6 py-10 max-w-3xl space-y-8" data-testid="data-explore-page">
            <header className="space-y-2">
                <h1 className="text-heading-h2 text-ink-heading">Data explorer</h1>
                <p className="text-sm text-ink-body max-w-2xl">
                    The graphs a Figaro network emits, each rendered as its own layer with the
                    guarantee behind it named &mdash; what the kernel enforces, what an institution
                    declared, what is anchored on chain with its content off it, and what is read
                    from a composed venue. No wallet, no account: everything here is public by
                    construction.
                </p>
            </header>

            <Suspense fallback={<p className="text-sm text-ink-muted">Reading the record&hellip;</p>}>
                <DataExplorer />
            </Suspense>
        </div>
    );
}
