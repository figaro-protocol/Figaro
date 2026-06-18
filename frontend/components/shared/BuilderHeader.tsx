"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { NotificationBell } from "@/components/shared/NotificationBell";
import { HeaderShell } from "@/components/shared/HeaderShell";
import { useWalletConnected } from "@/hooks/useWalletConnected";

/**
 * Wallet-aware header for the builder/authoring tier (the designer).
 *
 * Same publication nav row as the marketing chrome — HeaderShell's default
 * `NAV_LINKS` (Protocol / Builders / Discover) — PLUS the `<ConnectButton>`,
 * because authoring and publishing an assembly needs a wallet. But it has
 * NO `(app)` second nav row (Orders / Inbox / Sellers): the designer is a
 * Builders-section surface, not the runtime dashboard. This is the third
 * thin HeaderShell wrapper alongside `Header` (app, two-row) and
 * `MarketingHeader` (publication, no wallet).
 */
export function BuilderHeader() {
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
