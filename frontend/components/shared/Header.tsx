"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { NotificationBell } from "@/components/shared/NotificationBell";
import { HeaderShell } from "@/components/shared/HeaderShell";
import { useWalletConnected } from "@/hooks/useWalletConnected";

/**
 * Wagmi-aware header for `(app)` routes. Mounts the same chrome as
 * `MarketingHeader` plus the right-cluster pair: `<NotificationBell>`
 * (when connected) and `<ConnectButton>`. The Discover button is
 * intentionally absent here — Discover is a marketing-tier curriculum
 * CTA; the (app) tier is for transacting. The two never coexist.
 */
export function Header() {
    const walletConnected = useWalletConnected();
    return (
        <HeaderShell
            right={
                <>
                    {walletConnected && <NotificationBell theme="light" />}
                    <ConnectButton />
                </>
            }
        />
    );
}
