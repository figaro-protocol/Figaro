"use client";

/**
 * WalletGate — single wrapper for "if disconnected, show a Connect prompt;
 * otherwise render the gated children" pattern.
 *
 * Replaces the inline duplicates that used to be repeated in
 * AssemblyRuntimeView, AssemblyWorkspace, and the legacy operator-
 * onboarding form (each had its own `if (!address) { hint +
 * <ConnectButton /> } else { ... }` block). The Web2 UI/UX audit
 * (2026-04-26) flagged the duplication; this is the one-place wrapper.
 *
 * Usage:
 *
 *   // Inline gate inside a section's empty-state fallback:
 *   <WalletGate hint="Connect a wallet to place orders and track active processes.">
 *     <p>No active processes found for this wallet.</p>
 *   </WalletGate>
 *
 *   // Standalone full-panel gate (e.g. operator onboarding entry point):
 *   <WalletGate
 *     variant="standalone"
 *     title="Connect your wallet to continue"
 *     hint="Registration requires a wallet. Your profile is signed by your address."
 *   >
 *     <RegistrationForm />
 *   </WalletGate>
 *
 * Adding a `<ConnectButton />` outside this wrapper should be reserved for
 * the global header. Anywhere else in the app — gate it via WalletGate so
 * the placement audit stays trivial.
 */

import type { ReactNode } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export interface WalletGateProps {
    /** Short message explaining why a wallet is needed. */
    hint: string;
    /**
     * Content to render when a wallet is connected. Use a fallback like
     * "no items found" — the connected-but-empty state, not the loading
     * state. Loading should be handled by the caller.
     */
    children: ReactNode;
    /**
     * Visual variant.
     *  - "inline" (default): rounded panel matching list/empty-state UI.
     *    Suited for in-page gates inside a section.
     *  - "standalone": centered card with a prominent title, suited for
     *    page-entry gates (e.g. an onboarding step).
     */
    variant?: "inline" | "standalone";
    /**
     * Optional bold title shown above the hint. Required visually for
     * `variant="standalone"`; ignored for "inline".
     */
    title?: string;
    /** Optional override for the wrapper className when the default
     *  styling doesn't fit the surrounding layout. */
    className?: string;
    /** Optional `data-testid` on the root wrapper for e2e tests. */
    "data-testid"?: string;
}

const INLINE_CLASS =
    "rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-500 space-y-3";
const STANDALONE_CLASS =
    "border border-gray-200 rounded-lg px-8 py-10 text-center";

export function WalletGate({
    hint,
    children,
    variant = "inline",
    title,
    className,
    "data-testid": testId,
}: WalletGateProps) {
    const { address } = useAccount();

    if (address) return <>{children}</>;

    const wrapperClass = className ?? (variant === "standalone" ? STANDALONE_CLASS : INLINE_CLASS);

    if (variant === "standalone") {
        return (
            <div className={wrapperClass} data-testid={testId ?? "wallet-gate"}>
                {title && (
                    <p className="text-sm font-semibold text-black mb-1">{title}</p>
                )}
                <p className="text-xs text-gray-500 mb-6">{hint}</p>
                <ConnectButton />
            </div>
        );
    }

    return (
        <div className={wrapperClass} data-testid={testId ?? "wallet-gate"}>
            <p>{hint}</p>
            <ConnectButton />
        </div>
    );
}
