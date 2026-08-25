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

export function YourTurnBadge() {
    const { pending } = usePendingSellerSignature(awaitsMyCounterSign);
    const count = pending.length;

    return (
        <Link
            href="/orders"
            className="relative rounded-lg p-2 text-ink-body transition-colors hover:bg-subtle hover:text-ink-primary"
            aria-label={count > 0 ? `${count} order${count === 1 ? "" : "s"} awaiting your action` : "Orders"}
            data-testid="your-turn-badge"
        >
            <Bell className="w-5 h-5" aria-hidden="true" />
            {count > 0 && (
                <span
                    className="absolute -top-1 -right-1 bg-error text-paper text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center"
                    aria-hidden="true"
                    data-testid="your-turn-count"
                >
                    {count > 9 ? "9+" : count}
                </span>
            )}
        </Link>
    );
}
