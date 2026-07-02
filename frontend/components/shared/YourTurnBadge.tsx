"use client";

/**
 * YourTurnBadge — header indicator: a DERIVED count of orders awaiting THIS
 * wallet's action (relayed commitments needing its counter-signature), linking
 * to /orders. It is NOT a notification store/feed — "needs my action" is
 * derived from the coordination channel, the same signal the /orders "Your
 * turn" section and an agent's event subscription read, just a different
 * transport. The kernel has no pending state; this is the only off-chain
 * action signal.
 */

import Link from "next/link";
import { usePendingSellerSignature, awaitsMyCounterSign } from "@/lib/checkout/orderPendingSellerSignature";
import Bell from "@/components/icons/Bell";

interface YourTurnBadgeProps {
    theme?: "light" | "dark";
}

export function YourTurnBadge({ theme = "dark" }: YourTurnBadgeProps) {
    const { pending } = usePendingSellerSignature(awaitsMyCounterSign);
    const count = pending.length;

    const cls = theme === "dark"
        ? "relative rounded-lg p-2 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
        : "relative rounded-lg p-2 text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-black";

    return (
        <Link
            href="/orders"
            className={cls}
            aria-label={count > 0 ? `${count} order${count === 1 ? "" : "s"} awaiting your action` : "Orders"}
            data-testid="your-turn-badge"
        >
            <Bell className="w-5 h-5" aria-hidden="true" />
            {count > 0 && (
                <span
                    className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center"
                    aria-hidden="true"
                    data-testid="your-turn-count"
                >
                    {count > 9 ? "9+" : count}
                </span>
            )}
        </Link>
    );
}
