"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Menu from "@/components/icons/Menu";
import X from "@/components/icons/X";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_LINKS, NavLink } from "@/components/shared/navLinks";
import { navCurrent } from "@/components/shared/navActive";
import { Disclosure } from "@/components/ui/Disclosure";

interface MobileNavProps {
    links?: NavLink[];
    logo?: React.ReactNode;
    /** Optional CTA pinned to the top of the slide-out drawer. No current
     *  tier passes one; the slot stays for a tier that does. */
    topCta?: ReactNode;
}

interface NavGroup {
    section: string;
    slug: string;
    links: NavLink[];
}

/**
 * Re-group the flat drawer list into the sections its `isSectionHeader`
 * entries already encode. DERIVED, never re-listed: both drawer lists
 * (`NAV_LINKS_MARKETING_DRAWER`, `NAV_LINKS_APP_DRAWER`) are themselves
 * derived from `MARKETING_MAP` / `NAV_LINKS_APP_PRIMARY`, so a section added
 * upstream appears here with no edit. Entries appearing BEFORE the first
 * header (e.g. the bare `NAV_LINKS` default) stay ungrouped and render as
 * top-level rows.
 */
function groupLinks(links: NavLink[]): { ungrouped: NavLink[]; groups: NavGroup[] } {
    const ungrouped: NavLink[] = [];
    const groups: NavGroup[] = [];
    for (const link of links) {
        if (link.isSectionHeader) {
            groups.push({
                section: link.label,
                slug: link.label.toLowerCase().replace(/[^a-z]+/g, "-"),
                links: [],
            });
        } else if (groups.length === 0) {
            ungrouped.push(link);
        } else {
            groups[groups.length - 1].links.push(link);
        }
    }
    return { ungrouped, groups };
}

/** The section holding the reader, or `null` when the route is outside them all. */
function sectionHoldingReader(groups: NavGroup[], pathname: string): string | null {
    const holder = groups.find((group) =>
        group.links.some((link) => navCurrent(pathname, link.href) !== undefined),
    );
    return holder?.section ?? null;
}

/**
 * The mobile drawer — the ONE way into the site tree on a phone.
 *
 * Sections are an ACCORDION, one open at a time (`components/ui/Disclosure`):
 * the flat list ran past the fold on every small viewport, and its 11px
 * section headers read as captions BENEATH the 16px links they governed —
 * hierarchy inverted. Closed, the drawer is now one row per section, so the
 * whole map fits a small phone without scrolling; the section that holds the
 * current route opens on its own, so the reader lands where they already are.
 *
 * "You are here" runs on the same three ORTHOGONAL channels as the desktop
 * tree (`NavTreeRow`), per DESIGN_TOKENS §7: FILL is hover, RING is focus,
 * RULE + WEIGHT is current. pl-3.5 (14px) + the 2px rule restores px-4's 16px
 * inset, so a current row's label does not shift against its neighbours.
 */
