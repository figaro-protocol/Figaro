import type { Metadata } from "next";
import { REFERENCE_ASSEMBLIES } from "@/lib/shared/assembly";
import { EditAssemblyClient } from "./EditAssemblyClient";

/**
 * /builders/designer/edit/[slug] — DAG canvas for editing an existing
 * assembly. The slug resolves to either:
 *
 *   - a reference assembly (REFERENCE_ASSEMBLIES) → fork mode
 *     (transitional; this branch goes away when reference assemblies are
 *     removed in Phase 6 of the migration)
 *   - a saved localStorage draft → draft mode (client confirms the
 *     localStorage hit and renders "draft not found" if absent)
 *
 * Server component — exports `generateMetadata` and resolves the
 * optional reference; renders the EditAssemblyClient which selects the
 * DesignerCanvas seed.
 */

interface Props {
    params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const reference = REFERENCE_ASSEMBLIES.find(
        (a) => a.identity.slug === params.slug,
    );
    if (reference) {
        return {
            title: `Edit · ${reference.identity.name} — Figaro Protocol`,
            description: `Fork and modify the ${reference.identity.name} reference assembly on the DAG canvas.`,
        };
    }
    return {
        title: `Edit · ${params.slug} — Figaro Protocol`,
        description: "Edit a saved assembly draft on the DAG canvas.",
    };
}

export default function Page({ params }: Props) {
    const reference =
        REFERENCE_ASSEMBLIES.find((a) => a.identity.slug === params.slug) ?? null;
    return <EditAssemblyClient slug={params.slug} reference={reference} />;
}
