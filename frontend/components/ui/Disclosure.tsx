"use client";

/**
 * Disclosure — the shared show/hide primitive (WAI-ARIA disclosure pattern).
 *
 * Owns the cross-cutting disclosure concerns that were being re-typed inline
 * at every expand/collapse site:
 *   - `<button type="button">` trigger with `aria-expanded` + `aria-controls`
 *   - a panel carrying the controlled `id` and `aria-labelledby` back at the
 *     trigger, so the panel is announced with the trigger's own name
 *   - the rotating chevron affordance (`text-ink-muted`, `aria-hidden`)
 *   - keyboard operability for free — a real button answers Enter and Space,
 *     and focus stays on the trigger across expand/collapse
 *
 * State is CALLER-OWNED (`expanded` + `onToggle`): an accordion (one panel at
 * a time) and a set of independent disclosures are the same component with
 * different state upstream. The primitive imposes no visual style on the
 * trigger or the panel beyond the token defaults below; callers pass
 * `triggerClassName` / `panelClassName`.
 *
 * The panel MOUNTS only while expanded — matching `NavTreeRow`'s shipped
 * behaviour, and keeping collapsed content out of every focus-trap query
 * (a `hidden` panel still matches `querySelectorAll('a[href]')`, which is how
 * a trap ends up trying to focus an invisible element).
 */

import type { ReactNode } from "react";

export interface DisclosureProps {
    /** Panel id. The trigger's id is derived as `${id}-trigger`. */
    id: string;
    /** Trigger content — the section name. */
    label: ReactNode;
    expanded: boolean;
    onToggle: () => void;
    /** Forwarded to the trigger: `"true"` when the section holds the reader. */
    "aria-current"?: "true" | "page";
    triggerClassName?: string;
    panelClassName?: string;
    /** Optional test-id on the trigger button. */
    triggerTestId?: string;
    /** Optional test-id on the panel. */
    panelTestId?: string;
    /** Panel content — rendered only while expanded. */
    children: ReactNode;
}

/** Chevron affordance. Rotates 180° when the panel is open. */
function DisclosureChevron({ expanded }: { expanded: boolean }) {
    return (
        <svg
            aria-hidden="true"
            width="10"
            height="10"
            viewBox="0 0 10 10"
            className={`shrink-0 text-ink-muted transition-transform ${expanded ? "rotate-180" : ""}`}
        >
            <path
                d="M1 3l4 4 4-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

export function Disclosure({
    id,
    label,
    expanded,
    onToggle,
    "aria-current": ariaCurrent,
    triggerClassName = "",
    panelClassName = "",
    triggerTestId,
    panelTestId,
    children,
}: DisclosureProps) {
    const triggerId = `${id}-trigger`;
    return (
        <>
            <button
                type="button"
                id={triggerId}
                aria-expanded={expanded}
                aria-controls={id}
                aria-current={ariaCurrent}
                data-testid={triggerTestId}
                onClick={onToggle}
                // min-h-11 (44px) satisfies WCAG 2.5.5 Target Size.
                // rounded-l-none is load-bearing, not redundant: globals.css's
                // base `button` rule applies rounded-tile to ALL corners, and a
                // rounded LEFT edge bends a 2px current/active rule (border-l-2)
                // into a brace. Square left, tile right.
                className={`flex w-full items-center justify-between gap-sm min-h-11 rounded-l-none rounded-r-tile bg-transparent border-0 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${triggerClassName}`}
            >
                {label}
                <DisclosureChevron expanded={expanded} />
            </button>
            {expanded && (
                <div
                    id={id}
                    role="region"
                    aria-labelledby={triggerId}
                    className={panelClassName}
                    data-testid={panelTestId}
                >
                    {children}
                </div>
            )}
        </>
    );
}
