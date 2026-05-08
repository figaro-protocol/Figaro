import type { ReactNode } from "react";

interface MarketingSectionProps {
    /** Optional H2 title (`text-heading-h2 text-ink-heading`). */
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
 * Marketing-tier section. Top divider + optional H2 + body. Container width
 * (`max-w-3xl`) matches the hero. Anchor support via `sectionId`.
 */
export function MarketingSection({
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
            className={`container mx-auto px-6 ${pbClass} max-w-3xl border-t border-default pt-xl${scrollClass}`}
        >
            {title && (
                <h2 className="text-heading-h2 text-ink-heading mt-0 mb-6">
                    {title}
                </h2>
            )}
            {children}
        </section>
    );
}
