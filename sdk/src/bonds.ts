/**
 * @figaro/sdk — Bond Calculator
 *
 * Pure functions for the 2× asymmetric bonding math.
 * No chain access needed — just arithmetic.
 */

import type { BondBreakdown, SettlementBreakdown } from "./types.js";

/**
 * Calculate the required bonds for an order.
 *
 * Invariants (FigaroCore):
 *   sellerBond = 2 × cumulativeValue
 *   buyerBond  = 2 × payment
 */
export function calculateBonds(cumulativeValue: bigint, payment: bigint): BondBreakdown {
    return {
        sellerBond: cumulativeValue * 2n,
        buyerBond: payment * 2n,
        totalLocked: cumulativeValue * 2n + payment * 2n,
    };
}

/**
 * Calculate settlement payouts after resolveProcess.
 *
 * At resolution:
 *   sellerPayout = payment + sellerBond
 *   buyerPayout  = buyerBond − payment
 *
 * This means:
 *   - Seller gets their bond back + the payment
 *   - Buyer gets their bond back minus the payment (which went to seller)
 *   - Net transfer: exactly `payment` flows from buyer to seller
 */
export function calculateSettlement(
    payment: bigint,
    sellerBond: bigint,
    buyerBond: bigint,
): SettlementBreakdown {
    return {
        sellerPayout: payment + sellerBond,
        buyerPayout: buyerBond - payment,
        netTransfer: payment,
    };
}

/**
 * How much ERC-20 token approval each party needs before committing a
 * ROOT order.
 *
 * The kernel pulls the FULL bonds on every commit (FigaroCore `_pullExact`):
 *   Buyer:  2 × payment
 *   Seller: 2 × cumulativeValue  (== 2 × payment on a root order)
 *
 * There is no incremental approval anywhere in the kernel — sub-orders
 * pull full per-order bonds too; use `calculateSubOrderApproval`.
 */
export function calculateRootApproval(payment: bigint): {
    buyerApproval: bigint;
    sellerApproval: bigint;
} {
    return {
        buyerApproval: payment * 2n,
        sellerApproval: payment * 2n,
    };
}

/**
 * How much ERC-20 token approval each party needs before committing a
 * SUB-order.
 *
 * Every commit — root or sub — pulls full per-order bonds; nothing is
 * offset against bonds the kernel already holds from earlier orders in
 * the process:
 *   Buyer:  2 × payment            (pulled again, per order)
 *   Seller: 2 × newCumulativeValue (the whole cumulative bond for this
 *                                   order, NOT the increment over the
 *                                   previous order's bond)
 *
 * Approving less than these amounts makes `commit` revert inside the
 * settlement token with `ERC20InsufficientAllowance` (carried in
 * `CORE_ABI` so the revert decodes by name).
 */
export function calculateSubOrderApproval(
    payment: bigint,
    newCumulativeValue: bigint,
): {
    buyerApproval: bigint;
    sellerApproval: bigint;
} {
    return {
        buyerApproval: payment * 2n,
        sellerApproval: newCumulativeValue * 2n,
    };
}

/**
 * Verify that a bond configuration satisfies the protocol invariants.
 * Useful for agents to validate before signing.
 */
export function validateBonds(
    payment: bigint,
    cumulativeValue: bigint,
    sellerBond: bigint,
    buyerBond: bigint,
): { valid: boolean; reason?: string } {
    if (payment <= 0n) {
        return { valid: false, reason: "payment must be positive" };
    }
    if (cumulativeValue < payment) {
        return { valid: false, reason: "cumulativeValue must be >= payment" };
    }
    if (sellerBond !== cumulativeValue * 2n) {
        return { valid: false, reason: `sellerBond must be 2 × cumulativeValue (expected ${cumulativeValue * 2n}, got ${sellerBond})` };
    }
    if (buyerBond !== payment * 2n) {
        return { valid: false, reason: `buyerBond must be 2 × payment (expected ${payment * 2n}, got ${buyerBond})` };
    }
    return { valid: true };
}
