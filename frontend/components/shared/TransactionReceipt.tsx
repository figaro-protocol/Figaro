import type { ElementType, ReactNode } from "react";

interface TransactionReceiptRow {
    label: ReactNode;
    value: ReactNode;
    /** data-testid on this row's wrapper — most rows don't need one; pass it
     *  only where an existing test selects a specific row. */
    testId?: string;
}

export interface TransactionReceiptProps {
    /** Root element. Most receipts are a standalone block (`"div"`); one
     *  adopter renders inline inside an existing `<ul>` and needs `"li"`. */
    as?: "div" | "li";
    className?: string;
    /** data-testid on the root — every existing receipt panel is selected by one. */
    testId?: string;
    heading?: ReactNode;
    headingAs?: "h1" | "h2" | "h3";
    headingClassName?: string;
    /** Free-form prose — may itself contain `<Link>`/`<code>` with their own
     *  data-testids; rendered verbatim, never re-parsed. */
    prose?: ReactNode;
    proseClassName?: string;
    rows?: TransactionReceiptRow[];
    /** "list" (default): a bordered `<dl>` of stacked label/value pairs — the
     *  shape shared by every standalone receipt panel. "inline": each row is
     *  its own compact mono line with no dl chrome — for a receipt embedded
     *  inline in an existing list. */
    rowsLayout?: "list" | "inline";
    rowsClassName?: string;
    /** Rendered verbatim after the rows — callers that need their own action
     *  row layout (flex alignment, dividers) supply it already wrapped. */
    actions?: ReactNode;
}

const DEFAULT_LIST_ROWS_CLASSNAME = "text-xs text-ink-body space-y-2 pt-2 border-t border-default";
const DEFAULT_INLINE_ROWS_CLASSNAME = "text-xs text-ink-faint font-mono break-all";

/**
 * Shared receipt panel: heading, prose, label/value rows, actions. Replaces
 * the hand-rolled `<dl>`-based receipt markup duplicated across the clause
 * registration, assembly publish, and member onboarding publish flows
 * (maintainer ruling 2026-08-07). Read-only by construction — it renders a
 * result already produced by a completed transaction; it never initiates one.
 */
export function TransactionReceipt({
    as = "div",
    className,
    testId,
    heading,
    headingAs = "h3",
    headingClassName,
    prose,
    proseClassName,
    rows,
    rowsLayout = "list",
    rowsClassName,
    actions,
}: TransactionReceiptProps) {
    const Root = as as ElementType;
    const Heading = headingAs as ElementType;

    return (
        <Root className={className} data-testid={testId}>
            {heading != null && <Heading className={headingClassName}>{heading}</Heading>}
            {prose != null && <p className={proseClassName}>{prose}</p>}
            {rows && rows.length > 0 && (
                rowsLayout === "inline" ? (
                    <>
                        {rows.map((row, i) => (
                            <p
                                key={i}
                                className={rowsClassName ?? DEFAULT_INLINE_ROWS_CLASSNAME}
                                data-testid={row.testId}
                            >
                                {row.label} {row.value}
                            </p>
                        ))}
                    </>
                ) : (
                    <dl className={rowsClassName ?? DEFAULT_LIST_ROWS_CLASSNAME}>
                        {rows.map((row, i) => (
                            <div key={i} data-testid={row.testId}>
                                <dt className="text-ink-faint">{row.label}</dt>
                                <dd className="font-mono break-all">{row.value}</dd>
                            </div>
                        ))}
                    </dl>
                )
            )}
            {actions}
        </Root>
    );
}
