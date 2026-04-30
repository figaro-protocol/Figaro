import type { ReactNode } from "react";
import { BrandLogo } from "@/components/shared/BrandLogo";
import { MobileNav } from "@/components/shared/MobileNav";
import { NavLinksRow } from "@/components/shared/NavLinksRow";

interface HeaderShellProps {
    /** Right cluster — `<DiscoverButton>` plus optional `<ConnectButton>` /
     *  `<NotificationBell>` for the (app) shell. */
    right: ReactNode;
}

/**
 * Shared chrome for both `MarketingHeader` and `Header`: sticky-with-blur
 * container, container padding, mobile-nav trigger + logo on the left,
 * desktop nav row in the center, caller-supplied right cluster.
 */
export function HeaderShell({ right }: HeaderShellProps) {
    return (
        <header className="border-b border-gray-300 bg-white/80 backdrop-blur-md sticky top-0 z-50">
            <div className="container mx-auto px-6 py-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <MobileNav theme="light" />
                    <BrandLogo />
                </div>
                <NavLinksRow />
                <div className="flex items-center gap-3">{right}</div>
            </div>
        </header>
    );
}
