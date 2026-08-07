"use client";

import { ConnectWallet } from "@/components/shared/ConnectWallet";
import { YourTurnBadge } from "@/components/shared/YourTurnBadge";
import { HeaderShell } from "@/components/shared/HeaderShell";
import { NavLinksRow } from "@/components/shared/NavLinksRow";
import { usePathname } from "next/navigation";
import { NAV_LINKS_APP_PRIMARY, NAV_LINKS_APP_DRAWER } from "@/components/shared/navLinks";
import { useWalletConnected } from "@/hooks/useWalletConnected";

/**
 * Wagmi-aware header for `(app)` routes. Same shell chrome as
 * `MarketingHeader`, with two divergences (per
 * `feedback_two_navs_allowed.md`):
 *
 *  1. Right cluster is `<YourTurnBadge>` (when connected) +
 *     `<ConnectWallet>`. Discover is intentionally absent — that rule is
 *     in `feedback_header_buttons.md` and is independent of the two-nav
 *     decision.
 *  2. A second nav row sits under the main row, listing protocol-surface
 *     routes via `NAV_LINKS_APP_PRIMARY`, preceded by a small "Figaro App"
 *     label so the layer-crossing from the marketing tier is named rather
 *     than silent — the label uses the same `text-[11px] font-semibold
 *     text-neutral-500` treatment `MobileNav` already uses for its own
 *     "App" section header, so the desktop and mobile announcements match.
 *     The mobile drawer uses `NAV_LINKS_APP_DRAWER` (grouped publication +
 *     reference + transactional sections). Marketing tier renders neither.
 */
export function Header() {
    const walletConnected = useWalletConnected();
    const pathname = usePathname();
    // The App row lists surfaces for a REGISTERED member with a live stake;
    // the registration surfaces address a wallet that may hold none yet, so
    // /members/* renders without it (operator rule 2026-08-06).
    const onRegistration = pathname.startsWith("/members/") && !pathname.startsWith("/members/manage");
    return (
        <HeaderShell
            right={
                <>
                    {walletConnected && <YourTurnBadge theme="light" />}
                    <ConnectWallet />
                </>
            }
            mobileLinks={NAV_LINKS_APP_DRAWER}
            bottomRow={onRegistration ? undefined : (
                <div className="hidden md:flex items-center gap-4">
                    <NavLinksRow
                        links={NAV_LINKS_APP_PRIMARY}
                        testId="desktop-nav-app"
                        variant="secondary"
                    />
                </div>
            )}
        />
    );
}
