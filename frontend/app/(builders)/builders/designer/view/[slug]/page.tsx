import type { Metadata } from "next";
import { ViewAssemblyClient } from "./ViewAssemblyClient";

/**
 * /builders/designer/view/[slug] — read-only inspect of an assembly.
 *
 * The slug resolves at the client to either a localStorage draft or an
 * on-chain published assembly (via AssemblyRegistered events + IPFS).
 * Server-side metadata is generic — we can't tell from the slug alone
 * which source will resolve, and both sources are client-only.
 */

interface Props {
    params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    return {
        title: `Inspect · ${params.slug} — Figaro Protocol`,
        description: "Read-only view of an assembly's topology and clauses.",
    };
}

export default function Page({ params }: Props) {
    return <ViewAssemblyClient slug={params.slug} />;
}
