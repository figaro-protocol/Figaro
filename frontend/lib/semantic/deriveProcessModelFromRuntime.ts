import { Order, OrderState } from "@/lib/core/store";
import {
    GHG_MEASUREMENT_CLAUSE_KEY,
    GHG_CLAUSE_KEY,
    MERCHANT_PROCESS_CLAUSE_KEY,
    COURIER_PROCESS_CLAUSE_KEY,
    PROXIMITY_POLICY_CLAUSE_KEY,
    PROXIMITY_PROOF_CLAUSE_KEY,
    FULFILMENT_V2_CLAUSE_KEY,
    getSection,
    type Agreement,
    type TopologyMode,
} from "@/lib/core/agreement";
import { deriveOrderTopology } from "@/lib/core/orderTopology";
import { ProcessSummary } from "@/hooks/core/useWalletProcessIds";
import type { RuntimeAttestation } from "@/lib/core/indexer";
import { clauseEnumOrdinal } from "@/lib/shared/clauseSpecSource";
import { ZERO_BYTES32, hexEqual } from "@/lib/shared/evm";
import {
    AttachmentModel,
    CapabilityModel,
    EconomicBreakdownModel,
    EconomicBreakdownValue,
    MerchantProcessEventKind,
    OrderNodeModel,
    ProcessModel,
    ProcessRelationModel,
} from "@/lib/semantic/models";
import { keccak256, stringToHex, type Hex } from "viem";

// Clause ids the runtime attestation log keys on (keccak256 of the clause key,
// exactly as the on-chain Attestation event carries it). Computed from the
// agreement clause keys — the builder is the one place that holds this mapping.
const MERCHANT_PROCESS_CLAUSE_ID = keccak256(stringToHex(MERCHANT_PROCESS_CLAUSE_KEY)).toLowerCase();
const COURIER_PROCESS_CLAUSE_ID = keccak256(stringToHex(COURIER_PROCESS_CLAUSE_KEY)).toLowerCase();
const PROXIMITY_PROOF_CLAUSE_ID = keccak256(stringToHex(PROXIMITY_PROOF_CLAUSE_KEY)).toLowerCase();

/** Merchant-process events SURFACED at runtime. order-received and accepted
 *  are core — the bilateral commit IS the arrival + approval — so the runtime
 *  ladder begins at prep-started. The on-chain stage of each is the clause's
 *  own enum ordinal (read from the spec, never hardcoded). */
type MerchantHappyEvent = "prep-started" | "ready-for-pickup" | "handed-off";
const MERCHANT_HAPPY_PATH: ReadonlyArray<MerchantHappyEvent> = [
    "prep-started",
    "ready-for-pickup",
    "handed-off",
];

// Terminal merchant stages + the two courier handoff edges, as enum ordinals
// read from the clause specs (the single source for on-chain enum indices).
const MERCHANT_HANDED_OFF_STAGE = clauseEnumOrdinal(MERCHANT_PROCESS_CLAUSE_KEY, "handed-off");
const MERCHANT_CANCELLED_STAGE = clauseEnumOrdinal(MERCHANT_PROCESS_CLAUSE_KEY, "cancelled");
const COURIER_ARRIVED_PICKUP_STAGE = clauseEnumOrdinal(COURIER_PROCESS_CLAUSE_KEY, "arrived-pickup");
const COURIER_ARRIVED_DROPOFF_STAGE = clauseEnumOrdinal(COURIER_PROCESS_CLAUSE_KEY, "arrived-dropoff");

/** Next merchant-process event the seller can fire, from the stages already
 *  attested. Null once handed-off or cancelled is reached. */
function nextMerchantEvent(seenStages: Set<number>): MerchantHappyEvent | null {
    if (seenStages.has(MERCHANT_HANDED_OFF_STAGE) || seenStages.has(MERCHANT_CANCELLED_STAGE)) return null;
    for (const event of MERCHANT_HAPPY_PATH) {
        if (!seenStages.has(clauseEnumOrdinal(MERCHANT_PROCESS_CLAUSE_KEY, event))) return event;
    }
    return null;
}

/** The committed proximity band index, read off an order's agreement
 *  figaro-proximity-policy-v1 section. The on-chain band is the proof clause's
 *  enum ordinal + 1 (the validator rejects band 0 / "None"). Defaults to 1. */
function committedBand(agreement: Agreement | undefined): number {
    if (!agreement) return 1;
    const bands = (getSection(agreement, PROXIMITY_POLICY_CLAUSE_KEY)?.data as { bands?: string[] } | undefined)?.bands ?? [];
    const ordinal = clauseEnumOrdinal(PROXIMITY_PROOF_CLAUSE_KEY, bands[0] ?? "");
    return ordinal >= 0 ? ordinal + 1 : 1;
}

