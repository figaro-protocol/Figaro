import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { PAPER_GROUPS } from "@/app/(marketing)/_lib/paperGroups";

/** The taxonomy's own source, cited wherever the eight disciplines are named. */
const TAXONOMY_URL =
    "https://research.wu.ac.at/en/publications/foundations-of-cryptoeconomic-systems-6/";

/** Name a group in prose from the data, never by hand — hand-copied names are
 *  how this page drifted from `paperGroups.ts` in the first place. */
const groupName = (slug: string) =>
    PAPER_GROUPS.find((g) => g.slug === slug)?.name ?? slug;

export const metadata: Metadata = {
    title: "Working Groups — Figaro Protocol",
    description:
        "The working groups are the eight cryptoeconomic disciplines: what each asks of the bonded substrate, the papers that start its discussion, and the one way the work is financed — the 600M retroactive reward, paid for artifacts real settled trade reached for. Nobody is appointed; anyone forms or joins one, anywhere.",
};

export default function WorkingGroups() {
    return (
        <>
            <MarketingHero
                title="Nobody assigns this work."
                lead={
                    <>
                        The working groups are the eight cryptoeconomic disciplines, and nothing else. No one is appointed to one, no one is handed work inside one, and none of them holds a budget: the protocol finances this work in exactly one way &mdash; the 600M-florin retroactive reward, paid to the authors of the clauses and assemblies that real settled trade reached for, with no application to file and no list to get onto (<Link href="/artifact-rewards" className="underline">the mechanics</Link>, including the floor of three separate sellers an artifact must clear before it earns anything). What a group produces is an artifact, and an artifact rarely sits inside one discipline. The emissions clause is the shape of it: it binds the seller to a named accounting methodology in the agreement and files the measured figure as a runtime attestation &mdash; what gets measured and under which methodology is a question for {groupName("operations-research")}, how the spec is written and checked is a question for {groupName("computer-science-cryptography")}. One clause, two groups, nothing between them but the artifact.
                    </>
                }
            />

            <MarketingSection title="The eight groups.">
                <p className="text-sm text-ink-body leading-relaxed max-w-2xl mb-4">
                    A group is a discipline &mdash; a stable position from which to read the substrate. The list is not the project&rsquo;s: it is the taxonomy set out in Voshmgir, S. &amp; Zargham, M.,{" "}
                    <a href={TAXONOMY_URL} className="underline" rel="noreferrer">
                        &ldquo;Foundations of Cryptoeconomic Systems&rdquo;
                    </a>{" "}
                    (Working Paper Series 1/2020, Research Institute for Cryptoeconomics, WU Vienna, 2020; §3 and Fig. 2). Eight is the whole list; it cannot grow or shrink without leaving the taxonomy.
                </p>
                <p className="text-sm text-ink-body leading-relaxed max-w-2xl mb-4">
                    Each group carries a definition of what its discipline asks of the bonded substrate, and the papers written from that position so far. The papers are discussion starters, not doctrine &mdash; any reader may extend one, contest it, or fork it into an implementation of their own. A discipline with no papers yet is an open call, not a vacancy.
                </p>
                <p className="text-sm text-ink-muted leading-relaxed max-w-2xl mb-8">
                    Nobody grants membership, because there is nobody to ask: you form or join a group wherever you are, and a group&rsquo;s work becomes visible here through a pull request against <code>frontend/app/(marketing)/_lib/paperGroups.ts</code>, reviewed at merge time like any other. There is no project-wide channel to join, official or otherwise &mdash; one would contradict permissionless formation. Where a group publishes a venue of its own, it appears with the group below.
                </p>
                <div className="space-y-10">
                    {PAPER_GROUPS.map((g) => (
                        <article key={g.slug} id={g.slug} className="scroll-mt-24">
                            <h3 className="text-heading-h3 text-ink-heading leading-snug">
                                {g.name}
                            </h3>
                            <p className="text-xs text-ink-muted italic mt-0.5 mb-3">
                                {g.discipline}
                            </p>
                            <p className="text-sm text-ink-body leading-relaxed max-w-2xl mb-3">
                                {g.definition}
                            </p>
                            {g.papers.length > 0 ? (
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
                            ) : (
                                <p className="text-sm text-ink-muted">
                                    No paper convened yet &mdash; an open call.
                                </p>
                            )}
                            {g.references && g.references.length > 0 && (
                                <ul className="space-y-1 text-xs text-ink-muted mt-3">
                                    {g.references.map((r) => (
                                        <li key={r.href}>
                                            {r.href.startsWith("/") ? (
                                                <Link href={r.href} className="underline">
                                                    {r.label}
                                                </Link>
                                            ) : (
                                                <a href={r.href} className="underline" rel="noreferrer">
                                                    {r.label}
                                                </a>
                                            )}
                                            {r.note && <span> &mdash; {r.note}</span>}
                                        </li>
                                    ))}
                                </ul>
                            )}
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

            <MarketingSection title="No group&rsquo;s question closes inside its own boundary.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl mb-4">
                    The eight are reading positions, not jurisdictions. In the taxonomy the project adopts they are bound by a single concept &mdash; the allocation of resources, physical, financial and social &mdash; and a cryptoeconomic system is read at three levels at once: micro-foundational (mechanism design), meso-institutional (governance as algorithmic policy-making), and macro-observable (system metrics). Voshmgir and Zargham hold the three to be interdependent, and that they &ldquo;cannot be simply reduced into a single layer.&rdquo;
                </p>
                <p className="text-base text-ink-body leading-relaxed max-w-2xl mb-4">
                    So a question posed inside one group lands in another. The 2&times; bonding ratio is micro-foundational and belongs to {groupName("economics-game-theory")}; what it does to the classification of work along the subordination axis belongs to {groupName("philosophy-law-ethics")}; whether a participant actually performs the comparison correctly at the margin belongs to {groupName("psychology-decisions")}. One ratio, three groups.
                </p>
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    That is why the artifacts &mdash; clauses, assemblies &mdash; are usually co-authored across a boundary, as the emissions clause was. Working across group lines is not a separate kind of group and keeps no separate list: it is simply what the groups do.
                </p>
            </MarketingSection>

            <MarketingSection title="The corpus.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    <Link href="/papers" className="text-ink-heading font-medium hover:underline">
                        Papers
                    </Link>{" "}
                    is the index of the discussion starters &mdash; one page per paper, grouped by the same eight disciplines, each reading in the browser with server-rendered math and exporting to PDF.
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
