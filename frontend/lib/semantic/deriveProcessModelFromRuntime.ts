import { Order, OrderState } from "@/lib/core/store";
import {
    getSection,
    type Agreement,
    type TopologyMode,
} from "@/lib/core/agreement";
import { sectionByField } from "@/lib/core/orderAgreement";
import { deriveOrderTopology } from "@/lib/core/orderTopology";
import { ProcessSummary } from "@/hooks/core/useWalletProcessIds";
import type { RuntimeAttestation } from "@/lib/core/indexer";
import { clauseTier, clauseLadderField, clauseAttestation, clauseHandoffStages, isCompanionClause, getClauseSpec, labelEnumValue } from "@/lib/shared/clauseSpecSource";
import { ZERO_BYTES32, hexEqual, clauseIdHash as clauseIdHashOf } from "@/lib/shared/evm";
import {
    AttachmentModel,
    CapabilityModel,
    EconomicBreakdownModel,
    EconomicBreakdownValue,
    OrderNodeModel,
    ProcessModel,
    ProcessRelationModel,
} from "@/lib/semantic/models";
import { keccak256, stringToHex, type Hex } from "viem";

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

/** The runtime proof clause an order's agreement carries (a companion enum,
 *  e.g. a proximity proof) at the band committed in its sister policy section
 *  on the same order — the order's hand-off pairing carrier. */
interface ProofCarrier {
    clauseId: string;
    clauseIdHash: string;
    stage: number;
    eventCode: string;
    ladderField: string;
}

/** Pre-indexed runtime state, built ONCE per process derivation so the
 *  per-order capability loop stays O(orders + attestations). The kernel's
 *  resolve ceiling (~2,145 orders / 30M gas) must flow through this deriver
 *  without quadratic blowup — per-order scans of the full attestation array
 *  are the O(N²) shape this bundle exists to prevent. */
interface RuntimeIndexes {
    /** Attestations grouped by the order they target. */
    attestationsByOrder: Map<string, RuntimeAttestation[]>;
    /** Per order id: its proof carrier (see ProofCarrier). */
    proofCarrierByOrder: Map<string, ProofCarrier>;
    /** Off-chain topology edges, both directions, keyed by order id. */
    childrenByOrder: Map<string, string[]>;
    parentsByOrder: Map<string, string[]>;
}

function buildRuntimeIndexes(
    processOrders: Order[],
    topology: Map<string, { parentOrderIds: string[] }>,
    agreements: Map<string, Agreement>,
    attestations: RuntimeAttestation[],
): RuntimeIndexes {
    const attestationsByOrder = new Map<string, RuntimeAttestation[]>();
    for (const attestation of attestations) {
        const list = attestationsByOrder.get(attestation.orderHash);
        if (list) list.push(attestation);
        else attestationsByOrder.set(attestation.orderHash, [attestation]);
    }

    const proofCarrierByOrder = new Map<string, ProofCarrier>();
    for (const order of processOrders) {
        const agreement = order.agreementHash ? agreements.get(order.agreementHash) : undefined;
        if (!agreement) continue;
        for (const section of agreement.sections) {
            const clauseId = section.clause;
            if (clauseTier(clauseId) !== "runtime" || !isCompanionClause(clauseId)) continue;
            const ladder = clauseLadderField(clauseId);
            if (!ladder) continue;
            // Band committed in the sister policy section on this order.
            const policyId = getClauseSpec(clauseId)?.block?.sisterClauseId;
            const bands = policyId
                ? ((getSection(agreement, policyId)?.data as { bands?: string[] } | undefined)?.bands ?? [])
                : [];
            const eventCode = bands[0] ?? ladder.values[0];
            proofCarrierByOrder.set(order.id.toString(), {
                clauseId,
                clauseIdHash: clauseIdHashOf(clauseId, section.version).toLowerCase(),
                stage: Math.max(0, ladder.values.indexOf(eventCode)),
                eventCode,
                ladderField: ladder.name,
            });
            break; // the first runtime proof is the order's hand-off carrier
        }
    }

    const childrenByOrder = new Map<string, string[]>();
    const parentsByOrder = new Map<string, string[]>();
    for (const order of processOrders) {
        const id = order.id.toString();
        const parents = topology.get(order.id)?.parentOrderIds ?? [];
        parentsByOrder.set(id, parents);
        for (const parent of parents) {
            const children = childrenByOrder.get(parent);
            if (children) children.push(id);
            else childrenByOrder.set(parent, [id]);
        }
    }

    return { attestationsByOrder, proofCarrierByOrder, childrenByOrder, parentsByOrder };
}

