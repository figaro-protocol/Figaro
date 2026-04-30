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
    children,
}: MarketingSectionProps) {
    const pbClass =
        bottomPad === "extra" ? "pb-32" : bottomPad === "wide" ? "pb-24" : "pb-12";
    const scrollClass = sectionId ? " scroll-mt-24" : "";

    return (
        <section
            id={sectionId}
            className={`container mx-auto px-6 ${pbClass} max-w-3xl border-t border-gray-200 pt-12${scrollClass}`}
        >
            {eyebrow && (
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    {eyebrow}
                </p>
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
