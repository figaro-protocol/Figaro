/**
 * Synthetic process helpers for the designer canvas.
 *
 * Builds in-memory orders + their agreements for the /builders/designer/new
 * canvas. Persists each synthetic agreement through the normal agreementStore
 * (localStorage) so that the existing topology derivation and lens summaries
 * pick them up without any code path changes.
 *
 * IDs are deterministically generated within a session by counter; agreement
 * hashes are computed from the agreement contents the same way live commits
 * compute them.
 */

import type { Hex } from "viem";
import { Order, OrderState } from "@/lib/core/store";
import type { ManifestFields } from "@/lib/core/encoding";
import {
    buildOrderAgreement,
    getTopologyParentOrderHashes,
    summarizeAgreement,
} from "@/lib/core/orderAgreement";
import { computeAgreementHash } from "@/lib/core/agreementManifest";
import { loadAgreement, saveAgreement } from "@/lib/core/agreementStore";
import { deriveOrderTopology } from "@/lib/core/orderTopology";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

/** Address space for synthetic actors. Distinct prefix avoids visual confusion with live wallets. */
function syntheticAddress(slot: number): `0x${string}` {
    return ("0x" + "de51" + slot.toString(16).padStart(36, "0")) as `0x${string}`;
}

function syntheticBytes32(seed: string): `0x${string}` {
    const padded = seed.padEnd(64, "0").slice(0, 64);
    return ("0x" + padded) as `0x${string}`;
}

export interface SyntheticProcessSession {
    processId: `0x${string}`;
    buyerAddress: `0x${string}`;
    /** Counter used to mint deterministic order ids within the session. */
    nextOrderIndex: number;
    /** Counter used to mint deterministic seller addresses within the session. */
    nextSellerIndex: number;
}

export function startSyntheticSession(): SyntheticProcessSession {
    const sessionTag = Date.now().toString(16);
    return {
        processId: syntheticBytes32(`process${sessionTag}`),
        buyerAddress: syntheticAddress(0),
        nextOrderIndex: 0,
        nextSellerIndex: 1,
    };
}

export interface CreatedOrder {
    order: Order;
    /** Persists the agreement to localStorage so loadAgreement(...) finds it. */
    agreementHash: Hex;
}

export function createSyntheticRootOrder(session: SyntheticProcessSession): CreatedOrder {
    const orderIndex = session.nextOrderIndex++;
    const sellerIndex = session.nextSellerIndex++;

    const buyer = session.buyerAddress;
    const seller = syntheticAddress(sellerIndex);
    const currency = ZERO_ADDRESS;
    const payment = 1_000_000_000_000_000_000n; // 1.0
    const cumulativeValue = payment;

    const agreement = buildOrderAgreement({
        buyer,
        seller,
        currency,
        payment,
        manifestFields: { origin: "—", destination: "—" },
    });
    const agreementHash = computeAgreementHash(agreement);
    saveAgreement(agreement);

    const orderId = syntheticBytes32(`order${orderIndex}${session.processId.slice(2, 8)}`);

    const order: Order = {
        id: orderId,
        processId: session.processId,
        buyer,
        seller,
        currency,
        agreementHash,
        cumulativeValue,
        payment,
        state: OrderState.Active,
        sellerBond: cumulativeValue * 2n,
        buyerBond: payment * 2n,
        salt: BigInt(orderIndex + 1),
        deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
    };

    return { order, agreementHash };
}

export function createSyntheticSubOrder(
    session: SyntheticProcessSession,
    parent: Order,
): CreatedOrder {
    const orderIndex = session.nextOrderIndex++;
    const sellerIndex = session.nextSellerIndex++;

    const buyer = session.buyerAddress;
    const seller = syntheticAddress(sellerIndex);
    const currency = (parent.currency ?? ZERO_ADDRESS) as `0x${string}`;
    const payment = parent.payment / 2n > 0n ? parent.payment / 2n : 1n;
    const cumulativeValue = parent.cumulativeValue + payment;

    const agreement = buildOrderAgreement({
        buyer,
        seller,
        currency,
        payment,
        manifestFields: { origin: "—", destination: "—" },
        parentOrderHashes: [parent.id],
    });
    const agreementHash = computeAgreementHash(agreement);
    saveAgreement(agreement);

    const orderId = syntheticBytes32(`order${orderIndex}${session.processId.slice(2, 8)}`);

    const order: Order = {
        id: orderId,
        processId: session.processId,
        buyer,
        seller,
        currency,
        agreementHash,
        cumulativeValue,
        payment,
        state: OrderState.Active,
        sellerBond: cumulativeValue * 2n,
        buyerBond: payment * 2n,
        salt: BigInt(orderIndex + 1),
        deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
    };

    return { order, agreementHash };
}

