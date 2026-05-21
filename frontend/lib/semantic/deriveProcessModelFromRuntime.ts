import { Order, OrderState } from "@/lib/core/store";
import {
    GHG_MEASUREMENT_SCHEMA_KEY,
    GHG_SCHEMA_KEY,
    getSection,
    type TopologyMode,
} from "@/lib/core/agreementManifest";
import { loadAgreement } from "@/lib/core/agreementStore";
import { deriveOrderTopology } from "@/lib/core/orderTopology";
import { ProcessSummary } from "@/hooks/core/useWalletProcessIds";
import { ZERO_BYTES32, hexEqual } from "@/lib/shared/evm";
import {
    AttachmentModel,
    CapabilityModel,
    EconomicBreakdownModel,
    EconomicBreakdownValue,
    OrderNodeModel,
    ProcessModel,
    ProcessRelationModel,
} from "@/lib/semantic/models";
import type { Hex } from "viem";

/** Root orders anchor a process at cumulativeValue === payment. */
function isRootOrder(order: Order): boolean {
    return order.cumulativeValue === order.payment;
}

function runtimeSource(sourceLabel: string, referenceId?: string) {
    return {
        truthClass: "protocol-derived" as const,
        sourceLabel,
        referenceId,
    };
}

function ledgerSource(sourceLabel: string, referenceId?: string) {
    return {
        truthClass: "protocol-enforced" as const,
        sourceLabel,
        referenceId,
    };
}

function roleCapabilities(_order: Order, _address?: string, _isE2EMock = false): CapabilityModel[] {
    const order = _order;
    if (order.state !== OrderState.Active || !order.currency) return [];

    const normalized = _address?.toLowerCase();
    const isBuyer = _isE2EMock ? true : hexEqual(order.buyer, normalized);
    const isSeller = _isE2EMock ? true : hexEqual(order.seller, normalized);

    const out: CapabilityModel[] = [];

    if (isBuyer) {
        out.push({
            id: `${order.processId}:${order.id.toString()}:compose-sub-order`,
            label: "Add Sub-order",
            actionKind: "open-sub-order-composer",
            action: {
                executionType: "runtime",
                kind: "open-sub-order-composer",
                parentOrderIds: [order.id.toString()],
                currency: order.currency as `0x${string}`,
            },
            mechanismId: "core-orders",
            scopeType: "order",
            scopeId: order.id.toString(),
            preconditions: ["buyer-of-active-order"],
            riskLabel: "standard",
            uiPriority: 80,
            source: runtimeSource("buyer may compose downstream bonded work from an active order", `${order.processId}:${order.id.toString()}:compose-sub-order`),
        });
    }

    // Seller-side GHG disclosure capabilities — emitted when the
    // committed agreement carries the relevant clause. The agreement
    // is loaded from localStorage (witnessed by the seller's wallet
    // at commit time and saved by the commitment-flow). A wallet that
    // never witnessed the order won't have the agreement in store and
    // the capability won't surface — that's the correct event-driven
    // behavior; the seller's own wallet sees their own commitments.
    //
    // GHGWorkflowPanel reads these capabilities to surface the
    // "Submit commitment" / "Submit inventory" affordances at
    // /terminal. Without this derivation the panel renders but its
    // submit buttons stay disabled (no executable capability).
    if (isSeller && order.agreementHash) {
        const agreement = loadAgreement(order.agreementHash as Hex);
        if (agreement) {
            if (getSection(agreement, GHG_SCHEMA_KEY)) {
                out.push({
                    id: `${order.processId}:${order.id.toString()}:submit-disclosure-commitment`,
                    label: "Record Disclosure Commitment",
                    actionKind: "submit-disclosure-commitment",
                    action: {
                        executionType: "transaction",
                        kind: "submit-disclosure-commitment",
                        orderHash: order.id.toString(),
                    },
                    mechanismId: "attestation-coordinator",
                    scopeType: "order",
                    scopeId: order.id.toString(),
                    preconditions: ["seller-of-active-order", "ghg-protocol-clause-committed"],
                    riskLabel: "standard",
                    uiPriority: 70,
                    source: runtimeSource(
                        "seller may attest a GHG commitment when the figaro-ghg-iso-14064-v1 clause is committed",
                        `${order.processId}:${order.id.toString()}:submit-disclosure-commitment`,
                    ),
                });
            }
            if (getSection(agreement, GHG_MEASUREMENT_SCHEMA_KEY)) {
                out.push({
                    id: `${order.processId}:${order.id.toString()}:submit-disclosure-inventory`,
                    label: "Submit Emissions Inventory",
                    actionKind: "submit-disclosure-inventory",
                    action: {
                        executionType: "transaction",
                        kind: "submit-disclosure-inventory",
                        orderHash: order.id.toString(),
                    },
                    mechanismId: "attestation-coordinator",
                    scopeType: "order",
                    scopeId: order.id.toString(),
                    preconditions: ["seller-of-active-order", "ghg-measurement-clause-committed"],
                    riskLabel: "standard",
                    uiPriority: 70,
                    source: runtimeSource(
                        "seller may attest a runtime grams measurement when the figaro-ghg-measurement-v1 clause is committed",
                        `${order.processId}:${order.id.toString()}:submit-disclosure-inventory`,
                    ),
                });
            }
        }
    }

    return out;
}

