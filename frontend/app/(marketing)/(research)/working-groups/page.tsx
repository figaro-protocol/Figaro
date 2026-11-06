import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "@/components/shared/Link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { DisciplineIntersectionFigure } from "@/components/figures/DisciplineIntersectionFigure";
import { PAPER_GROUPS, tagIndex } from "@/app/(marketing)/_lib/paperGroups";
import { PaperRow } from "./_components/PaperRow";

/** The taxonomy's source — cited ONCE, in the page footnote. */
const TAXONOMY_URL =
    "https://research.wu.ac.at/en/publications/foundations-of-cryptoeconomic-systems-6/";

export const metadata: Metadata = withOg({
    title: "Working Groups — Figaro",
    description:
        "Form working groups where you are: people from different disciplines, around the papers. The eight disciplines of cryptoeconomics, the papers in each, and how to publish what your group finds.",
});

/** The reader's index, derived: which industries and fields the papers name as their doorway. */
const INDUSTRIES = tagIndex("for");

export default function WorkingGroups() {
    return (
        <>
            <MarketingHero
                title="Working groups."
                lead={
                    <>
                        Form working groups where you are. No permission. No charter.
                        <br />
                        Bring people from different disciplines together: every question here crosses several, and no single discipline can close it alone.
                        <br />
                        Start from a paper. Read it. Break it. Build on it.
                    </>
                }
            />

            <MarketingSection title="Form a group.">
                <ol className="text-base text-ink-body leading-relaxed max-w-2xl space-y-2 list-decimal pl-6">
                    <li>
                        <span className="text-ink-heading font-medium">Pick an area of interest.</span> One of the eight disciplines below. Explore the papers, within and outside of that area.
                    </li>
                    <li>
                        <span className="text-ink-heading font-medium">Find people.</span> Three or four, from different disciplines, near you.
                    </li>
                    <li>
                        <span className="text-ink-heading font-medium">Meet.</span> Read a paper together. Try to refute it.
                    </li>
                    <li>
                        <span className="text-ink-heading font-medium">Publish.</span> A new paper, a correction, or your group&rsquo;s venue: one pull request against{" "}
                        <a href="https://github.com/figaro-protocol/Figaro" className="underline" rel="noreferrer">
                            the papers index in the repository
                        </a>
                        .
                    </li>
                    <li>
                        <span className="text-ink-heading font-medium">Build.</span> Clauses, agreements and assemblies the network uses earn{" "}
                        <Link href="/rpgf" className="text-ink-heading font-medium hover:underline">Designer Rewards</Link>, in proportion to use.
                    </li>
                </ol>
            </MarketingSection>

            <MarketingSection title="Eight disciplines.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl mb-6">
                    The eight disciplines are<sup>1</sup>:
                </p>
                <DisciplineIntersectionFigure
                    labels={PAPER_GROUPS.map((g) => g.name)}
                    hrefs={PAPER_GROUPS.map((g) => `#${g.slug}`)}
                    className="mb-10"
                />
                <div id="index" className="scroll-mt-24 md:grid md:grid-cols-[1fr_13rem] md:gap-8">
                <aside className="mb-10 md:mb-0 md:order-2 md:sticky md:top-24 md:self-start">
                    <h3 className="text-sm text-ink-heading font-medium">By industry.</h3>
                    <p className="text-xs text-ink-muted leading-relaxed mt-1 mb-3">
                        Arriving from one of these? Start there.
                    </p>
                    <ul className="text-xs space-y-1">
                        {INDUSTRIES.map((t) => (
                            <li key={t.slug}>
                                <Link href={`/working-groups/for/${t.slug}`} className="text-ink-heading hover:underline">
                                    {t.label}
                                </Link>
                                <span className="text-ink-muted"> · {t.papers.length}</span>
                            </li>
                        ))}
                    </ul>
                </aside>
                <div className="space-y-10 md:order-1">
                    {PAPER_GROUPS.map((g) => (
                        <article key={g.slug} id={g.slug} className="scroll-mt-24 border-l-2 border-default pl-6">
                            <h3 className="text-heading-h3 text-ink-heading leading-snug">
                                {g.name}
                            </h3>
                            <p className="text-xs text-ink-muted italic mt-0.5">
                                {g.discipline}
                            </p>
                            <p className="text-sm text-ink-body leading-relaxed max-w-2xl mt-2">
                                {g.intro}
                            </p>
                            <ul className="space-y-5 max-w-2xl mt-5">
                                {g.papers.map((p) => (
                                    <PaperRow key={p.href} paper={p} group={g} showGroup={false} />
                                ))}
                            </ul>
                            {g.venue && (
                                <p className="text-xs text-ink-muted mt-3">
                                    Venue:{" "}
                                    <a href={g.venue.href} className="underline" rel="noreferrer">
                                        {g.venue.label}
                                    </a>
                                </p>
                            )}
                        </article>
                    ))}
                </div>
                </div>
                <p className="text-xs text-ink-muted leading-relaxed max-w-2xl mt-10">
                    <sup>1</sup> Voshmgir, S. &amp; Zargham, M.,{" "}
                    <a href={TAXONOMY_URL} className="underline" rel="noreferrer">
                        &ldquo;Foundations of Cryptoeconomic Systems&rdquo;
                    </a>
                    , Working Paper Series 1/2020, Research Institute for Cryptoeconomics, WU Vienna, 2020.
                </p>
            </MarketingSection>

        </>
    );
}
