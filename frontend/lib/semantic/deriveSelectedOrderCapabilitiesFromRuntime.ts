import {
    CapabilityModel,
    DeliveryLifecycleSignalActionKind,
    MechanismModel,
    OrderNodeModel,
} from "@/lib/semantic/models";
import { hexEqual } from "@/lib/shared/evm";

const DELIVERY_SIGNAL_LABELS: Record<DeliveryLifecycleSignalActionKind, string> = {
    declarePreparationStarted: "Declare Preparation Started",
    declareReadyForPickup: "Declare Ready for Pickup",
    declareEnRoute: "Declare En Route",
    declarePickedUp: "Declare Picked Up",
    declareDelivered: "Declare Delivered",
};

function findMechanism(mechanisms: MechanismModel[], kinds: string[]): MechanismModel | null {
    return mechanisms.find((mechanism) => kinds.includes(mechanism.kind)) ?? null;
}

function isSellerRole(roleKind: string | undefined): boolean {
    return roleKind === "merchant" || roleKind === "courier" || roleKind === "seller";
}

function resolveDisclosureRole(roleKind: string | undefined): "merchant" | "courier" {
    return roleKind === "courier" ? "courier" : "merchant";
}

function isDeliveryCoordinatorRole(roleKind: string | undefined): boolean {
    return roleKind === "courier";
}

function isRestaurantRole(roleKind: string | undefined): boolean {
    return roleKind === "merchant";
}

const RESTAURANT_SIGNAL_ORDER: DeliveryLifecycleSignalActionKind[] = [
    "declarePreparationStarted",
    "declareReadyForPickup",
];

function isAuctionClaimRole(roleKind: string | undefined): boolean {
    return roleKind === "courier";
}

