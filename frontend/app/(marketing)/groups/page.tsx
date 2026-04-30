import type { Metadata } from "next";
import Link from "next/link";
import { DisciplineGlyph } from "@/components/shared/DisciplineGlyph";
import { MarketingHero } from "@/components/shared/MarketingHero";
import { MarketingSection } from "@/components/shared/MarketingSection";
import {
    FIGARO_TELEGRAM_URL,
    GROUPS_REGISTRY,
    disciplineHasConvenedGroup,
} from "@/lib/shared/groupsRegistry";

export const metadata: Metadata = {
    title: "Working Groups — Figaro Protocol",
    description:
        "Working groups along two axes: the eight Voshmgir & Zargham cryptoeconomic disciplines (intellectual lenses on the substrate) and composability working groups (assembly composition and schema authoring). Grants and capital sources. Local and international.",
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
            { label: "Composability — Tier 1", href: "/composability" },
            { label: "Builders — Tier 1 tools", href: "/builders" },
            { label: "Local Commerce reference", href: "/local-commerce" },
        ],
    },
    {
        name: "Schema authoring",
        tier: "Tier 2",
        charter:
            "Authors new schemas — content-type design plus the validator-implementation work that ships in lockstep across TypeScript and on-chain Solidity (with an SP1 Rust mirror pending). Cross-cuts disciplines: validator implementation pulls from Computer Science and Cryptography; content definition pulls from whichever discipline the schema's domain belongs to.",
        references: [
            { label: "Composability — Tier 2", href: "/composability" },
            { label: "Schemas — architecture and inventory", href: "/schemas" },
            { label: "Builders — Tier 2 tools", href: "/builders" },
        ],
    },
];

