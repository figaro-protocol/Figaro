"use client";

import { useEffect, useRef, useState } from "react";
import Link from "@/components/shared/Link";
import { usePathname } from "next/navigation";
import { MARKETING_MAP } from "@/components/shared/navLinks";
import { doorOfRoute, navCurrent } from "@/components/shared/navActive";
import { Disclosure } from "@/components/ui/Disclosure";

/**
 * Desktop nav — one row, the three doors of `MARKETING_MAP`, on every page
 * including the home page. Each door's name is a link to its door page, and
 * the chevron beside it is a disclosure button (`components/ui/Disclosure`,
 * the same primitive the drawer uses) whose panel lists the door's pages, the
 * door page first — so a reader who never opens a menu still reaches every door.
 * Click-to-open; Escape and outside-click close — never hover-only.
 *
 * "You are here" runs on three ORTHOGONAL channels so no two states are
 * confusable: FILL is hover (pointer is here), RING is focus (keyboard is
 * here), RULE + WEIGHT is current (the reader is here). The current rule is
 * `border-ink-heading` — the amber already carried by the row's own text, so
 * no new hue family enters for a state. The panel is closed by default, so
 * the section button is the only positional signal a reader gets on desktop:
 * it carries `aria-current="true"` whenever the section map
 * (`lib/shared/sections.json`) gives the route to its door (`doorOfRoute`).
 * An `external` entry (the docs-site, a separate build) is a plain anchor.
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

    const groups = MARKETING_MAP;
    const holder = doorOfRoute(pathname);

    return (
        <nav
            ref={rootRef}
            className="hidden md:flex flex-1 justify-center items-center gap-1 text-sm"
            data-testid="desktop-nav"
        >
            {groups.map((group) => {
                const isOpen = open === group.section;
                const slug = group.section.toLowerCase().replace(/[^a-z]+/g, "-");
                const panelId = `nav-tree-${slug}`;
                // The door holds the reader when the section map gives it the
                // route — a page behind a listed entry included.
                const holdsReader = group.section === holder;
                const door = group.links[0];
                return (
                    <div key={group.section} className="relative flex items-center">
                        {/* The door's name is a LINK to the door page — a reader
                            who never opens a menu still reaches every door. The
                            chevron beside it is the disclosure: the door's pages,
                            the door page first. */}
                        <Link
                            href={door.href}
                            aria-current={navCurrent(pathname, door.href) === "page" ? "page" : holdsReader ? "true" : undefined}
                            className={`py-1.5 text-ink-heading hover:bg-subtle-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${holdsReader ? "pl-2 border-l-2 border-ink-heading font-semibold" : "pl-2.5"}`}
                        >
                            {group.section}
                        </Link>
                        <Disclosure
                            id={panelId}
                            triggerTestId={`nav-tree-toggle-${slug}`}
                            panelTestId={`nav-tree-panel-${slug}`}
                            expanded={isOpen}
                            onToggle={() => setOpen(isOpen ? null : group.section)}
                            triggerClassName="pl-1 pr-2.5 py-1.5 text-ink-heading hover:bg-subtle-hover"
                            label={<span className="sr-only">{group.section} menu</span>}
                            panelClassName="absolute left-0 top-full mt-2 min-w-56 rounded border border-default bg-canvas shadow-lg py-2 z-50"
                        >
                            {group.links.map((item) => {
                                // pl-3.5 (14px) + the 2px rule restores the
                                // 16px inset of pl-4 — the current row does
                                // not shift its label.
                                const current = navCurrent(pathname, item.href);
                                const className = `block pr-4 py-1.5 text-sm hover:bg-subtle-hover hover:text-ink-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus ${current
                                    ? "pl-3.5 border-l-2 border-ink-heading font-medium text-ink-primary"
                                    : "pl-4 text-ink-body"
                                    }`;
                                if (item.external) {
                                    return (
                                        <a key={item.href} href={item.href} onClick={() => setOpen(null)} className={className}>
                                            {item.label}
                                        </a>
                                    );
                                }
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        onClick={() => setOpen(null)}
                                        aria-current={current}
                                        className={className}
                                    >
                                        {item.label}
                                    </Link>
                                );
                            })}
                        </Disclosure>
                    </div>
                );
            })}
        </nav>
    );
}
