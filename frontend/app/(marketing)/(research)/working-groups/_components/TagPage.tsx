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
            <MarketingHero
                title={entry.label}
                lead={
                    <>
                        <Breadcrumb
                            items={[
                                { label: "Working groups", href: "/working-groups" },
                                { label: kind === "for" ? "By industry" : "By keyword", href: "/working-groups#index" },
                                { label: entry.label },
                            ]}
                            className="mb-4"
                        />
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
