"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { YourTurnBadge } from "@/components/shared/YourTurnBadge";
import { HeaderShell } from "@/components/shared/HeaderShell";
import { NavLinksRow } from "@/components/shared/NavLinksRow";
import { NAV_LINKS_APP_PRIMARY, NAV_LINKS_APP_DRAWER } from "@/components/shared/navLinks";
import { useWalletConnected } from "@/hooks/useWalletConnected";

/**
 * Wagmi-aware header for `(app)` routes. Same shell chrome as
 * `MarketingHeader`, with two divergences (per
 * `feedback_two_navs_allowed.md`):
 *
 *  1. Right cluster is `<YourTurnBadge>` (when connected) +
 *     `<ConnectButton>`. Discover is intentionally absent — that rule is
 *     in `feedback_header_buttons.md` and is independent of the two-nav
 *     decision.
 *  2. A second nav row sits under the main row, listing protocol-surface
 *     routes via `NAV_LINKS_APP_PRIMARY`. The mobile drawer uses
 *     `NAV_LINKS_APP_DRAWER` (grouped publication + reference +
 *     transactional sections). Marketing tier renders neither.
 */
export function Header() {
    const walletConnected = useWalletConnected();
    return (
        <HeaderShell
            right={
                <>
                    {walletConnected && <YourTurnBadge theme="light" />}
                    <ConnectButton />
                </>
            }
            mobileLinks={NAV_LINKS_APP_DRAWER}
            bottomRow={
                <NavLinksRow
                    links={NAV_LINKS_APP_PRIMARY}
                    testId="desktop-nav-app"
                    variant="secondary"
                />
            }
        />
    );
}