export default function Groups() {
    return (
        <>
            <MarketingHero
                eyebrow="Working Groups"
                title="Two axes. One substrate."
                lead={
                    <>
                        Working groups assemble where contributors do. Two organizing axes: the eight cryptoeconomic disciplines (intellectual lenses on the substrate, per Voshmgir &amp; Zargham 2024) and composability working groups (output-oriented &mdash; assembly composition, schema authoring). Tier-3 work (mechanism contract authoring) is absorbed into the existing Computer Science and Cryptography and Economics and Game Theory groups.
                    </>
                }
            />

            <MarketingSection eyebrow="Conversation">
                <p className="text-sm text-gray-700 leading-relaxed">
                    Project-wide coordination happens on{" "}
                    <a
                        href={FIGARO_TELEGRAM_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-black"
                    >
                        Telegram
                    </a>
                    . Groups with their own dedicated channels surface them inline below. Local meetups and international correspondences are encouraged; the taxonomy is fixed but geography and cadence are whatever contributors decide.
                </p>
            </MarketingSection>

            <MarketingSection eyebrow="Cryptoeconomic working groups" title="Eight disciplines, eight lenses.">
                <p className="text-sm text-gray-700 leading-relaxed mb-8">
                    The disciplinary list anchors to Voshmgir &amp; Zargham, <em>Foundations of Cryptoeconomic Systems</em> (2024). Detailed paper portfolios per discipline live on{" "}
                    <Link href="/cryptoeconomics" className="underline">
                        /cryptoeconomics
                    </Link>
                    .
                </p>
                <div className="space-y-8">
                    {GROUPS_REGISTRY.map((g) => {
                        const convened = disciplineHasConvenedGroup(g);
                        return (
                            <article
                                key={g.slug}
                                id={`discipline-${g.disciplineIndex}`}
                                className="scroll-mt-24"
                            >
                                <div className="flex items-start gap-4">
                                    <DisciplineGlyph index={g.disciplineIndex} />
                                    <div className="min-w-0 flex-1">
                                        <h3 className="text-lg font-bold text-black leading-snug">
                                            {g.name}
                                        </h3>
                                        <p className="text-xs text-gray-500 italic">
                                            {g.discipline}
                                        </p>
                                    </div>
                                </div>
                                <div className="mt-3 ml-16">
                                    {convened ? (
                                        <p className="text-sm text-gray-700 leading-relaxed">
                                            {g.charter}
                                        </p>
                                    ) : (
                                        <p className="text-xs text-gray-500 italic">
                                            Open call &mdash; no group convened yet.
                                        </p>
                                    )}
                                    {g.currentWork && g.currentWork.length > 0 && (
                                        <ul className="mt-3 space-y-1 text-xs text-gray-600 list-disc pl-5">
                                            {g.currentWork.map((w, i) => (
                                                <li key={i}>{w}</li>
                                            ))}
                                        </ul>
                                    )}
                                    {g.venue && (
                                        <p className="text-xs text-gray-500 mt-2">
                                            Dedicated channel:{" "}
                                            <a
                                                href={g.venue.href}
                                                target={g.venue.href.startsWith("http") ? "_blank" : undefined}
                                                rel={g.venue.href.startsWith("http") ? "noopener noreferrer" : undefined}
                                                className="underline hover:text-black"
                                            >
                                                {g.venue.label}
                                            </a>
                                        </p>
                                    )}
                                </div>
                            </article>
                        );
                    })}
                </div>
            </MarketingSection>

            <MarketingSection eyebrow="Composability working groups" title="Output-oriented; cross-cut the disciplines.">
                <p className="text-sm text-gray-700 leading-relaxed mb-8">
                    Where the cryptoeconomic disciplines are reading lenses, the composability working groups are oriented around concrete builder outputs &mdash; assemblies and schemas. They cross-cut the disciplinary axis: a schema for GHG measurement pulls validator-implementation expertise from Computer Science and Cryptography while the content-definition expertise comes from Operations Research or Industrial Engineering. The tier framing comes from{" "}
                    <Link href="/composability" className="underline">
                        /composability
                    </Link>
                    .
                </p>
                <div className="space-y-8">
                    {COMPOSITION_GROUPS.map((g) => (
                        <article key={g.name}>
                            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1">
                                {g.tier}
                            </p>
                            <h3 className="text-lg font-bold text-black mb-2 leading-snug">
                                {g.name}
                            </h3>
                            <p className="text-sm text-gray-700 leading-relaxed mb-3">
                                {g.charter}
                            </p>
                            <ul className="space-y-1 text-xs text-gray-600">
                                {g.references.map((r) => (
                                    <li key={r.href}>
                                        <Link
                                            href={r.href}
                                            className="underline hover:text-black"
                                        >
                                            {r.label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </article>
                    ))}
                </div>
                <p className="text-sm text-gray-600 mt-8">
                    Tier-3 work (authoring new mechanism contracts above the kernel) is absorbed into the existing Computer Science and Cryptography group (formal verification, adversarial review) and the Economics and Game Theory group (mechanism design). It does not require its own working group at this scale.
                </p>
            </MarketingSection>

            <MarketingSection eyebrow="Grants &amp; capital sources">
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    Work on the Figaro substrate &mdash; research, review, verification, assembly design, schema authoring, documentation &mdash; is funded through permissionless channels. No application committee. No curated budget.
                </p>
                <dl className="space-y-4 text-sm">
                    <div className="border-l-2 border-gray-200 pl-4">
                        <dt className="text-base font-semibold text-black">DAO allocation</dt>
                        <dd className="text-gray-700 leading-relaxed mt-1">
                            300M FIG (30% of supply) minted to the DAO wallet at genesis with no vesting. Allocation decisions will be made by the DAO&apos;s governance process; the DAO is not yet instantiated.
                        </dd>
                    </div>
                    <div className="border-l-2 border-gray-200 pl-4">
                        <dt className="text-base font-semibold text-black">Gitcoin rounds</dt>
                        <dd className="text-gray-700 leading-relaxed mt-1">
                            Quadratic funding for Figaro-adjacent work. No Figaro round is live yet; until then, groups can apply to general ecosystem rounds where they fit the theme.
                        </dd>
                    </div>
                    <div className="border-l-2 border-gray-200 pl-4">
                        <dt className="text-base font-semibold text-black">Direct contributions</dt>
                        <dd className="text-gray-700 leading-relaxed mt-1">
                            Any wallet can send assets to a group&apos;s published address or to the DAO wallet. On-chain visibility preserves the funding graph.
                        </dd>
                    </div>
                </dl>
            </MarketingSection>

            <MarketingSection eyebrow="Local &amp; international">
                <p className="text-base text-gray-700 leading-relaxed">
                    Working groups self-organize across jurisdictions: local meetups, international correspondences, async pull requests against{" "}
                    <code>frontend/lib/shared/groupsRegistry.ts</code>
                    . Cadence and geography are whatever contributors decide. The taxonomy stays fixed; the activity inside it does not.
                </p>
            </MarketingSection>

            <MarketingSection eyebrow="Contributing" bottomPad="wide">
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    To declare current work, surface a received grant, publish a contributor handle, or amend a group&apos;s charter, open a pull request against{" "}
                    <code>frontend/lib/shared/groupsRegistry.ts</code>
                    . PRs are reviewed at merge time; conversation about scope happens on Telegram before codification.
                </p>
                <p className="text-sm text-gray-600 leading-relaxed">
                    The disciplinary list itself tracks Voshmgir &amp; Zargham, <em>Foundations of Cryptoeconomic Systems</em>. The composability tiers track the extension doctrine on{" "}
                    <Link href="/composability" className="underline">
                        /composability
                    </Link>
                    . If either upstream taxonomy converges on a different shape, this page will follow.
                </p>
            </MarketingSection>
        </>
    );
}
