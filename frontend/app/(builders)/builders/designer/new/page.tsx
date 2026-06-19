import type { Metadata } from "next";
import { NewAssemblyClient } from "./NewAssemblyClient";

/**
 * /builders/designer/new — topology-canvas designer for fresh assemblies.
 *
 * Server component — exports static metadata; renders the client
 * NewAssemblyClient (which carries all the React state, autosave,
 * and TopologyCanvas wiring).
 */

export const metadata: Metadata = {
    title: "New assembly — Figaro Protocol",
    description: "Compose a Figaro assembly on the topology canvas. Drafts persist in local storage.",
};

export default function Page() {
    return <NewAssemblyClient />;
}
