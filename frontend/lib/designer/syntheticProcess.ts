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
import { Order, OrderState } from "@/lib/kernel/store";
import { ZERO_ADDRESS } from "@/lib/shared/evm";
import type { ClauseFields } from "@/lib/shared/clauseFields";
import { buildOrderAgreement } from "@figaro/sdk";
import { specSource } from "@/lib/shared/clauseSpecSource";
import { saveAgreement } from "@/lib/designer/syntheticAgreementStore";
import { draftOrderTopology } from "@/lib/shared/orderTopology";

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
 * Clause-field defaults applied to every freshly-spawned synthetic order.
 * No clause is pre-composed by default: structural clauses (commerce, topology)
 * are composed by the build itself, and every other clause is an explicit
 * designer choice in the drawer.
 */
function defaultNodeClauseFields(): ClauseFields {
    return {};
}

/**
 * The single synthetic display-Order choreography: build the agreement from the
 * order's clauses + topology parents, hash it, persist it to the agreement store (so
 * the canvas + topology derivation resolve it by hash), and assemble the display
 * `Order`. Every synthetic-Order producer — the canvas node-spawn paths here
 * and the template fork/`/view` reconstruction in `assemblyTemplateToDraft` —
 * routes through this one builder.
 *
 * Designer drafts are VALUE-FREE: the published template carries no amounts
 * (commerce values are checkout-time fills) and designer-mode nodes render no
 * amounts, so no cumulative value or bond is derived here — those exist only
 * on runtime orders, where the chain is the source. The value fields the
 * shared `Order` shape requires are zeroed.
 *
 * Deliberately NOT the real checkout path: the SDK checkout walk produces a
 * signable `Commitment` from real parties and constructs no display `Order`.
 * That is a different concern and stays separate.
 */
export function buildSyntheticOrder(params: {
    orderId: `0x${string}`;
    processId: `0x${string}`;
    buyer: `0x${string}`;
    seller: `0x${string}`;
    currency: `0x${string}`;
    payment: bigint;
    salt: bigint;
    clauseFields: ClauseFields;
    parentOrderHashes?: string[];
}): CreatedOrder {
    // The clause map IS the seller's pinned assembly, valued for this order —
    // buildOrderAgreement projects it, names no clause.
    const { agreement, agreementHash } = buildOrderAgreement(
        params.buyer,
        params.seller,
        params.clauseFields,
        specSource(),
    );
    // Persist to the designer's authoring store (localStorage) so the in-progress
    // design survives until publish — the assembly-management counterpart to the
    // buyer's draftOrders.
    saveAgreement(agreement);

    const order: Order = {
        orderHash: params.orderId,
        processId: params.processId,
        buyer: params.buyer,
        seller: params.seller,
        currency: params.currency,
        agreementHash,
        // First-class topology edges (the topology clause's data) — read directly by
        // the topology deriver, never recovered from the agreement.
        parentOrderHashes: params.parentOrderHashes ?? [],
        // Value-free draft: zeros satisfy the shared Order shape; never rendered
        // (designer-mode nodes show no amounts), never published, never signed.
        cumulativeValue: 0n,
        payment: params.payment,
        state: OrderState.Active,
        sellerBond: 0n,
        buyerBond: 0n,
        salt: params.salt,
        deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
    };

    return { order, agreementHash };
}

export function createSyntheticRootOrder(
    session: SyntheticProcessSession,
    /** Per-root clause-field overrides. Merged onto defaultNodeClauseFields().
     *  Used by `assemblyTemplateToDraft` to seed an IPFS-pinned assembly's kleros +
     *  modality fields into the new draft's root. */
    clauseFieldOverrides?: ClauseFields,
): CreatedOrder {
    const orderIndex = session.nextOrderIndex++;
    const sellerIndex = session.nextSellerIndex++;
    const payment = 1_000_000_000_000_000_000n; // 1.0

    return buildSyntheticOrder({
        orderId: syntheticBytes32(`order${orderIndex}${session.processId.slice(2, 8)}`),
        processId: session.processId,
        buyer: session.buyerAddress,
        seller: syntheticAddress(sellerIndex),
        currency: ZERO_ADDRESS,
        payment,
        salt: BigInt(orderIndex + 1),
        clauseFields: { ...defaultNodeClauseFields(), ...clauseFieldOverrides },
    });
}

