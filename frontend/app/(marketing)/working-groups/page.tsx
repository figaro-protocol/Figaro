import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { DisciplineIntersectionFigure } from "@/components/figures/DisciplineIntersectionFigure";
import { PAPER_GROUPS } from "@/app/(marketing)/_lib/paperGroups";

/** The taxonomy's source — cited ONCE, in the page footnote. */
const TAXONOMY_URL =
    "https://research.wu.ac.at/en/publications/foundations-of-cryptoeconomic-systems-6/";

export const metadata: Metadata = {
    title: "Working Groups — Figaro Protocol",
    description:
        "A working group is an interdisciplinary group of people: the eight disciplines of cryptoeconomics intersecting on questions none of them can close alone. The eight groups, their papers, and how to contribute.",
};

export default function WorkingGroups() {
    return (
        <>
            <MarketingHero
                title="Working groups."
                lead={
                    <>
                        A working group is an interdisciplinary group of people: the eight disciplines of cryptoeconomics<sup>1</sup> intersecting on questions none of them can close alone. Groups form and work wherever their people are.
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
                    Work becomes visible through a pull request against <code>frontend/app/(marketing)/_lib/paperGroups.ts</code> &mdash; a new paper, a revised definition, a group&apos;s venue. When a group&apos;s work lands in the network &mdash; clauses, assemblies, the surfaces around them &mdash; the RPGF program pays the authors from the retroactive pool.
                </p>
                <p className="text-xs text-ink-muted leading-relaxed max-w-2xl mt-8">
                    <sup>1</sup> Voshmgir, S. &amp; Zargham, M.,{" "}
                    <a href={TAXONOMY_URL} className="underline" rel="noreferrer">
                        &ldquo;Foundations of Cryptoeconomic Systems&rdquo;
                    </a>
                    , Working Paper Series 1/2020, Research Institute for Cryptoeconomics, WU Vienna, 2020.
                </p>
            </MarketingSection>

            <MarketingSection title="More on the protocol" bottomPad="wide">
                <ul className="space-y-3 text-base">
                    <li>
                        <Link href="/protocol" className="text-ink-heading font-medium hover:underline">
                            Protocol
                        </Link>
                        <span className="text-ink-body"> &mdash; how the mechanism works: bonded commitments, buyer dominance, twice-the-deal collateral, atomic settlement.</span>
                    </li>
                    <li>
                        <Link href="/why" className="text-ink-heading font-medium hover:underline">
                            Why
                        </Link>
                        <span className="text-ink-body"> &mdash; the rule-making lineage: coercion, cognition, crypto. What Figaro contributes to the third.</span>
                    </li>
                    <li>
                        <Link href="/spec" className="text-ink-heading font-medium hover:underline">
                            Specifications
                        </Link>
                        <span className="text-ink-body"> &mdash; the on-chain contract surface: kernel, attestation, clause, mechanism modules, with source links and verification status.</span>
                    </li>
                    <li>
                        <Link href="/builders" className="text-ink-heading font-medium hover:underline">
                            Builders
                        </Link>
                        <span className="text-ink-body"> &mdash; where implementation work organizes: clause authoring, contract development, assembly composition, and the tooling around them.</span>
                    </li>
                </ul>
            </MarketingSection>
        </>
    );
}
