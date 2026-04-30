import type { ReactNode } from "react";

interface MarketingSectionProps {
    /** Optional uppercase tracking-widest eyebrow above the H2. */
    eyebrow?: string;
    /** Optional H2 title (`text-3xl font-bold leading-tight`). */
    title?: string;
    /** Anchor target for `#fragment` URLs. Adds `scroll-mt-24` automatically. */
    sectionId?: string;
    /** Bottom padding override.
     *   - default (pb-12): standard between-sections spacing
     *   - wide (pb-24): used for the last section before the page footer
     *   - extra (pb-32): reserved for the rare hero-adjacent close
     */
    bottomPad?: "default" | "wide" | "extra";
    /** When true and `title` is omitted, the eyebrow renders as a semantic
     *  `<h2>` while keeping its small uppercase visual weight. Used for
     *  flat-catalogue pages (e.g. `/spec`) where the heavy `text-3xl` H2
     *  doesn't fit the page's scan rhythm but the document still needs
     *  proper heading semantics for accessibility. */
    eyebrowAsHeading?: boolean;
    children: ReactNode;
}

/**
 * Marketing-tier section. Top divider + eyebrow + H2 + body. Container width
 * (`max-w-3xl`) matches the hero. Anchor support via `sectionId`.
 */
export function MarketingSection({
    eyebrow,
    title,
    sectionId,
    bottomPad = "default",
    eyebrowAsHeading = false,
    children,
}: MarketingSectionProps) {
    const pbClass =
        bottomPad === "extra" ? "pb-32" : bottomPad === "wide" ? "pb-24" : "pb-12";
    const scrollClass = sectionId ? " scroll-mt-24" : "";

    const eyebrowClass =
        "text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3";
    const renderEyebrowAsH2 = eyebrowAsHeading && !title;

    return (
        <section
            id={sectionId}
            className={`container mx-auto px-6 ${pbClass} max-w-3xl border-t border-gray-200 pt-12${scrollClass}`}
        >
            {eyebrow && renderEyebrowAsH2 && (
                <h2 className={`${eyebrowClass} mb-6`}>{eyebrow}</h2>
            )}
            {eyebrow && !renderEyebrowAsH2 && (
                <p className={eyebrowClass}>{eyebrow}</p>
            )}
            {title && (
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    {title}
                </h2>
            )}
            {children}
        </section>
    );
}