/**
 * Reason a `mergeSyntheticParent` call was rejected. Callers can surface
 * these to the UI; cycles must always be rejected to keep the DAG valid.
 */
export type MergeRejectionReason = "self-loop" | "duplicate-parent" | "would-create-cycle";

export type MergeResult =
    | { ok: true; child: Order }
    | { ok: false; reason: MergeRejectionReason };

/**
 * Add `newParentId` as an additional parent of `child`. Used to build
 * many-to-one merges (e.g. the diamond pattern where order 4 has parents
 * [order 2, order 3]).
 *
 * Rebuilds the child's agreement with the extended parent list, recomputes
 * its hash, and persists. The child's order id is preserved (acts as a
 * stable label in synthetic mode); only `agreementHash` changes.
 */
export function mergeSyntheticParent(
    child: Order,
    newParentId: string,
    allOrders: Order[],
): MergeResult {
    if (newParentId === child.id) return { ok: false, reason: "self-loop" };

    const existingAgreement = loadAgreement(child.agreementHash);
    const existingParents = getTopologyParentOrderHashes(existingAgreement) ?? [];

    if (existingParents.includes(newParentId)) {
        return { ok: false, reason: "duplicate-parent" };
    }

    // Cycle check: if walking down from `child` reaches `newParentId`, then
    // making newParentId a parent of child would create a cycle.
    const topology = deriveOrderTopology(allOrders);
    const visited = new Set<string>();
    const stack = [child.id];
    while (stack.length > 0) {
        const current = stack.pop()!;
        if (visited.has(current)) continue;
        visited.add(current);
        for (const order of allOrders) {
            const parents = topology.get(order.id)?.parentOrderIds ?? [];
            if (parents.includes(current)) {
                if (order.id === newParentId) {
                    return { ok: false, reason: "would-create-cycle" };
                }
                stack.push(order.id);
            }
        }
    }

    const nextParents = [...existingParents, newParentId];
    const newAgreement = buildOrderAgreement({
        buyer: child.buyer as `0x${string}`,
        seller: child.seller as `0x${string}`,
        currency: (child.currency ?? ZERO_ADDRESS) as `0x${string}`,
        payment: child.payment,
        manifestFields: { origin: "—", destination: "—" },
        parentOrderHashes: nextParents,
    });
    const newAgreementHash = computeAgreementHash(newAgreement);
    saveAgreement(newAgreement);

    return {
        ok: true,
        child: { ...child, agreementHash: newAgreementHash },
    };
}

// ── Formation mechanism per child order ─────────────────────────────────────

export type FormationMechanism = "direct" | "dutch-auction";

export const FORMATION_MECHANISM_LABELS: Record<FormationMechanism, string> = {
    "direct": "Direct commit",
    "dutch-auction": "Dutch auction",
};

/** Read the child's current formation mechanism from its committed agreement.
 *  Auction is now implicit in the canonical fulfilment method enum:
 *  `deliver:dutch-auction` is the only Dutch-auction-mediated case among live
 *  methods. Future auction allocators would land as additional method values. */
export function deriveFormationMechanism(order: Order): FormationMechanism {
    const summary = summarizeAgreement(loadAgreement(order.agreementHash));
    const method = summary?.fulfilment?.method;
    if (typeof method === "string" && method === "deliver:dutch-auction") {
        return "dutch-auction";
    }
    return "direct";
}

/**
 * Swap the formation mechanism on a child order. Rebuilds its agreement with
 * (or without) the fulfilment section reflecting the new mechanism, persists
 * the new agreement, and returns an Order with the updated agreementHash.
 *
 * The order id stays stable in synthetic mode — see mergeSyntheticParent.
 */
export function swapSyntheticMechanism(
    child: Order,
    mechanism: FormationMechanism,
): Order {
    const existingAgreement = loadAgreement(child.agreementHash);
    const existingParents = getTopologyParentOrderHashes(existingAgreement) ?? [];

    const manifestFields: ManifestFields = { origin: "—", destination: "—" };
    if (mechanism === "dutch-auction") {
        manifestFields.fulfilmentMethod = "deliver:dutch-auction";
        manifestFields.auctionType = "dutch-auction";
    }

    const newAgreement = buildOrderAgreement({
        buyer: child.buyer as `0x${string}`,
        seller: child.seller as `0x${string}`,
        currency: (child.currency ?? ZERO_ADDRESS) as `0x${string}`,
        payment: child.payment,
        manifestFields,
        parentOrderHashes: existingParents,
    });
    const newAgreementHash = computeAgreementHash(newAgreement);
    saveAgreement(newAgreement);

    return { ...child, agreementHash: newAgreementHash };
}

// ── Per-node agreement editing ──────────────────────────────────────────────

