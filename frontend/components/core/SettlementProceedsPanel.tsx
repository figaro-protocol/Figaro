"use client";

import { useAccount } from "wagmi";
import { truncateHex } from "@/lib/shared/formatHex";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
    /** The resolved order hash that generated the proceeds. */
    sourceOrderId: string;
    /** The ERC-20 token address for this order. */
    currency: `0x${string}`;
    /** Whether the connected wallet is the seller of this order. */
    isSeller: boolean;
}

/**
 * SettlementProceedsPanel
 *
 * The live kernel has no internal ledger — resolveProcess transfers tokens directly.
 * No fee, no router/cascade certification. This panel shows a simple
 * confirmation that settlement has occurred.
 *
 * TODO(Tier-B): Add provenance certification via AttestationCoordinator.
 */
export function SettlementProceedsPanel({
    sourceOrderId,
    currency,
    isSeller,
}: Props) {
    const { address } = useAccount();

    if (!address) return null;

    return (
        <div className="mt-3 border border-neutral-200 rounded-lg p-4 bg-neutral-50 space-y-2">
            <p className="text-xs font-semibold text-neutral-500">
                Settlement Complete
            </p>
            <p className="text-sm text-neutral-700">
                {isSeller
                    ? "Payment received and bonds returned to your wallet. The agreement completed as guaranteed."
                    : "Bonds returned to your wallet. The agreement completed as guaranteed."}
            </p>
            <p className="text-xs text-neutral-500 font-mono truncate" title={sourceOrderId}>
                Order: {truncateHex(sourceOrderId, { head: 14, tail: 8 })}
            </p>
        </div>
    );
}