export function MobileNav({ links, logo, topCta }: MobileNavProps) {
    links = links ?? NAV_LINKS;
    const [isOpen, setIsOpen] = useState(false);
    const [openSection, setOpenSection] = useState<string | null>(null);
    const pathname = usePathname();
    const triggerRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    const { ungrouped, groups } = groupLinks(links);

    // Close menu when route changes (avoids unmounting Link before navigation completes)
    useEffect(() => {
        setIsOpen(false);
    }, [pathname]);

    // Focus trap + Escape-to-close + focus restoration on the open panel.
    useEffect(() => {
        if (!isOpen) return;

        const panel = panelRef.current;
        if (!panel) return;

        // Focus the first focusable element on open.
        const focusables = panel.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        focusables[0]?.focus();

        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                setIsOpen(false);
                triggerRef.current?.focus();
                return;
            }
            if (e.key === "Tab") {
                // Re-queried per keypress: expanding a section adds focusables.
                const list = panel.querySelectorAll<HTMLElement>(
                    'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
                );
                if (list.length === 0) return;
                const first = list[0];
                const last = list[list.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };

        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [isOpen]);

    const open = () => {
        // Derived on every open, not stored: the reader's own section is the
        // one panel worth their tap, and the pathname is where that lives.
        setOpenSection(sectionHoldingReader(groups, pathname));
        setIsOpen(true);
    };

    const close = () => {
        setIsOpen(false);
        triggerRef.current?.focus();
    };

    /** One row: a page link. Shared by the ungrouped rows and every section panel. */
    const renderLink = (link: NavLink) => {
        const current = navCurrent(pathname, link.href);
        return (
            <li key={link.href} className="mb-0">
                <Link
                    href={link.href}
                    aria-current={current}
                    // rounded-r-tile, not rounded-tile: a rounded LEFT edge bends
                    // the 2px current rule into a brace. The rule stays straight.
                    className={`flex min-h-11 flex-col justify-center rounded-r-tile pr-md py-xs transition-colors hover:bg-subtle-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${current
                        ? "pl-3.5 border-l-2 border-ink-heading text-ink-primary"
                        : "pl-4 text-ink-body hover:text-ink-primary"
                        }`}
                >
                    {/* Weight lives on the label, not the anchor — the anchor's
                        font-* is overridden by this span. */}
                    <span className={current ? "font-semibold" : "font-normal"}>{link.label}</span>
                    {link.description && (
                        <span className="mt-0.5 text-xs text-ink-muted">{link.description}</span>
                    )}
                </Link>
            </li>
        );
    };

    return (
        <>
            {/* Hamburger Button */}
            <button
                ref={triggerRef}
                onClick={() => (isOpen ? close() : open())}
                className="md:hidden flex min-h-11 min-w-11 items-center justify-center rounded-tile border-0 bg-transparent p-2 text-ink-heading hover:bg-subtle-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                aria-label="Toggle mobile menu"
                aria-expanded={isOpen}
                aria-controls="mobile-menu"
            >
                {isOpen ? (
                    <X className="w-6 h-6" aria-hidden="true" />
                ) : (
                    <Menu className="w-6 h-6" aria-hidden="true" />
                )}
            </button>

            {/* The drawer PORTALS to <body>: the sticky header's
                backdrop-blur makes the header a containing block for fixed
                descendants, so an in-place drawer's h-full resolves to the
                header's own height (~82px) — full content, collapsed box. */}
            {isOpen && createPortal(
                <>
                    {/* Backdrop */}
                    <div
                        data-testid="mobile-nav-backdrop"
                        className="fixed inset-0 z-40 md:hidden bg-ink-primary/40"
                        onClick={close}
                        aria-hidden="true"
                    />

                    {/* Slide-out Menu */}
                    <div
                        id="mobile-menu"
                        ref={panelRef}
                        className="fixed top-0 left-0 z-50 flex h-full w-80 max-w-full transform flex-col border-r border-default bg-paper shadow-section transition-transform duration-300 ease-in-out md:hidden"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Mobile navigation"
                    >
                        {/* Menu Header */}
                        <div className="flex items-center justify-between gap-sm border-b border-default px-md py-sm">
                            {logo || (
                                <span className="text-heading-h3 text-ink-heading">
                                    Figaro<span className="align-super text-xs ml-1" aria-label="registered trademark">®</span> Protocol
                                </span>
                            )}
                            <button
                                onClick={close}
                                className="flex min-h-11 min-w-11 items-center justify-center rounded-tile border-0 bg-transparent p-2 text-ink-muted hover:bg-subtle-hover hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                                aria-label="Close menu"
                            >
                                <X className="w-5 h-5" aria-hidden="true" />
                            </button>
                        </div>

                        {/* Optional top CTA — caller-controlled; currently no
                             tier passes one. (app) must never surface a
                             marketing CTA here. */}
                        {topCta && (
                            <div className="border-b border-default p-md">
                                {topCta}
                            </div>
                        )}

                        {/* Navigation */}
                        {/* No horizontal padding: rows run to the drawer's own
                            edge, so the current-row rule reads as a margin rule
                            and each row's pl-4 keeps the header's 16px inset. */}
                        <nav className="flex-1 overflow-y-auto py-sm">
                            {ungrouped.length > 0 && (
                                <ul className="list-none pl-0 mb-xs space-y-0.5" role="list">
                                    {ungrouped.map(renderLink)}
                                </ul>
                            )}
                            <ul className="list-none pl-0 space-y-0.5" role="list">
                                {groups.map((group) => {
                                    const expanded = openSection === group.section;
                                    const holdsReader = sectionHoldingReader([group], pathname) !== null;
                                    return (
                                        <li key={`section-${group.section}`} className="mb-0">
                                            <Disclosure
                                                id={`mobile-nav-${group.slug}`}
                                                triggerTestId={`mobile-nav-section-${group.slug}`}
                                                expanded={expanded}
                                                onToggle={() => setOpenSection(expanded ? null : group.section)}
                                                aria-current={holdsReader ? "true" : undefined}
                                                // Section headers DOMINATE their links:
                                                // heading-h3 (18px/600, ink-heading) over a
                                                // 16px ink-body row. RULE + WEIGHT marks the
                                                // section that holds the reader.
                                                triggerClassName={`pr-md text-heading-h3 text-ink-heading ${holdsReader ? "pl-3.5 border-l-2 border-ink-heading" : "pl-4"}`}
                                                label={group.section}
                                            >
                                                {/* The panel's own pl-4 indents the whole
                                                    group; each row keeps px-4's inset from
                                                    there, so the current-row rule lines up
                                                    as the group's left guide. */}
                                                <ul className="list-none pl-4 pb-xs space-y-0.5" role="list">
                                                    {group.links.map(renderLink)}
                                                </ul>
                                            </Disclosure>
                                        </li>
                                    );
                                })}
                            </ul>
                        </nav>
                    </div>
                </>,
                document.body,
            )}
        </>
    );
}
