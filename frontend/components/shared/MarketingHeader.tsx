"use client";

import Link from "next/link";
import { MobileNav } from "@/components/shared/MobileNav";
import { NAV_LINKS } from "@/components/shared/navLinks";

/**
 * Wagmi-free header for marketing routes (`app/(marketing)/`). Same chrome
 * as `Header.tsx` but without `ConnectButton` / `NotificationBell` /
 * `useWalletConnected` so marketing pages don't pull the wallet provider
 * into their client bundle. Pure-publication routes like `/`, `/about`,
 * `/help`, `/research`, etc. mount this; transactional and reference routes
 * mount the full `Header.tsx` via `app/(app)/layout.tsx`.
 */
export function MarketingHeader() {
    return (
        <header className="border-b border-gray-300 bg-white/80 backdrop-blur-md sticky top-0 z-50">
            <div className="container mx-auto px-6 py-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <MobileNav theme="light" />
                    <Link href="/" className="flex items-center gap-2">
                        <span className="text-xl md:text-2xl font-bold">Figaro<span className="align-super text-xs ml-1">®</span> Protocol</span>
                    </Link>
                </div>
                <nav className="hidden md:flex flex-1 justify-center items-center gap-6 text-sm" data-testid="desktop-nav">
                    {NAV_LINKS.map(link => (
                        <Link key={link.href} href={link.href} className="hover:underline px-2 py-1 rounded transition-colors">
                            {link.label}
                        </Link>
                    ))}
                </nav>
            </div>
        </header>
    );
}
