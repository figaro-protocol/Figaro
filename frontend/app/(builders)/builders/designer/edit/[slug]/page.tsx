import type { Metadata } from "next";
import { EditAssemblyClient } from "./EditAssemblyClient";

/**
 * /builders/designer/edit/[slug] — DAG canvas for editing a saved draft.
 *
 * The slug must resolve to a localStorage draft; the client renders a
 * "draft not found" empty state if no match. Forking a published
 * on-chain assembly is the separate Fork action on `PublishedList`,
 * which spawns a new local draft under a fresh slug before routing here.
 */

interface Props {
    params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    return {
        title: `Edit · ${params.slug} — Figaro Protocol`,
        description: "Edit a saved assembly draft on the DAG canvas.",
    };
}

export default function Page({ params }: Props) {
    return <EditAssemblyClient slug={params.slug} />;
}
