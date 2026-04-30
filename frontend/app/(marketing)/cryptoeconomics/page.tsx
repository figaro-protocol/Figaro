import type { Metadata } from "next";
import Link from "next/link";
import { DisciplineGlyph } from "@/components/shared/DisciplineGlyph";
import { MarketingHero } from "@/components/shared/MarketingHero";
import { MarketingSection } from "@/components/shared/MarketingSection";
import { GROUPS_REGISTRY } from "@/lib/shared/groupsRegistry";

export const metadata: Metadata = {
    title: "Cryptoeconomics — Figaro",
    description:
        "Voshmgir & Zargham, Foundations of Cryptoeconomic Systems (2024). Eight disciplines converge on the substrate; Figaro's papers are organized along that taxonomy.",
};

export default function Cryptoeconomics() {
    return (
        <>
            <MarketingHero
                eyebrow="Cryptoeconomics"
                title="Cryptoeconomic systems are multi-disciplinary."
                lead={
                    <>
                        Voshmgir &amp; Zargham frame the field as eight disciplines converging on the same substrate &mdash; each asks the substrate a different question in its own vocabulary. Figaro&apos;s papers are organized along that taxonomy. Working groups, current work, grants, and community framing live on{" "}
                        <Link href="/groups" className="underline hover:text-black">
                            /groups
                        </Link>
                        .
                    </>
                }
            />

            <MarketingSection>
                <figure>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src="/images/foundations-zargham-2024.jpg"
                        alt="Eight disciplines arranged around a central cryptoeconomic-systems node."
                        width={1014}
                        height={612}
                        className="w-full h-auto rounded-lg border border-gray-200"
                    />
                    <figcaption className="text-xs text-gray-500 italic mt-2">
                        Figure from Voshmgir &amp; Zargham,{" "}
                        <em>Foundations of Cryptoeconomic Systems</em> (2024, Figure 1). Reproduced with attribution.
                    </figcaption>
                </figure>
            </MarketingSection>

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
                                    <h3 className="text-2xl font-bold text-black leading-snug">
                                        {g.name}
                                    </h3>
                                    <p className="text-sm text-gray-500 italic">
                                        {g.discipline}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-4 ml-16">
                                {g.papers.length > 0 ? (
                                    <ul className="space-y-1 text-sm">
                                        {g.papers.map((p) => (
                                            <li key={p.id}>
                                                <a
                                                    href={p.href}
                                                    className="text-gray-700 hover:text-black hover:underline"
                                                >
                                                    <span className="font-mono text-xs text-gray-500">
                                                        {p.id}
                                                    </span>{" "}
                                                    &mdash; {p.title}
                                                </a>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-xs text-gray-500 italic">
                                        No published papers yet. Contribute via{" "}
                                        <Link href="/groups" className="underline">
                                            /groups
                                        </Link>
                                        .
                                    </p>
                                )}
                            </div>
                        </article>
                    ))}
                </div>
            </section>

            <MarketingSection eyebrow="Implementation">
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    Implementation work &mdash; schema authoring, contract development, assembly composition, frontend construction &mdash; organizes separately at{" "}
                    <Link href="/builders" className="underline">
                        /builders
                    </Link>
                    . The disciplines above frame the substrate; /builders is where the substrate gets built on.
                </p>
                <p className="text-base text-gray-700 leading-relaxed">
                    The property the kernel&apos;s narrowness produces &mdash; that a wide range of economic arrangements compose on top while preserving the bonding equilibrium &mdash; is stated on{" "}
                    <Link href="/composability" className="underline">
                        /composability
                    </Link>
                    .
                </p>
            </MarketingSection>

            <MarketingSection eyebrow="Working groups" bottomPad="wide">
                <p className="text-base text-gray-700 leading-relaxed">
                    Active work in each discipline &mdash; charters, current work, grants, dedicated channels &mdash; lives at{" "}
                    <Link href="/groups" className="underline font-semibold">
                        /groups
                    </Link>
                    , alongside the composability working groups (assembly composition, schema authoring) and grants &amp; capital sources.
                </p>
            </MarketingSection>
        </>
    );
}
