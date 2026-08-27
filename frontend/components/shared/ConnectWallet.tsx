"use client";

import { useAccount, useDisconnect } from "wagmi";
import { Button } from "@/components/ui/Button";
import { useConnectInjected } from "@/hooks/useConnectInjected";
import { useMounted } from "@/hooks/useMounted";
import { truncateHex } from "@/lib/shared/formatHex";

/**
 * ConnectWallet — the ONE connect affordance for the whole app.
 *
 * Replaces RainbowKit's `<ConnectButton>` (ruled 2026-08-03:
 * RainbowKit has no wagmi-3 support, so the ratified fallback is
 * wagmi's bare `injected()` connector — no wallet-picker modal, no
 * WalletConnect QR code). Renders:
 *  - disconnected (or pre-mount, to avoid a hydration mismatch — see
 *    `useMounted`): a "Connect Wallet" button. That exact string is
 *    load-bearing — devnet e2e specs poll for it to disappear
 *    (`tests/e2e/devnet-helpers.ts` `waitForConnected`).
 *  - connected: the truncated address + a Disconnect button.
 *
 * The header (`Header`, `ToolsHeader`) and `WalletGate` are the only
 * sanctioned placements (per `WalletGate`'s own doc comment) — mount this
 * nowhere else.
 */
export function ConnectWallet() {
    const { address, isConnected } = useAccount();
    const { disconnect } = useDisconnect();
    const connectInjected = useConnectInjected();
    const mounted = useMounted();

    if (mounted && isConnected && address) {
        return (
            <div className="flex items-center gap-2">
                <span
                    className="rounded-md border border-default bg-paper px-3 py-2 text-sm font-medium text-ink-primary"
                    data-testid="connect-wallet-address"
                >
                    {truncateHex(address)}
                </span>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => disconnect()}
                    data-testid="disconnect-wallet"
                >
                    Disconnect
                </Button>
            </div>
        );
    }

    return (
        <Button
            type="button"
            size="sm"
            onClick={connectInjected}
            data-testid="connect-wallet"
        >
            Connect Wallet
        </Button>
    );
}
