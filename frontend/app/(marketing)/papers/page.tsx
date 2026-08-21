import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { PAPER_GROUPS } from "../_lib/paperGroups";

export const metadata: Metadata = withOg({
    title: "Papers — Figaro Protocol",
    description:
        "The paper corpus, listed as papers: every preprint across the eight working-group disciplines, with its one-line claim. The disciplines themselves — and the groups behind them — are on Working Groups.",
});

// The index lists; it does not re-teach. Discipline framing, current work, and
// venues belong to /working-groups (the disciplines page); each paper's claims
// belong to the paper. Derived entirely from PAPER_GROUPS — never a hand list
// (maintainer-ruled 2026-08-21, superseding the working-groups-only route).
export default function PapersIndex() {
    const groups = PAPER_GROUPS.filter((g) => (g.papers?.length ?? 0) > 0);
    const total = groups.reduce((n, g) => n + (g.papers?.length ?? 0), 0);
    return (
        <>
            <MarketingHero
                title="Papers"
                lead={
                    <>
                        {total} preprints, one corpus: the same settlement mechanism read through eight disciplines. Every paper stands alone; the disciplines and the working groups behind them are described on{" "}
                        <Link href="/working-groups" className="underline">
                            Working Groups
                        </Link>
                        .
                    </>
                }
            />
            {groups.map((group) => (
                <MarketingSection key={group.slug} title={group.name}>
                    <ul className="space-y-5">
                        {group.papers!.map((paper) => (
                            <li key={paper.href} className="text-base text-ink-body leading-relaxed">
                                <Link href={paper.href} className="text-ink-heading hover:underline font-medium">
                                    {paper.title}
                                </Link>
                                {paper.formalCore && (
                                    <span className="ml-2 text-xs uppercase tracking-wide text-ink-muted border border-default rounded-tile px-1.5 py-0.5 align-middle">
                                        formal core
                                    </span>
                                )}
                                {paper.blurb && (
                                    <p className="text-sm text-ink-muted leading-relaxed mt-1">{paper.blurb}</p>
                                )}
                            </li>
                        ))}
                    </ul>
                    <p className="text-sm text-ink-muted leading-relaxed mt-6">
                        <Link href={`/working-groups#${group.slug}`} className="hover:underline">
                            About this discipline &rarr;
                        </Link>
                    </p>
                </MarketingSection>
            ))}
        </>
    );
}
