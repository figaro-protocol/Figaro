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
import { ZERO_ADDRESS } from "@/lib/shared/evm";
import type { ClauseFields } from "@/lib/core/encoding";
import {
    buildOrderAgreement,
    getTopologyParentOrderHashes,
    summarizeAgreement,
} from "@/lib/core/orderAgreement";
import {
    computeAgreementHash,
    COURIER_PROCESS_CLAUSE_KEY,
    GEO_CLAUSE_KEY,
    ARBITRATION_KLEROS_CLAUSE_KEY,
    FULFILMENT_V2_CLAUSE_KEY,
} from "@/lib/core/agreement";
import { loadAgreement, saveAgreement } from "@/lib/core/agreementStore";
import { buildAgreementsFromCache, deriveOrderTopology } from "@/lib/core/orderTopology";

/** Address space for synthetic actors. Distinct prefix avoids visual confusion with live wallets. */
export function syntheticAddress(slot: number): `0x${string}` {
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

/**
 * Manifest field defaults applied to every freshly-spawned synthetic
 * order. The chosen fields make five sections appear in the agreement
 * by default — Geo (placeholder geohashes), Jurisdiction (Kleros layer-2),
 * Fulfilment (pickup), Commerce (always), Topology (always) — matching
 * the designer's "default articles for any node" intent.
 *
 *   - `origin` / `destination` = "0" — single-character base32 geohashes
 *     that satisfy `figaro-geo-v2`'s pattern + minLength constraints. The
 *     v2 validator also requires non-zero mass/volume and a valid class
 *     of service; `clauseFieldsToGeoSection` supplies minimally-valid
 *     defaults (mass=1 g, volume=1 ml, class="S") when this section is
 *     emitted, which the buyer overwrites at commit time.
 *   - `klerosCourt` = "general" + `klerosMinJurors` = "3" — Kleros General
 *     Court with 3 jurors. Layer 1 (kernel mechanisms) is always active
 *     and not encoded; layer 3 (state / ADR / traditional) is opt-in via
 *     the Jurisdiction tab.
 *   - `fulfilmentModalities` = ["consume-onsite", "pickup"] — the two
 *     in-person modalities that don't imply a courier sub-order; matches
 *     the legacy direct-sale reference shape.
 */
const DEFAULT_NODE_MANIFEST_FIELDS: ClauseFields = {
    // Nested, spec-named (the unified ClauseFields shape). The geo entry
    // carries sentinel origin/destination; jurisdiction defaults to Kleros
    // General Court with 3 jurors (Layer 1 is always active and not encoded;
    // Layer 3 state/ADR is opt-in). No fulfilment entry is pre-seeded — the
    // designer's modality choice flows through the per-order clause selection.
    [GEO_CLAUSE_KEY]: { origin: "0", destination: "0" },
    [ARBITRATION_KLEROS_CLAUSE_KEY]: { klerosCourt: "general", klerosMinJurors: "3" },
};

export function createSyntheticRootOrder(
    session: SyntheticProcessSession,
    /** Per-root assemblyDoc overrides. Merged onto DEFAULT_NODE_MANIFEST_FIELDS.
     *  Used by `assemblyDocumentToDraft` to seed an IPFS-pinned assembly's kleros +
     *  fulfilment fields into the new draft's root. */
    assemblyDocumentOverrides?: ClauseFields,
): CreatedOrder {
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
        clauseFields: { ...DEFAULT_NODE_MANIFEST_FIELDS, ...assemblyDocumentOverrides },
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
    /** Optional per-sub-order assemblyDoc overrides. Merged onto
     *  DEFAULT_NODE_MANIFEST_FIELDS — use this to mark role-specific
     *  flags at creation time (e.g., `courierProcessIncluded: true` for
     *  delivery-spawned courier sub-orders). */
    assemblyDocumentOverrides?: ClauseFields,
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
        clauseFields: { ...DEFAULT_NODE_MANIFEST_FIELDS, ...assemblyDocumentOverrides },
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
type MergeRejectionReason = "self-loop" | "duplicate-parent" | "would-create-cycle";

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
    const topology = deriveOrderTopology(allOrders, buildAgreementsFromCache(allOrders));
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
        clauseFields: { [GEO_CLAUSE_KEY]: { origin: "—", destination: "—" } },
        parentOrderHashes: nextParents,
    });
    const newAgreementHash = computeAgreementHash(newAgreement);
    saveAgreement(newAgreement);

    return {
        ok: true,
        child: { ...child, agreementHash: newAgreementHash },
    };
}

