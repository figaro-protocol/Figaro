import type { ReactNode } from "react";

interface MarketingHeroProps {
    /** H1 title. */
    title: string;
    /** Optional lead paragraph. */
    lead?: ReactNode;
    /** Anything additional below the lead — extra paragraphs, callouts, etc. */
    children?: ReactNode;
}

/**
 * Marketing-tier hero. H1 + optional lead + arbitrary children.
 * No eyebrow — banned on marketing pages per the no-marketing-hero-eyebrow rule.
 */
export function MarketingHero({ title, lead, children }: MarketingHeroProps) {
    return (
        <section className="container mx-auto px-6 pt-24 pb-12 max-w-3xl">
            <h1 className="text-heading-h1 text-ink-heading mt-0 mb-6">
                {title}
            </h1>
            {lead && (
                <p className="text-body-lead text-ink-muted max-w-2xl">
                    {lead}
                </p>
            )}
            {children}
        </section>
    );
}
