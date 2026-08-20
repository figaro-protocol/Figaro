import { Order, OrderState } from "@/lib/kernel/store";
import type { Agreement } from "@figaro-protocol/sdk";
import { sectionByField } from "@figaro-protocol/sdk";
import { deriveOrderTopology } from "@/lib/semantic/processTopology";
import type { PartyRole, ProcessSummary } from "@/lib/kernel/walletProcessQueries";
import type { RuntimeAttestation } from "@/lib/composition/indexer";
import { clauseIsProcessLog, clauseLadderField, clauseWitnessStages, getClauseSpec, labelEnumValue, specSource } from "@/lib/shared/clauseSpecSource";
import { computeClauseKey } from "@figaro-protocol/sdk";
import { ZERO_BYTES32, hexEqual } from "@/lib/shared/evm";
import {
    AttachmentModel,
    CapabilityModel,
    EconomicBreakdownModel,
    EconomicBreakdownValue,
    OrderNodeModel,
    ProcessModel,
} from "@/lib/semantic/models";

// Rootness is a TOPOLOGY concept (no parent edges in the committed topology
// section) — never derived from bond arithmetic. Bonding is kernel-layer,
// linear, and has nothing to do with topology (maintainer ruling 2026-07-02).

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

/** Pre-indexed runtime state, built ONCE per process derivation so the
 *  per-order capability loop stays O(orders + attestations). The kernel's
 *  resolve ceiling (~1,240 orders / 30M gas) must flow through this deriver
 *  without quadratic blowup — per-order scans of the full attestation array
 *  are the O(N²) shape this bundle exists to prevent. */
interface RuntimeIndexes {
    /** Attestations grouped by the order they target. */
    attestationsByOrder: Map<string, RuntimeAttestation[]>;
    /** Off-chain topology edges, both directions, keyed by order id. */
    childrenByOrder: Map<string, string[]>;
    parentsByOrder: Map<string, string[]>;
}

function buildRuntimeIndexes(
    processOrders: Order[],
    topology: Map<string, string[]>,
    agreements: Map<string, Agreement>,
    attestations: RuntimeAttestation[],
): RuntimeIndexes {
    const attestationsByOrder = new Map<string, RuntimeAttestation[]>();
    for (const attestation of attestations) {
        const list = attestationsByOrder.get(attestation.orderHash);
        if (list) list.push(attestation);
        else attestationsByOrder.set(attestation.orderHash, [attestation]);
    }

    const childrenByOrder = new Map<string, string[]>();
    const parentsByOrder = new Map<string, string[]>();
    for (const order of processOrders) {
        const id = order.orderHash.toString();
        const parents = topology.get(order.orderHash) ?? [];
        parentsByOrder.set(id, parents);
        for (const parent of parents) {
            const children = childrenByOrder.get(parent);
            if (children) children.push(id);
            else childrenByOrder.set(parent, [id]);
        }
    }

    return { attestationsByOrder, childrenByOrder, parentsByOrder };
}