export function deriveSelectedOrderCapabilitiesFromRuntime(
    order: OrderNodeModel | null,
    roleKind: string | undefined,
    mechanisms: MechanismModel[],
    address?: `0x${string}`,
): CapabilityModel[] {
    if (!order || !address) {
        return [];
    }

    const isSelectedSeller = hexEqual(order.seller, address);

    const capabilities: CapabilityModel[] = [];
    const disclosureMechanism = findMechanism(mechanisms, ["disclosure", "ghg"]);
    const coordinatorMechanism = findMechanism(mechanisms, ["coordinator"]);
    const auctionMechanism = findMechanism(mechanisms, ["auction"]);

    if (
        auctionMechanism
        && isAuctionClaimRole(roleKind)
        && order.parentOrderIds.length > 0
        && !isSelectedSeller
    ) {
        capabilities.push({
            id: `${order.processId}:${order.orderId}:claim-auction`,
            label: "Claim Job",
            actionKind: "claim-auction",
            action: {
                executionType: "transaction",
                kind: "claim-auction",
                auctionId: order.orderId,
            },
            mechanismId: auctionMechanism.id,
            scopeType: "order",
            scopeId: order.orderId,
            preconditions: ["driver-role-selected", "selected-child-order"],
            riskLabel: "important",
            writeTarget: "DutchAuction.claim",
            uiPriority: 72,
            source: {
                truthClass: "protocol-derived",
                sourceLabel: "selected driver may claim the active auction for this order",
                referenceId: `${order.processId}:${order.orderId}:claim-auction`,
            },
        });
    }

    if (isSelectedSeller && disclosureMechanism && isSellerRole(roleKind)) {
        capabilities.push(
            {
                id: `${order.processId}:${order.orderId}:submit-disclosure-commitment`,
                label: "Record Disclosure Commitment",
                actionKind: "submit-disclosure-commitment",
                action: {
                    executionType: "transaction",
                    kind: "submit-disclosure-commitment",
                    orderHash: order.orderId,
                    disclosureRole: resolveDisclosureRole(roleKind),
                },
                mechanismId: disclosureMechanism.id,
                scopeType: "order",
                scopeId: order.orderId,
                preconditions: ["seller-of-selected-order"],
                riskLabel: "standard",
                writeTarget: "AttestationCoordinator.attestAsSeller",
                uiPriority: 70,
                source: {
                    truthClass: "protocol-derived",
                    sourceLabel: "selected seller may record the disclosure commitment for this order",
                    referenceId: `${order.processId}:${order.orderId}:submit-disclosure-commitment`,
                },
            },
            {
                id: `${order.processId}:${order.orderId}:submit-disclosure-inventory`,
                label: "Submit Emissions Inventory",
                actionKind: "submit-disclosure-inventory",
                action: {
                    executionType: "transaction",
                    kind: "submit-disclosure-inventory",
                    orderHash: order.orderId,
                },
                mechanismId: disclosureMechanism.id,
                scopeType: "order",
                scopeId: order.orderId,
                preconditions: ["seller-of-selected-order"],
                riskLabel: "standard",
                writeTarget: "AttestationCoordinator.attestAsSeller",
                uiPriority: 69,
                source: {
                    truthClass: "protocol-derived",
                    sourceLabel: "selected seller may submit quantified emissions inventory for this order",
                    referenceId: `${order.processId}:${order.orderId}:submit-disclosure-inventory`,
                },
            },
        );
    }

    if (isSelectedSeller && coordinatorMechanism && isDeliveryCoordinatorRole(roleKind)) {
        (Object.entries(DELIVERY_SIGNAL_LABELS) as Array<[DeliveryLifecycleSignalActionKind, string]>)
            .filter(([signal]) => signal === "declareEnRoute" || signal === "declarePickedUp" || signal === "declareDelivered")
            .forEach(([signal, label], index) => {
                capabilities.push({
                    id: `${order.processId}:${order.orderId}:submit-delivery-lifecycle-signal:${signal}`,
                    label,
                    actionKind: "submit-delivery-lifecycle-signal",
                    action: {
                        executionType: "transaction",
                        kind: "submit-delivery-lifecycle-signal",
                        orderHash: order.orderId,
                        signal,
                    },
                    mechanismId: coordinatorMechanism.id,
                    scopeType: "order",
                    scopeId: order.orderId,
                    preconditions: ["driver-of-selected-order"],
                    riskLabel: "standard",
                    writeTarget: "AttestationCoordinator.attestAsSeller",
                    uiPriority: 68 - index,
                    source: {
                        truthClass: "protocol-derived",
                        sourceLabel: `selected driver may attest ${label.toLowerCase()} for this delivery order`,
                        referenceId: `${order.processId}:${order.orderId}:submit-delivery-lifecycle-signal:${signal}`,
                    },
                });
            });
    }

    if (isSelectedSeller && coordinatorMechanism && isRestaurantRole(roleKind) && order.parentOrderIds.length === 0) {
        RESTAURANT_SIGNAL_ORDER.forEach((signal, index) => {
            const label = DELIVERY_SIGNAL_LABELS[signal];
            capabilities.push({
                id: `${order.processId}:${order.orderId}:submit-delivery-lifecycle-signal:${signal}`,
                label,
                actionKind: "submit-delivery-lifecycle-signal",
                action: {
                    executionType: "transaction",
                    kind: "submit-delivery-lifecycle-signal",
                    orderHash: order.orderId,
                    signal,
                },
                mechanismId: coordinatorMechanism.id,
                scopeType: "order",
                scopeId: order.orderId,
                preconditions: ["restaurant-of-selected-order"],
                riskLabel: "standard",
                writeTarget: "AttestationCoordinator.attestAsSeller",
                uiPriority: 66 - index,
                source: {
                    truthClass: "protocol-derived",
                    sourceLabel: `selected restaurant may attest ${label.toLowerCase()} for this order`,
                    referenceId: `${order.processId}:${order.orderId}:submit-delivery-lifecycle-signal:${signal}`,
                },
            });
        });
    }

    return capabilities;
}