/** The order whose agreement carries the proximity proof for a hand-off on
 *  `orderId`: the order itself, else a topology-adjacent order (child first,
 *  then parent) — the cross-order witness case. */
function findProofCarrierOrder(orderId: string, indexes: RuntimeIndexes): string | null {
    if (indexes.proofCarrierByOrder.has(orderId)) return orderId;
    for (const child of indexes.childrenByOrder.get(orderId) ?? []) {
        if (indexes.proofCarrierByOrder.has(child)) return child;
    }
    for (const parent of indexes.parentsByOrder.get(orderId) ?? []) {
        if (indexes.proofCarrierByOrder.has(parent)) return parent;
    }
    return null;
}

/** True when this order's agreement still has a hand-off lifecycle stage the
 *  seller has not attested — the seller's proof witness will arrive PAIRED
 *  with that stage, so the standalone proof button stays suppressed. */
function sellerHasPendingHandoffStage(
    agreement: Agreement,
    orderAttestations: RuntimeAttestation[],
    sellerAddr: string,
): boolean {
    for (const section of agreement.sections) {
        const clauseId = section.clause;
        if (clauseTier(clauseId) !== "runtime" || isCompanionClause(clauseId)) continue;
        const handoffStages = clauseHandoffStages(clauseId);
        if (handoffStages.length === 0) continue;
        const ladder = clauseLadderField(clauseId);
        if (!ladder) continue;
        const clauseIdHash = clauseIdHashOf(clauseId, section.version);
        const seen = new Set(
            orderAttestations
                .filter((a) => hexEqual(a.clauseId, clauseIdHash) && hexEqual(a.attester, sellerAddr))
                .map((a) => a.stage),
        );
        for (const stage of handoffStages) {
            const ordinal = ladder.values.indexOf(stage);
            if (ordinal >= 0 && !seen.has(ordinal)) return true;
        }
    }
    return false;
}

