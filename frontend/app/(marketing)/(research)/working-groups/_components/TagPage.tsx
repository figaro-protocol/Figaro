import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { tagEntry, tagSlug } from "@/app/(marketing)/_lib/paperGroups";
import { PaperRow } from "./PaperRow";

/**
 * One entry of the reader's index: every paper under one industry (`for`)
 * or one keyword (`on`), with title, summary, keywords, and discipline.
 * Both `[tag]` routes render this; the entry set is derived from the
 * registry, so a paper that gains a keyword gains a page.
 */
export function TagPage({ kind, slug }: { kind: "for" | "on"; slug: string }) {
    const entry = tagEntry(kind, slug);
    if (!entry) return null;
    const noun = kind === "for" ? "industry" : "keyword";
    return (
        <>
            {/* The trail sits BEFORE the hero, in the container wrapper
                `/pitfalls` and `/worked-example` already use. It cannot ride
                the hero's `lead`: that slot renders inside a <p>, the HTML
                parser closes a <p> at any <nav>, and the relocated node makes
                the browser's DOM differ from React's tree — a hydration
                mismatch (React #418/#423) on all 200 tag pages. */}
            <div className="container mx-auto px-6 pt-8">
                <Breadcrumb
                    items={[
                        { label: "Working groups", href: "/working-groups" },
                        { label: kind === "for" ? "By industry" : "By keyword", href: "/working-groups#index" },
                        { label: entry.label },
                    ]}
                />
            </div>
            <MarketingHero
                title={entry.label}
                lead={
                    <>
                        {entry.papers.length} {entry.papers.length === 1 ? "paper" : "papers"} carry this {noun}. Each is listed with what it treats and the discipline it sits in.
                    </>
                }
            />
            <MarketingSection>
                <ul className="space-y-8 max-w-2xl">
                    {entry.papers.map((p) => (
                        <PaperRow key={p.href} paper={p} group={p.group} highlight={kind === "on" ? entry.slug : undefined} />
                    ))}
                </ul>
                <p className="text-xs text-ink-muted mt-10">
                    <Link href="/working-groups#index" className="underline">The whole index</Link>, by industry and by keyword. A paper&apos;s slug in this index is {tagSlug(entry.label)}.
                </p>
            </MarketingSection>
        </>
    );
}
