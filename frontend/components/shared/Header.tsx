"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { NotificationBell } from "@/components/shared/NotificationBell";
import { DiscoverButton } from "@/components/shared/DiscoverButton";
import { HeaderShell } from "@/components/shared/HeaderShell";
import { useWalletConnected } from "@/hooks/useWalletConnected";

/**
 * Wagmi-aware header for `(app)` routes. Mounts the same chrome as
 * `MarketingHeader` plus the right-cluster trio: `<DiscoverButton>` (the
 * curriculum CTA — same affordance as on marketing routes; auto-hides on
 * `/discover` itself), `<NotificationBell>` (when connected), and
 * `<ConnectButton>`. The Discover button answers "where do I start?" and
 * the ConnectButton answers "how do I sign?" — distinct affordances that
 * coexist throughout the (app) tier.
 */
export function Header() {
    const walletConnected = useWalletConnected();
    return (
        <HeaderShell
            right={
                <>
                    <DiscoverButton />
                    {walletConnected && <NotificationBell theme="light" />}
                    <ConnectButton />
                </>
            }
        />
    );
}
