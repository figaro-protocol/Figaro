import type { Hex } from "viem";

interface ProcessOrderLike {
    orderHash: Hex;
    cumulativeValue: bigint;
}

export function buildExpectedCumulativeValue(
    currentCumulativeValue: bigint,
    payment: bigint,
): bigint {
    return currentCumulativeValue + payment;
}

export function resolveSubOrderParentHashes({
    parentOrderIds,
    defaultParentOrderIds,
    parentOrderId,
}: {
    parentOrderIds: string;
    defaultParentOrderIds?: string[];
    parentOrderId?: string;
}): string[] {
    const parsedParentHashes = parentOrderIds
        ? parentOrderIds.split(",").map((id) => id.trim()).filter(Boolean)
        : [];

    if (parsedParentHashes.length > 0) {
        return parsedParentHashes;
    }

    if (defaultParentOrderIds && defaultParentOrderIds.length > 0) {
        return defaultParentOrderIds;
    }

    return parentOrderId ? [parentOrderId] : [];
}

export function getLinearPredecessorOrderHash(
    orders: Iterable<ProcessOrderLike>,
): Hex | undefined {
    return [...orders]
        .sort((left, right) => {
            if (left.cumulativeValue !== right.cumulativeValue) {
                return left.cumulativeValue < right.cumulativeValue ? -1 : 1;
            }
            if (left.orderHash < right.orderHash) return -1;
            if (left.orderHash > right.orderHash) return 1;
            return 0;
        })
        .at(-1)?.orderHash;
}
