"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { EditAssemblyClient } from "./EditAssemblyClient";

/**
 * /assemblies/designer/edit?slug=<slug> — topology canvas for editing a saved
 * draft.
 *
 * The slug must resolve to a localStorage draft; the client renders a
 * "draft not found" empty state if no match. Forking a published
 * on-chain assembly is the separate Fork action on `PublishedList`,
 * which spawns a new local draft under a fresh slug before routing here.
 *
 * The slug is an open-world id, so it rides in a query param read
 * client-side; the page prerenders to a static shell. See
 * `docs/FRONTEND.md` § "Static export".
 */
function EditAssemblyContent() {
    const searchParams = useSearchParams();
    const slug = searchParams.get("slug") ?? "";

    return <EditAssemblyClient slug={slug} />;
}

export default function Page() {
    return (
        <Suspense
            fallback={
                <div className="container mx-auto px-6 py-12">
                    <p className="text-sm text-ink-muted">Loading draft…</p>
                </div>
            }
        >
            <EditAssemblyContent />
        </Suspense>
    );
}
