"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface ReadButtonProps {
    /** Tailwind className override. Default hides the button below `sm:`. */
    className?: string;
}

/**
 * Primary protocol-tier CTA — routes to `/protocol`. Parallel to
 * `BuildButton` (builder entry) and the homepage's Participate link
 * (consumer entry, `/users`): `ReadButton` is the protocol-reader entry.
 * Used on the homepage as a doorway CTA; not currently used in headers.
 *
 * Outline-styled like `BuildButton` so the three doorway CTAs visually
 * cluster as peer entries.
 *
 * Sized for WCAG 2.5.5 AAA target size (44 × 44 minimum) via `py-3`.
 * Includes `focus-visible:ring-*` for keyboard users.
 */
export function ReadButton({
    className = "inline-flex",
}: ReadButtonProps) {
    const pathname = usePathname();
    if (pathname === "/protocol") return null;

    return (
        <Link
            href="/protocol"
            className={
                `${className} items-center gap-1 px-9 py-sm bg-paper text-ink-primary text-sm font-medium rounded-tile border border-ink-primary ` +
                `hover:bg-ink-primary hover:text-paper hover:no-underline transition-colors ` +
                `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus`
            }
            data-testid="read-button"
        >
            Read <span aria-hidden="true">→</span>
        </Link>
    );
}
