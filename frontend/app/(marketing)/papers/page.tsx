import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { PAPER_GROUPS } from "@/app/(marketing)/_lib/paperGroups";

export const metadata: Metadata = {
    title: "Papers — Figaro Protocol",
    description:
        "Discussion starters for the working groups that form, permissionlessly, anywhere around the Figaro substrate — the paper corpus organized along the eight cryptoeconomic disciplines. Each reads in the browser and exports to PDF.",
};

export default function Papers() {
    const groups = PAPER_GROUPS.filter((g) => g.papers.length > 0);

    return (
        <>
            <MarketingHero
                title="Papers."
                lead={
                    <>
                        Discussion starters, not doctrine. Each paper reads the bonded settlement primitive through one of the eight cryptoeconomic disciplines &mdash; a seed for the working groups that form around it, anywhere and without permission, to extend it, contest it, or fork it into an implementation of their own. Each reads in the browser, with server-rendered math, and exports to PDF. The disciplines, the self-forming groups, and how the work is funded sit at{" "}
                        <Link href="/cryptoeconomics" className="text-ink-heading font-medium hover:underline">
                            cryptoeconomics
                        </Link>
                        .
                    </>
                }
            />

            <MarketingSection title="A different way to coordinate.">
                <p className="text-sm text-ink-body leading-relaxed max-w-2xl">
                    Figaro makes cooperation the dominant strategy between strangers &mdash; weakly dominant, under perfect monitoring and costless performance &mdash; and lets institutions dissolve into transaction-scoped processes, a genuinely different way to coordinate. It is hard to see at first, because the assumptions it sets aside are the ones nearly everyone arrives with: that durable coordination needs a firm, fixed roles, or a trusted party in the middle. Bonded commitments make those structurally unnecessary. The corpus exists to ease the crossing &mdash; each paper meets a reader inside one discipline&rsquo;s vocabulary and carries them from the inherited model to the bonded one. Not to settle the question, but to start the conversation a working group takes from there.
                </p>
                <p className="text-sm text-ink-body leading-relaxed max-w-2xl mt-4">
                    New readers should start with{" "}
                    <Link href="/papers/asymmetric-bonding" className="text-ink-heading font-medium hover:underline">
                        Asymmetric Bonding and Buyer Dominance
                    </Link>
                    , the mechanism-design paper that derives the two composing mechanisms and their equilibrium from first principles; every other paper in the corpus takes those results as given.
                </p>
                <p className="text-sm text-ink-body leading-relaxed max-w-2xl mt-4">
                    The corpus analyzes a system that is built and formally verified but pre-launch: no public deployment exists yet, so every paper below states a mechanism, never a live-market result.
                </p>
            </MarketingSection>

            <MarketingSection title="By discipline." bottomPad="wide">
                <p className="text-sm text-ink-muted leading-relaxed max-w-2xl mb-8">
                    Papers marked <span className="text-xs text-ink-faint uppercase tracking-wide">Formal</span> are the mechanism-design and engineering core &mdash; the equilibrium proof, the verified kernel, the composition discipline, and the behavioral analysis. The rest are interpretive essays that read those results through a discipline&rsquo;s own vocabulary.
                </p>
                <p className="text-sm text-ink-muted leading-relaxed max-w-2xl mb-8">
                    The corpus deliberately spans engineering &mdash; the kernel, its verification, the composition discipline &mdash; and political economy or philosophy &mdash; what the mechanism displaces; the two registers read the same primitive at a different altitude, and the grouping below is the map between them.
                </p>
                <div className="space-y-10">
                    {groups.map((g) => (
                        <div key={g.slug}>
                            <h3 className="text-heading-h3 text-ink-heading leading-snug">{g.name}</h3>
                            <p className="text-xs text-ink-muted italic mt-0.5 mb-3">{g.discipline}</p>
                            <ul className="space-y-2 text-base">
                                {g.papers.map((p) => {
                                    const isPdf = p.href.endsWith(".pdf");
                                    return (
                                        <li key={p.href}>
                                            <div className="flex flex-wrap items-baseline gap-x-2">
                                                {isPdf ? (
                                                    <a href={p.href} className="text-ink-heading font-medium hover:underline">
                                                        {p.title}
                                                    </a>
                                                ) : (
                                                    <Link href={p.href} className="text-ink-heading font-medium hover:underline">
                                                        {p.title}
                                                    </Link>
                                                )}
                                                {p.formalCore && (
                                                    <span className="text-xs text-ink-faint uppercase tracking-wide">Formal</span>
                                                )}
                                                {isPdf && (
                                                    <span className="text-xs text-ink-faint uppercase tracking-wide">PDF</span>
                                                )}
                                            </div>
                                            {p.blurb && (
                                                <p className="text-sm text-ink-muted leading-snug mt-0.5 max-w-2xl">{p.blurb}</p>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ))}
                </div>
            </MarketingSection>
        </>
    );
}
