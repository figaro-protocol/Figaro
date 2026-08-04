import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = {
    title: "Working Groups — Figaro Protocol",
    description:
        "How work on Figaro organizes itself: composability working groups that self-form around builder outputs — assemblies and clauses — rather than a roster of teams, funded by the protocol's open-world registries and RPGF.",
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
            "Authors new clauses — content-type design plus the spec/validation work that ships in lockstep across the TypeScript Layer-A validator and its byte-parity Rust mirror in the generic SP1 proof engine (which validates any registered clause in-proof against its anchored spec — no per-clause on-chain validator, by design). Cross-cuts disciplines: the spec and its conformance vectors pull from Computer Science and Cryptography; content definition pulls from whichever discipline the clause's domain belongs to.",
        references: [
            { label: "Composability — Tier 2", href: "/builders/composability" },
            { label: "Clauses — architecture and inventory", href: "/clauses" },
            { label: "Builders — Tier 2 tools", href: "/builders" },
        ],
    },
];

export default function WorkingGroups() {
    return (
        <>
            <MarketingHero
                title="Nobody assigns this work."
                lead={
                    <>
                        Work on Figaro funds itself three ways &mdash; a 600M usage-paid reward pool, a 300M DAO-discretionary treasury, and direct contributions (<Link href="/artifact-rewards" className="underline">the mechanics</Link>) &mdash; and the people doing it organize themselves around builder outputs, assemblies and clauses, rather than a roster of teams. Take a clause for measuring greenhouse-gas emissions in a supply chain: the spec-and-conformance work draws from Computer Science and Cryptography, the content definition from Operations Research or Industrial Engineering &mdash; two people who have never met, pulled together by what the artifact needed rather than by an org chart. They register the clause; sellers start reaching for it in real settled trade; RPGF pays them for what it carries, automatically, once three different sellers have used it. That is a working group: not appointed, not headcount-planned, formed by the shape of the artifact.
                    </>
                }
            />

            <MarketingSection title="Output-oriented; anyone can start one.">
                <p className="text-sm text-ink-body leading-relaxed mb-8">
                    Composability working groups organize around concrete builder outputs &mdash; assemblies and clauses &mdash; rather than the disciplinary axis they cross-cut: a clause for GHG measurement pulls spec-and-conformance expertise from Computer Science and Cryptography while the content-definition expertise comes from Operations Research or Industrial Engineering. The tier framing comes from <Link href="/builders/composability" className="underline">composability</Link>. Any working group can form around any discipline, anywhere, without permission &mdash; implementation work organizes at <Link href="/builders" className="underline">/builders</Link>.
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

            <MarketingSection title="Local &amp; international">
                <p className="text-base text-ink-body leading-relaxed">
                    Working groups self-organize across jurisdictions: local meetups, international correspondences, async pull requests against <code>frontend/app/(marketing)/_lib/paperGroups.ts</code>. Cadence and geography are whatever contributors decide. The taxonomy stays fixed; the activity inside it does not.
                </p>
            </MarketingSection>

            <MarketingSection title="Contributing">
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    To extend the paper corpus, declare current research, or amend a discipline&apos;s charter, open a pull request against <code>frontend/app/(marketing)/_lib/paperGroups.ts</code> &mdash; reviewed at merge time, with scope discussed on Telegram first. To amend a composability working group&apos;s charter or references, open a pull request against this page.
                </p>
                <p className="text-sm text-ink-muted leading-relaxed">
                    The composability tiers track the composition doctrine on <Link href="/builders/composability" className="underline">composability</Link>; the disciplinary frame they cross-cut is catalogued on <Link href="/papers" className="underline">Papers</Link>. If either upstream taxonomy converges on a different shape, the relevant page will follow.
                </p>
            </MarketingSection>

            <MarketingSection title="More on the protocol" bottomPad="wide">
                <ul className="space-y-3 text-base">
                    <li>
                        <Link href="/artifact-rewards" className="text-ink-heading font-medium hover:underline">
                            Artifact rewards
                        </Link>
                        <span className="text-ink-body"> &mdash; the three capital sources and the full 600M reward mechanism: the schedule, the three-seller floor, the live-deposit condition.</span>
                    </li>
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
