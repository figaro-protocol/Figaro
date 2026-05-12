/**
 * @figaro/core/agent — Action Proposer
 *
 * Analyzes process state and proposes valid next actions.
 * Pure function — no side effects, no signing, no submission.
 *
 * Each ProposedAction includes:
 *   - Type and human-readable description
 *   - Pre-validated parameters
 *   - Bond math (approval amounts, payouts)
 *
 * The agent (human or autonomous) decides which to execute.
 */

import type { Hex, Address, Process, Order, Commitment, BondBreakdown, SettlementBreakdown } from "../types.js";
import { OrderState } from "../types.js";
import { calculateBonds, calculateSettlement } from "../bonds.js";

// ── Action types ────────────────────────────────────────────────────────────

export type ActionType =
    | "resolve-process"
    | "commit-sub-order"
    | "attest-as-seller"
    | "attest-as-buyer";

export interface BaseAction {
    type: ActionType;
    /** Human/LLM-readable description of what this action does. */
    description: string;
    /** Process this action operates on. */
    processId: Hex;
}

export interface ResolveProcessAction extends BaseAction {
    type: "resolve-process";
    /** The buyer address that must call resolveProcess. */
    caller: Address;
    /**
     * Commitment structs for all active orders.
     * Must be supplied for resolveProcess (kernel re-derives hashes).
     */
    commitments: Commitment[];
    /** Per-order settlement breakdown. */
    settlements: Array<{
        orderHash: Hex;
        seller: Address;
        settlement: SettlementBreakdown;
    }>;
    /** Total payout to buyer across all orders. */
    totalBuyerPayout: bigint;
    /** Total payout to all sellers across all orders. */
    totalSellerPayout: bigint;
}

export interface CommitSubOrderAction extends BaseAction {
    type: "commit-sub-order";
    /** The root buyer who must co-sign. */
    buyer: Address;
    /** Current cumulative value (for expectedCumulativeValue computation). */
    currentCumulativeValue: bigint;
    /** Currency inherited from the process. */
    currency: Address;
}

export interface AttestAction extends BaseAction {
    type: "attest-as-seller" | "attest-as-buyer";
    /** The address that should submit the attestation. */
    attester: Address;
    /** Orders this address can attest against. */
    orderHashes: Hex[];
    /**
     * Optional schemaId for the attestation. When omitted, the executor picks
     * a role-appropriate default (e.g. `figaro-courier-process-v1` for a
     * courier sub-order). Must correspond to a clause committed in the
     * target's signed agreement — otherwise the coordinator's inclusion-proof
     * gate rejects the call.
     */
    schemaId?: Hex;
    /** Optional stage; executor default is 1. */
    stage?: number;
    /** Optional ABI-encoded content. Omit to default to the committed
     *  sectionData (correct for Category-2 schemas). */
    content?: Hex;
    /** Optional — seller-attest only. Supply a distinct role commitment for
     *  cross-order attestation; omit for same-order attestation. */
    roleOrderHash?: Hex;
}

export type ProposedAction =
    | ResolveProcessAction
    | CommitSubOrderAction
    | AttestAction;

// ── Proposer ────────────────────────────────────────────────────────────────

/**
 * Analyze a process and propose all valid actions for the given address.
 *
 * Note: resolveProcess requires the original Commitment structs. Since the
 * ProcessGraph only stores event data (not original commitments), the caller
 * must supply commitments separately when executing a ResolveProcessAction.
 * The proposer sets commitments to an empty array as a placeholder.
 *
 * @param process   The process to analyze.
 * @param myAddress The address we're proposing for.
 * @returns         Array of valid actions, ordered by priority.
 */
export function proposeActions(process: Process, myAddress: Address): ProposedAction[] {
    const actions: ProposedAction[] = [];
    const lc = myAddress.toLowerCase();
    const isBuyer = process.rootBuyer.toLowerCase() === lc;

    const activeOrders = [...process.orders.values()].filter(
        (o) => o.state === OrderState.Active,
    );

    const mySellerOrders = [...process.orders.values()].filter(
        (o) => o.seller.toLowerCase() === lc,
    );

    // ── Buyer actions ───────────────────────────────────────────────────

    if (isBuyer && activeOrders.length > 0 && !process.resolved) {
        // 1. Resolve process (highest priority buyer action)
        // Bonds are derived: buyerBond = 2 × payment, sellerBond = 2 × cumulativeValue
        const settlements = activeOrders.map((o) => {
            const sellerBond = o.cumulativeValue * 2n;
            const buyerBond = o.payment * 2n;
            const settlement = calculateSettlement(o.payment, sellerBond, buyerBond);
            return { orderHash: o.orderHash, seller: o.seller, settlement };
        });

        const totalBuyerPayout = settlements.reduce(
            (sum, s) => sum + s.settlement.buyerPayout, 0n,
        );
        const totalSellerPayout = settlements.reduce(
            (sum, s) => sum + s.settlement.sellerPayout, 0n,
        );

        actions.push({
            type: "resolve-process",
            description: `Resolve process with ${activeOrders.length} active order(s). ` +
                `You receive ${totalBuyerPayout} back; sellers receive ${totalSellerPayout} total.`,
            processId: process.processId,
            caller: process.rootBuyer,
            commitments: [], // Must be supplied by caller at execution time
            settlements,
            totalBuyerPayout,
            totalSellerPayout,
        });

        // 2. Commit sub-order (buyer can always extend the process)
        actions.push({
            type: "commit-sub-order",
            description: `Add a sub-order to this process. Current cumulative value: ${process.cumulativeValue}. ` +
                `You will co-sign with a new seller.`,
            processId: process.processId,
            buyer: process.rootBuyer,
            currentCumulativeValue: process.cumulativeValue,
            currency: process.currency,
        });

        // 3. Attest as buyer
        actions.push({
            type: "attest-as-buyer",
            description: `Submit an attestation for ${activeOrders.length} order(s) as the buyer.`,
            processId: process.processId,
            attester: myAddress,
            orderHashes: activeOrders.map((o) => o.orderHash),
        });
    }

    // ── Seller actions ──────────────────────────────────────────────────

    if (mySellerOrders.length > 0) {
        const activeSellerOrders = mySellerOrders.filter(
            (o) => o.state === OrderState.Active,
        );

        if (activeSellerOrders.length > 0) {
            // Attest as seller
            actions.push({
                type: "attest-as-seller",
                description: `Submit an attestation for ${activeSellerOrders.length} order(s) as the seller.`,
                processId: process.processId,
                attester: myAddress,
                orderHashes: activeSellerOrders.map((o) => o.orderHash),
            });
        }
    }

    return actions;
}

/**
 * Filter proposed actions by type.
 */
export function filterActions<T extends ActionType>(
    actions: ProposedAction[],
    type: T,
): Extract<ProposedAction, { type: T }>[] {
    return actions.filter((a) => a.type === type) as Extract<ProposedAction, { type: T }>[];
}
