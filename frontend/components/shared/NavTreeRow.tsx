"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MARKETING_MAP } from "@/components/shared/navLinks";

/**
 * Desktop publication nav — the ONE wayfinding tree, rendering
 * `MARKETING_MAP` directly. Each section title is an INERT disclosure
 * button (the ruled tree's semantics: titles are headers, never links);
 * its panel lists ALL of the section's pages, first page included. Only
 * pages navigate. Click-to-open; Escape and outside-click close —
 * never hover-only.
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
            className="hidden md:flex flex-1 justify-center items-center gap-1 text-sm"
            data-testid="desktop-nav"
        >
            {MARKETING_MAP.map((group) => {
                const isOpen = open === group.section;
                const slug = group.section.toLowerCase().replace(/[^a-z]+/g, "-");
                const panelId = `nav-tree-${slug}`;
                return (
                    <div key={group.section} className="relative flex items-center">
                        <button
                            type="button"
                            aria-expanded={isOpen}
                            aria-controls={panelId}
                            data-testid={`nav-tree-toggle-${slug}`}
                            onClick={() => setOpen(isOpen ? null : group.section)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-ink-heading hover:bg-subtle-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-black"
                        >
                            {group.section}
                            <svg
                                aria-hidden="true"
                                width="9"
                                height="9"
                                viewBox="0 0 10 10"
                                className={`text-ink-muted transition-transform ${isOpen ? "rotate-180" : ""}`}
                            >
                                <path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </button>
                        {isOpen && (
                            <div
                                id={panelId}
                                data-testid={`nav-tree-panel-${slug}`}
                                className="absolute left-0 top-full mt-2 min-w-56 rounded border border-default bg-canvas shadow-lg py-2 z-50"
                            >
                                {group.links.map((item, i) =>
                                    item.isSectionHeader ? (
                                        <div
                                            key={`h-${item.label}`}
                                            className={`px-4 ${i === 0 ? "pt-1" : "pt-3"} pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted`}
                                        >
                                            {item.label}
                                        </div>
                                    ) : (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            onClick={() => setOpen(null)}
                                            className="block px-4 py-1.5 text-sm text-ink-body hover:bg-subtle-hover hover:text-ink-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black"
                                        >
                                            {item.label}
                                        </Link>
                                    ),
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </nav>
    );
}
