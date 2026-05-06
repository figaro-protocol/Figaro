"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface BuildButtonProps {
    /** Tailwind className override. Default hides the button below `sm:`. */
    className?: string;
}

/**
 * Primary builder-tier CTA — routes to `/builders`. Renders on every header
 * except when already inside the builders surface (`pathname.startsWith
 * ("/builders")`). Parallel to `DiscoverButton`: Discover is the consumer
 * entry point; Build is the builder entry point. Both live on marketing
 * surfaces; neither appears on (app)-tier headers (per
 * `feedback_header_buttons.md`).
 *
 * Outline-styled so it sits next to the filled Discover button without
 * competing for primacy — both are peer audiences but the visual
 * distinction prevents two identical pills.
 *
 * Sized for WCAG 2.5.5 AAA target size (44 × 44 minimum) via `py-3`.
 * Includes `focus-visible:ring-*` for keyboard users.
 */
export function BuildButton({
    className = "hidden sm:inline-flex",
}: BuildButtonProps) {
    const pathname = usePathname();
    if (pathname?.startsWith("/builders")) return null;

    return (
        <Link
            href="/builders"
            className={
                `${className} items-center gap-1 px-9 py-sm bg-transparent text-ink-body text-sm font-medium rounded-tile border border-default-strong ` +
                `hover:bg-subtle hover:text-ink-heading hover:no-underline transition-colors ` +
                `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus`
            }
            data-testid="build-button"
        >
            Build <span aria-hidden="true">→</span>
        </Link>
    );
}
