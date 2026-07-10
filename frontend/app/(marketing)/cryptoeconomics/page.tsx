import type { Metadata } from "next";
import Link from "next/link";
import { DisciplineGlyph } from "@/components/shared/DisciplineGlyph";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { PAPER_GROUPS } from "@/app/(marketing)/_lib/paperGroups";

export const metadata: Metadata = {
    title: "Cryptoeconomics — Figaro Protocol",
    description:
        "The eight cryptoeconomic disciplines that read the Figaro substrate, the papers organized along them, the composability working groups, and how the work is funded.",
};

interface CompositionGroup {
    name: string;
    tier: string;
    charter: string;
    references: { label: string; href: string }[];
}

const COMPOSITION_GROUPS: CompositionGroup[] = [
    {
        name: "Assembly composition",
        tier: "Tier 1",
        charter:
            "Designs assemblies that compose against existing primitives — roles, mechanisms, clauses, and handoff conditions wired into a configuration artifact. No new on-chain code; the assembly is the only authored artifact. Produces reference assemblies for new verticals; iterates on existing ones.",
        references: [
            { label: "Composability — Tier 1", href: "/builders/composability" },
            { label: "Builders — Tier 1 tools", href: "/builders" },
            { label: "Local Commerce reference", href: "/local-commerce" },
        ],
    },
    {
        name: "Clause authoring",
        tier: "Tier 2",
        charter:
            "Authors new clauses — content-type design plus the validator-implementation work that ships in lockstep across TypeScript and on-chain Solidity (the on-chain validator and its SP1 Rust mirror rebuild pre-launch). Cross-cuts disciplines: validator implementation pulls from Computer Science and Cryptography; content definition pulls from whichever discipline the clause's domain belongs to.",
        references: [
            { label: "Composability — Tier 2", href: "/builders/composability" },
            { label: "Clauses — architecture and inventory", href: "/clauses" },
            { label: "Builders — Tier 2 tools", href: "/builders" },
        ],
    },
];

