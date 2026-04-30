import Link from "next/link";
import { NAV_LINKS } from "@/components/shared/navLinks";

/**
 * Desktop nav row. `hidden md:flex flex-1 justify-center` — visible on md+
 * only; mobile uses MobileNav. Used by both MarketingHeader and Header.
 */
export function NavLinksRow() {
    return (
        <nav
            className="hidden md:flex flex-1 justify-center items-center gap-6 text-sm"
            data-testid="desktop-nav"
        >
            {NAV_LINKS.map((link) => (
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
