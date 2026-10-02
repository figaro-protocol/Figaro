import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "@/components/shared/Link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { DisciplineIntersectionFigure } from "@/components/figures/DisciplineIntersectionFigure";
import { PAPER_GROUPS, tagIndex } from "@/app/(marketing)/_lib/paperGroups";
import { PaperRow } from "./_components/PaperRow";

/** The taxonomy's source — cited ONCE, in the page footnote (the field's two definitions are footnotes 1 and 2). */
const TAXONOMY_URL =
    "https://research.wu.ac.at/en/publications/foundations-of-cryptoeconomic-systems-6/";

export const metadata: Metadata = withOg({
    title: "Working Groups — Figaro Protocol",
    description:
        "Before you build on a protocol you check its arguments. The papers that carry them — the equilibrium proof, the mechanisms by which an offer forms, the scope of what is formally verified, the legal and political readings — sorted into the eight disciplines of cryptoeconomics. The eight groups, their papers, and how to contribute.",
});

/** Derived, never stated: the corpus size is whatever `PAPER_GROUPS` holds. */
const PAPER_COUNT = PAPER_GROUPS.reduce((n, g) => n + g.papers.length, 0);

/** The reader's index, derived: which industries and fields the papers name as their doorway. */
const INDUSTRIES = tagIndex("for");

export default function WorkingGroups() {
    return (
        <>
            <MarketingHero
                title="Working groups."
                lead={
                    <>
                        Before you build on a protocol you check its arguments. {PAPER_COUNT} papers carry them &mdash; the equilibrium proof, the mechanisms by which an offer forms, the scope of what is formally verified, the legal and political readings &mdash; sorted into the eight disciplines of cryptoeconomics. Three of them come first whatever your discipline: <Link href="/papers/figaro-as-a-cryptoeconomic-system" className="text-ink-heading hover:underline">Figaro as a Cryptoeconomic System</Link> reads the whole of Figaro through the field&rsquo;s own definitions, <Link href="/papers/asymmetric-bonding" className="text-ink-heading hover:underline">Asymmetric Bonding and Buyer Dominance</Link> derives the equilibrium the rest of the corpus reasons from, and <Link href="/papers/verified-resolution-kernel" className="text-ink-heading hover:underline">A Verified Resolution Contract</Link> says what a machine has and has not checked about the code that runs it; after those three, read the group nearest your own field. A working group is an interdisciplinary group of people: the eight disciplines intersecting on questions none of them can close alone. Groups form and work wherever their people are.
</>
                }
            />

            <MarketingSection title="The groups.">
                <p className="text-sm text-ink-body leading-relaxed max-w-2xl mb-4">
                    Cryptoeconomics is &ldquo;a formal discipline that studies protocols that govern the production, distribution, and consumption of goods and services in a decentralized digital economy&rdquo;, and &ldquo;a practical science that focuses on the design and characterization of these protocols&rdquo;<sup>1</sup>. In Buterin&rsquo;s words, it is also &ldquo;a methodology for building systems that try to guarantee certain kinds of information security properties&rdquo;<sup>2</sup>. Figaro is one such protocol: each seller produces value and adds it to the process in turn, resolution distributes every payment to the sellers who produced it, and the buyer, who pays, consumes what arrived. It is one such system: the property its bonds are built to secure is that keeping the agreement is each party&rsquo;s best move. The disciplines below are the readings a full account of it passes through.
                </p>
                <p className="text-sm text-ink-body leading-relaxed max-w-2xl mb-8">
                    The eight disciplines come from Voshmgir &amp; Zargham, not from this project. They are the taxonomy set out by Voshmgir &amp; Zargham<sup>3</sup>, which argues that cryptoeconomic systems are irreducibly multi-disciplinary objects and enumerates the disciplines a full account of one must pass through. The project adopts that list rather than inventing its own, so that a reader arriving from any one of the eight finds the substrate addressed in that discipline&rsquo;s own vocabulary, and so that the depth of coverage under each is measured against a list the project did not draw.
                </p>
                <DisciplineIntersectionFigure labels={PAPER_GROUPS.map((g) => g.name)} className="mb-10" />
                <div id="index" className="scroll-mt-24 lg:grid lg:grid-cols-[1fr_15rem] lg:gap-10">
                <aside className="mb-10 lg:mb-0 lg:order-2 lg:sticky lg:top-24 lg:self-start">
                    <h3 className="text-sm text-ink-heading font-medium">By industry.</h3>
                    <p className="text-xs text-ink-muted leading-relaxed mt-1 mb-3">
                        Where to start if you arrive from one of these. Each opens the papers that name it, with what each treats. Every keyword under a paper opens its own list the same way.
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
                            <p className="text-xs text-ink-muted italic mt-0.5 mb-3">
                                {g.discipline}
                            </p>
                            <p className="text-sm text-ink-body leading-relaxed max-w-2xl mb-3">
                                {g.intro}
                            </p>
                            <p className="text-sm text-ink-body leading-relaxed max-w-2xl mb-3">
                                {g.definition}
                            </p>
                            <ul className="space-y-5 max-w-2xl">
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
            </MarketingSection>

            <MarketingSection title="Contributing.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    Work becomes visible through a pull request against <a href="https://github.com/figaro-protocol/Figaro" className="underline" rel="noreferrer"><code>frontend/app/(marketing)/_lib/paperGroups.ts</code> in the repository</a> &mdash; a new paper, a revised definition, a group&apos;s venue. When a group&apos;s work lands in the network &mdash; clauses and assemblies &mdash; it is rewarded after the fact, in proportion to the use it gets, by <Link href="/rpgf" className="text-ink-heading font-medium hover:underline">Designer Rewards</Link>. Work that has to happen before there is any use to measure is what the <Link href="/dao" className="text-ink-heading font-medium hover:underline">DAO&apos;s treasury</Link> is for: it funds by human judgment, and a grant is one of the three ways it spends.
                </p>
                <p className="text-xs text-ink-muted leading-relaxed max-w-2xl mt-8">
                    <sup>1</sup> Zamfir, V., &ldquo;What Is Cryptoeconomics?&rdquo;, Cryptoeconomicon, 2015; as quoted in Brekke, J. K. &amp; Alsindi, W. Z., &ldquo;Cryptoeconomics&rdquo;,{" "}
                    <a href="https://doi.org/10.14763/2021.2.1553" className="underline" rel="noreferrer">
                        <em>Internet Policy Review</em> 10(2)
                    </a>
                    , 2021.
                </p>
                <p className="text-xs text-ink-muted leading-relaxed max-w-2xl mt-2">
                    <sup>2</sup> Buterin, V., &ldquo;Introduction to Cryptoeconomics&rdquo;, Ethereum Foundation, 2017; as quoted in Brekke &amp; Alsindi, 2021.
                </p>
                <p className="text-xs text-ink-muted leading-relaxed max-w-2xl mt-2">
                    <sup>3</sup> Voshmgir, S. &amp; Zargham, M.,{" "}
                    <a href={TAXONOMY_URL} className="underline" rel="noreferrer">
                        &ldquo;Foundations of Cryptoeconomic Systems&rdquo;
                    </a>
                    , Working Paper Series 1/2020, Research Institute for Cryptoeconomics, WU Vienna, 2020.
                </p>
            </MarketingSection>

        </>
    );
}
