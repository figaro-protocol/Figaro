import {
    CapabilityModel,
    CourierProcessEventKind,
    MechanismModel,
    MerchantProcessEventKind,
    OrderNodeModel,
} from "@/lib/semantic/models";
import { hexEqual } from "@/lib/shared/evm";

/** Merchant signals emitted by the restaurant role at the root-order level.
 *  Ordered by typical lifecycle progression for UI sort. */
const MERCHANT_SIGNAL_ORDER: ReadonlyArray<{
    eventType: MerchantProcessEventKind;
    label: string;
}> = [
    { eventType: "prep-started", label: "Declare Preparation Started" },
    { eventType: "ready-for-pickup", label: "Declare Ready for Pickup" },
    { eventType: "handed-off", label: "Declare Handed Off" },
];

/** Courier signals emitted by the courier role on a delivery sub-order.
 *  Ordered by typical lifecycle progression for UI sort. The two
 *  proximity-bearing events (arrived-pickup, completed) are surfaced through
 *  the proof-bearing capability descriptor in DeliveryAttestationPanel, not
 *  this list — keep this list to the unproven en-route signal so the
 *  CoordinatorActionModule shows only the lightweight signals. */
const COURIER_SIGNAL_ORDER: ReadonlyArray<{
    eventType: CourierProcessEventKind;
    label: string;
}> = [
    { eventType: "en-route-pickup", label: "Declare En Route" },
    { eventType: "arrived-pickup", label: "Declare Picked Up" },
    { eventType: "completed", label: "Declare Delivered" },
];

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
        COURIER_SIGNAL_ORDER.forEach(({ eventType, label }, index) => {
            capabilities.push({
                id: `${order.processId}:${order.orderId}:submit-courier-process-signal:${eventType}`,
                label,
                actionKind: "submit-courier-process-signal",
                action: {
                    executionType: "transaction",
                    kind: "submit-courier-process-signal",
                    orderHash: order.orderId,
                    eventType,
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
                    referenceId: `${order.processId}:${order.orderId}:submit-courier-process-signal:${eventType}`,
                },
            });
        });
    }

    if (isSelectedSeller && coordinatorMechanism && isRestaurantRole(roleKind) && order.parentOrderIds.length === 0) {
        MERCHANT_SIGNAL_ORDER.forEach(({ eventType, label }, index) => {
            capabilities.push({
                id: `${order.processId}:${order.orderId}:submit-merchant-process-signal:${eventType}`,
                label,
                actionKind: "submit-merchant-process-signal",
                action: {
                    executionType: "transaction",
                    kind: "submit-merchant-process-signal",
                    orderHash: order.orderId,
                    eventType,
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
                    referenceId: `${order.processId}:${order.orderId}:submit-merchant-process-signal:${eventType}`,
                },
            });
        });
    }

    return capabilities;
}
