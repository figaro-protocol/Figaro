"use client";

import { ConnectWallet } from "@/components/shared/ConnectWallet";
import { YourTurnBadge } from "@/components/shared/YourTurnBadge";
import { HeaderShell } from "@/components/shared/HeaderShell";
import { NAV_LINKS_APP_DRAWER } from "@/components/shared/navLinks";
import { useWalletConnected } from "@/hooks/useWalletConnected";
import { usePathname } from "next/navigation";

/**
 * Wagmi-aware header for `(app)` routes. Same shell chrome as
 * `MarketingHeader`, with two divergences:
 *
 *  1. Right cluster is `<YourTurnBadge>` (when connected) +
 *     `<ConnectWallet>`. Discover is intentionally absent.
 *  2. The mobile drawer uses `NAV_LINKS_APP_DRAWER` (grouped publication +
 *     transactional sections). There is no second desktop row — the
 *     wallet's personal surfaces attach to their object pages and the
 *     wallet chrome.
 */
export function Header() {
    const walletConnected = useWalletConnected();
    const pathname = usePathname();
    // /audit is the spectator surface — anyone verifies with no wallet and
    // no account; the header offers no wallet affordance there.
    const onSpectator = pathname.startsWith("/audit");
    return (
        <HeaderShell
            right={
                onSpectator ? undefined : (
                    <>
                        {walletConnected && <YourTurnBadge />}
                        <ConnectWallet />
                    </>
                )
            }
            mobileLinks={NAV_LINKS_APP_DRAWER}
        />
    );
}