function deriveProcessCapabilities(
    processId: string,
    orders: Order[],
    address?: string,
    isE2EMock = false,
): CapabilityModel[] {
    if (!address && !isE2EMock) return [];

    const normalized = address?.toLowerCase();
    const capabilities: CapabilityModel[] = [];
    const canResolve = isE2EMock
        ? orders.some((order) => order.state === OrderState.Active)
        : orders.some(
            (order) => order.state === OrderState.Active && hexEqual(order.buyer, normalized)
        );

    if (canResolve) {
        capabilities.push({
            id: `${processId}-resolve`,
            label: "Resolve Process",
            actionKind: "resolve-process",
            action: {
                executionType: "transaction",
                kind: "resolve-process",
                processId,
            },
            mechanismId: "core-orders",
            scopeType: "process",
            scopeId: processId,
            preconditions: ["buyer-of-active-process"],
            riskLabel: "important",
            uiPriority: 100,
            source: {
                truthClass: "protocol-derived",
                sourceLabel: "buyer authority over active process",
                referenceId: `${processId}:resolve`,
            },
        });
    }

    return capabilities;
}

function deriveSettlementBreakdown(order: Order, address?: string): EconomicBreakdownModel | undefined {
    if (!address) return undefined;
    const normalized = address.toLowerCase();
    const isBuyer = hexEqual(order.buyer, normalized);
    const isSeller = hexEqual(order.seller, normalized);

    if (!isBuyer && !isSeller) return undefined;

    const typedOutputs: EconomicBreakdownValue[] = [];

    typedOutputs.push({
        label: "Payment for value transfer",
        amount: order.payment,
        source: {
            truthClass: "protocol-derived",
            sourceLabel: "order payment field",
            referenceId: `${order.processId}:${order.id.toString()}:payment`,
        },
    });

    if (isBuyer) {
        typedOutputs.push({
            label: "Buyer bond obligation",
            amount: order.buyerBond,
            source: {
                truthClass: "protocol-derived",
                sourceLabel: "2x payment buyer bond rule",
                referenceId: `${order.processId}:${order.id.toString()}:buyer-bond`,
            },
        });
    }

    if (isSeller) {
        typedOutputs.push({
            label: "Seller bond obligation",
            amount: order.sellerBond,
            source: {
                truthClass: "protocol-derived",
                sourceLabel: "2x cumulative value seller bond rule",
                referenceId: `${order.processId}:${order.id.toString()}:seller-bond`,
            },
        });
    }

    return {
        scopeType: "order",
        scopeId: order.id.toString(),
        lockedBond: {
            label: isBuyer ? "Buyer bond" : "Seller bond",
            amount: isBuyer ? order.buyerBond : order.sellerBond,
            source: {
                truthClass: "protocol-derived",
                sourceLabel: "order-derived bond obligation",
                referenceId: `${order.processId}:${order.id.toString()}:locked-bond`,
            },
        },
        typedOutputs,
        downstreamReferencedAmount: !isRootOrder(order)
            ? {
                label: "Downstream referenced value",
                amount: order.payment,
                source: {
                    truthClass: "protocol-derived",
                    sourceLabel: "sub-order payment references upstream process value",
                    referenceId: `${order.processId}:${order.id.toString()}:downstream-reference`,
                },
            }
            : undefined,
    };
}