// ── Fulfilment method per child order ──────────────────────────────────────

import type { CanonicalFulfilmentMethod } from "@/lib/core/orderAgreement";
import { canonicalFulfilmentMethodToArrays } from "@/lib/core/orderAgreement";
import { FULFILMENT_MODE_LABELS } from "@/lib/seller/fulfilmentRouting";
;

/**
 * Default fulfilment method when an order's agreement carries no fulfilment
 * section. Picked as the most common case for a delivery sub-order — the
 * merchant arranges the courier directly. Edge pill swaps it via
 * `swapSyntheticFulfilmentMethod`.
 */
const DEFAULT_FULFILMENT_METHOD: CanonicalFulfilmentMethod = "deliver:seller-assigned";

/** Read the child's current fulfilment method from its committed agreement. */
function deriveFulfilmentMethod(order: Order): CanonicalFulfilmentMethod {
    const summary = summarizeAgreement(loadAgreement(order.agreementHash));
    const method = summary?.fulfilment?.method;
    if (typeof method === "string" && (FULFILMENT_MODE_LABELS as Record<string, string>)[method]) {
        return method as CanonicalFulfilmentMethod;
    }
    return DEFAULT_FULFILMENT_METHOD;
}

function clauseFieldsForFulfilmentMethod(method: CanonicalFulfilmentMethod): ClauseFields {
    const { modalities, coordinations } = canonicalFulfilmentMethodToArrays(method);
    return {
        [GEO_CLAUSE_KEY]: { origin: "—", destination: "—" },
        [FULFILMENT_V2_CLAUSE_KEY]: {
            modalities,
            ...(coordinations.length > 0 ? { coordinations } : {}),
        },
    };
}

/**
 * Swap the fulfilment method on a child order. Rebuilds its agreement with
 * the fulfilment section reflecting the new method, persists the new
 * agreement, and returns an Order with the updated agreementHash.
 *
 * The order id stays stable in synthetic mode — see mergeSyntheticParent.
 */
function swapSyntheticFulfilmentMethod(
    child: Order,
    method: CanonicalFulfilmentMethod,
): Order {
    const existingAgreement = loadAgreement(child.agreementHash);
    const existingParents = getTopologyParentOrderHashes(existingAgreement) ?? [];

    const newAgreement = buildOrderAgreement({
        buyer: child.buyer as `0x${string}`,
        seller: child.seller as `0x${string}`,
        currency: (child.currency ?? ZERO_ADDRESS) as `0x${string}`,
        payment: child.payment,
        clauseFields: clauseFieldsForFulfilmentMethod(method),
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
    clauseFields?: ClauseFields;
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
    const existingMethod = deriveFulfilmentMethod(order);

    // Fulfilment method is preserved across edits — the user changes it via
    // the edge pill, not the section editor. If the caller's assemblyDoc patch
    // already specifies fulfilmentMethod, that wins.
    const baseFields: ClauseFields = edits.clauseFields ?? { [GEO_CLAUSE_KEY]: { origin: "—" } };
    const clauseFields: ClauseFields = { ...baseFields };
    // Preserve the fulfilment method across edits unless the patch sets one
    // (the user changes it via the edge pill, not the section editor).
    if (!clauseFields[FULFILMENT_V2_CLAUSE_KEY]) {
        const inherited = clauseFieldsForFulfilmentMethod(existingMethod);
        clauseFields[FULFILMENT_V2_CLAUSE_KEY] = inherited[FULFILMENT_V2_CLAUSE_KEY];
    }

    const currency = (edits.currency ?? order.currency ?? ZERO_ADDRESS) as `0x${string}`;
    const payment = edits.payment ?? order.payment;

    const newAgreement = buildOrderAgreement({
        buyer: order.buyer as `0x${string}`,
        seller: order.seller as `0x${string}`,
        currency,
        payment,
        clauseFields,
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
    const topology = deriveOrderTopology(orders, buildAgreementsFromCache(orders));
    const parents = topology.get(orderId)?.parentOrderIds ?? [];
    return parents.length === 0;
}

/**
 * Walk down the DAG from `rootId` via the topology and return every order
 * id reachable as a descendant — including `rootId` itself. Used by the
 * cascade-delete flow.
 */
export function collectDescendants(rootId: string, orders: Order[]): Set<string> {
    const topology = deriveOrderTopology(orders, buildAgreementsFromCache(orders));
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

