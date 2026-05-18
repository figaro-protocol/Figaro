import { loadAgreement } from "@/lib/core/agreementStore";
import { type TopologyMode } from "@/lib/core/agreementManifest";
import {
    getTopologyMode,
    getTopologyParentOrderHashes,
} from "@/lib/core/orderAgreement";
import type { Order } from "@/lib/core/store";

export interface OrderTopologyInfo {
    parentOrderIds: string[];
    topologyMode: TopologyMode;
    sourceLabel: string;
}

function compareOrders(left: Order, right: Order): number {
    if (left.cumulativeValue !== right.cumulativeValue) {
        return left.cumulativeValue < right.cumulativeValue ? -1 : 1;
    }

    const leftBlock = left.blockNumber ?? left.timestamp ?? 0;
    const rightBlock = right.blockNumber ?? right.timestamp ?? 0;
    if (leftBlock !== rightBlock) {
        return leftBlock - rightBlock;
    }

    if (left.id < right.id) return -1;
    if (left.id > right.id) return 1;
    return 0;
}

function sortOrdersForTopology(orders: Order[]): Order[] {
    return [...orders].sort(compareOrders);
}

export function deriveOrderTopology(orders: Order[]): Map<string, OrderTopologyInfo> {
    const sortedOrders = sortOrdersForTopology(orders);
    const fallbackTopology = new Map<string, OrderTopologyInfo>();

    sortedOrders.forEach((order, index) => {
        fallbackTopology.set(order.id, {
            parentOrderIds: index === 0 ? [] : [sortedOrders[index - 1].id],
            topologyMode: index === 0 ? "root" : "linear-fallback",
            sourceLabel: index === 0
                ? "first order in cumulative process progression"
                : "linear fallback derived from cumulative process progression",
        });
    });

    const topology = new Map<string, OrderTopologyInfo>();
    for (const order of orders) {
        const fallback = fallbackTopology.get(order.id) ?? {
            parentOrderIds: [],
            topologyMode: "root" as const,
            sourceLabel: "default root fallback",
        };

        const agreement = loadAgreement(order.agreementHash);
        const explicitParents = getTopologyParentOrderHashes(agreement);
        const explicitMode = getTopologyMode(agreement);

        if (explicitParents !== null || explicitMode !== null) {
            const parentOrderIds = explicitParents ?? [];
            const topologyMode = parentOrderIds.length === 0
                ? "root"
                : explicitMode === "linear-fallback"
                    ? "linear-fallback"
                    : "explicit";

            topology.set(order.id, {
                parentOrderIds,
                topologyMode,
                sourceLabel: "agreement topology section committed through agreementHash",
            });
            continue;
        }

        topology.set(order.id, fallback);
    }

    return topology;
}

export function deriveOrderDepths(orders: Order[], topology: Map<string, OrderTopologyInfo>): Map<string, number> {
    const knownOrderIds = new Set(orders.map((order) => order.id));
    const depthMap = new Map<string, number>();
    const visiting = new Set<string>();

    const visit = (orderId: string): number => {
        const cached = depthMap.get(orderId);
        if (cached !== undefined) return cached;
        if (visiting.has(orderId)) {
            depthMap.set(orderId, 0);
            return 0;
        }

        visiting.add(orderId);
        const parentOrderIds = (topology.get(orderId)?.parentOrderIds ?? []).filter(
            (parentOrderId) => parentOrderId !== orderId && knownOrderIds.has(parentOrderId),
        );

        const depth = parentOrderIds.length === 0
            ? 0
            : Math.max(...parentOrderIds.map((parentOrderId) => visit(parentOrderId))) + 1;

        visiting.delete(orderId);
        depthMap.set(orderId, depth);
        return depth;
    };

    orders.forEach((order) => {
        visit(order.id);
    });

    return depthMap;
}
