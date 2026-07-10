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
                    Figaro makes cooperation the dominant strategy between strangers and lets institutions dissolve into transaction-scoped processes &mdash; a genuinely different way to coordinate. It is hard to see at first, because the assumptions it sets aside are the ones nearly everyone arrives with: that durable coordination needs a firm, fixed roles, or a trusted party in the middle. Bonded commitments make those structurally unnecessary. The corpus exists to ease the crossing &mdash; each paper meets a reader inside one discipline&rsquo;s vocabulary and carries them from the inherited model to the bonded one. Not to settle the question, but to start the conversation a working group takes from there.
                </p>
            </MarketingSection>

            <MarketingSection title="By discipline." bottomPad="wide">
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
                                            {isPdf ? (
                                                <a href={p.href} className="text-ink-heading font-medium hover:underline">
                                                    {p.title}
                                                </a>
                                            ) : (
                                                <Link href={p.href} className="text-ink-heading font-medium hover:underline">
                                                    {p.title}
                                                </Link>
                                            )}
                                            {isPdf && (
                                                <span className="ml-2 text-xs text-ink-faint uppercase tracking-wide">PDF</span>
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
