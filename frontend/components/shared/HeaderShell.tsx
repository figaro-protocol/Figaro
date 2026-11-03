import type { ReactNode } from "react";
import { BrandLogo } from "@/components/shared/BrandLogo";
import { MobileNav } from "@/components/shared/MobileNav";
import { NavTreeRow } from "@/components/shared/NavTreeRow";
import type { NavLink } from "@/components/shared/navLinks";

interface HeaderShellProps {
    /** Right cluster — varies by tier. Marketing passes null (audience CTAs
     *  live on the pages, not in the header); (app) uses `<YourTurnBadge>` +
     *  `<ConnectWallet>`. */
    right: ReactNode;
    /** Override the mobile drawer link list. Marketing tier uses the
     *  default (`NAV_LINKS`, the publication row); (app) tier passes
     *  `NAV_LINKS_APP_DRAWER` for grouped publication + reference +
     *  transactional surfaces. */
    mobileLinks?: NavLink[];
}

/**
 * Shared chrome for both `MarketingHeader` and `Header`: sticky-with-blur
 * container, container padding, mobile-nav trigger + logo on the left with
 * the site's one line beneath the name (a line, never the tagline), the
 * three doors as dropdowns in the center (`NavTreeRow`, one row, on every
 * page), caller-supplied right cluster.
 */
export function HeaderShell({ right, mobileLinks }: HeaderShellProps) {
    return (
        <header className="border-b border-default bg-canvas/80 backdrop-blur-md sticky top-0 z-50">
            <div className="container mx-auto px-6 py-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <MobileNav links={mobileLinks} />
                    <div className="flex flex-col">
                        <BrandLogo />
                        <span className="text-xs md:text-sm text-ink-muted leading-tight">factotum of the blockchain</span>
                    </div>
                </div>
                <NavTreeRow />
                <div className="flex items-center gap-3">{right}</div>
            </div>
        </header>
    );
}
