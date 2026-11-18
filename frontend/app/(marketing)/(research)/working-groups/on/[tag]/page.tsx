import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import { tagEntry, tagIndex } from "@/app/(marketing)/_lib/paperGroups";
import { TagPage } from "../../_components/TagPage";

const KIND = "on" as const;

/** Static export: every entry the registry yields is a page; nothing else is. */
export const dynamicParams = false;

export function generateStaticParams() {
    return tagIndex(KIND).map((t) => ({ tag: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ tag: string }> }): Promise<Metadata> {
    const { tag } = await params;
    const entry = tagEntry(KIND, tag);
    const label = entry?.label ?? tag;
    return withOg({
        title: `${label} — Working Groups — Figaro`,
        description: `The papers that treat ${label}: each with its summary, keywords, and discipline.`,
    });
}

export default async function Page({ params }: { params: Promise<{ tag: string }> }) {
    const { tag } = await params;
    return <TagPage kind={KIND} slug={tag} />;
}