function roleCapabilities(
    _order: Order,
    agreements: Map<string, Agreement>,
    indexes: RuntimeIndexes,
    _address?: string,
): CapabilityModel[] {
    const order = _order;
    if (order.state !== OrderState.Active || !order.currency) return [];

    const normalized = _address?.toLowerCase();
    const isBuyer = hexEqual(order.buyer, normalized);
    const isSeller = hexEqual(order.seller, normalized);

    // DERIVE means derive: this model READS the committed process — it never
    // alters it. The process shape is fixed by the assembly the buyer selected
    // at checkout; there is no runtime composition (maintainer ruling 2026-07-02).
    const out: CapabilityModel[] = [];

    // Lifecycle / handoff capabilities, gated on the clauses the agreement
    // carries AND the attestation state. Labels are the clause's own event
    // codes (one source — the clause), never frontend copy.
    const orderIdStr = order.orderHash.toString();
    const agreement = order.agreementHash ? agreements.get(order.agreementHash) : undefined;

    // GENERIC runtime attestation: any PROCESS-LOG clause (attestations
    // article — the clause's own declared kind) advances its transfer ladder,
    // seller-side. No clause names — a permissionlessly-registered process-log
    // clause flows through this loop unchanged. Committed-choice enum clauses
    // (coordination article, e.g. modalities) are content, not lifecycles —
    // classifying by "has an enum" fabricated seller capabilities for them.
    if (agreement) {
        const orderAttestations = indexes.attestationsByOrder.get(orderIdStr) ?? [];
        for (const section of agreement.sections) {
            const clauseId = section.clause;
            if (!clauseIsProcessLog(clauseId)) continue;               // only attestations-article ladders are lifecycles
            const ladder = clauseLadderField(clauseId);
            if (!ladder) continue;                                     // process-log clause without a declared ladder yet → nothing to advance
            const clauseIdHash = computeClauseKey(clauseId, section.version).toLowerCase();
            const parties: Array<PartyRole> = ["seller"];

            for (const party of parties) {
                if (party === "seller" ? !isSeller : !isBuyer) continue;
                const partyAddr = party === "seller" ? order.seller : order.buyer;
                const mine = orderAttestations.filter(
                    (a) => hexEqual(a.clauseId, clauseIdHash)
                        && hexEqual(a.attester, partyAddr),
                );
                const seen = new Set(mine.map((a) => a.stage));
                const stage = ladder.values.findIndex((_v, i) => !seen.has(i));
                if (stage < 0) continue;                               // ladder fully attested
                const eventCode = ladder.values[stage];
                const capId = `${order.processId}:${orderIdStr}:${clauseId}-${party}-${eventCode}`;
                // The ladder's COMPANION fields (every declared field that
                // isn't the ladder enum itself — an evidence pointer, a note)
                // ride the same generic form the witness stages use: the spec
                // declares, the rail renders, the fill lands in the encoded
                // content beside the event code. No field is named here.
                const companions = getClauseSpec(clauseId, section.version)
                    ?.fields.filter((f) => f.name !== ladder.name) ?? [];
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
                    },
                    ...(companions.length > 0 ? { inputFields: companions } : {}),
                    mechanismId: "attestation-coordinator",
                    scopeType: "order",
                    scopeId: orderIdStr,
                    preconditions: [party === "seller" ? "seller-of-active-order" : "buyer-of-active-order"],
                    riskLabel: "standard",
                    uiPriority: party === "buyer" ? 76 : 75,
                    source: runtimeSource(`${party} attests ${clauseId} ${eventCode}`, capId),
                });
            }
        }

        // GENERIC witness stages: any composed clause DECLARING spec.stages[N]
        // surfaces a runtime witness capability at N — a temperature record,
        // measured grams, a detected band. Declaration is the signal (a
        // never-seen clause participates by declaring); the form is generated
        // from the declared stage's fields. Offered to BOTH parties — who must
        // witness is never engine policy (a dead-drop seller attests with a
        // device identifier in lieu of the buyer; sufficiency is derived at
        // read time against the committed policy) — and REPEATABLE while the
        // order is active (one attestation per reporting period; the evidence
        // window closes at resolve, on-chain and here).
        for (const section of agreement.sections) {
            const clauseId = section.clause;
            if (clauseIsProcessLog(clauseId)) continue;                // a ladder's stage overrides shape its content, not a witness
            for (const witness of clauseWitnessStages(clauseId, section.version)) {
                const title = getClauseSpec(clauseId, section.version)?.title ?? clauseId;
                for (const party of ["seller", "buyer"] as const) {
                    if (party === "seller" ? !isSeller : !isBuyer) continue;
                    const capId = `${order.processId}:${orderIdStr}:${clauseId}-${party}-stage-${witness.stage}`;
                    out.push({
                        id: capId,
                        label: title,
                        eventCode: `stage-${witness.stage}`,
                        actionKind: "submit-clause-attestation",
                        action: {
                            executionType: "transaction",
                            kind: "submit-clause-attestation",
                            orderHash: orderIdStr,
                            clauseId,
                            stage: witness.stage,
                            party,
                        },
                        inputFields: witness.fields,
                        mechanismId: "attestation-coordinator",
                        scopeType: "order",
                        scopeId: orderIdStr,
                        preconditions: [party === "seller" ? "seller-of-active-order" : "buyer-of-active-order"],
                        riskLabel: "standard",
                        uiPriority: party === "buyer" ? 66 : 65,
                        source: runtimeSource(`${party} witnesses ${clauseId} stage ${witness.stage}`, capId),
                    });
                }
            }
        }

        // GENERIC re-assert: any OTHER committed section can be affirmed
        // on-chain as an attestation whose content IS the committed
        // sectionData (the coordinator's omit-content default) — the act that
        // turns committed content into a timestamped runtime event (the
        // designer-credit provenance attestation is one instance; geo and
        // modality are others — no clause is named here). Offered to BOTH
        // parties, once each per section (a repeat adds nothing: same bytes,
        // same contentRef). Process-log ladders advance instead — their
        // lifecycle IS their attestation — and a clause declaring witness
        // stage 0 owns that slot with its own form.
        for (const section of agreement.sections) {
            const clauseId = section.clause;
            if (clauseIsProcessLog(clauseId)) continue;
            if (clauseWitnessStages(clauseId, section.version).some((w) => w.stage === 0)) continue;
            const clauseIdHash = computeClauseKey(clauseId, section.version).toLowerCase();
            const title = getClauseSpec(clauseId, section.version)?.title ?? clauseId;
            for (const party of ["seller", "buyer"] as const) {
                if (party === "seller" ? !isSeller : !isBuyer) continue;
                const partyAddr = party === "seller" ? order.seller : order.buyer;
                const already = orderAttestations.some(
                    (a) => hexEqual(a.clauseId, clauseIdHash) && hexEqual(a.attester, partyAddr) && a.stage === 0,
                );
                if (already) continue;
                const capId = `${order.processId}:${orderIdStr}:${clauseId}-${party}-reassert`;
                out.push({
                    id: capId,
                    label: `Re-assert: ${title}`,
                    // Its OWN actionKind (→ its own `capability-*` testid): the
                    // rail renders many attestation cards per order, and the
                    // re-assert card must never collide with a ladder/witness
                    // card's locator. Dispatch still routes on `action.kind`.
                    actionKind: "reassert-committed-section",
                    action: {
                        executionType: "transaction",
                        kind: "submit-clause-attestation",
                        orderHash: orderIdStr,
                        clauseId,
                        stage: 0,
                        party,
                        reasserts: true,
                    },
                    mechanismId: "attestation-coordinator",
                    scopeType: "order",
                    scopeId: orderIdStr,
                    preconditions: [party === "seller" ? "seller-of-active-order" : "buyer-of-active-order"],
                    riskLabel: "standard",
                    uiPriority: party === "buyer" ? 56 : 55,
                    source: runtimeSource(`${party} re-asserts ${clauseId}`, capId),
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
): CapabilityModel[] {
    if (!address) return [];

    const normalized = address?.toLowerCase();
    const capabilities: CapabilityModel[] = [];
    const canResolve = orders.some(
        (order) => order.state === OrderState.Active && hexEqual(order.buyer, normalized),
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

function deriveSettlementBreakdown(order: Order, parentOrderHashes: string[], address?: string): EconomicBreakdownModel | undefined {
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
            referenceId: `${order.processId}:${order.orderHash.toString()}:payment`,
        },
    });

    if (isBuyer) {
        typedOutputs.push({
            label: "Buyer bond obligation",
            amount: order.buyerBond,
            source: {
                truthClass: "protocol-derived",
                sourceLabel: "2x payment buyer bond rule",
                referenceId: `${order.processId}:${order.orderHash.toString()}:buyer-bond`,
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
                referenceId: `${order.processId}:${order.orderHash.toString()}:seller-bond`,
            },
        });
    }

    return {
        scopeType: "order",
        scopeId: order.orderHash.toString(),
        lockedBond: {
            label: isBuyer ? "Buyer bond" : "Seller bond",
            amount: isBuyer ? order.buyerBond : order.sellerBond,
            source: {
                truthClass: "protocol-derived",
                sourceLabel: "order-derived bond obligation",
                referenceId: `${order.processId}:${order.orderHash.toString()}:locked-bond`,
            },
        },
        typedOutputs,
        downstreamReferencedAmount: parentOrderHashes.length > 0
            ? {
                label: "Downstream referenced value",
                amount: order.payment,
                source: {
                    truthClass: "protocol-derived",
                    sourceLabel: "sub-order payment references upstream process value",
                    referenceId: `${order.processId}:${order.orderHash.toString()}:downstream-reference`,
                },
            }
            : undefined,
    };
}

function deriveProcessEconomicSummary(
    processId: string,
    orders: Order[],
    topology: Map<string, string[]>,
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
        .filter((order) => (topology.get(order.orderHash) ?? []).length > 0)
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

function deriveOrderAttachments(order: Order, parentOrderHashes: string[], address?: string): AttachmentModel[] {
    const attachments: AttachmentModel[] = [];
    const orderId = order.orderHash.toString();
    const normalized = address?.toLowerCase();

    if (parentOrderHashes.length === 0) {
        attachments.push({
            id: `${order.processId}:${orderId}:root`,
            mechanismId: "core-orders",
            targetType: "order",
            targetId: orderId,
            label: "Root order",
            description: "This order anchors the process (no parent orders in its committed topology).",
            attachmentKind: "topology-root",
            state: "derived",
            visibleByDefault: true,
            source: runtimeSource("no topology parents identifies the root order", `${order.processId}:${orderId}:root`),
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
            source: runtimeSource("committed topology parents identify a sub-order", `${order.processId}:${orderId}:child`),
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
    const descendantCount = orders.filter((order) => order.orderHash.toString() !== rootOrderId).length;

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
            source: runtimeSource("orders beyond the topology root are descendants", `${processId}:descendants`),
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
    topology: Map<string, string[]>,
    agreements: Map<string, Agreement>,
    indexes: RuntimeIndexes,
    address?: string,
): OrderNodeModel {
    const parentOrderHashes = topology.get(order.orderHash) ?? [];
    const attachments = deriveOrderAttachments(order, parentOrderHashes, address);

    return {
        orderId: order.orderHash.toString(),
        processId: order.processId,
        buyer: order.buyer as `0x${string}`,
        seller: order.seller as `0x${string}`,
        currency: order.currency as `0x${string}` | undefined,
        payment: order.payment,
        state: OrderState[order.state],
        parentOrderHashes,
        agreementHash: (order.agreementHash ?? ZERO_BYTES32) as `0x${string}`,
        attachments,
        capabilities: roleCapabilities(order, agreements, indexes, address),
        settlementBreakdown: deriveSettlementBreakdown(order, parentOrderHashes, address),
    };
}

export function deriveProcessModelFromRuntime(
    summary: ProcessSummary,
    orders: Order[],
    agreements: Map<string, Agreement>,
    address?: string,
    currencyAddress?: string,
    attestations: RuntimeAttestation[] = [],
): ProcessModel {
    const processOrders = orders
        .filter((order) => order.processId === summary.processId)
        .sort((left, right) => (left.orderHash < right.orderHash ? -1 : left.orderHash > right.orderHash ? 1 : 0));
    const topology = deriveOrderTopology(processOrders, agreements);
    // Built ONCE per derivation — the per-order loop reads these maps so the
    // whole model stays O(orders + attestations) at the resolve ceiling.
    const indexes = buildRuntimeIndexes(processOrders, topology, agreements, attestations);
    const semanticOrders = processOrders.map((order) => deriveOrderNodeModelFromOrder(order, topology, agreements, indexes, address));
    const rootOrderId = semanticOrders.find((order) => order.parentOrderHashes.length === 0)?.orderId ?? semanticOrders[0]?.orderId ?? "";
    const rootOrder = processOrders.find((order) => order.orderHash.toString() === rootOrderId);
    const rootAgreement = rootOrder?.agreementHash ? agreements.get(rootOrder.agreementHash) : undefined;
    // The modality section is found by its declared field, never by name.
    // Single-select: one scalar value per order.
    const rootModality = rootAgreement
        ? ((sectionByField(rootAgreement, "modality", specSource())?.data as { modality?: string } | undefined)?.modality ?? null)
        : null;
    const stateCounts = {
        active: processOrders.filter((order) => order.state === OrderState.Active).length,
        closed: processOrders.filter((order) => order.state === OrderState.Resolved).length,
    };
    return {
        processId: summary.processId,
        rootOrderId,
        currency: processOrders[0]?.currency as `0x${string}` | undefined,
        rootModality,
        orders: semanticOrders,
        stateSummary: stateCounts.active > 0
            ? `Active · ${stateCounts.active} active / ${processOrders.length} total`
            : `Closed · ${stateCounts.closed} settled / ${processOrders.length} total`,
        capabilities: deriveProcessCapabilities(summary.processId, processOrders, address),
        economicSummary: deriveProcessEconomicSummary(summary.processId, processOrders, topology, address),
        attachments: deriveProcessAttachments(summary.processId, processOrders, rootOrderId, address, currencyAddress),
    };
}