/**
 * Patch shape passed by the AgreementDrawer. Only fields the user touched
 * appear in the patch; all others fall back to the order's current
 * agreement state. `payment` and `currency` overrides flow through to the
 * order itself (cumulativeValue rebuilt for the affected order only —
 * downstream cumulative recomputation across descendants is out of scope
 * for the current synthetic mode).
 */
export interface AgreementEdits {
    currency?: `0x${string}`;
    payment?: bigint;
    manifestFields?: ManifestFields;
}

/**
 * Apply edits to a single order's agreement. Rebuilds the agreement
 * (preserving topology + formation mechanism), hashes, persists. Returns
 * the updated Order with refreshed agreementHash, currency, payment, bond
 * derivations.
 */
export function editSyntheticAgreement(
    order: Order,
    edits: AgreementEdits,
): Order {
    const existingAgreement = loadAgreement(order.agreementHash);
    const existingParents = getTopologyParentOrderHashes(existingAgreement) ?? [];
    const existingMechanism = deriveFormationMechanism(order);

    // Mechanism is preserved across edits — the user changes mechanism via
    // the edge pill, not the section editor.
    const baseFields: ManifestFields = edits.manifestFields ?? {
        origin: "—",
    };
    const manifestFields: ManifestFields = { ...baseFields };
    if (existingMechanism === "dutch-auction") {
        manifestFields.fulfilmentMethod = "deliver:dutch-auction";
        manifestFields.auctionType = "dutch-auction";
    }

    const currency = (edits.currency ?? order.currency ?? ZERO_ADDRESS) as `0x${string}`;
    const payment = edits.payment ?? order.payment;

    const newAgreement = buildOrderAgreement({
        buyer: order.buyer as `0x${string}`,
        seller: order.seller as `0x${string}`,
        currency,
        payment,
        manifestFields,
        parentOrderHashes: existingParents,
    });
    const newAgreementHash = computeAgreementHash(newAgreement);
    saveAgreement(newAgreement);

    // Recompute bond + cumulativeValue for THIS order only.
    // Downstream cumulative-roll-up across the subtree is intentionally
    // deferred — a full recompute would mutate every descendant order id
    // in real-kernel mode and we're not tackling that until Stage 6.
    return {
        ...order,
        agreementHash: newAgreementHash,
        currency,
        payment,
        cumulativeValue: existingParents.length === 0 ? payment : order.cumulativeValue,
        sellerBond: (existingParents.length === 0 ? payment : order.cumulativeValue) * 2n,
        buyerBond: payment * 2n,
    };
}

/**
 * Returns true when `orderId` has no parents in the current topology —
 * i.e. it sits at the root of the DAG. Used by delete-protection logic.
 */
export function isRootOrder(orderId: string, orders: Order[]): boolean {
    const topology = deriveOrderTopology(orders);
    const parents = topology.get(orderId)?.parentOrderIds ?? [];
    return parents.length === 0;
}

/**
 * Walk down the DAG from `rootId` via the topology and return every order
 * id reachable as a descendant — including `rootId` itself. Used by the
 * cascade-delete flow.
 */
export function collectDescendants(rootId: string, orders: Order[]): Set<string> {
    const topology = deriveOrderTopology(orders);
    const collected = new Set<string>([rootId]);
    let frontier: string[] = [rootId];
    while (frontier.length > 0) {
        const next: string[] = [];
        for (const id of frontier) {
            for (const order of orders) {
                const parents = topology.get(order.id)?.parentOrderIds ?? [];
                if (parents.includes(id) && !collected.has(order.id)) {
                    collected.add(order.id);
                    next.push(order.id);
                }
            }
        }
        frontier = next;
    }
    return collected;
}

/** Read the order's agreement back into a ManifestFields shape for the drawer's initial state. */
export function readAgreementFields(order: Order): ManifestFields {
    const summary = summarizeAgreement(loadAgreement(order.agreementHash));
    const fields: ManifestFields = { origin: summary?.geo?.origin ?? "—" };
    if (summary?.geo?.destination) fields.destination = summary.geo.destination;
    if (summary?.geo?.mass !== undefined) {
        fields.mass = typeof summary.geo.mass === "number" ? String(summary.geo.mass) : summary.geo.mass;
    }
    if (summary?.geo?.volume !== undefined) {
        fields.volume = typeof summary.geo.volume === "number" ? String(summary.geo.volume) : summary.geo.volume;
    }
    if (summary?.geo?.classOfService) fields.class_ = summary.geo.classOfService;
    const ghgStandard = summary?.ghg?.standard;
    if (typeof ghgStandard === "string") fields.ghgStandard = ghgStandard;
    const ghgScope = summary?.ghg?.scope;
    if (ghgScope !== undefined) fields.ghgScope = String(ghgScope);
    return fields;
}
