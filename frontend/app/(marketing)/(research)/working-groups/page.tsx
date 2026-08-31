import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { DisciplineIntersectionFigure } from "@/components/figures/DisciplineIntersectionFigure";
import { PAPER_GROUPS } from "@/app/(marketing)/_lib/paperGroups";

/** The taxonomy's source — cited ONCE, in the page footnote. */
const TAXONOMY_URL =
    "https://research.wu.ac.at/en/publications/foundations-of-cryptoeconomic-systems-6/";

export const metadata: Metadata = withOg({
    title: "Working Groups — Figaro Protocol",
    description:
        "Before you build on a protocol you check its arguments. The papers that carry them — the equilibrium proof, the mechanisms by which an offer forms, the scope of what is formally verified, the legal and political readings — sorted into the eight disciplines of cryptoeconomics. The eight groups, their papers, and how to contribute.",
});

/** Derived, never stated: the corpus size is whatever `PAPER_GROUPS` holds. */
const PAPER_COUNT = PAPER_GROUPS.reduce((n, g) => n + g.papers.length, 0);

export default function WorkingGroups() {
    return (
        <>
            <MarketingHero
                title="Working groups."
                lead={
                    <>
                        Before you build on a protocol you check its arguments. {PAPER_COUNT} papers carry them &mdash; the equilibrium proof, the mechanisms by which an offer forms, the scope of what is formally verified, the legal and political readings &mdash; sorted into the eight disciplines of cryptoeconomics. Two of them come first whatever your discipline: <Link href="/papers/asymmetric-bonding" className="text-ink-heading hover:underline">Asymmetric Bonding and Buyer Dominance</Link> derives the equilibrium the rest of the corpus reasons from, and <Link href="/papers/verified-settlement-kernel" className="text-ink-heading hover:underline">A Verified Settlement Kernel</Link> says what a machine has and has not checked about the code that runs it; after those two, read the group nearest your own field. A working group is whoever is doing that work in a discipline; groups form and work wherever their people are.
</>
                }
            />

            <MarketingSection title="The groups.">
                <p className="text-sm text-ink-body leading-relaxed max-w-2xl mb-8">
                    The eight disciplines are not ours. They are the taxonomy set out by Voshmgir &amp; Zargham<sup>1</sup>, which argues that cryptoeconomic systems are irreducibly multi-disciplinary objects and enumerates the disciplines a full account of one must pass through. The project adopts that list rather than inventing its own, so that a reader arriving from any one of the eight finds the substrate addressed in that discipline&rsquo;s own vocabulary, and so that the depth of coverage under each is measured against a list the project did not draw.
                </p>
                <DisciplineIntersectionFigure labels={PAPER_GROUPS.map((g) => g.name)} className="mb-10" />
                <div className="space-y-10">
                    {PAPER_GROUPS.map((g) => (
                        <article key={g.slug} id={g.slug} className="scroll-mt-24 border-l-2 border-default pl-6">
                            <h3 className="text-heading-h3 text-ink-heading leading-snug">
                                {g.name}
                            </h3>
                            <p className="text-xs text-ink-muted italic mt-0.5 mb-3">
                                {g.discipline}
                            </p>
                            <p className="text-sm text-ink-body leading-relaxed max-w-2xl mb-3">
                                {g.intro}
                            </p>
                            <p className="text-sm text-ink-body leading-relaxed max-w-2xl mb-3">
                                {g.definition}
                            </p>
                            <ul className="space-y-1 text-sm">
                                {g.papers.map((p) => (
                                    <li key={p.href}>
                                        {p.href.endsWith(".pdf") ? (
                                            <a href={p.href} className="text-ink-heading hover:underline">
                                                {p.title}
                                            </a>
                                        ) : (
                                            <Link href={p.href} className="text-ink-heading hover:underline">
                                                {p.title}
                                            </Link>
                                        )}
                                    </li>
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
            </MarketingSection>

            <MarketingSection title="Contributing.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    Work becomes visible through a pull request against <a href="https://github.com/figaro-protocol/Figaro" className="underline" rel="noreferrer"><code>frontend/app/(marketing)/_lib/paperGroups.ts</code> in the repository</a> &mdash; a new paper, a revised definition, a group&apos;s venue. When a group&apos;s work lands in the network &mdash; clauses, assemblies, the surfaces around them &mdash; it is paid for after the fact, in proportion to the use it gets, by <Link href="/rpgf" className="text-ink-heading font-medium hover:underline">Rewards for designers</Link>. Work that has to happen before there is any use to measure is what the <Link href="/dao" className="text-ink-heading font-medium hover:underline">DAO&apos;s treasury</Link> is for: it funds by human judgment, and a grant is one of the three ways it spends.
                </p>
                <p className="text-xs text-ink-muted leading-relaxed max-w-2xl mt-8">
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
