/**
 * @figaro-protocol/sdk/agent — Action Proposer
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

import type { Hex, Address, Process, Order, Commitment, BondBreakdown, SettlementBreakdown, RegisteredAssembly } from "../types.js";
import { OrderState } from "../types.js";
import { calculateBonds, calculateSettlement } from "../bonds.js";
import { orderToCommitment, ZERO_PROCESS_ID } from "../commitments.js";

// ── Action types ────────────────────────────────────────────────────────────

export type ActionType =
    | "initiate-process"
    | "resolve-process"
    | "attest-as-seller"
    | "attest-as-buyer";

export interface BaseAction {
    type: ActionType;
    /** Human/LLM-readable description of what this action does. */
    description: string;
    /** Process this action operates on. */
    processId: Hex;
}

export interface InitiateProcessAction extends BaseAction {
    type: "initiate-process";
    /** The buyer that would originate — the agent's own address. */
    buyer: Address;
    /** The discovered assembly template being instantiated. Identity IS the hash. */
    compositionHash: Hex;
    /** Pointer to the assembly document; the agent hydrates it (off-SDK) to
     *  build the agreement(s) the parties sign. */
    contentURI: string;
    /** Author-of-record of the assembly (its registry `registeredBy`). */
    registeredBy: Address;
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

export interface AttestAction extends BaseAction {
    type: "attest-as-seller" | "attest-as-buyer";
    /** The address that should submit the attestation. */
    attester: Address;
    /** Orders this address can attest against. */
    orderHashes: Hex[];
    /**
     * clauseId for the attestation. The proposer does not choose one — an
     * attestation names a specific clause committed in the target's signed
     * agreement, and only the agent (which holds the hydrated agreement) knows
     * which. It is supplied at execution time via `ActionExecutionInputs`; a
     * clauseId absent from the target's agreement makes the coordinator's
     * inclusion-proof gate reject the call.
     */
    clauseId?: Hex;
    /** Optional stage; executor default is 1. */
    stage?: number;
    /** Optional ABI-encoded content the executor fingerprints into `contentRef`
     *  (`keccak256`). Omit to RE-ASSERT the committed section — the executor then
     *  defaults `contentRef` to the section's own fingerprint. */
    content?: Hex;
}

export type ProposedAction =
    | InitiateProcessAction
    | ResolveProcessAction
    | AttestAction;

// ── Proposer ────────────────────────────────────────────────────────────────

/**
 * Analyze a process and propose all valid actions for the given address.
 *
 * `resolveProcess` requires the original Commitment structs. `Order` carries
 * every Commitment field, so the proposer reconstructs them here (via
 * `orderToCommitment`) — no separate supply needed. A ROOT order's rebuilt
 * commitment still carries the DERIVED processId; the executor restores the
 * signed `processId = 0` at submission (it needs chain context the proposer,
 * being pure, does not have).
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
            // Reconstructed from the active orders; the executor restores each
            // root's signed processId=0 before submitting.
            commitments: activeOrders.map(orderToCommitment),
            settlements,
            totalBuyerPayout,
            totalSellerPayout,
        });

        // NO runtime compose verb: composition is the DESIGNER's act — the
        // buyer selects an assembly and originates from its template
        // (`originateChain`), never extends a live process ad hoc. A
        // "commit-sub-order" arm here was the SDK-native reincarnation of the
        // retired open-sub-order-composer; deleted 2026-07-10.

        // 2. Attest as buyer
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
 * Propose origination actions from the discovered assembly catalogue — the
 * cold-start "act" verb. `proposeActions` reasons about processes the agent is
 * already IN; this reasons about processes it could START, one per live-staked
 * assembly. Pure over discovery output (`FigaroContext.getAssemblies()`).
 *
 * These are OPPORTUNITIES, not executable-from-nothing: originating a process
 * is a two-party commit, so executing one still needs the counterparty's
 * signature (gathered off-SDK via a coordination channel) supplied at execution.
 *
 * @param assemblies The live assemblies to consider (typically all discovered).
 * @param myAddress  The prospective buyer — the agent's own address.
 */
export function proposeInitiations(
    assemblies: RegisteredAssembly[],
    myAddress: Address,
): InitiateProcessAction[] {
    return assemblies.map((a) => ({
        type: "initiate-process",
        description:
            `Initiate a new process from assembly ${a.compositionHash}. ` +
            `You would be the root buyer; sellers co-sign from the assembly's roles.`,
        // No process exists yet — the kernel derives the id at root commit.
        processId: ZERO_PROCESS_ID,
        buyer: myAddress,
        compositionHash: a.compositionHash,
        contentURI: a.contentURI,
        registeredBy: a.registeredBy,
    }));
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