function deriveProcessEconomicSummary(
    processId: string,
    orders: Order[],
    address?: string,
): EconomicBreakdownModel | undefined {
    if (!address || orders.length === 0) return undefined;

    const normalized = address.toLowerCase();
    const totalPayment = orders.reduce((sum, order) => sum + order.payment, 0n);
    const actorBuyerBond = orders.reduce(
        (sum, order) => sum + (hexEqual(order.buyer, normalized) ? order.buyerBond : 0n),
        0n
    );
    const actorSellerBond = orders.reduce(
        (sum, order) => sum + (hexEqual(order.seller, normalized) ? order.sellerBond : 0n),
        0n
    );
    const downstreamReferenced = orders
        .filter((order) => !isRootOrder(order))
        .reduce((sum, order) => sum + order.payment, 0n);
    const lockedBondAmount = actorBuyerBond + actorSellerBond;

    return {
        scopeType: "process",
        scopeId: processId,
        lockedBond: lockedBondAmount > 0n
            ? {
                label: "Actor locked bond capital",
                amount: lockedBondAmount,
                source: {
                    truthClass: "protocol-derived",
                    sourceLabel: "sum of actor bond obligations across process orders",
                    referenceId: `${processId}:locked-bond`,
                },
            }
            : undefined,
        typedOutputs: [
            {
                label: "Gross payment commitments",
                amount: totalPayment,
                source: {
                    truthClass: "protocol-derived",
                    sourceLabel: "sum of order payments in process",
                    referenceId: `${processId}:gross-payment`,
                },
            },
            {
                label: "Buyer-side bond obligations",
                amount: actorBuyerBond,
                source: {
                    truthClass: "protocol-derived",
                    sourceLabel: "sum of buyer bond obligations for connected actor",
                    referenceId: `${processId}:buyer-bonds`,
                },
            },
            {
                label: "Seller-side bond obligations",
                amount: actorSellerBond,
                source: {
                    truthClass: "protocol-derived",
                    sourceLabel: "sum of seller bond obligations for connected actor",
                    referenceId: `${processId}:seller-bonds`,
                },
            },
        ],
        downstreamReferencedAmount: downstreamReferenced > 0n
            ? {
                label: "Downstream referenced value",
                amount: downstreamReferenced,
                source: {
                    truthClass: "protocol-derived",
                    sourceLabel: "sum of payments on descendant orders",
                    referenceId: `${processId}:downstream-referenced`,
                },
            }
            : undefined,
    };
}

function deriveOrderAttachments(order: Order, address?: string): AttachmentModel[] {
    const attachments: AttachmentModel[] = [];
    const orderId = order.id.toString();
    const normalized = address?.toLowerCase();

    if (isRootOrder(order)) {
        attachments.push({
            id: `${order.processId}:${orderId}:root`,
            mechanismId: "core-orders",
            targetType: "order",
            targetId: orderId,
            label: "Root order",
            description: "This order anchors the process (cumulativeValue equals payment).",
            attachmentKind: "topology-root",
            state: "derived",
            visibleByDefault: true,
            source: runtimeSource("cumulativeValue === payment identifies the root order", `${order.processId}:${orderId}:root`),
        });
    } else {
        attachments.push({
            id: `${order.processId}:${orderId}:child`,
            mechanismId: "core-orders",
            targetType: "order",
            targetId: orderId,
            label: "Sub-order",
            description: "This order extends the process as a downstream node.",
            attachmentKind: "topology-child",
            state: "derived",
            visibleByDefault: true,
            source: runtimeSource("cumulativeValue > payment identifies a sub-order", `${order.processId}:${orderId}:child`),
        });
    }

    if (hexEqual(order.buyer, normalized)) {
        attachments.push({
            id: `${order.processId}:${orderId}:buyer-role`,
            mechanismId: "core-orders",
            targetType: "order",
            targetId: orderId,
            label: "Connected as buyer",
            description: "The connected actor is the buyer on this order.",
            attachmentKind: "actor-participation",
            state: "buyer",
            visibleByDefault: true,
            source: runtimeSource("connected wallet matches order buyer", `${order.processId}:${orderId}:buyer-role`),
        });
    }

    if (hexEqual(order.seller, normalized)) {
        attachments.push({
            id: `${order.processId}:${orderId}:seller-role`,
            mechanismId: "core-orders",
            targetType: "order",
            targetId: orderId,
            label: "Connected as seller",
            description: "The connected actor is the seller on this order.",
            attachmentKind: "actor-participation",
            state: "seller",
            visibleByDefault: true,
            source: runtimeSource("connected wallet matches order seller", `${order.processId}:${orderId}:seller-role`),
        });
    }

    if (order.agreementHash && order.agreementHash !== ZERO_BYTES32) {
        attachments.push({
            id: `${order.processId}:${orderId}:agreement`,
            mechanismId: "core-orders",
            targetType: "order",
            targetId: orderId,
            label: "Agreement commitment",
            description: "This order includes an agreement hash committed at order creation.",
            attachmentKind: "agreement-reference",
            state: "committed",
            visibleByDefault: false,
            source: runtimeSource("OrderCommitted agreementHash field", `${order.processId}:${orderId}:agreement`),
        });
    }

    return attachments;
}