export default function Cryptoeconomics() {
    return (
        <>
            <MarketingHero
                title="Eight disciplines, one substrate."
                lead={
                    <>
                        Voshmgir &amp; Zargham frame cryptoeconomics as eight disciplines, each reading the same substrate in its own vocabulary. Because the substrate is open-world &mdash; permissionless registries, and RPGF that rewards a contribution by how much it helps the network evolve &mdash; the working groups around these disciplines self-form, build, and fund themselves without anyone&apos;s leave. This page gathers all of it: the disciplines, the papers that seed them, the composability working groups that build above the kernel, and how the work is funded.
                    </>
                }
            />

            <MarketingSection title="Eight disciplines, eight lenses.">
                <p className="text-sm text-ink-body leading-relaxed mb-8">
                    The disciplinary list anchors to Voshmgir &amp; Zargham, <em>Foundations of Cryptoeconomic Systems</em> (2024) &mdash; eight disciplines, fixed: a shared set of lenses, not a roster of teams. Each frames the substrate and carries its own papers, collected on the <Link href="/papers" className="underline">Papers</Link> page; a working group can form around any of them &mdash; anywhere, and without permission. The dedicated channels below are seeds and invitations, not gates or membership. Implementation work &mdash; clause authoring, contract development, assembly composition &mdash; organizes at <Link href="/builders" className="underline">/builders</Link>.
                </p>
                <div className="space-y-10">
                    {PAPER_GROUPS.map((g) => (
                        <article
                            key={g.slug}
                            id={`discipline-${g.disciplineIndex}`}
                            className="scroll-mt-24"
                        >
                            <div className="flex items-start gap-4">
                                <DisciplineGlyph index={g.disciplineIndex} />
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-heading-h3 text-ink-heading leading-snug">
                                        {g.name}
                                    </h3>
                                    <p className="text-xs text-ink-muted italic">
                                        {g.discipline}
                                    </p>
                                </div>
                            </div>
                            <div className="mt-3 ml-16">
                                <p className="text-sm text-ink-body leading-relaxed">
                                    {g.charter}
                                </p>
                                {g.currentWork && g.currentWork.length > 0 && (
                                    <ul className="mt-3 space-y-1 text-xs text-ink-muted list-disc pl-5">
                                        {g.currentWork.map((w, i) => (
                                            <li key={i}>{w}</li>
                                        ))}
                                    </ul>
                                )}
                                {g.venue && (
                                    <p className="text-xs text-ink-muted mt-2">
                                        Dedicated channel:{" "}
                                        <a
                                            href={g.venue.href}
                                            target={g.venue.href.startsWith("http") ? "_blank" : undefined}
                                            rel={g.venue.href.startsWith("http") ? "noopener noreferrer" : undefined}
                                            className="underline"
                                        >
                                            {g.venue.label}
                                        </a>
                                    </p>
                                )}
                            </div>
                        </article>
                    ))}
                </div>
            </MarketingSection>

            <MarketingSection title="Output-oriented; cross-cut the disciplines.">
                <p className="text-sm text-ink-body leading-relaxed mb-8">
                    Where the cryptoeconomic disciplines are reading lenses, the composability working groups are oriented around concrete builder outputs &mdash; assemblies and clauses. They cross-cut the disciplinary axis: a clause for GHG measurement pulls validator-implementation expertise from Computer Science and Cryptography while the content-definition expertise comes from Operations Research or Industrial Engineering. The tier framing comes from <Link href="/builders/composability" className="underline">composability</Link>.
                </p>
                <div className="space-y-8">
                    {COMPOSITION_GROUPS.map((g) => (
                        <article key={g.name}>
                            <p className="text-xs font-semibold text-ink-muted mb-1">
                                {g.tier}
                            </p>
                            <h3 className="text-heading-h3 text-ink-heading mb-2 leading-snug">
                                {g.name}
                            </h3>
                            <p className="text-sm text-ink-body leading-relaxed mb-3">
                                {g.charter}
                            </p>
                            <ul className="space-y-1 text-xs text-ink-muted">
                                {g.references.map((r) => (
                                    <li key={r.href}>
                                        <Link href={r.href} className="underline">
                                            {r.label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </article>
                    ))}
                </div>
                <p className="text-sm text-ink-muted mt-8">
                    Tier-3 work (authoring new mechanism contracts above the kernel) is absorbed into the existing Computer Science and Cryptography group (formal verification, adversarial review) and the Economics and Game Theory group (mechanism design). It does not require its own working group at this scale.
                </p>
            </MarketingSection>

            <MarketingSection title="Grants &amp; capital sources">
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    Work on the Figaro substrate &mdash; research, review, verification, assembly design, clause authoring, documentation &mdash; is funded through permissionless channels. No application committee. No curated budget.
                </p>
                <dl className="space-y-4 text-sm">
                    <div className="border-l-2 border-default pl-4">
                        <dt className="text-base font-semibold text-ink-heading">DAO allocation</dt>
                        <dd className="text-ink-body leading-relaxed mt-1">
                            300M FIG (30% of supply) minted to the DAO wallet at genesis with no vesting. Allocation decisions will be made by the DAO&apos;s governance process; the DAO is not yet instantiated.
                        </dd>
                    </div>
                    <div className="border-l-2 border-default pl-4">
                        <dt className="text-base font-semibold text-ink-heading">Gitcoin rounds</dt>
                        <dd className="text-ink-body leading-relaxed mt-1">
                            Quadratic funding for Figaro-adjacent work. No Figaro round is live yet; until then, groups can apply to general ecosystem rounds where they fit the theme.
                        </dd>
                    </div>
                    <div className="border-l-2 border-default pl-4">
                        <dt className="text-base font-semibold text-ink-heading">Direct contributions</dt>
                        <dd className="text-ink-body leading-relaxed mt-1">
                            Any wallet can send assets to a group&apos;s published address or to the DAO wallet. On-chain visibility preserves the funding graph.
                        </dd>
                    </div>
                </dl>
            </MarketingSection>

            <MarketingSection title="Local &amp; international">
                <p className="text-base text-ink-body leading-relaxed">
                    Working groups self-organize across jurisdictions: local meetups, international correspondences, async pull requests against <code>frontend/app/(marketing)/_lib/paperGroups.ts</code>. Cadence and geography are whatever contributors decide. The taxonomy stays fixed; the activity inside it does not.
                </p>
            </MarketingSection>

            <MarketingSection title="Contributing">
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    To declare current work, surface a received grant, publish a contributor handle, or amend a group&apos;s charter, open a pull request against <code>frontend/app/(marketing)/_lib/paperGroups.ts</code>. PRs are reviewed at merge time; conversation about scope happens on Telegram before codification.
                </p>
                <p className="text-sm text-ink-muted leading-relaxed">
                    The disciplinary list tracks Voshmgir &amp; Zargham, <em>Foundations of Cryptoeconomic Systems</em>. The composability tiers track the extension doctrine on <Link href="/builders/composability" className="underline">composability</Link>. If either upstream taxonomy converges on a different shape, this page will follow.
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
                </ul>
            </MarketingSection>
        </>
    );
}
