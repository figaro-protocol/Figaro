import type { Metadata } from "next";
import { Suspense } from "react";
import { NewAssemblyClient } from "./NewAssemblyClient";

/**
 * /builders/designer/new — topology-canvas designer for fresh assemblies.
 *
 * Server component — exports static metadata; renders the client
 * NewAssemblyClient (which carries all the React state, autosave,
 * and TopologyCanvas wiring). `NewAssemblyClient` reads `useSearchParams`
 * (the `?e2e=` mode flag), so it mounts behind a Suspense boundary — required
 * for the static export prerender. See `docs/FRONTEND.md` § "Static export".
 */

export const metadata: Metadata = {
    title: "New assembly — Figaro Protocol",
    description: "Compose a Figaro assembly on the topology canvas. Drafts persist in local storage.",
};

export default function Page() {
    return (
        <Suspense
            fallback={
                <div className="container mx-auto px-6 py-12">
                    <p className="text-sm text-ink-muted">Loading designer…</p>
                </div>
            }
        >
            <NewAssemblyClient />
        </Suspense>
    );
}
