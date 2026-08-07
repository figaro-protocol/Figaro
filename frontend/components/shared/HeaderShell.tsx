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
    /** Optional CTA pinned to the top of the mobile slide-out drawer.
     *  No current tier passes one; the slot stays for a tier that does. */
    mobileTopCta?: ReactNode;
    /** Override the mobile drawer link list. Marketing tier uses the
     *  default (`NAV_LINKS`, the publication row); (app) tier passes
     *  `NAV_LINKS_APP_DRAWER` for grouped publication + reference +
     *  transactional surfaces. */
    mobileLinks?: NavLink[];
    /** Optional second row rendered under the main row (inside the same
     *  sticky `<header>`). No current tier passes one. */
    bottomRow?: ReactNode;
}

/**
 * Shared chrome for both `MarketingHeader` and `Header`: sticky-with-blur
 * container, container padding, mobile-nav trigger + logo on the left,
 * desktop nav row in the center, caller-supplied right cluster.
 */
export function HeaderShell({ right, mobileTopCta, mobileLinks, bottomRow }: HeaderShellProps) {
    return (
        <header className="border-b border-default bg-canvas/80 backdrop-blur-md sticky top-0 z-50">
            <div className="container mx-auto px-6 py-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <MobileNav theme="light" topCta={mobileTopCta} links={mobileLinks} />
                    <BrandLogo />
                </div>
                <NavTreeRow />
                <div className="flex items-center gap-3">{right}</div>
            </div>
            {bottomRow && (
                <div className="border-t border-default">
                    <div className="container mx-auto px-6 py-2 flex justify-center">
                        {bottomRow}
                    </div>
                </div>
            )}
        </header>
    );
}
