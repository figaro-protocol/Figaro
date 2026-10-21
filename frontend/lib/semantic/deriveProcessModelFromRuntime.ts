import { Order, OrderState } from "@/lib/kernel/store";
import type { Agreement } from "@figaro-protocol/sdk";
import { clauseByField } from "@figaro-protocol/sdk";
import { deriveOrderTopology } from "@/lib/semantic/processTopology";
import type { PartyRole, ProcessSummary } from "@/lib/kernel/walletProcessQueries";
import type { RuntimeAttestation } from "@/lib/composition/indexer";
import { clauseIsProcessLog, clauseLadderField, clauseWitnessStages, getClauseSpec, labelEnumValue, specSource } from "@/lib/shared/clauseSpecSource";
import { PROVENANCE_LEAF_KEY } from "@figaro-protocol/sdk";
import { ZERO_BYTES32, hexEqual } from "@/lib/shared/evm";
import { truncateHex } from "@/lib/shared/formatHex";
import {
    CapabilityModel,
    EconomicBreakdownModel,
    EconomicBreakdownValue,
    OrderNodeModel,
    ProcessModel,
} from "@/lib/semantic/models";

// Rootness is a TOPOLOGY concept (no parent edges in the committed topology
// clause) — never derived from bond arithmetic. Bonding is Core-layer,
// linear, and has nothing to do with topology.

function runtimeSource(sourceLabel: string, referenceId?: string) {
    return {
        truthClass: "protocol-derived" as const,
        sourceLabel,
        referenceId,
    };
}

/** Pre-indexed runtime state, built ONCE per process derivation so the
 *  per-order capability loop stays O(orders + attestations). FigaroCore's
 *  resolve ceiling (about 550 orders under the chain's cap on one
 *  transaction's gas) must flow through this deriver
 *  without quadratic blowup — per-order scans of the full attestation array
 *  are the O(N²) shape this bundle exists to prevent. */
interface RuntimeIndexes {
    /** Attestations grouped by the order they target. */
    attestationsByOrder: Map<string, RuntimeAttestation[]>;
    /** Off-chain topology edges, both directions, keyed by order id. */
    childrenByOrder: Map<string, string[]>;
    parentsByOrder: Map<string, string[]>;
    /** Each order's 1-based position on the process chain, by id. */
    positionByOrder: Map<string, number>;
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

    // Position on the process chain: the Core accepts each commit only at the
    // process's running cumulative value plus a non-zero payment, so the
    // cumulative value rises strictly in commit order and ranks the orders.
    const byChain = processOrders.slice().sort((left, right) =>
        left.cumulativeValue < right.cumulativeValue ? -1 : left.cumulativeValue > right.cumulativeValue ? 1 : 0);
    const positionByOrder = new Map(byChain.map((order, i) => [order.orderHash.toString(), i + 1]));

    return { attestationsByOrder, childrenByOrder, parentsByOrder, positionByOrder };
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
    // at checkout; there is no runtime composition.
    const out: CapabilityModel[] = [];

    // Lifecycle / handoff capabilities, gated on the clauses the agreement
    // carries AND the attestation state. Labels are the clause's own event
    // codes (one source — the clause), never frontend copy.
    const orderIdStr = order.orderHash.toString();
    const agreement = order.checkoutHash ? agreements.get(order.checkoutHash) : undefined;

