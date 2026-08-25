import type { ReactNode } from "react";

interface LabelledListRowProps {
    /** Mono-styled label rendered in the left column. */
    label: string;
    /** Anchor id on the row, for a cross-page deep link that must land on
     *  this entry. Omitted rows carry no id. */
    id?: string;
    /** Width slot for the label column. */
    labelWidth?: "narrow" | "default" | "wide";
    /** Whether to uppercase the label. */
    uppercase?: boolean;
    /** Prose content rendered on the right. */
    children: ReactNode;
}

const WIDTH_CLASS: Record<NonNullable<LabelledListRowProps["labelWidth"]>, string> = {
    narrow: "w-32",
    default: "w-40",
    wide: "w-44",
};

/**
 * Reusable two-column list row: a mono-styled label on the left, prose on
 * the right. Used by `/spec` (subpaths, events, external surfaces) and
 * any other reference page that enumerates a labelled list. Caller wraps
 * rows in a `<ul>`.
 */
export function LabelledListRow({
    label,
    id,
    labelWidth = "default",
    uppercase = false,
    children,
}: LabelledListRowProps) {
    return (
        <li id={id} className={`flex gap-4${id ? " scroll-mt-24" : ""}`}>
            <span
                className={
                    `font-mono text-xs text-ink-muted mt-1 ${WIDTH_CLASS[labelWidth]} shrink-0` +
                    (uppercase ? " uppercase" : "")
                }
            >
                {label}
            </span>
            <span className="text-sm text-ink-body leading-relaxed">{children}</span>
        </li>
    );
}
