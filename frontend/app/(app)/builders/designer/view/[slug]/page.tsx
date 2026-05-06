import type { Metadata } from "next";
import { REFERENCE_ASSEMBLIES } from "@/lib/shared/assembly";
import { ViewAssemblyClient } from "./ViewAssemblyClient";

/**
 * /builders/designer/view/[slug] — read-only DAG view of a reference assembly.
 *
 * Server component — exports `generateMetadata` so the browser tab
 * carries the human-readable assembly name; renders the client
 * ViewAssemblyClient for the read-only canvas.
 */

interface Props {
    params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const reference = REFERENCE_ASSEMBLIES.find(
        (a) => a.identity.slug === params.slug,
    );
    return {
        title: reference
            ? `Inspect · ${reference.identity.name} — Figaro Protocol`
            : "Inspect assembly — Figaro Protocol",
        description: reference
            ? `Read-only view of the ${reference.identity.name} reference assembly on the DAG canvas.`
            : "Read-only view of a reference assembly on the DAG canvas.",
    };
}

export default function Page({ params }: Props) {
    return <ViewAssemblyClient params={params} />;
}
