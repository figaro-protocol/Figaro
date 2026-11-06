import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "@/components/shared/Link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { DisciplineIntersectionFigure } from "@/components/figures/DisciplineIntersectionFigure";
import { PAPER_GROUPS, tagIndex } from "@/app/(marketing)/_lib/paperGroups";
import { PaperRow } from "./_components/PaperRow";
import { More } from "./_components/More";

/** The taxonomy's source — cited ONCE, in the page footnote. */
const TAXONOMY_URL =
    "https://research.wu.ac.at/en/publications/foundations-of-cryptoeconomic-systems-6/";

export const metadata: Metadata = withOg({
    title: "Working Groups — Figaro",
    description:
        "Form a working group where you are: people from different disciplines, around one paper. The eight disciplines of cryptoeconomics, the question each paper asks, and how to publish what your group finds.",
});

/** Derived, never stated: the corpus size is whatever `PAPER_GROUPS` holds. */
const PAPER_COUNT = PAPER_GROUPS.reduce((n, g) => n + g.papers.length, 0);

/** The reader's index, derived: which industries and fields the papers name as their doorway. */
const INDUSTRIES = tagIndex("for");

/** The three papers to read first, whatever the reader's discipline. */
const READ_FIRST = [
    { href: "/papers/figaro-as-a-cryptoeconomic-system", label: "Figaro as a Cryptoeconomic System", line: "the whole, in the field’s own definitions" },
    { href: "/papers/asymmetric-bonding", label: "Asymmetric Bonding and Buyer Dominance", line: "the equilibrium everything else reasons from" },
    { href: "/papers/verified-resolution-kernel", label: "What Formal Verification Transfers to a Bonded Contract", line: "what a machine has and has not checked" },
];

export default function WorkingGroups() {
    return (
        <>
            <MarketingHero
                title="Working groups."
                lead={
                    <>
                        Form one where you are. No permission. No charter.
                        <br />
                        Mix the disciplines: no single one closes these questions.
                        <br />
                        Start from a paper. Read it. Break it. Build on it.
                    </>
                }
            />

            <MarketingSection title="Form a group.">
                <ol className="text-base text-ink-body leading-relaxed max-w-2xl space-y-2 list-decimal pl-6">
                    <li>
                        <span className="text-ink-heading font-medium">Pick a question.</span> Every paper below asks one.
                    </li>
                    <li>
                        <span className="text-ink-heading font-medium">Find people.</span> Three or four, from different disciplines, near you.
                    </li>
                    <li>
                        <span className="text-ink-heading font-medium">Meet.</span> Read the paper together. Try to refute it.
                    </li>
                    <li>
                        <span className="text-ink-heading font-medium">Publish.</span> A new paper, a correction, or your group&rsquo;s venue: one pull request against{" "}
                        <a href="https://github.com/figaro-protocol/Figaro" className="underline" rel="noreferrer">
                            the papers index in the repository
                        </a>
                        .
                    </li>
                    <li>
                        <span className="text-ink-heading font-medium">Build.</span> Clauses and assemblies the network uses earn{" "}
                        <Link href="/rpgf" className="text-ink-heading font-medium hover:underline">Designer Rewards</Link>, in proportion to use. Work that comes before any use: the{" "}
                        <Link href="/dao" className="text-ink-heading font-medium hover:underline">DAO&rsquo;s treasury</Link>, by human judgment.
                    </li>
                </ol>
            </MarketingSection>

            <MarketingSection title="Eight disciplines.">
                <ul className="text-sm text-ink-body leading-relaxed max-w-2xl space-y-1 mb-8">
                    <li>
                        The eight are Voshmgir and Zargham&rsquo;s, not ours<sup>1</sup>. {PAPER_COUNT} papers so far.
                    </li>
                    <li>A working group crosses them. Never one group per discipline.</li>
                    <li>
                        Read first, whatever your field:
                        <ul className="mt-1 space-y-1 pl-4">
                            {READ_FIRST.map((p) => (
                                <li key={p.href}>
                                    <Link href={p.href} className="text-ink-heading hover:underline">{p.label}</Link>
                                    <span className="text-ink-muted"> — {p.line}</span>
                                </li>
                            ))}
                        </ul>
                    </li>
                </ul>
                <DisciplineIntersectionFigure labels={PAPER_GROUPS.map((g) => g.name)} className="mb-10" />
                <div id="index" className="scroll-mt-24 lg:grid lg:grid-cols-[1fr_15rem] lg:gap-10">
                <aside className="mb-10 lg:mb-0 lg:order-2 lg:sticky lg:top-24 lg:self-start">
                    <h3 className="text-sm text-ink-heading font-medium">By industry.</h3>
                    <p className="text-xs text-ink-muted leading-relaxed mt-1 mb-3">
                        Arriving from one of these? Start there.
                    </p>
                    <ul className="text-sm space-y-1">
                        {INDUSTRIES.map((t) => (
                            <li key={t.slug}>
                                <Link href={`/working-groups/for/${t.slug}`} className="text-ink-heading hover:underline">
                                    {t.label}
                                </Link>
                                <span className="text-xs text-ink-muted"> · {t.papers.length}</span>
                            </li>
                        ))}
                    </ul>
                </aside>
                <div className="space-y-10 lg:order-1">
                    {PAPER_GROUPS.map((g) => (
                        <article key={g.slug} id={g.slug} className="scroll-mt-24 border-l-2 border-default pl-6">
                            <h3 className="text-heading-h3 text-ink-heading leading-snug">
                                {g.name}
                            </h3>
                            <p className="text-xs text-ink-muted italic mt-0.5">
                                {g.discipline}
                            </p>
                            <More id={`about-${g.slug}`} label="About this discipline">
                                <p className="text-sm text-ink-body leading-relaxed max-w-2xl mb-3">
                                    {g.intro}
                                </p>
                                <p className="text-sm text-ink-body leading-relaxed max-w-2xl">
                                    {g.definition}
                                </p>
                            </More>
                            <ul className="space-y-4 max-w-2xl mt-2">
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
