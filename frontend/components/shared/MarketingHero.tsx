import type { ReactNode } from "react";

interface MarketingHeroProps {
    /** Uppercase tracking-widest label above the H1 (page name). */
    eyebrow: string;
    /** H1 title. */
    title: string;
    /** Optional `text-xl text-gray-600` lead paragraph. */
    lead?: ReactNode;
    /** Anything additional below the lead — extra paragraphs, callouts, etc. */
    children?: ReactNode;
}

/**
 * Marketing-tier hero. Eyebrow + H1 + optional lead + arbitrary children.
 * Canonical scale: `text-5xl sm:text-6xl` H1, `text-xl text-gray-600` lead,
 * `max-w-3xl` body within a `pt-24 pb-12` section.
 */
export function MarketingHero({ eyebrow, title, lead, children }: MarketingHeroProps) {
    return (
        <section className="container mx-auto px-6 pt-24 pb-12 max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-4">
                {eyebrow}
            </p>
            <h1 className="text-5xl sm:text-6xl font-bold text-black leading-tight tracking-tight mb-6">
                {title}
            </h1>
            {lead && (
                <p className="text-xl text-gray-600 leading-relaxed max-w-2xl">
                    {lead}
                </p>
            )}
            {children}
        </section>
    );
}
