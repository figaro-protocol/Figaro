"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface DiscoverButtonProps {
    /** Tailwind className override. Default hides the button below `sm:`. */
    className?: string;
}

/**
 * Primary curriculum CTA — routes to `/discover` (operator listing). Renders
 * on every header except `/discover` itself (don't show the CTA on its
 * destination). Used by MarketingHeader, Header, and MobileNav.
 *
 * Sized for WCAG 2.5.5 AAA target size (44 × 44 minimum) via `py-3`.
 * Includes `focus-visible:ring-*` for keyboard users.
 */
export function DiscoverButton({
    className = "hidden sm:inline-flex",
}: DiscoverButtonProps) {
    const pathname = usePathname();
    if (pathname === "/discover") return null;

    return (
        <Link
            href="/discover"
            className={
                `${className} items-center gap-1 px-4 py-3 bg-black text-white text-sm font-semibold rounded-md ` +
                `hover:bg-gray-800 transition-colors ` +
                `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-black`
            }
            data-testid="discover-button"
        >
            Discover <span aria-hidden="true">→</span>
        </Link>
    );
}
