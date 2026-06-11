"use client";

/**
 * ClausesByArticle — the shared presentational shell for rendering clauses
 * grouped by article. Both the marketing `/clauses` inventory and the designer
 * drawer's `ClauseRegistryPanel` render through this, so the "for each article →
 * heading → list of clauses" structure exists once. The grouping itself comes
 * from `clauseSpecSource.clausesByArticle()` (the single classification); this
 * component is the view of it.
 *
 * Generic over the clause item type `T`: the inventory passes spec entries, the
 * drawer passes on-chain registry events. Each caller supplies `renderClause`
 * (which returns a complete `<li>`), so per-surface markup (anchor ids, the
 * selectable checkbox, the non-clause token picker) stays with the caller while
 * the grouping shell is shared.
 */

import type { ReactNode } from "react";

interface ClauseArticleSection<T> {
    /** The article key (e.g. "coordination"), from `block.article`. */
    article: string;
    /** Display label; falls back to the article key. */
    label?: string;
    items: readonly T[];
}

interface ClausesByArticleProps<T> {
    sections: ReadonlyArray<ClauseArticleSection<T>>;
    /** Render one item as a complete `<li>` (own key, own markup). */
    renderClause: (item: T, index: number) => ReactNode;
    /** Optional trailing content inside a section's `<ul>` — e.g. the drawer's
     *  privileged-token picker in the consent group (NOT a clause). */
    renderSectionFooter?: (article: string) => ReactNode;
    /** Optional override for the article heading (defaults to a `<p>`). */
    renderHeading?: (label: string) => ReactNode;
    /** `data-testid` for each section wrapper, derived from the article key. */
    sectionTestId?: (article: string) => string;
    /** `data-testid` for the outer wrapper. */
    rootTestId?: string;
    rootClassName?: string;
    headingClassName?: string;
    listClassName?: string;
}

export function ClausesByArticle<T>({
    sections,
    renderClause,
    renderSectionFooter,
    renderHeading,
    sectionTestId,
    rootTestId,
    rootClassName,
    headingClassName,
    listClassName,
}: ClausesByArticleProps<T>) {
    return (
        <div className={rootClassName} data-testid={rootTestId}>
            {sections.map((section) => {
                const label = section.label ?? section.article;
                return (
                    <div key={section.article} data-testid={sectionTestId?.(section.article)}>
                        {renderHeading ? renderHeading(label) : <p className={headingClassName}>{label}</p>}
                        <ul className={listClassName}>
                            {section.items.map((item, i) => renderClause(item, i))}
                            {renderSectionFooter?.(section.article)}
                        </ul>
                    </div>
                );
            })}
        </div>
    );
}