function roleCapabilities(
    _order: Order,
    agreements: Map<string, Agreement>,
    indexes: RuntimeIndexes,
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
            // Spec-driven, no clause names: a committed clause whose spec block
            // declares the `disclosure` mechanism surfaces the commitment
            // capability; its runtime COMPANION (the measurement clause some
            // disclosure spec names as `sisterClauseId`) surfaces the inventory
            // capability. Each kind pushes at most once per order.
            let disclosureClauseId: string | null = null;
            let measurementClauseId: string | null = null;
            for (const section of agreement.sections) {
                const block = getClauseSpec(section.clause)?.block;
                if (!block?.mechanismKinds?.includes("disclosure")) continue;
                if (isCompanionClause(section.clause)) measurementClauseId = section.clause;
                else disclosureClauseId = section.clause;
            }
            if (disclosureClauseId) {
                out.push({
                    id: `${order.processId}:${order.id.toString()}:submit-disclosure-commitment`,
                    label: "Record Disclosure Commitment",
                    actionKind: "submit-disclosure-commitment",
                    action: {
                        executionType: "transaction",
                        kind: "submit-disclosure-commitment",
                        orderHash: order.id.toString(),
                        clauseId: disclosureClauseId,
                    },
                    mechanismId: "attestation-coordinator",
                    scopeType: "order",
                    scopeId: order.id.toString(),
                    preconditions: ["seller-of-active-order", "disclosure-clause-committed"],
                    riskLabel: "standard",
                    uiPriority: 70,
                    source: runtimeSource(
                        "seller may attest a disclosure commitment when a disclosure clause is committed",
                        `${order.processId}:${order.id.toString()}:submit-disclosure-commitment`,
                    ),
                });
            }
            if (measurementClauseId) {
                out.push({
                    id: `${order.processId}:${order.id.toString()}:submit-disclosure-inventory`,
                    label: "Submit Emissions Inventory",
                    actionKind: "submit-disclosure-inventory",
                    action: {
                        executionType: "transaction",
                        kind: "submit-disclosure-inventory",
                        orderHash: order.id.toString(),
                        clauseId: measurementClauseId,
                    },
                    mechanismId: "attestation-coordinator",
                    scopeType: "order",
                    scopeId: order.id.toString(),
                    preconditions: ["seller-of-active-order", "measurement-clause-committed"],
                    riskLabel: "standard",
                    uiPriority: 70,
                    source: runtimeSource(
                        "seller may attest a runtime measurement when a disclosure clause's runtime companion is committed",
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

    // GENERIC runtime attestation. Every category-1 clause the order's agreement
    // carries declares WHO attests in its spec (block.attestation: seller |
    // bilateral). Lifecycle clauses (non-companion enum: merchant/courier/…)
    // advance their enum ladder; proof clauses (companion enum: proximity-proof)
    // are a single attestation at the band committed in the sister policy. Both
    // parties of a bilateral clause get their own capability. A lifecycle stage
    // listed in the clause's `block.handoffStages` is a physical hand-off: the
    // seller's capability PAIRS the proximity proof from the carrying order
    // (own order, else the topology-adjacent carrier — the cross-order witness),
    // and the seller's standalone proof button stays suppressed while a pairing
    // stage is pending. No clause names — a permissionlessly-registered clause
    // flows through this loop unchanged.
    if (agreement) {
        const orderAttestations = indexes.attestationsByOrder.get(orderIdStr) ?? [];
        for (const section of agreement.sections) {
            const clauseId = section.clause;
            if (clauseTier(clauseId) !== "runtime") continue;          // category-1 only
            const ladder = clauseLadderField(clauseId);
            if (!ladder) continue;                                     // non-enum (e.g. ghg grams) → its own surface
            const clauseIdHash = clauseIdHashOf(clauseId, section.version).toLowerCase();
            const isProof = isCompanionClause(clauseId);               // a proof of a committed clause
            const parties: Array<"seller" | "buyer"> =
                clauseAttestation(clauseId) === "bilateral" ? ["seller", "buyer"] : ["seller"];

            for (const party of parties) {
                if (party === "seller" ? !isSeller : !isBuyer) continue;
                const partyAddr = party === "seller" ? order.seller : order.buyer;
                const mine = orderAttestations.filter(
                    (a) => hexEqual(a.clauseId, clauseIdHash)
                        && hexEqual(a.attester, partyAddr),
                );
                let stage: number;
                let eventCode: string;
                let pairedProof: { clauseId: string; orderHash: string; stage: number; eventCode: string; ladderField: string } | undefined;
                if (isProof) {
                    if (mine.length > 0) continue;                     // this party already witnessed
                    // The seller's witness arrives paired with a pending
                    // hand-off stage when this clause is the order's carrier.
                    if (party === "seller"
                        && indexes.proofCarrierByOrder.get(orderIdStr)?.clauseId === clauseId
                        && sellerHasPendingHandoffStage(agreement, orderAttestations, partyAddr)) continue;
                    // band committed in the sister policy section on this order.
                    const policyId = getClauseSpec(clauseId)?.block?.sisterClauseId;
                    const bands = policyId
                        ? ((getSection(agreement, policyId)?.data as { bands?: string[] } | undefined)?.bands ?? [])
                        : [];
                    eventCode = bands[0] ?? ladder.values[0];
                    stage = Math.max(0, ladder.values.indexOf(eventCode));
                } else {
                    const seen = new Set(mine.map((a) => a.stage));
                    stage = ladder.values.findIndex((_v, i) => !seen.has(i));
                    if (stage < 0) continue;                           // ladder fully attested
                    eventCode = ladder.values[stage];
                    if (party === "seller" && clauseHandoffStages(clauseId).includes(eventCode)) {
                        const carrierOrderId = findProofCarrierOrder(orderIdStr, indexes);
                        const carrier = carrierOrderId ? indexes.proofCarrierByOrder.get(carrierOrderId) : undefined;
                        if (carrierOrderId && carrier) {
                            const witnessed = (indexes.attestationsByOrder.get(carrierOrderId) ?? []).some(
                                (a) => hexEqual(a.clauseId, carrier.clauseIdHash)
                                    && hexEqual(a.attester, partyAddr),
                            );
                            if (!witnessed) {
                                pairedProof = {
                                    clauseId: carrier.clauseId,
                                    orderHash: carrierOrderId,
                                    stage: carrier.stage,
                                    eventCode: carrier.eventCode,
                                    ladderField: carrier.ladderField,
                                };
                            }
                        }
                    }
                }
                const capId = `${order.processId}:${orderIdStr}:${clauseId}-${party}-${eventCode}`;
                out.push({
                    id: capId,
                    label: labelEnumValue(ladder, eventCode),
                    eventCode,
                    actionKind: "submit-clause-attestation",
                    action: {
                        executionType: "transaction",
                        kind: "submit-clause-attestation",
                        orderHash: orderIdStr,
                        clauseId,
                        stage,
                        eventCode,
                        ladderField: ladder.name,
                        party,
                        ...(isProof ? { isProof: true } : {}),
                        ...(pairedProof ? { pairedProof } : {}),
                    },
                    mechanismId: "attestation-coordinator",
                    scopeType: "order",
                    scopeId: orderIdStr,
                    preconditions: [party === "seller" ? "seller-of-active-order" : "buyer-of-active-order"],
                    riskLabel: "standard",
                    uiPriority: party === "buyer" ? 76 : 75,
                    source: runtimeSource(
                        pairedProof
                            ? `${party} attests ${clauseId} ${eventCode}, pairing the ${pairedProof.clauseId} witness on order ${pairedProof.orderHash}`
                            : `${party} attests ${clauseId} ${eventCode}`,
                        capId,
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
            label: "Resolve & release funds",
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
    agreements: Map<string, Agreement>,
    indexes: RuntimeIndexes,
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
        capabilities: roleCapabilities(order, agreements, indexes, address, isE2EMock),
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
    // Built ONCE per derivation — the per-order loop reads these maps so the
    // whole model stays O(orders + attestations) at the resolve ceiling.
    const indexes = buildRuntimeIndexes(processOrders, topology, agreements, attestations);
    const semanticOrders = processOrders.map((order) => deriveOrderNodeModelFromOrder(order, topology, agreements, indexes, address, isE2EMock));
    const relations = deriveProcessRelations(summary.processId, processOrders, topology);
    const rootOrderId = semanticOrders.find((order) => order.parentOrderIds.length === 0)?.orderId ?? semanticOrders[0]?.orderId ?? "";
    const rootOrder = processOrders.find((order) => order.id.toString() === rootOrderId);
    const rootAgreement = rootOrder?.agreementHash ? agreements.get(rootOrder.agreementHash) : undefined;
    // The modality section is found by its declared field, never by name.
    // Single-select: one scalar value per order.
    const rootModality = rootAgreement
        ? ((sectionByField(rootAgreement, "modality")?.data as { modality?: string } | undefined)?.modality ?? null)
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
        rootModality,
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