import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import { SearchParamsBoundary } from "@/components/shared/QueryParamPage";
import { NewAssemblyClient } from "./NewAssemblyClient";

/**
 * /assemblies/designer/new — topology-canvas designer for fresh assemblies.
 *
 * Server component — exports static metadata; renders the client
 * NewAssemblyClient (which carries all the React state, autosave,
 * and TopologyCanvas wiring). `NewAssemblyClient` reads `useSearchParams`
 * (the optional `?draft=` and `?fresh=` seeds), so it mounts behind the shared
 * `SearchParamsBoundary` — required for the static export prerender. See
 * `docs/FRONTEND.md` § "Static export".
 */

export const metadata: Metadata = withOg({
    title: "New assembly — Figaro",
    description: "Compose a Figaro assembly on the topology canvas. Drafts persist in local storage.",
});

export default function Page() {
    return (
        <SearchParamsBoundary>
            <NewAssemblyClient />
        </SearchParamsBoundary>
    );
}
