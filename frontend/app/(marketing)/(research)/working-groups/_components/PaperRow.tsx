import Link from "@/components/shared/Link";
import type { PaperGroup, PaperRef } from "@/app/(marketing)/_lib/paperGroups";
import { tagSlug } from "@/app/(marketing)/_lib/paperGroups";

/**
 * One paper in the corpus index: the word "Paper" before its title, the title
 * as the link to it, its abstract in one breath, and its keywords. `showGroup`
 * adds the discipline link, for pages that list papers across disciplines.
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
    const isPdf = paper.href.endsWith(".pdf");
    const titleClassName = "text-base text-ink-heading font-medium underline underline-offset-2 hover:no-underline";
    return (
        <li>
            <span className="text-base text-ink-muted">{isPdf ? "Paper (PDF): " : "Paper: "}</span>
            {isPdf ? (
                <a href={paper.href} className={titleClassName}>
                    {paper.title}
                </a>
            ) : (
                <Link href={paper.href} className={titleClassName}>
                    {paper.title}
                </Link>
            )}
            <p className="text-sm text-ink-body leading-relaxed mt-1">{paper.summary}</p>
            <p className="text-xs text-ink-muted mt-1 leading-relaxed">
                Keywords:{" "}
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
