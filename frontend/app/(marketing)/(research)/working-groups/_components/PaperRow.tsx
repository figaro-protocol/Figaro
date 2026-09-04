import Link from "next/link";
import type { PaperGroup, PaperRef } from "@/app/(marketing)/_lib/paperGroups";
import { tagSlug } from "@/app/(marketing)/_lib/paperGroups";

/**
 * One paper in the corpus index: title, the one-breath summary, and the
 * keywords as index links. `showGroup` adds the discipline link, for pages
 * that list papers across disciplines.
 */
export function PaperRow({
    paper,
    group,
    showGroup = true,
    highlight,
}: {
    paper: PaperRef;
    group: PaperGroup;
    showGroup?: boolean;
    /** Keyword slug to render without a link (the page the reader is on). */
    highlight?: string;
}) {
    return (
        <li>
            {paper.href.endsWith(".pdf") ? (
                <a href={paper.href} className="text-ink-heading hover:underline text-sm">
                    {paper.title}
                </a>
            ) : (
                <Link href={paper.href} className="text-ink-heading hover:underline text-sm">
                    {paper.title}
                </Link>
            )}
            <p className="text-sm text-ink-body leading-relaxed mt-1">{paper.summary}</p>
            <p className="text-xs text-ink-muted mt-1 leading-relaxed">
                {paper.keywords.map((k, i) => {
                    const slug = tagSlug(k);
                    return (
                        <span key={slug}>
                            {i > 0 && " · "}
                            {slug === highlight ? (
                                <span>{k}</span>
                            ) : (
                                <Link href={`/working-groups/on/${slug}`} className="hover:underline">
                                    {k}
                                </Link>
                            )}
                        </span>
                    );
                })}
                {showGroup && (
                    <>
                        {" — "}
                        <Link href={`/working-groups#${group.slug}`} className="hover:underline">
                            {group.name}
                        </Link>
                    </>
                )}
            </p>
        </li>
    );
}
