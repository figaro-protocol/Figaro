import Link from "next/link";
import { cn } from "@/lib/shared/utils";

export interface BreadcrumbItem {
    /** Crumb text. */
    label: string;
    /** Omit on the current (usually last) crumb — it renders as plain text,
     *  never a link to itself. */
    href?: string;
}

interface BreadcrumbProps {
    /** Ordered trail, root first. An item with no `href` renders as the
     *  current-page label rather than a link — that's what marks "you are
     *  here", not position in the array. */
    items: BreadcrumbItem[];
    className?: string;
}

/**
 * Depth-≥ 2 wayfinding trail — e.g. "Clauses › Register a clause". Derived
 * from the route the caller passes in, never a stored taxonomy.
 *
 * This is the one implementation: extracted from `PaperLayout`'s inline
 * breadcrumb markup (Papers › discipline › title) so both surfaces share
 * it rather than duplicating the nav shape. Markup and classes are
 * unchanged from that original — only the item count is generalized from
 * fixed three-deep to an arbitrary trail.
 */
export function Breadcrumb({ items, className }: BreadcrumbProps) {
    if (items.length === 0) return null;

    return (
        <nav aria-label="Breadcrumb" className={cn("print:hidden mb-4 text-sm text-ink-faint", className)}>
            {items.map((item, i) => (
                <span key={`${item.href ?? item.label}-${i}`}>
                    {i > 0 && (
                        <span className="mx-2" aria-hidden>
                            &rsaquo;
                        </span>
                    )}
                    {item.href ? (
                        <Link href={item.href} className="hover:text-ink-body hover:underline">
                            {item.label}
                        </Link>
                    ) : (
                        <span className="text-ink-muted" aria-current="page">
                            {item.label}
                        </span>
                    )}
                </span>
            ))}
        </nav>
    );
}