function deriveProcessAttachments(
    processId: string,
    orders: Order[],
    rootOrderId: string,
    address?: string,
    currencyAddress?: string,
): AttachmentModel[] {
    if (orders.length === 0) return [];

    const attachments: AttachmentModel[] = [
        {
            id: `${processId}:root-order`,
            mechanismId: "core-orders",
            targetType: "process",
            targetId: processId,
            label: `Root order #${rootOrderId}`,
            description: "Primary process anchor derived from the first order without parents.",
            attachmentKind: "root-order",
            state: rootOrderId ? "derived" : "missing",
            visibleByDefault: true,
            source: runtimeSource("root order derived from process order topology", `${processId}:root-order`),
        },
    ];

    if (currencyAddress) {
        attachments.push({
            id: `${processId}:currency`,
            mechanismId: "core-orders",
            targetType: "process",
            targetId: processId,
            label: "Settlement currency",
            description: `Runtime process settlement currency ${currencyAddress}.`,
            attachmentKind: "currency-binding",
            state: "active",
            visibleByDefault: true,
            source: ledgerSource("first process order currency", `${processId}:currency`),
        });
    }

    const activeCount = orders.filter((order) => order.state === OrderState.Active).length;
    const descendantCount = orders.filter((order) => !isRootOrder(order)).length;

    attachments.push({
        id: `${processId}:state-summary`,
        mechanismId: "core-orders",
        targetType: "process",
        targetId: processId,
        label: "Runtime state summary",
        description: `${activeCount} active, ${orders.length} total orders.`,
        attachmentKind: "state-summary",
        state: activeCount > 0 ? "active" : "closed",
        visibleByDefault: true,
        source: runtimeSource("aggregate order states within the process", `${processId}:state-summary`),
    });

    if (descendantCount > 0) {
        attachments.push({
            id: `${processId}:descendants`,
            mechanismId: "core-orders",
            targetType: "process",
            targetId: processId,
            label: "Composed descendants",
            description: `${descendantCount} descendant order${descendantCount === 1 ? "" : "s"} reference upstream value in this process.`,
            attachmentKind: "topology-summary",
            state: "composed",
            visibleByDefault: true,
            source: runtimeSource("sub-orders with cumulativeValue > payment create descendant topology", `${processId}:descendants`),
        });
    }

    const normalized = address?.toLowerCase();
    if (normalized) {
        const buyerCount = orders.filter((order) => hexEqual(order.buyer, normalized)).length;
        const sellerCount = orders.filter((order) => hexEqual(order.seller, normalized)).length;

        if (buyerCount > 0) {
            attachments.push({
                id: `${processId}:buyer-presence`,
                mechanismId: "core-orders",
                targetType: "process",
                targetId: processId,
                label: "Connected buyer presence",
                description: `The connected actor is buyer on ${buyerCount} order${buyerCount === 1 ? "" : "s"} in this process.`,
                attachmentKind: "actor-presence",
                state: "buyer",
                visibleByDefault: true,
                source: runtimeSource("connected wallet matches process order buyer fields", `${processId}:buyer-presence`),
            });
        }

        if (sellerCount > 0) {
            attachments.push({
                id: `${processId}:seller-presence`,
                mechanismId: "core-orders",
                targetType: "process",
                targetId: processId,
                label: "Connected seller presence",
                description: `The connected actor is seller on ${sellerCount} order${sellerCount === 1 ? "" : "s"} in this process.`,
                attachmentKind: "actor-presence",
                state: "seller",
                visibleByDefault: true,
                source: runtimeSource("connected wallet matches process order seller fields", `${processId}:seller-presence`),
            });
        }
    }

    return attachments;
}

