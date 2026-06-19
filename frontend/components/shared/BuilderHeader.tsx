"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { YourTurnBadge } from "@/components/shared/YourTurnBadge";
import { HeaderShell } from "@/components/shared/HeaderShell";
import { useWalletConnected } from "@/hooks/useWalletConnected";

/**
 * Wallet-aware header for the builder/authoring tier (the designer).
 *
 * Same publication nav row as the marketing chrome — HeaderShell's default
 * `NAV_LINKS` (Protocol / Builders / Discover) — PLUS the `<ConnectButton>`,
 * because authoring and publishing an assembly needs a wallet. But it has
 * NO `(app)` second nav row (Orders / Sellers): the designer is a
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
                    {walletConnected && <YourTurnBadge theme="light" />}
                    <ConnectButton />
                </>
            }
        />
    );
}
