import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { GROUPS_REGISTRY } from "@/lib/shared/groupsRegistry";

export const metadata: Metadata = {
    title: "Papers — Figaro Protocol",
    description:
        "The Figaro paper corpus, organized along the eight cryptoeconomic disciplines. Prose papers read in the browser and print to PDF; math-heavy papers download as typeset PDFs.",
};

export default function Papers() {
    const groups = GROUPS_REGISTRY.filter((g) => g.papers.length > 0);

    return (
        <>
            <MarketingHero
                title="Papers."
                lead={
                    <>
                        The corpus, organized along the eight cryptoeconomic disciplines &mdash; each paper translating the bonded settlement primitive into one discipline&apos;s vocabulary. Prose papers read in the browser and export to PDF from the page; math-heavy papers download as typeset PDFs. The disciplines themselves, the working groups, and how the work is funded sit at{" "}
                        <Link href="/cryptoeconomics" className="text-ink-heading font-medium hover:underline">
                            cryptoeconomics
                        </Link>
                        .
                    </>
                }
            />

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