function deriveOrderNodeModelFromOrder(
    order: Order,
    topology: Map<string, { parentOrderIds: string[] }>,
    address?: string,
    isE2EMock = false,
): OrderNodeModel {
    const attachments = deriveOrderAttachments(order, address);
    const parentOrderIds = topology.get(order.id)?.parentOrderIds ?? [];

    return {
        orderId: order.id.toString(),
        processId: order.processId,
        buyer: order.buyer as `0x${string}`,
        seller: order.seller as `0x${string}`,
        currency: order.currency as `0x${string}` | undefined,
        payment: order.payment,
        state: OrderState[order.state],
        parentOrderIds,
        agreementHash: (order.agreementHash ?? ZERO_BYTES32) as `0x${string}`,
        attachments,
        capabilities: roleCapabilities(order, address, isE2EMock),
        settlementBreakdown: deriveSettlementBreakdown(order, address),
    };
}

function deriveProcessRelations(
    processId: string,
    orders: Order[],
    topology: Map<string, { parentOrderIds: string[]; topologyMode: TopologyMode; sourceLabel: string }>,
): ProcessRelationModel[] {
    const relationModels: ProcessRelationModel[] = [];
    const knownOrderIds = new Set(orders.map((order) => order.id.toString()));

    orders.forEach((order) => {
        const orderTopology = topology.get(order.id);
        const parentOrderIds = (orderTopology?.parentOrderIds ?? []).filter(
            (parentOrderId) => parentOrderId !== order.id.toString() && knownOrderIds.has(parentOrderId),
        );

        parentOrderIds.forEach((parentOrderId) => {
            relationModels.push({
                id: `${processId}-${parentOrderId}-${order.id.toString()}`,
                processId,
                parentOrderId,
                childOrderId: order.id.toString(),
                relationKind: orderTopology?.topologyMode === "explicit"
                    ? "declared-parent-reference"
                    : "linear-fallback-reference",
                labels: orderTopology?.topologyMode === "explicit"
                    ? ["declared dependency", "agreement-defined edge", "same-process settlement path"]
                    : ["linear fallback", "previous-order dependency", "same-process settlement path"],
                referencedValue: {
                    label: "Sub-order payment reference",
                    amount: order.payment,
                    source: {
                        truthClass: "protocol-derived",
                        sourceLabel: "sub-order payment is the value added to the process",
                        referenceId: `${processId}:${order.id.toString()}:shared-reference`,
                    },
                },
                source: {
                    truthClass: "protocol-derived",
                    sourceLabel: orderTopology?.sourceLabel ?? "derived process topology",
                    referenceId: `${processId}:${parentOrderId}:${order.id.toString()}`,
                },
            });
        });
    });

    return relationModels;
}

export function deriveProcessModelFromRuntime(
    summary: ProcessSummary,
    orders: Order[],
    address?: string,
    currencyAddress?: string,
    isE2EMock = false,
): ProcessModel {
    const processOrders = orders
        .filter((order) => order.processId === summary.processId)
        .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
    const topology = deriveOrderTopology(processOrders);
    const semanticOrders = processOrders.map((order) => deriveOrderNodeModelFromOrder(order, topology, address, isE2EMock));
    const relations = deriveProcessRelations(summary.processId, processOrders, topology);
    const rootOrderId = semanticOrders.find((order) => order.parentOrderIds.length === 0)?.orderId ?? semanticOrders[0]?.orderId ?? "";
    const stateCounts = {
        active: processOrders.filter((order) => order.state === OrderState.Active).length,
        closed: processOrders.filter((order) => order.state === OrderState.Resolved).length,
    };
    const upstreamLinks = [...new Set(relations.map((relation) => relation.parentOrderId))];
    const downstreamLinks = [...new Set(relations.map((relation) => relation.childOrderId))];

    return {
        processId: summary.processId,
        rootOrderId,
        currency: processOrders[0]?.currency as `0x${string}` | undefined,
        orders: semanticOrders,
        relations,
        stateSummary: stateCounts.active > 0
            ? `Active · ${stateCounts.active} active / ${processOrders.length} total`
            : `Closed · ${stateCounts.closed} settled / ${processOrders.length} total`,
        capabilities: deriveProcessCapabilities(summary.processId, processOrders, address, isE2EMock),
        economicSummary: deriveProcessEconomicSummary(summary.processId, processOrders, address),
        attachments: deriveProcessAttachments(summary.processId, processOrders, rootOrderId, address, currencyAddress),
        upstreamLinks,
        downstreamLinks,
    };
}