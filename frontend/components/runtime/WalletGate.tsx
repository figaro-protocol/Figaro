"use client";

/**
 * WalletGate — single wrapper for "if disconnected, show a Connect prompt;
 * otherwise render the gated children" pattern.
 *
 * Replaces the inline duplicates that used to be repeated across
 * assembly-runtime views and the legacy seller-onboarding form
 * (each had its own `if (!address) { hint + <ConnectWallet /> } else
 * { ... }` block). The Web2 UI/UX audit (2026-04-26) flagged the
 * duplication; this is the one-place wrapper.
 *
 * Usage:
 *
 *   // Inline gate inside a section's empty-state fallback:
 *   <WalletGate hint="Connect a wallet to place orders and track active processes.">
 *     <p>No active processes found for this wallet.</p>
 *   </WalletGate>
 *
 *   // Standalone full-panel gate (e.g. seller onboarding entry point):
 *   <WalletGate
 *     variant="standalone"
 *     title="Connect your wallet to continue"
 *     hint="Registration requires a wallet. Your profile is signed by your address."
 *   >
 *     <RegistrationForm />
 *   </WalletGate>
 *
 * Adding a `<ConnectWallet />` outside this wrapper should be reserved for
 * the global header. Anywhere else in the app — gate it via WalletGate so
 * the placement audit stays trivial.
 */

import type { ReactNode } from "react";
import { useAccount } from "wagmi";
import { ConnectWallet } from "@/components/shared/ConnectWallet";
import { useMounted } from "@/hooks/useMounted";

/**
 * The shared stranger-facing explanation for wallet-scoped pages reached
 * from the top-level nav (probe move 10): the disconnected branch is what
 * the server renders, so this copy is what a cold visitor and a crawler
 * see. One constant, spelled here, so the three surfaces never drift.
 */
export const STRANGER_EXPLAINER =
    "There is no account to create: a wallet is the only identity the protocol knows. This page is a reading of the public chain state that belongs to whichever wallet connects — nothing on it is held by a platform.";

export interface WalletGateProps {
    /** Short message explaining why a wallet is needed. */
    hint: string;
    /**
     * Optional longer explanation rendered above the hint in the
     * disconnected state — server-rendered, so it is the stranger/crawler
     * view of the page. Pass `STRANGER_EXPLAINER` for nav-reachable pages.
     */
    explainer?: string;
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
    "rounded-lg border border-default bg-paper p-4 text-sm text-ink-muted space-y-3";
const STANDALONE_CLASS =
    "border border-default rounded-lg px-8 py-10 text-center";

export function WalletGate({
    hint,
    explainer,
    children,
    variant = "inline",
    title,
    className,
    "data-testid": testId,
}: WalletGateProps) {
    const { address } = useAccount();
    // Gate on mounted: the server always renders the connect prompt, so the
    // first client render must too — wagmi restores the connection
    // synchronously from storage, and branching on it during hydration is a
    // React #418/#423/#425 mismatch. Children take over post-mount.
    const mounted = useMounted();

    if (mounted && address) return <>{children}</>;

    const wrapperClass = className ?? (variant === "standalone" ? STANDALONE_CLASS : INLINE_CLASS);

    if (variant === "standalone") {
        return (
            <div className={wrapperClass} data-testid={testId ?? "wallet-gate"}>
                {title && (
                    <p className="text-sm font-semibold text-ink-primary mb-1">{title}</p>
                )}
                {explainer && (
                    <p className="text-xs text-ink-muted mb-3 text-left">{explainer}</p>
                )}
                <p className="text-xs text-ink-muted mb-6">{hint}</p>
                <ConnectWallet />
            </div>
        );
    }

    return (
        <div className={wrapperClass} data-testid={testId ?? "wallet-gate"}>
            {explainer && <p>{explainer}</p>}
            <p>{hint}</p>
            <ConnectWallet />
        </div>
    );
}
