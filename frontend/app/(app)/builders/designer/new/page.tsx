import type { Metadata } from "next";
import { NewAssemblyClient } from "./NewAssemblyClient";

/**
 * /builders/designer/new — DAG-canvas designer for fresh assemblies.
 *
 * Server component — exports static metadata; renders the client
 * NewAssemblyClient (which carries all the React state, autosave,
 * and ProcessGraphCanvas wiring).
 */

export const metadata: Metadata = {
    title: "New assembly — Figaro Protocol",
    description: "Compose a Figaro assembly on the DAG canvas. Drafts persist in local storage.",
};

export default function Page() {
    return <NewAssemblyClient />;
}
