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
    title: "Cryptoeconomics — Figaro",
    description:
        "Voshmgir & Zargham, Foundations of Cryptoeconomic Systems (2024). Eight disciplines converge on the substrate; Figaro's papers are organized along that taxonomy. Working groups assemble where contributors do.",
};

export default function Cryptoeconomics() {
    return (
        <>
            <MarketingHero
                eyebrow="Cryptoeconomics"
                title="Cryptoeconomic systems are multi-disciplinary."
                lead={
                    <>
                        Voshmgir &amp; Zargham frame the field as eight disciplines
                        converging on the same substrate &mdash; each asks the substrate
                        a different question in its own vocabulary. Figaro&apos;s papers
                        are organized along that taxonomy. Working groups assemble where
                        contributors do; empty disciplines are open calls.
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
                        <em>Foundations of Cryptoeconomic Systems</em> (2024, Figure 1).
                        Reproduced with attribution.
                    </figcaption>
                </figure>
            </MarketingSection>

            {/* Project-wide coordination — rendered once at the top of the
                disciplines section so per-card venue lines don't repeat. */}
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
                    . Disciplines with their own dedicated channels surface them
                    inline below; otherwise, all conversation is the project
                    Telegram.
                </p>
            </MarketingSection>

            {/* Disciplines list — uses a non-MarketingSection wrapper because
                each <article> is its own anchor target with custom layout
                (glyph leading-column + indented body). */}
            <section className="container mx-auto px-6 pb-12 max-w-3xl pt-2">
                <div className="space-y-12">
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
                                        <h3 className="text-2xl font-bold text-black leading-snug">
                                            {g.name}
                                        </h3>
                                        <p className="text-sm text-gray-500 italic">
                                            {g.discipline}
                                        </p>
                                    </div>
                                </div>

                                {convened ? (
                                    <div className="mt-4 ml-16 space-y-4">
                                        <p className="text-sm text-gray-700 leading-relaxed">
                                            {g.charter}
                                        </p>

                                        {g.papers.length > 0 && (
                                            <div>
                                                <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">
                                                    Papers
                                                </p>
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
                                            </div>
                                        )}

                                        {g.currentWork && g.currentWork.length > 0 && (
                                            <div>
                                                <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">
                                                    Current work
                                                </p>
                                                <ul className="space-y-1 text-sm text-gray-700 list-disc pl-5">
                                                    {g.currentWork.map((w, i) => (
                                                        <li key={i}>{w}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {g.references && g.references.length > 0 && (
                                            <div>
                                                <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">
                                                    See also
                                                </p>
                                                <ul className="space-y-1 text-sm">
                                                    {g.references.map((r) => (
                                                        <li key={r.href}>
                                                            <a
                                                                href={r.href}
                                                                target={r.href.startsWith("http") ? "_blank" : undefined}
                                                                rel={r.href.startsWith("http") ? "noopener noreferrer" : undefined}
                                                                className="text-gray-700 hover:text-black hover:underline"
                                                            >
                                                                {r.label}
                                                            </a>
                                                            {r.note && (
                                                                <span className="text-gray-500"> &mdash; {r.note}</span>
                                                            )}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {g.venue && (
                                            <p className="text-xs text-gray-500">
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
                                ) : (
                                    <p className="mt-3 ml-16 text-xs text-gray-500 italic">
                                        Open call &mdash; no group convened yet.
                                    </p>
                                )}
                            </article>
                        );
                    })}
                </div>
            </section>

            <MarketingSection eyebrow="Implementation">
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    Implementation work &mdash; schema authoring, contract
                    development, assembly composition, frontend
                    construction &mdash; organizes separately at{" "}
                    <Link href="/builders" className="underline">
                        /builders
                    </Link>
                    . The disciplines above frame the substrate; /builders
                    is where the substrate gets built on.
                </p>
                <p className="text-base text-gray-700 leading-relaxed">
                    The property the kernel&apos;s narrowness produces &mdash; that
                    a wide range of economic arrangements compose on top while
                    preserving the bonding equilibrium &mdash; is stated on{" "}
                    <Link href="/composability" className="underline">
                        /composability
                    </Link>
                    .
                </p>
            </MarketingSection>

            <MarketingSection eyebrow="Grants &amp; capital sources">
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    Work on the Figaro substrate &mdash; research, review,
                    verification, assembly design, documentation &mdash; is funded
                    through permissionless channels. No application committee. No
                    curated budget.
                </p>
                <dl className="space-y-4 text-sm">
                    <div className="border-l-2 border-gray-200 pl-4">
                        <dt className="text-base font-semibold text-black">DAO allocation</dt>
                        <dd className="text-gray-700 leading-relaxed mt-1">
                            300M FIG (30% of supply) minted to the DAO wallet at
                            genesis with no vesting. Allocation decisions will be
                            made by the DAO&apos;s governance process; the DAO is
                            not yet instantiated.
                        </dd>
                    </div>
                    <div className="border-l-2 border-gray-200 pl-4">
                        <dt className="text-base font-semibold text-black">Gitcoin rounds</dt>
                        <dd className="text-gray-700 leading-relaxed mt-1">
                            Quadratic funding for Figaro-adjacent work. No Figaro
                            round is live yet; until then, groups can apply to
                            general ecosystem rounds where they fit the theme.
                        </dd>
                    </div>
                    <div className="border-l-2 border-gray-200 pl-4">
                        <dt className="text-base font-semibold text-black">Direct contributions</dt>
                        <dd className="text-gray-700 leading-relaxed mt-1">
                            Any wallet can send assets to a group&apos;s published
                            address or to the DAO wallet. On-chain visibility
                            preserves the funding graph.
                        </dd>
                    </div>
                </dl>
            </MarketingSection>

            <MarketingSection eyebrow="Contributing" bottomPad="extra">
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    To add a paper, declare current work, surface a received
                    grant, or publish a contributor handle, open a pull request
                    against{" "}
                    <code>frontend/lib/shared/groupsRegistry.ts</code>. PRs are
                    reviewed at merge time; conversation about scope happens on
                    Telegram before codification.
                </p>
                <p className="text-sm text-gray-600 leading-relaxed">
                    The disciplinary list itself tracks Voshmgir &amp; Zargham,{" "}
                    <em>Foundations of Cryptoeconomic Systems</em>. If the
                    literature converges on a different taxonomy, this registry
                    will follow.
                </p>
            </MarketingSection>
        </>
    );
}