export function createSyntheticSubOrder(
    session: SyntheticProcessSession,
    parent: Order,
    /** Optional per-sub-order clause-field overrides, merged onto
     *  defaultNodeClauseFields(). */
    clauseFieldOverrides?: ClauseFields,
): CreatedOrder {
    const orderIndex = session.nextOrderIndex++;
    const sellerIndex = session.nextSellerIndex++;
    const currency = (parent.currency ?? ZERO_ADDRESS) as `0x${string}`;
    const payment = parent.payment / 2n > 0n ? parent.payment / 2n : 1n;

    return buildSyntheticOrder({
        orderId: syntheticBytes32(`order${orderIndex}${session.processId.slice(2, 8)}`),
        processId: session.processId,
        buyer: session.buyerAddress,
        seller: syntheticAddress(sellerIndex),
        currency,
        payment,
        salt: BigInt(orderIndex + 1),
        clauseFields: { ...defaultNodeClauseFields(), ...clauseFieldOverrides },
        parentOrderHashes: [parent.orderHash],
    });
}

/**
 * Reason a `mergeSyntheticParent` call was rejected. Callers can surface
 * these to the UI; cycles must always be rejected to keep the topology acyclic.
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
    if (newParentId === child.orderHash) return { ok: false, reason: "self-loop" };

    const existingParents = child.parentOrderHashes ?? [];

    if (existingParents.includes(newParentId)) {
        return { ok: false, reason: "duplicate-parent" };
    }

    // Cycle check: if walking down from `child` reaches `newParentId`, then
    // making newParentId a parent of child would create a cycle.
    const topology = draftOrderTopology(allOrders);
    const visited = new Set<string>();
    const stack = [child.orderHash];
    while (stack.length > 0) {
        const current = stack.pop()!;
        if (visited.has(current)) continue;
        visited.add(current);
        for (const order of allOrders) {
            const parents = topology.get(order.orderHash) ?? [];
            if (parents.includes(current)) {
                if (order.orderHash === newParentId) {
                    return { ok: false, reason: "would-create-cycle" };
                }
                stack.push(order.orderHash);
            }
        }
    }

    const nextParents = [...existingParents, newParentId];
    // Topology is first-class on the order (parentOrderHashes below); the
    // agreement projects the node's assembly clauses.
    const { agreement: newAgreement, agreementHash: newAgreementHash } = buildOrderAgreement(
        child.buyer as `0x${string}`,
        child.seller as `0x${string}`,
        defaultNodeClauseFields(),
        specSource(),
    );
    saveAgreement(newAgreement);

    return {
        ok: true,
        child: { ...child, agreementHash: newAgreementHash, parentOrderHashes: nextParents },
    };
}

/**
 * Returns true when `orderId` has no parents in the current topology —
 * i.e. it sits at the root of the topology. Used by delete-protection logic.
 */
export function isRootOrder(orderId: string, orders: Order[]): boolean {
    const topology = draftOrderTopology(orders);
    const parents = topology.get(orderId) ?? [];
    return parents.length === 0;
}

/**
 * Walk down the topology from `rootId` and return every order
 * id reachable as a descendant — including `rootId` itself. Used by the
 * cascade-delete flow.
 */
export function collectDescendants(rootId: string, orders: Order[]): Set<string> {
    const topology = draftOrderTopology(orders);
    const collected = new Set<string>([rootId]);
    let frontier: string[] = [rootId];
    while (frontier.length > 0) {
        const next: string[] = [];
        for (const id of frontier) {
            for (const order of orders) {
                const parents = topology.get(order.orderHash) ?? [];
                if (parents.includes(id) && !collected.has(order.orderHash)) {
                    collected.add(order.orderHash);
                    next.push(order.orderHash);
                }
            }
        }
        frontier = next;
    }
    return collected;
}

