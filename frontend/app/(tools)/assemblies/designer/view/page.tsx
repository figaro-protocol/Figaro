"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ViewAssemblyClient } from "./ViewAssemblyClient";

/**
 * /assemblies/designer/view?slug=<slug> — read-only inspect of an assembly.
 *
 * The slug resolves at the client to either a localStorage draft or an
 * on-chain published assembly (via AssemblyRegistered events + IPFS). It is
 * an open-world id, so it rides in a query param read client-side; the page
 * prerenders to a static shell. See `docs/FRONTEND.md` § "Static export".
 */
function ViewAssemblyContent() {
    const searchParams = useSearchParams();
    const slug = searchParams.get("slug") ?? "";

    return <ViewAssemblyClient slug={slug} />;
}

export default function Page() {
    return (
        <Suspense
            fallback={
                <div className="container mx-auto px-6 py-12">
                    <p className="text-sm text-ink-muted">Loading…</p>
                </div>
            }
        >
            <ViewAssemblyContent />
        </Suspense>
    );
}