    // GENERIC runtime attestation: any PROCESS-LOG clause (attestations
    // article — the clause's own declared kind) advances its transfer ladder,
    // seller-side. No clause names — a permissionlessly-registered process-log
    // clause flows through this loop unchanged. Committed-choice enum clauses
    // (coordination article, e.g. modalities) are content, not lifecycles —
    // classifying by "has an enum" fabricated seller capabilities for them.
    if (agreement) {
        const orderAttestations = indexes.attestationsByOrder.get(orderIdStr) ?? [];
        for (const clauseEntry of agreement.clauses) {
            const clauseKey = clauseEntry.clause;
            if (!clauseIsProcessLog(clauseKey)) continue; // only attestations-article ladders are lifecycles
            const ladder = clauseLadderField(clauseKey);
            if (!ladder) continue;                                     // process-log clause without a declared ladder yet → nothing to advance
            const parties: Array<PartyRole> = ["seller"];

            for (const party of parties) {
                if (party === "seller" ? !isSeller : !isBuyer) continue;
                const mine = orderAttestations.filter(
                    (a) => hexEqual(a.clauseId, clauseKey)
                        && hexEqual(a.attester, party === "seller" ? order.seller : order.buyer),
                );
                const seen = new Set(mine.map((a) => a.stage));
                const stage = ladder.values.findIndex((_v, i) => !seen.has(i));
                if (stage < 0) continue;                               // ladder fully attested
                const eventCode = ladder.values[stage];
                const capId = `${order.processId}:${orderIdStr}:${clauseKey}-${party}-${eventCode}`;
                // The ladder's COMPANION fields (every declared field that
                // isn't the ladder enum itself — an evidence pointer, a note)
                // ride the same generic form the witness stages use: the spec
                // declares, the rail renders, the fill lands in the encoded
                // content beside the event code. No field is named here.
                const companions = getClauseSpec(clauseKey)
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
                        clauseKey,
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
                    source: runtimeSource(`${party} attests ${clauseKey} ${eventCode}`, capId),
                });
            }
        }

        // GENERIC witness stages: any composed clause DECLARING spec.stages[N]
        // surfaces a runtime witness capability at N — a temperature reading,
        // measured grams, a detected band. Declaration is the signal (a
        // never-seen clause participates by declaring); the form is generated
        // from the declared stage's fields. Offered to BOTH parties — who must
        // witness is never engine policy (a dead-drop seller attests with a
        // device identifier in lieu of the buyer; sufficiency is derived at
        // read time against the committed policy) — and REPEATABLE while the
        // order is active (one attestation per reporting period; the evidence
        // window closes at resolve, on-chain and here).
        //
        // Each card names its order — position on the process chain and
        // seller — as the re-assert card below does: the buyer is a party to
        // every order of its process and the rail lists every order's cards
        // together, so one clause's witness card repeats once per order.
        const orderLabel = `Order ${indexes.positionByOrder.get(orderIdStr)} of ${indexes.positionByOrder.size} · seller ${truncateHex(order.seller)}`;
        for (const clauseEntry of agreement.clauses) {
            const clauseKey = clauseEntry.clause;
            if (clauseIsProcessLog(clauseKey)) continue; // a ladder's stage overrides shape its content, not a witness
            for (const witness of clauseWitnessStages(clauseKey)) {
                const title = getClauseSpec(clauseKey)?.title ?? clauseKey;
                for (const party of ["seller", "buyer"] as const) {
                    if (party === "seller" ? !isSeller : !isBuyer) continue;
                    const capId = `${order.processId}:${orderIdStr}:${clauseKey}-${party}-stage-${witness.stage}`;
                    out.push({
                        id: capId,
                        label: title,
                        orderLabel,
                        eventCode: `stage-${witness.stage}`,
                        actionKind: "submit-clause-attestation",
                        action: {
                            executionType: "transaction",
                            kind: "submit-clause-attestation",
                            orderHash: orderIdStr,
                            clauseKey,
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
                        source: runtimeSource(`${party} witnesses ${clauseKey} stage ${witness.stage}`, capId),
                    });
                }
            }
        }

        // GENERIC re-assert: any OTHER committed clause can be affirmed
        // on-chain as an attestation whose content IS the committed
        // clauseData (the coordinator's omit-content default) — the act that
        // turns committed content into a timestamped runtime event (geo and
        // modality are instances — no clause is named here). Offered to BOTH
        // parties, once each per clause (a repeat adds nothing: same bytes,
        // same contentRef). Process-log ladders advance instead — their
        // lifecycle IS their attestation — and a clause declaring witness
        // stage 0 owns that entry with its own form.
        //
        // ONE card per party per order, opening a chooser of the clauses
        // that party has not yet re-asserted. Each choice is one clause's
        // own attestation: the coordinator attests one clause per call, so
        // an "all" act would be N wallet prompts that can stop half-way. The
        // card is absent once every clause is re-asserted.
        for (const party of ["seller", "buyer"] as const) {
            if (party === "seller" ? !isSeller : !isBuyer) continue;
            const choices: CapabilityModel[] = [];
            for (const clauseEntry of agreement.clauses) {
                const clauseKey = clauseEntry.clause;
                if (clauseIsProcessLog(clauseKey)) continue;
                if (clauseWitnessStages(clauseKey).some((w) => w.stage === 0)) continue;
                    const already = orderAttestations.some(
                    (a) => hexEqual(a.clauseId, clauseKey) && a.stage === 0
                        && hexEqual(a.attester, party === "seller" ? order.seller : order.buyer),
                );
                if (already) continue;
                const title = getClauseSpec(clauseKey)?.title ?? clauseKey;
                const capId = `${order.processId}:${orderIdStr}:${clauseKey}-${party}-reassert`;
                choices.push({
                    id: capId,
                    label: title,
                    actionKind: "reassert-committed-clause",
                    action: {
                        executionType: "transaction",
                        kind: "submit-clause-attestation",
                        orderHash: orderIdStr,
                        clauseKey,
                        stage: 0,
                        party,
                        reasserts: true,
                    },
                    mechanismId: "attestation-coordinator",
                    scopeType: "order",
                    scopeId: orderIdStr,
                    preconditions: [party === "seller" ? "seller-of-active-order" : "buyer-of-active-order"],
                    riskLabel: "standard",
                    source: runtimeSource(`${party} re-asserts ${clauseKey}`, capId),
                });
            }
            // The agreement FORMAT's provenance leaf — the link from this
            // order to the assembly it instantiated — is the buyer's to
            // attest, beside the clauses, keyed by the reserved key (a
            // format rule, never a clause name).
            if (party === "buyer" && agreement.provenance !== undefined) {
                const already = orderAttestations.some(
                    (a) => hexEqual(a.clauseId, PROVENANCE_LEAF_KEY) && a.stage === 0 && hexEqual(a.attester, order.buyer),
                );
                if (!already) {
                    const capId = `${order.processId}:${orderIdStr}:provenance-leaf-buyer-reassert`;
                    choices.push({
                        id: capId,
                        label: "Assembly provenance",
                        actionKind: "reassert-provenance-leaf",
                        action: {
                            executionType: "transaction",
                            kind: "attest-provenance-leaf",
                            orderHash: orderIdStr,
                            agreementHash: agreement.provenance.agreementHash,
                            compositionHash: agreement.provenance.compositionHash,
                            party: "buyer",
                        },
                        mechanismId: "attestation-coordinator",
                        scopeType: "order",
                        scopeId: orderIdStr,
                        preconditions: ["buyer-of-active-order"],
                        riskLabel: "standard",
                        source: runtimeSource("buyer re-asserts the agreement's provenance leaf", capId),
                    });
                }
            }
            if (choices.length === 0) continue;
            const cardId = `${order.processId}:${orderIdStr}:${party}-reassert-committed-clauses`;
            out.push({
                id: cardId,
                label: `Re-assert committed clauses (${choices.length})`,
                orderLabel,
                // Its OWN actionKind (→ its own `capability-*` testid): the
                // rail renders many attestation cards per order, and the
                // re-assert card must never collide with a ladder/witness
                // card's locator, nor with one of its own choices.
                actionKind: "reassert-committed-clauses",
                action: {
                    executionType: "choice",
                    kind: "choose-capability",
                    choices,
                },
                mechanismId: "attestation-coordinator",
                scopeType: "order",
                scopeId: orderIdStr,
                preconditions: [party === "seller" ? "seller-of-active-order" : "buyer-of-active-order"],
                riskLabel: "standard",
                uiPriority: party === "buyer" ? 56 : 55,
                source: runtimeSource(`${party} re-asserts committed clauseEntries`, cardId),
            });
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
            label: "Resolve: pay sellers, refund bonds",
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

function deriveResolutionBreakdown(order: Order, parentOrderHashes: string[], address?: string): EconomicBreakdownModel | undefined {
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
        // What resolution refunds to THIS party: the seller's bond whole; the
        // buyer's bond less the payment it carried — the payment transfers to
        // the seller in the same call. A receipt that printed the locked
        // amount as the refund read 6 for a 3 MOCK order (beta panel r4).
        settledAvailable: {
            label: isBuyer ? "Buyer bond refunded" : "Seller bond refunded",
            amount: isBuyer ? order.buyerBond - order.payment : order.sellerBond,
            source: {
                truthClass: "protocol-derived",
                sourceLabel: isBuyer ? "buyer bond less the payment it carried" : "seller bond, refunded whole",
                referenceId: `${order.processId}:${order.orderHash.toString()}:refunded-bond`,
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

function deriveOrderNodeModelFromOrder(
    order: Order,
    topology: Map<string, string[]>,
    agreements: Map<string, Agreement>,
    indexes: RuntimeIndexes,
    address?: string,
): OrderNodeModel {
    const parentOrderHashes = topology.get(order.orderHash) ?? [];

    return {
        orderId: order.orderHash.toString(),
        processId: order.processId,
        buyer: order.buyer as `0x${string}`,
        seller: order.seller as `0x${string}`,
        currency: order.currency as `0x${string}` | undefined,
        payment: order.payment,
        state: OrderState[order.state],
        parentOrderHashes,
        checkoutHash: (order.checkoutHash ?? ZERO_BYTES32) as `0x${string}`,
        capabilities: roleCapabilities(order, agreements, indexes, address),
        resolutionBreakdown: deriveResolutionBreakdown(order, parentOrderHashes, address),
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
    const rootAgreement = rootOrder?.checkoutHash ? agreements.get(rootOrder.checkoutHash) : undefined;
    // The modality clause is found by its declared field, never by name.
    // Single-select: one scalar value per order.
    const rootModality = rootAgreement
        ? ((clauseByField(rootAgreement, "modality", specSource())?.data as { modality?: string } | undefined)?.modality ?? null)
        : null;
    return {
        processId: summary.processId,
        rootOrderId,
        currency: processOrders[0]?.currency as `0x${string}` | undefined,
        rootModality,
        orders: semanticOrders,
        capabilities: deriveProcessCapabilities(summary.processId, processOrders, address),
    };
}