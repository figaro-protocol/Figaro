import type { Metadata } from "next";
import Link from "next/link";
import { DisciplineGlyph } from "@/components/shared/DisciplineGlyph";
import { MarketingHero } from "@/components/shared/MarketingHero";
import { MarketingSection } from "@/components/shared/MarketingSection";
import { GROUPS_REGISTRY } from "@/lib/shared/groupsRegistry";

export const metadata: Metadata = {
    title: "Cryptoeconomics — Figaro Protocol",
    description:
        "Voshmgir & Zargham, Foundations of Cryptoeconomic Systems (2024). Eight disciplines converge on the substrate; Figaro's papers are organized along that taxonomy.",
};

export default function Cryptoeconomics() {
    return (
        <>
            <MarketingHero
                title="Cryptoeconomic systems are multi-disciplinary by necessity."
                lead={
                    <>
                        Voshmgir &amp; Zargham frame the field as eight disciplines converging on the same substrate &mdash; each asks the substrate a different question in its own vocabulary. The disciplines are:
                    </>
                }
            />

            <section className="container mx-auto px-6 pb-12 max-w-3xl pt-2">
                <div className="space-y-12">
                    {GROUPS_REGISTRY.map((g) => (
                        <article
                            key={g.slug}
                            id={`discipline-${g.disciplineIndex}`}
                            className="scroll-mt-24"
                        >
                            <div className="flex items-start gap-4">
                                <DisciplineGlyph index={g.disciplineIndex} />
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-heading-h3 text-ink-primary mt-0 mb-1">
                                        {g.name}
                                    </h3>
                                    <p className="text-sm text-ink-primary mt-0">
                                        {g.discipline}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-4 ml-16">
                                {g.papers.length === 0 ? (
                                    <p className="text-xs text-ink-muted italic">
                                        No published papers yet. Contribute via{" "}
                                        <Link href="/groups" className="text-ink-body hover:text-ink-heading">
                                            /groups
                                        </Link>
                                        .
                                    </p>
                                ) : (
                                    <ul className="space-y-1 text-sm">
                                        {g.papers.map((p) => (
                                            <li key={p.href}>
                                                <a
                                                    href={p.href}
                                                    className="text-ink-body hover:text-ink-heading"
                                                >
                                                    {p.title}
                                                </a>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </article>
                    ))}
                </div>
            </section>

            <MarketingSection eyebrow="Implementation">
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    Implementation work &mdash; schema authoring, contract development, assembly composition, frontend construction &mdash; organizes separately at{" "}
                    <Link href="/builders" className="text-ink-heading font-medium hover:text-ink-body">
                        /builders
                    </Link>
                    . The disciplines above frame the substrate; /builders is where the substrate gets built on.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The property the kernel&apos;s narrowness produces &mdash; that a wide range of economic arrangements compose on top while preserving the bonding equilibrium &mdash; is stated on{" "}
                    <Link href="/composability" className="text-ink-heading font-medium hover:text-ink-body">
                        /composability
                    </Link>
                    .
                </p>
            </MarketingSection>

            <MarketingSection eyebrow="Working groups" bottomPad="wide">
                <p className="text-base text-ink-body leading-relaxed">
                    Active work in each discipline &mdash; charters, current work, grants, dedicated channels &mdash; lives at{" "}
                    <Link href="/groups" className="text-ink-heading font-medium hover:text-ink-body">
                        /groups
                    </Link>
                    , alongside the composability working groups (assembly composition, schema authoring) and grants &amp; capital sources.
                </p>
            </MarketingSection>
        </>
    );
}
