import { useReadContract } from "wagmi";
import { CORE_ABI, CONTRACTS } from "@/lib/core/contracts";
import { parseToken } from "@/lib/shared/utils";
import { calculateBonds } from "@figaro/core";

interface UseBondPreviewParams {
    payment: string;
    tokenDecimals: number | undefined;
    /** For sub-orders: processId to read current cumulativeValue. Null for root. */
    currentProcessId: string | null;
}

export interface BondPreview {
    paymentPreview: bigint;
    buyerBond: bigint;
    sellerBond: bigint;
    /** New cumulative value after this order. */
    newCumulativeValue: bigint;
}

export function useBondPreview({
    payment,
    tokenDecimals,
    currentProcessId,
}: UseBondPreviewParams): BondPreview {
    // For sub-orders, read the current process state to get cumulativeValue.
    // For root orders, currentProcessId is null so the query stays disabled.
    const { data: processState } = useReadContract({
        address: CONTRACTS.core,
        abi: CORE_ABI,
        functionName: "processes",
        args: currentProcessId ? [currentProcessId as `0x${string}`] : undefined,
        query: { enabled: !!currentProcessId && !!CONTRACTS.core },
    });

    let rawPaymentPreview: bigint;
    try {
        rawPaymentPreview = parseToken(payment || "0", tokenDecimals);
    } catch {
        rawPaymentPreview = 0n;
    }
    const paymentPreview: bigint = rawPaymentPreview < 0n ? 0n : rawPaymentPreview;

    // Live kernel bonds: buyer = 2 × payment, seller = 2 × cumulativeValue
    // Root order: cumulativeValue == payment
    // Sub-order: cumulativeValue = previous cumulative + payment
    let prevCumulative = 0n;
    if (currentProcessId && processState) {
        const state = processState as readonly [string, string, bigint, bigint];
        prevCumulative = state[2]; // cumulativeValue field
    }

    const newCumulativeValue = currentProcessId
        ? prevCumulative + paymentPreview
        : paymentPreview;

    const bonds = calculateBonds(newCumulativeValue, paymentPreview);

    return { paymentPreview, buyerBond: bonds.buyerBond, sellerBond: bonds.sellerBond, newCumulativeValue };
}
