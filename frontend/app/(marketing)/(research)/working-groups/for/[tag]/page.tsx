import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import { tagEntry, tagIndex } from "@/app/(marketing)/_lib/paperGroups";
import { TagPage } from "../../_components/TagPage";

const KIND = "for" as const;

/** Static export: every entry the registry yields is a page; nothing else is. */
export const dynamicParams = false;

export function generateStaticParams() {
    return tagIndex(KIND).map((t) => ({ tag: t.slug }));
}

export function generateMetadata({ params }: { params: { tag: string } }): Metadata {
    const { tag } = params;
    const entry = tagEntry(KIND, tag);
    const label = entry?.label ?? tag;
    return withOg({
        title: `${label} — Working Groups — Figaro Protocol`,
        description: `The papers that treat ${label}: each with its summary, keywords, and discipline.`,
    });
}

export default function Page({ params }: { params: { tag: string } }) {
    const { tag } = params;
    return <TagPage kind={KIND} slug={tag} />;
}
