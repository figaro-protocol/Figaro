"use client";

/**
 * Tabs — the shared WAI-ARIA tab set: a row of tabs over ONE tabpanel.
 *
 * Owns the tab-set concerns:
 *   - a `role="tablist"` row (`aria-label` names it) of `role="tab"` buttons,
 *     each with `aria-selected` and `aria-controls` naming the tabpanel
 *   - one `role="tabpanel"` carrying the controlled `id` and
 *     `aria-labelledby` back at the selected tab, so the panel is announced
 *     with that tab's name
 *   - a roving `tabIndex`: only the selected tab is in the tab order
 *   - ArrowRight / ArrowLeft (wrapping), Home and End move the selection and
 *     the focus, with automatic activation — selecting on focus suits a tab
 *     set whose selection is a URL change, where nothing is lost by it
 *   - the tab shape: `min-h-11` (44px, WCAG 2.5.5) on the tile radius, the
 *     selected tab `border-ink-heading text-ink-heading`
 *
 * Selection is CALLER-OWNED (`selected` + `onSelect`); the panel's content is
 * the caller's `children`, rendered for whichever tab is selected.
 */

import { useCallback, useId, useRef, type KeyboardEvent, type ReactNode } from "react";

interface TabItem<K extends string> {
    value: K;
    label: ReactNode;
    /** Optional test-id on the tab button. */
    testId?: string;
}

export interface TabsProps<K extends string> {
    /** Accessible name of the tablist. */
    label: string;
    tabs: ReadonlyArray<TabItem<K>>;
    selected: K;
    onSelect: (value: K) => void;
    panelClassName?: string;
    /** The selected tab's panel content. */
    children: ReactNode;
}

export function Tabs<K extends string>({ label, tabs, selected, onSelect, panelClassName = "", children }: TabsProps<K>) {
    const idBase = useId();
    const tabId = (value: K) => `${idBase}-tab-${value}`;
    const panelId = `${idBase}-panel`;
    const tabRefs = useRef(new Map<K, HTMLButtonElement>());

    const onKeyDown = useCallback(
        (event: KeyboardEvent<HTMLButtonElement>) => {
            const at = tabs.findIndex((t) => t.value === selected);
            const last = tabs.length - 1;
            const to =
                event.key === "ArrowRight" ? (at >= last ? 0 : at + 1)
                : event.key === "ArrowLeft" ? (at <= 0 ? last : at - 1)
                : event.key === "Home" ? 0
                : event.key === "End" ? last
                : null;
            if (to === null) return;
            event.preventDefault();
            const value = tabs[to].value;
            onSelect(value);
            tabRefs.current.get(value)?.focus();
        },
        [tabs, selected, onSelect],
    );

    return (
        <>
            <div className="flex flex-wrap gap-2" role="tablist" aria-label={label}>
                {tabs.map((t) => {
                    const isSelected = t.value === selected;
                    return (
                        <button
                            key={t.value}
                            ref={(el) => {
                                if (el) tabRefs.current.set(t.value, el);
                                else tabRefs.current.delete(t.value);
                            }}
                            id={tabId(t.value)}
                            type="button"
                            role="tab"
                            aria-selected={isSelected}
                            aria-controls={panelId}
                            tabIndex={isSelected ? 0 : -1}
                            data-testid={t.testId}
                            onClick={() => onSelect(t.value)}
                            onKeyDown={onKeyDown}
                            className={`inline-flex items-center min-h-11 px-3 text-sm rounded-tile border ${isSelected ? "border-ink-heading text-ink-heading" : "border-ink-muted/30 text-ink-muted hover:text-ink-heading"}`}
                        >
                            {t.label}
                        </button>
                    );
                })}
            </div>

            <div role="tabpanel" id={panelId} aria-labelledby={tabId(selected)} tabIndex={0} className={panelClassName}>
                {children}
            </div>
        </>
    );
}