/** The order whose committed figaro-proximity-policy-v1 a seller witnesses at
 *  the handoff: its own order when that carries the policy (pickup / on-site /
 *  a kit node), otherwise a downstream sub-order carrying it (the courier edge
 *  the root merchant cross-witnesses). Null when no order carries the policy. */
function proximityTargetOrder(
    order: Order,
    allOrders: Order[],
    agreements: Map<string, Agreement>,
): Order | null {
    const own = order.agreementHash ? agreements.get(order.agreementHash) : undefined;
    if (own && getSection(own, PROXIMITY_POLICY_CLAUSE_KEY)) return order;
    return allOrders.find((sibling) => {
        if (sibling.id === order.id || !sibling.agreementHash) return false;
        const agreement = agreements.get(sibling.agreementHash);
        return !!agreement && !!getSection(agreement, PROXIMITY_POLICY_CLAUSE_KEY);
    }) ?? null;
}

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

function roleCapabilities(
    _order: Order,
    allOrders: Order[],
    agreements: Map<string, Agreement>,
    attestations: RuntimeAttestation[],
    _address?: string,
    _isE2EMock = false,
): CapabilityModel[] {
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
    // "Submit commitment" / "Submit inventory" affordances on the
    // order page. Without this derivation the panel renders but its
    // submit buttons stay disabled (no executable capability).
    if (isSeller && order.agreementHash) {
        const agreement = agreements.get(order.agreementHash);
        if (agreement) {
            if (getSection(agreement, GHG_CLAUSE_KEY)) {
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
            if (getSection(agreement, GHG_MEASUREMENT_CLAUSE_KEY)) {
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

    // Lifecycle / handoff capabilities, gated on the clauses the agreement
    // carries AND the attestation state. Labels are the clause's own event
    // codes (one source — the clause), never frontend copy.
    const orderIdStr = order.id.toString();
    const agreement = order.agreementHash ? agreements.get(order.agreementHash) : undefined;
    const merchantStages = new Set(
        attestations
            .filter((a) => a.clauseId.toLowerCase() === MERCHANT_PROCESS_CLAUSE_ID && a.orderHash === orderIdStr)
            .map((a) => a.stage),
    );
    const courierStages = attestations
        .filter((a) => a.clauseId.toLowerCase() === COURIER_PROCESS_CLAUSE_ID && a.orderHash === orderIdStr)
        .map((a) => a.stage);
    const iAttestedProximity = !!normalized && attestations.some(
        (a) => a.clauseId.toLowerCase() === PROXIMITY_PROOF_CLAUSE_ID && hexEqual(a.attester, normalized),
    );

    // Seller — figaro-merchant-process-v1 lifecycle (prep-started →
    // ready-for-pickup → handed-off). The handoff pairs with a proximity-proof
    // cross-witness when the order (or a downstream sub-order) carries the
    // proximity policy.
    if (isSeller && agreement && getSection(agreement, MERCHANT_PROCESS_CLAUSE_KEY)) {
        const next = nextMerchantEvent(merchantStages);
        if (next === "prep-started" || next === "ready-for-pickup") {
            out.push({
                id: `${order.processId}:${orderIdStr}:merchant-${next}`,
                label: next,
                actionKind: "submit-merchant-process-signal",
                action: { executionType: "transaction", kind: "submit-merchant-process-signal", orderHash: orderIdStr, eventType: next },
                mechanismId: "attestation-coordinator",
                scopeType: "order",
                scopeId: orderIdStr,
                preconditions: ["seller-of-active-order", "merchant-process-clause-committed"],
                riskLabel: "standard",
                uiPriority: 75,
                source: runtimeSource("seller advances the merchant-process lifecycle", `${order.processId}:${orderIdStr}:merchant-${next}`),
            });
        } else if (next === "handed-off") {
            const target = proximityTargetOrder(order, allOrders, agreements);
            if (target && !iAttestedProximity) {
                out.push({
                    id: `${order.processId}:${orderIdStr}:merchant-handed-off-proof`,
                    label: "handed-off",
                    actionKind: "submit-merchant-process-signal-with-proof",
                    action: {
                        executionType: "transaction",
                        kind: "submit-merchant-process-signal-with-proof",
                        orderHash: orderIdStr,
                        proximityTargetOrderHash: target.id.toString(),
                        eventType: "handed-off",
                        band: committedBand(target.agreementHash ? agreements.get(target.agreementHash) : undefined),
                    },
                    mechanismId: "attestation-coordinator",
                    scopeType: "order",
                    scopeId: orderIdStr,
                    preconditions: ["seller-of-active-order", "merchant-process-clause-committed", "proximity-policy-committed"],
                    riskLabel: "standard",
                    uiPriority: 75,
                    source: runtimeSource("seller certifies the handoff with a proximity-proof cross-witness", `${order.processId}:${orderIdStr}:merchant-handed-off-proof`),
                });
            } else {
                out.push({
                    id: `${order.processId}:${orderIdStr}:merchant-handed-off`,
                    label: "handed-off",
                    actionKind: "submit-merchant-process-signal",
                    action: { executionType: "transaction", kind: "submit-merchant-process-signal", orderHash: orderIdStr, eventType: "handed-off" satisfies MerchantProcessEventKind },
                    mechanismId: "attestation-coordinator",
                    scopeType: "order",
                    scopeId: orderIdStr,
                    preconditions: ["seller-of-active-order", "merchant-process-clause-committed"],
                    riskLabel: "standard",
                    uiPriority: 75,
                    source: runtimeSource("seller marks the order handed off", `${order.processId}:${orderIdStr}:merchant-handed-off`),
                });
            }
        }
    }

    // Seller — figaro-courier-process-v1 handoff proximity proofs. The edge
    // (arrived-pickup → arrived-dropoff) advances with the courier stages
    // already attested; the capability retires once the dropoff is witnessed.
    if (isSeller && agreement && getSection(agreement, COURIER_PROCESS_CLAUSE_KEY)) {
        const hasDropoff = courierStages.some((s) => s >= COURIER_ARRIVED_DROPOFF_STAGE);
        if (!hasDropoff) {
            const eventType = courierStages.some((s) => s >= COURIER_ARRIVED_PICKUP_STAGE) ? "arrived-dropoff" : "arrived-pickup";
            out.push({
                id: `${order.processId}:${orderIdStr}:courier-${eventType}`,
                label: eventType,
                actionKind: "submit-courier-process-signal-with-proof",
                action: { executionType: "transaction", kind: "submit-courier-process-signal-with-proof", orderHash: orderIdStr, eventType, band: committedBand(agreement) },
                mechanismId: "attestation-coordinator",
                scopeType: "order",
                scopeId: orderIdStr,
                preconditions: ["seller-of-active-order", "courier-process-clause-committed"],
                riskLabel: "standard",
                uiPriority: 75,
                source: runtimeSource("courier certifies a delivery handoff with a proximity proof", `${order.processId}:${orderIdStr}:courier-${eventType}`),
            });
        }
    }

    // Buyer — symmetric proximity-proof witness at a buyer↔seller handoff with
    // no intermediary (the root carries the policy and the process is a single
    // order: pickup / on-site).
    if (isBuyer && agreement && getSection(agreement, PROXIMITY_POLICY_CLAUSE_KEY) && allOrders.length <= 1 && !iAttestedProximity) {
        out.push({
            id: `${order.processId}:${orderIdStr}:buyer-proximity-proof`,
            label: "proximity-proof",
            actionKind: "submit-buyer-proximity-proof",
            action: { executionType: "transaction", kind: "submit-buyer-proximity-proof", orderHash: orderIdStr, band: committedBand(agreement) },
            mechanismId: "attestation-coordinator",
            scopeType: "order",
            scopeId: orderIdStr,
            preconditions: ["buyer-of-active-order", "proximity-policy-committed"],
            riskLabel: "standard",
            uiPriority: 76,
            source: runtimeSource("buyer co-witnesses the handoff with a proximity proof", `${order.processId}:${orderIdStr}:buyer-proximity-proof`),
        });
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
    allOrders: Order[],
    topology: Map<string, { parentOrderIds: string[] }>,
    agreements: Map<string, Agreement>,
    attestations: RuntimeAttestation[],
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
        capabilities: roleCapabilities(order, allOrders, agreements, attestations, address, isE2EMock),
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
    agreements: Map<string, Agreement>,
    address?: string,
    currencyAddress?: string,
    isE2EMock = false,
    attestations: RuntimeAttestation[] = [],
): ProcessModel {
    const processOrders = orders
        .filter((order) => order.processId === summary.processId)
        .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
    const topology = deriveOrderTopology(processOrders, agreements);
    const semanticOrders = processOrders.map((order) => deriveOrderNodeModelFromOrder(order, processOrders, topology, agreements, attestations, address, isE2EMock));
    const relations = deriveProcessRelations(summary.processId, processOrders, topology);
    const rootOrderId = semanticOrders.find((order) => order.parentOrderIds.length === 0)?.orderId ?? semanticOrders[0]?.orderId ?? "";
    const rootOrder = processOrders.find((order) => order.id.toString() === rootOrderId);
    const rootAgreement = rootOrder?.agreementHash ? agreements.get(rootOrder.agreementHash) : undefined;
    const rootFulfilmentModality = rootAgreement
        ? ((getSection(rootAgreement, FULFILMENT_V2_CLAUSE_KEY)?.data as { modalities?: string[] } | undefined)?.modalities?.[0] ?? null)
        : null;
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
        rootFulfilmentModality,
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