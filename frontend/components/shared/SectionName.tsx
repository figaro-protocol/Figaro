"use client";

import { usePathname } from "next/navigation";
import { currentSection, sectionLabel } from "@/lib/shared/sections";

/** The section's own name beside the logo — Use, Build, or Core — so a
 *  reader always knows which section they are in. Nothing on the apex. */
export function SectionName() {
    const pathname = usePathname() ?? "/";
    const label = sectionLabel(currentSection(pathname));
    if (!label) return null;
    return (
        <span className="text-sm font-medium text-ink-muted border-l border-default pl-3" data-testid="section-name">
            {label}
        </span>
    );
}
