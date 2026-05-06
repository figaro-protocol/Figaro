import type { Metadata } from "next";
import { REFERENCE_ASSEMBLIES } from "@/lib/shared/assembly";
import { EditAssemblyClient } from "./EditAssemblyClient";

/**
 * /builders/designer/edit/[slug] — fork-and-edit a reference assembly.
 *
 * Server component — exports `generateMetadata` so the browser tab
 * carries the human-readable assembly name; renders the client
 * EditAssemblyClient for the canvas + drawer UI.
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
            ? `Edit · ${reference.identity.name} — Figaro Protocol`
            : "Edit assembly — Figaro Protocol",
        description: reference
            ? `Fork and modify the ${reference.identity.name} reference assembly on the DAG canvas.`
            : "Fork and modify a reference assembly on the DAG canvas.",
    };
}

export default function Page({ params }: Props) {
    return <EditAssemblyClient params={params} />;
}
