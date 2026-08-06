"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MARKETING_MAP, NAV_LINKS } from "@/components/shared/navLinks";

/**
 * Desktop publication nav with disclosure submenus — the ONE wayfinding
 * tree (operator rule 2026-08-06: it replaces the footer's link columns
 * and the per-page "More on…" closers, so pointers stop regrowing all
 * over the pages).
 *
 * Each doorway stays a plain link; the chevron beside it is a separate
 * disclosure BUTTON (click-to-open, Escape and outside-click close —
 * never hover-only) opening the section's links from `MARKETING_MAP`,
 * the same single source the mobile drawer flattens. A doorway whose
 * section holds no further links gets no chevron.
 */
export function NavTreeRow() {
    const [open, setOpen] = useState<string | null>(null);
    const rootRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
                setOpen(null);
            }
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(null);
        };
        document.addEventListener("mousedown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open]);

    return (
        <nav
            ref={rootRef}
            className="hidden md:flex flex-1 justify-center items-center gap-5 text-base"
            data-testid="desktop-nav"
        >
            {NAV_LINKS.map((link) => {
                // The doorway's section: MARKETING_MAP's group whose FIRST
                // entry IS the doorway (the map's own convention).
                const group = MARKETING_MAP.find((g) => g.links[0]?.href === link.href);
                const items = group ? group.links.slice(1) : [];
                const isOpen = open === link.href;
                const panelId = `nav-tree-${link.href.replace(/\//g, "")}`;
                return (
                    <div key={link.href} className="relative flex items-center">
                        <Link
                            href={link.href}
                            className="hover:underline px-2 py-1 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-black"
                        >
                            {link.label}
                        </Link>
                        {items.length > 0 && (
                            <>
                                <button
                                    type="button"
                                    aria-expanded={isOpen}
                                    aria-controls={panelId}
                                    aria-label={`Open the ${link.label} menu`}
                                    data-testid={`nav-tree-toggle-${link.href.replace(/\//g, "")}`}
                                    onClick={() => setOpen(isOpen ? null : link.href)}
                                    className="px-1 py-1.5 text-ink-muted hover:text-ink-heading rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-black"
                                >
                                    <svg
                                        aria-hidden="true"
                                        width="10"
                                        height="10"
                                        viewBox="0 0 10 10"
                                        className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
                                    >
                                        <path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </button>
                                {isOpen && (
                                    <div
                                        id={panelId}
                                        data-testid={`nav-tree-panel-${link.href.replace(/\//g, "")}`}
                                        className="absolute left-0 top-full mt-2 min-w-60 rounded border border-default bg-canvas shadow-lg py-2 z-50"
                                    >
                                        {items.map((item) => (
                                            <Link
                                                key={item.href}
                                                href={item.href}
                                                onClick={() => setOpen(null)}
                                                className="block px-4 py-1.5 text-sm text-ink-body hover:bg-subtle-hover hover:text-ink-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black"
                                            >
                                                {item.label}
                                            </Link>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                );
            })}
        </nav>
    );
}
