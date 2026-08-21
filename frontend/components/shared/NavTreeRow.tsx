"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MARKETING_MAP } from "@/components/shared/navLinks";
import { navCurrent } from "@/components/shared/navActive";

/**
 * Desktop publication nav — the ONE wayfinding tree, rendering
 * `MARKETING_MAP` directly. Each section title is an INERT disclosure
 * button (the ruled tree's semantics: titles are headers, never links);
 * its panel lists ALL of the section's pages, first page included. Only
 * pages navigate. Click-to-open; Escape and outside-click close —
 * never hover-only.
 *
 * "You are here" runs on three ORTHOGONAL channels so no two states are
 * confusable: FILL is hover (pointer is here), RING is focus (keyboard is
 * here), RULE + WEIGHT is current (the reader is here). The current rule is
 * `border-ink-heading` — the amber already carried by the row's own text, so
 * no new hue family enters for a state. The panel is closed by default, so
 * the section button is the only positional signal a reader gets on desktop:
 * it carries `aria-current="true"` whenever the route lives inside its group.
 */
export function NavTreeRow() {
    const [open, setOpen] = useState<string | null>(null);
    const pathname = usePathname();
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
                // The section holds the reader if ANY page under it matches —
                // exactly (/members) or as an ancestor (/members/manage).
                const holdsReader = group.links.some((item) => navCurrent(pathname, item.href) !== undefined);
                return (
                    <div key={group.section} className="relative flex items-center">
                        <button
                            type="button"
                            aria-expanded={isOpen}
                            aria-controls={panelId}
                            aria-current={holdsReader ? "true" : undefined}
                            data-testid={`nav-tree-toggle-${slug}`}
                            onClick={() => setOpen(isOpen ? null : group.section)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-ink-heading hover:bg-subtle-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-black ${holdsReader ? "border-ink-heading font-semibold" : ""}`}
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
                                {group.links.map((item) => {
                                    // pl-3.5 (14px) + the 2px rule restores the
                                    // 16px inset of pl-4 — the current row does
                                    // not shift its label.
                                    const current = navCurrent(pathname, item.href);
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            onClick={() => setOpen(null)}
                                            aria-current={current}
                                            className={`block pr-4 py-1.5 text-sm hover:bg-subtle-hover hover:text-ink-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black ${current
                                                ? "pl-3.5 border-l-2 border-ink-heading font-medium text-ink-primary"
                                                : "pl-4 text-ink-body"
                                                }`}
                                        >
                                            {item.label}
                                        </Link>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
        </nav>
    );
}
