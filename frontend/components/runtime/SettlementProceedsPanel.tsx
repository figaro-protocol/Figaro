"use client";

import { useAccount } from "wagmi";
import { formatToken } from "@/lib/shared/utils";
import useTokenDecimals from "@/hooks/useTokenDecimals";
import { useTokenSymbol } from "@/components/sellers/TokenAddressInput";
import { truncateHex } from "@/lib/shared/formatHex";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
    /** The resolved order hash that generated the proceeds. */
    sourceOrderId: string;
    /** The ERC-20 token address for this order. */
    currency: `0x${string}`;
    /** Whether the connected wallet is the seller of this order. */
    isSeller: boolean;
    /** Payment that settled (moved buyer→seller) at resolution. */
    payment: bigint;
    /** The connected wallet's bond, returned in full at resolution. */
    bondReturned: bigint;
}

/**
 * SettlementProceedsPanel
 *
 * The live kernel has no internal ledger — resolveProcess transfers tokens directly.
 * No fee, no router/cascade certification. This panel shows the human what
 * settlement moved: the payment (sent or received) and their bond, returned in
 * full. The amounts are read from the protocol-derived process model — the same
 * 2×payment / 2×cumulative-value bond the kernel locked and returned.
 *
 * Kernel-core, NOT a clause surface. Settlement is the kernel's own proceeds —
 * clause-less by construction — so this mounts by symbol on the process-detail
 * page, a peer of CapabilityRail and the timeline. It is deliberately NOT a
 * candidate for the declared-semantic component registries (fieldFormatInputs /
 * interactionSurfaces / rateQuantitySources): those key on a semantic the clause
 * SPEC declares, and there is no clause here to key on. "Re-homing" it under a
 * registry would build a one-tenant registry for a permanent kernel singleton —
 * ceremony that buys none of the open-world composition the registries exist for.
 *
 * TODO(Tier-B): Add provenance certification via AttestationCoordinator.
 */
export function SettlementProceedsPanel({
    sourceOrderId,
    currency,
    isSeller,
    payment,
    bondReturned,
}: Props) {
    const { address } = useAccount();
    const { decimals } = useTokenDecimals(currency);
    const { data: symbol } = useTokenSymbol(currency);

    if (!address) return null;

    const fmt = (v: bigint) => `${formatToken(v, decimals)}${symbol ? ` ${symbol}` : ""}`;

    return (
        <div
            className="mt-3 border border-neutral-200 rounded-lg p-4 bg-neutral-50 space-y-3"
            data-testid="settlement-proceeds"
        >
            <p className="text-xs font-semibold text-neutral-500">
                Settlement Complete
            </p>
            <dl className="text-sm text-neutral-700 space-y-1">
                <div className="flex justify-between gap-4">
                    <dt>{isSeller ? "Payment received" : "Payment sent"}</dt>
                    <dd className="font-medium text-black" data-testid="settlement-payment">
                        {fmt(payment)}
                    </dd>
                </div>
                <div className="flex justify-between gap-4">
                    <dt>Bond returned to your wallet</dt>
                    <dd className="font-medium text-black" data-testid="settlement-bond-returned">
                        {fmt(bondReturned)}
                    </dd>
                </div>
            </dl>
            <p className="text-xs text-neutral-500">
                The agreement completed as guaranteed — your bond is back in your wallet.
            </p>
            <p className="text-xs text-neutral-500 font-mono truncate" title={sourceOrderId}>
                Order: {truncateHex(sourceOrderId, { head: 14, tail: 8 })}
            </p>
        </div>
    );
}
