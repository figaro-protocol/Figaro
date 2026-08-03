import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = {
    title: "Funding & Working Groups — Figaro Protocol",
    description:
        "How work on the Figaro substrate organizes and pays for itself: a 600M retroactive usage-paid pool, a 300M DAO-discretionary treasury, direct contributions, and the composability working groups that build above the kernel.",
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

export default function Cryptoeconomics() {
    return (
        <>
            <MarketingHero
                title="Nobody assigns this work; the substrate pays for what gets used."
                lead={
                    <>
                        Work on Figaro &mdash; research, review, verification, assembly design, clause authoring &mdash; funds itself three ways, and organizes around builder outputs rather than a roster of teams: because the substrate is open-world &mdash; permissionless registries, and RPGF that rewards a contribution by how much it helps the network evolve &mdash; the working groups below self-form, build, and fund themselves without anyone&apos;s leave. The eight cryptoeconomic disciplines that frame the substrate (Voshmgir &amp; Zargham) and the papers seeding each one are catalogued on <Link href="/papers" className="underline">Papers</Link>; this page covers the funding and the working groups.
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

            <MarketingSection title="Grants &amp; capital sources">
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    Work on the Figaro substrate &mdash; research, review, verification, assembly design, clause authoring, documentation &mdash; is funded three ways. The 600M retroactive pool pays authors automatically for the trade their work carries, with no gatekeeper between a contributor and the reward (<Link href="/artifact-rewards" className="underline">How clause authors and assembly designers get paid</Link> walks through it). The DAO spends its own treasury at its discretion. And anyone can fund anyone directly, in the open.
                </p>
                <dl className="space-y-4 text-sm">
                    <div className="border-l-2 border-default pl-4">
                        <dt className="text-base font-semibold text-ink-heading">
                            Retroactive reward (600M)
                        </dt>
                        <dd className="text-ink-body leading-relaxed mt-1">
                            Sixty percent of all florins &mdash; the largest allocation by far &mdash; pays clause authors and assembly designers for the real, settled trade their work carried, by a fixed formula with no application and no gatekeeper. Full mechanism: <Link href="/artifact-rewards" className="underline">How clause authors and assembly designers get paid</Link>.
                        </dd>
                    </div>
                    <div className="border-l-2 border-default pl-4">
                        <dt className="text-base font-semibold text-ink-heading">DAO treasury (300M)</dt>
                        <dd className="text-ink-body leading-relaxed mt-1">
                            30% of supply, minted to the DAO wallet at genesis with no vesting (the DAO is not yet instantiated). Where the 600M pays out by formula, the 300M is the human-judgment layer by design: the DAO funds public goods by choosing to &mdash; paying a third party, procuring through the protocol, standing up a program &mdash; from its own treasury, never through a market. There is no quadratic-funding round and no crowd-matching mechanism; the discretion is the point.
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
                    To extend the paper corpus, declare current research, or amend a discipline&apos;s charter, open a pull request against <code>frontend/app/(marketing)/_lib/paperGroups.ts</code> &mdash; reviewed at merge time, with scope discussed on Telegram first. To amend a composability working group&apos;s charter or references, open a pull request against this page.
                </p>
                <p className="text-sm text-ink-muted leading-relaxed">
                    The composability tiers track the composition doctrine on <Link href="/builders/composability" className="underline">composability</Link>; the disciplinary frame they cross-cut is catalogued on <Link href="/papers" className="underline">Papers</Link>. If either upstream taxonomy converges on a different shape, the relevant page will follow.
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
