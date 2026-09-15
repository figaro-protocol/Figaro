"use client";

import Link from "@/components/shared/Link";
import { usePathname } from "next/navigation";
import { SECTION_IDS, currentSection, sectionLabel, sectionLanding } from "@/lib/shared/sections";
import { navCurrent } from "@/components/shared/navActive";

/**
 * The header's first level: the three sections as plain links, on every page,
 * so a reader moves between sections without going back to the home page. The
 * reader's own section carries the current rule; its landing page, when the
 * reader is on it, is `aria-current="page"`. The second level — the section's
 * own tree — is `NavTreeRow`, under this row. Desktop only; the drawer
 * carries the same three rows on a phone.
 */
export function SectionLinks() {
    const pathname = usePathname() ?? "/";
    const section = currentSection(pathname);
    return (
        <nav aria-label="Sections" className="hidden md:flex flex-1 justify-center items-center gap-1 text-sm" data-testid="section-links">
            {SECTION_IDS.map((id) => {
                const href = sectionLanding(id);
                const current = navCurrent(pathname, href) === "page" ? "page" : section === id ? "true" : undefined;
                return (
                    <Link
                        key={id}
                        href={href}
                        aria-current={current}
                        className={`py-1.5 rounded text-ink-heading hover:bg-subtle-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${current ? "pl-2 pr-2.5 border-l-2 border-ink-heading font-semibold" : "px-2.5"}`}
                    >
                        {sectionLabel(id)}
                    </Link>
                );
            })}
        </nav>
    );
}
