import Link from "next/link";
import { NAV_LINKS, type NavLink } from "@/components/shared/navLinks";

/**
 * Desktop nav row. `hidden md:flex flex-1 justify-center` — visible on md+
 * only; mobile uses MobileNav. Used by:
 *  - MarketingHeader (default props → publication links)
 *  - Header primary row (default props → publication links)
 *  - Header secondary row (`links={NAV_LINKS_APP_PRIMARY}`,
 *    `variant="secondary"`).
 */
interface NavLinksRowProps {
    links?: NavLink[];
    testId?: string;
    /** "secondary" reduces font weight + size for the (app) second row. */
    variant?: "primary" | "secondary";
}

export function NavLinksRow({
    links = NAV_LINKS,
    testId = "desktop-nav",
    variant = "primary",
}: NavLinksRowProps = {}) {
    const sizeClass = variant === "secondary" ? "text-xs text-neutral-600" : "text-sm";
    return (
        <nav
            className={`hidden md:flex flex-1 justify-center items-center gap-6 ${sizeClass}`}
            data-testid={testId}
        >
            {links.map((link) => (
                <Link
                    key={link.href}
                    href={link.href}
                    className="hover:underline px-2 py-1 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-black"
                >
                    {link.label}
                </Link>
            ))}
        </nav>
    );
}
