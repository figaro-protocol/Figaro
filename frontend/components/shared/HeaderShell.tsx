import type { ReactNode } from "react";
import { BrandLogo } from "@/components/shared/BrandLogo";
import { MobileNav } from "@/components/shared/MobileNav";
import { NavLinksRow } from "@/components/shared/NavLinksRow";

interface HeaderShellProps {
    /** Right cluster — varies by tier. Marketing uses `<DiscoverButton>`;
     *  (app) uses `<NotificationBell>` + `<ConnectButton>`. Discover and
     *  Connect Wallet never coexist. */
    right: ReactNode;
    /** Optional CTA pinned to the top of the mobile slide-out drawer.
     *  MarketingHeader passes `<DiscoverButton>`; (app) Header omits it. */
    mobileTopCta?: ReactNode;
}

/**
 * Shared chrome for both `MarketingHeader` and `Header`: sticky-with-blur
 * container, container padding, mobile-nav trigger + logo on the left,
 * desktop nav row in the center, caller-supplied right cluster.
 */
export function HeaderShell({ right, mobileTopCta }: HeaderShellProps) {
    return (
        <header className="border-b border-gray-300 bg-white/80 backdrop-blur-md sticky top-0 z-50">
            <div className="container mx-auto px-6 py-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <MobileNav theme="light" topCta={mobileTopCta} />
                    <BrandLogo />
                </div>
                <NavLinksRow />
                <div className="flex items-center gap-3">{right}</div>
            </div>
        </header>
    );
}
